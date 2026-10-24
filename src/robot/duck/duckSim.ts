/**
 * duckSim — Microduck in real physics: MuJoCo (WASM) steps Pollen Robotics'
 * MJCF model, and the official walking policy (velstand.onnx, onnxruntime-web)
 * drives its 14 servos at 50 Hz, exactly the contract the real robot runs:
 *
 *   obs[61] = [ gyro(3), projected gravity(3), joint pos − home(14),
 *               joint vel, one control step old(14), last action(14),
 *               twist command(3), head pose command(4), body pose command(6) ]
 *   target  = home + action                      (action scale 1.0)
 *
 * Power comes from the board's solved state, never from the duck:
 *   - a stalled servo jams: its joint holds the angle it stalled at
 *   - a brownout resets the controller: the policy stops and every servo
 *     goes limp, so the duck falls over
 *   - when the rail recovers the controller boots, the policy gets the duck
 *     back up (velstand recovers from falls), then walks on
 */
import type { MainModule, MjData, MjModel } from "@mujoco/mujoco";
import type { InferenceSession, Tensor } from "onnxruntime-web";
import { DUCK_HOME, DUCK_JOINTS, gravityInBody, servoJoint } from "./duckModel";

export const CONTROL_DT = 0.02;          // 50 Hz, as on the robot
const PHYSICS_DT = 0.005;                // 4 substeps per control step
const SUBSTEPS = Math.round(CONTROL_DT / PHYSICS_DT);
/** Seconds the rebooted controller holds a zero command while getting up. */
const BOOT_STAND_S = 2.5;
/** Uprightness (z of the body's up axis) below which the duck has fallen. */
const FALLEN_UP = 0.5;

export type DuckPower = { mode: "on" | "off"; stalled: string[] };
export type DuckPhase = "walk" | "limp" | "collapse" | "recover";

export interface DuckFrame {
  /** Per body (MuJoCo order): world position (m) and quaternion (w, x, y, z). */
  xpos: Float64Array;
  xquat: Float64Array;
  phase: DuckPhase;
  /** Body up-axis z: 1 standing, ≤ 0 lying on its side or back. */
  upright: number;
}

interface Loaded {
  mj: MainModule;
  ort: typeof import("onnxruntime-web");
  model: MjModel;
  data: MjData;
  session: InferenceSession;
}

export interface DuckAssets {
  baseUrl: string;      // ends with "/"
  mujocoWasmUrl: string;
  ortWasmUrl: string;
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function load(assets: DuckAssets): Promise<Loaded> {
  const manifest = (await (await fetch(assets.baseUrl + "manifest.json")).json()) as {
    scene: string; xml: string[]; meshes: string[]; policy: string;
  };
  const [{ default: loadMujoco }, ort] = await Promise.all([
    import("@mujoco/mujoco"),
    import("onnxruntime-web/wasm"),
  ]);
  const mj = await loadMujoco({ locateFile: (p: string) => (p.endsWith(".wasm") ? assets.mujocoWasmUrl : p) });

  const vfs = new mj.MjVFS();
  const files = [...manifest.xml, ...manifest.meshes];
  const bytes = await Promise.all(files.map((f) => fetchBytes(assets.baseUrl + f)));
  files.forEach((f, i) => vfs.addBuffer(f, bytes[i]));
  const sceneXml = new TextDecoder().decode(bytes[files.indexOf(manifest.scene)]);
  const model = mj.MjModel.from_xml_string(sceneXml, vfs);
  vfs.delete();
  // Solver settings from the velocity task (microduck_velocity_env_cfg.py).
  model.opt.timestep = PHYSICS_DT;
  model.opt.iterations = 30;
  model.opt.ls_iterations = 50;
  const data = new mj.MjData(model);

  // Single-threaded, no proxy worker: needs no cross-origin isolation.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = { wasm: assets.ortWasmUrl };
  const session = await ort.InferenceSession.create(await fetchBytes(assets.baseUrl + manifest.policy), {
    executionProviders: ["wasm"],
  });
  return { mj, ort, model, data, session };
}

export class DuckSim {
  private l: Loaded;
  private qposAdr: number[];
  private dofAdr: number[];
  private gyroAdr: number;
  private gain0: number[];
  private bias1: number[];
  private bias2: number[];
  private lastAction = new Float32Array(14);
  private prevVel = new Float32Array(14);
  private obs = new Float32Array(61);
  private locked = new Map<number, number>();
  private power: DuckPower = { mode: "on", stalled: [] };
  private torqueOn = true;
  private bootAt = -Infinity;
  private time = 0;
  /** Walking command [vx m/s, vy m/s, wz rad/s]: a gentle circle. */
  command: [number, number, number] = [0.22, 0, 0.45];
  phase: DuckPhase = "walk";
  private busy = false;
  private disposed = false;

  private constructor(l: Loaded) {
    this.l = l;
    const { mj, model } = l;
    const id = (type: number, name: string): number => {
      const i = mj.mj_name2id(model, type, name);
      if (i < 0) throw new Error(`Microduck model has no "${name}"`);
      return i;
    };
    const J = mj.mjtObj.mjOBJ_JOINT.value, A = mj.mjtObj.mjOBJ_ACTUATOR.value;
    this.qposAdr = DUCK_JOINTS.map((n) => model.jnt_qposadr[id(J, n)] as number);
    this.dofAdr = DUCK_JOINTS.map((n) => model.jnt_dofadr[id(J, n)] as number);
    const acts = DUCK_JOINTS.map((n) => id(A, n));
    if (acts.some((a, i) => a !== i)) throw new Error("Microduck actuators are not in policy order");
    this.gyroAdr = model.sensor_adr[id(mj.mjtObj.mjOBJ_SENSOR.value, "imu_ang_vel")] as number;
    const g = model.actuator_gainprm, b = model.actuator_biasprm;
    this.gain0 = DUCK_JOINTS.map((_, i) => g[i * 10]);
    this.bias1 = DUCK_JOINTS.map((_, i) => b[i * 10 + 1]);
    this.bias2 = DUCK_JOINTS.map((_, i) => b[i * 10 + 2]);
    this.reset();
  }

  static async create(assets: DuckAssets): Promise<DuckSim> {
    return new DuckSim(await load(assets));
  }

  get nbody(): number { return this.l.model.nbody; }
  get model(): MjModel { return this.l.model; }
  get mj(): MainModule { return this.l.mj; }

  reset(): void {
    const { mj, model, data } = this.l;
    mj.mj_resetDataKeyframe(model, data, mj.mj_name2id(model, mj.mjtObj.mjOBJ_KEY.value, "STAND"));
    mj.mj_forward(model, data);
    this.lastAction.fill(0);
    this.prevVel.fill(0);
    this.locked.clear();
    this.time = 0;
  }

  /** Apply the board's power state. Only the solver decides this. */
  setPower(power: DuckPower): void {
    const wasOff = this.power.mode === "off";
    this.power = { mode: power.mode, stalled: [...power.stalled] };
    if (power.mode === "off") {
      this.setTorque(false);
      return;
    }
    if (wasOff) {
      // Controller boots: torque back on, fresh action history, stand up first.
      this.setTorque(true);
      this.lastAction.fill(0);
      this.bootAt = this.time;
    }
    // A servo that stalls jams at the angle it reached; released ones are freed.
    const want = new Set(power.stalled.map(servoJoint).filter((j): j is number => j !== null));
    for (const j of [...this.locked.keys()]) if (!want.has(j)) this.locked.delete(j);
    for (const j of want) if (!this.locked.has(j)) this.locked.set(j, this.l.data.qpos[this.qposAdr[j]!] as number);
  }

  private setTorque(on: boolean): void {
    if (on === this.torqueOn) return;
    this.torqueOn = on;
    const g = this.l.model.actuator_gainprm, b = this.l.model.actuator_biasprm;
    const k = on ? 1 : 0;
    for (let i = 0; i < DUCK_JOINTS.length; i++) {
      g[i * 10] = this.gain0[i]! * k;
      b[i * 10 + 1] = this.bias1[i]! * k;
      b[i * 10 + 2] = this.bias2[i]! * k;
    }
  }

  private upright(): number {
    const q = this.l.data.qpos;
    return -gravityInBody(q[3], q[4], q[5], q[6])[2];
  }

  /** One 50 Hz control step: observe, infer, actuate, integrate. */
  async step(): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true;
    try {
      const { mj, model, data, ort, session } = this.l;
      const q = data.qpos, v = data.qvel, s = data.sensordata;
      const up = this.upright();
      const booting = this.time - this.bootAt < BOOT_STAND_S;

      if (this.power.mode === "on") {
        const obs = this.obs;
        let o = 0;
        const g = gravityInBody(q[3], q[4], q[5], q[6]);
        for (let i = 0; i < 3; i++) obs[o++] = s[this.gyroAdr + i] as number;
        for (let i = 0; i < 3; i++) obs[o++] = g[i]!;
        for (let i = 0; i < 14; i++) obs[o++] = (q[this.qposAdr[i]!] as number) - DUCK_HOME[i]!;
        for (let i = 0; i < 14; i++) obs[o++] = this.prevVel[i]!;
        for (let i = 0; i < 14; i++) obs[o++] = this.lastAction[i]!;
        const cmd = booting || up < FALLEN_UP ? [0, 0, 0] : this.command;
        for (let i = 0; i < 3; i++) obs[o++] = cmd[i]!;
        for (; o < 61; o++) obs[o] = 0;          // head + body pose: neutral
        const input = new ort.Tensor("float32", obs, [1, 61]);
        const out = await session.run({ [session.inputNames[0]!]: input });
        input.dispose();
        if (this.disposed) return;
        const action = out[session.outputNames[0]!] as Tensor;
        this.lastAction.set(action.data as Float32Array);
        action.dispose();
        for (let i = 0; i < 14; i++) {
          data.ctrl[i] = this.locked.get(i) ?? DUCK_HOME[i]! + this.lastAction[i]!;
        }
      }
      // Joint velocity as the policy sees it: one control period old.
      for (let i = 0; i < 14; i++) this.prevVel[i] = v[this.dofAdr[i]!] as number;
      for (let k = 0; k < SUBSTEPS; k++) mj.mj_step(model, data);
      this.time += CONTROL_DT;

      const nowUp = this.upright();
      this.phase = this.power.mode === "off" ? "collapse"
        : booting || nowUp < FALLEN_UP ? "recover"
        : this.power.stalled.length > 0 ? "limp" : "walk";
    } finally {
      this.busy = false;
    }
  }

  frame(): DuckFrame {
    const d = this.l.data;
    return { xpos: d.xpos as Float64Array, xquat: d.xquat as Float64Array, phase: this.phase, upright: this.upright() };
  }

  dispose(): void {
    this.disposed = true;
    const { data, model, session } = this.l;
    void session.release();
    data.delete();
    model.delete();
  }
}
