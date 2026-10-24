/**
 * DuckRig — Robot view with Microduck in real physics. MuJoCo steps the
 * official model and the official walking policy drives it (duckSim.ts); this
 * component renders the simulated bodies, carries the board on the duck's
 * back, follows the duck with the camera, and feeds it power from the solver.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import mujocoWasmUrl from "@mujoco/mujoco/mujoco.wasm?url";
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import type { Board } from "../../model/board-model";
import { useStore } from "../../store/useStore";
import { tokens } from "../../ui/tokens";
import { applyPose, boardFitPose, type CameraPose } from "../../scene/AutoFitCamera";
import { readRobot } from "../robotState";
import { useRobotStore } from "../useRobotStore";
import { CONTROL_DT, DuckSim } from "./duckSim";

const BASE_URL = `${import.meta.env.BASE_URL}models/microduck/`;
/** Scene units are millimetres; MuJoCo's are metres. */
const MM = 1000;
/** The floor the duck walks on (matches the board's contact shadow plane). */
const FLOOR_Z = -9;
const TRANSITION_S = 1.4;
/** Camera: distance and elevation for framing the 25 cm duck. */
const VIEW_DIST_MM = 620;
const VIEW_ELEV = (28 * Math.PI) / 180;
const VIEW_AZIM = (-62 * Math.PI) / 180;    // from the duck's front-left
const MAX_CATCHUP_STEPS = 4;

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const IDENTITY = new THREE.Quaternion();

function boardBounds(board: Board): { cx: number; cy: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of board.outline) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { cx: 0, cy: 0, w: 1, h: 1 };
  return { cx: (minX + maxX) / 2, cy: -(minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}

interface DuckScene {
  bodies: THREE.Group[];
  trunk: number;
  /** Top-centre of the trunk shell, in the trunk body's frame (m). */
  seat: THREE.Vector3;
  /** Neck joint position in the trunk body's frame (m). */
  neckX: number;
  trunkLen: number;
  trunkWid: number;
  eyes: THREE.MeshStandardMaterial[];
  dispose: () => void;
}

/** Build three.js meshes for every visual geom, grouped per MuJoCo body. */
function buildScene(sim: DuckSim): DuckScene {
  const { model, mj } = sim;
  const name = (adr: number): string => {
    const n = model.names as Int8Array;
    let s = "";
    for (let i = adr; n[i]; i++) s += String.fromCharCode(n[i]!);
    return s;
  };
  // Geometry stays in metres inside each body group; the group scales it to mm.
  const bodies = Array.from({ length: model.nbody }, () => {
    const g = new THREE.Group();
    g.scale.setScalar(MM);
    return g;
  });
  const geoms = new Map<number, THREE.BufferGeometry>();
  const mats = new Map<number, THREE.MeshStandardMaterial>();
  const eyes: THREE.MeshStandardMaterial[] = [];
  const MESH = mj.mjtGeom.mjGEOM_MESH.value;
  const vert = model.mesh_vert as Float32Array, face = model.mesh_face as Int32Array;

  const meshGeometry = (m: number): THREE.BufferGeometry => {
    const cached = geoms.get(m);
    if (cached) return cached;
    const va = model.mesh_vertadr[m] as number, vn = model.mesh_vertnum[m] as number;
    const fa = model.mesh_faceadr[m] as number, fn = model.mesh_facenum[m] as number;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(vert.slice(va * 3, (va + vn) * 3), 3));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(face.subarray(fa * 3, (fa + fn) * 3)), 1));
    // Faceted shading suits the decimated CAD meshes.
    const flat = g.toNonIndexed();
    flat.computeVertexNormals();
    g.dispose();
    geoms.set(m, flat);
    return flat;
  };
  const material = (matId: number, geomId: number): THREE.MeshStandardMaterial => {
    const key = matId >= 0 ? matId : -1 - geomId;
    const cached = mats.get(key);
    if (cached) return cached;
    const rgba = matId >= 0 ? (model.mat_rgba as Float32Array) : (model.geom_rgba as Float32Array);
    const i = (matId >= 0 ? matId : geomId) * 4;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!),
      roughness: 0.55,
      metalness: 0.05,
    });
    const matName = matId >= 0 ? name(model.name_matadr[matId] as number) : "";
    if (/noenoeil|lens/i.test(matName)) {
      m.emissive = new THREE.Color(tokens.phosphor);
      m.emissiveIntensity = 1.6;
      m.toneMapped = false;
      eyes.push(m);
    }
    mats.set(key, m);
    return m;
  };

  const trunk = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, "trunk_base");
  const neck = mj.mj_name2id(model, mj.mjtObj.mjOBJ_BODY.value, "neck");
  const trunkBox = new THREE.Box3();
  for (let g = 0; g < model.ngeom; g++) {
    if (model.geom_group[g] !== 2 || model.geom_type[g] !== MESH) continue;
    const body = model.geom_bodyid[g] as number;
    const mesh = new THREE.Mesh(meshGeometry(model.geom_dataid[g] as number), material(model.geom_matid[g] as number, g));
    const p = model.geom_pos as Float64Array, q = model.geom_quat as Float64Array;
    mesh.position.set(p[g * 3]!, p[g * 3 + 1]!, p[g * 3 + 2]!);
    mesh.quaternion.set(q[g * 4 + 1]!, q[g * 4 + 2]!, q[g * 4 + 3]!, q[g * 4]!);
    mesh.castShadow = true;
    mesh.raycast = () => {};            // never block clicks on the board
    bodies[body]!.add(mesh);
    if (body === trunk) {
      mesh.updateMatrix();
      const box = mesh.geometry.boundingBox ?? (mesh.geometry.computeBoundingBox(), mesh.geometry.boundingBox!);
      trunkBox.union(box.clone().applyMatrix4(mesh.matrix));
    }
  }
  const size = trunkBox.getSize(new THREE.Vector3());
  const center = trunkBox.getCenter(new THREE.Vector3());
  return {
    bodies,
    trunk,
    seat: new THREE.Vector3(center.x, center.y, trunkBox.max.z),
    neckX: model.body_pos[neck * 3] as number,
    trunkLen: size.x,
    trunkWid: size.y,
    eyes,
    dispose: () => {
      for (const g of geoms.values()) g.dispose();
      for (const m of mats.values()) m.dispose();
    },
  };
}

export default function DuckRig({ board, active, boardGroup }: {
  board: Board;
  active: boolean;
  boardGroup: React.RefObject<THREE.Group | null>;
}): React.ReactElement | null {
  const [sim, setSim] = useState<DuckSim | null>(null);
  const setReady = useRobotStore((s) => s.setReady);
  const setPhase = useRobotStore((s) => s.setPhase);

  useEffect(() => {
    let cancelled = false;
    let created: DuckSim | null = null;
    DuckSim.create({ baseUrl: BASE_URL, mujocoWasmUrl, ortWasmUrl })
      .then((s) => { if (cancelled) s.dispose(); else { created = s; setSim(s); } })
      .catch((e: unknown) => console.warn("[DuckRig] Microduck failed to load:", e));
    return () => { cancelled = true; created?.dispose(); setReady(false); };
  }, [setReady]);

  const scene = useMemo(() => (sim ? buildScene(sim) : null), [sim]);
  useEffect(() => () => scene?.dispose(), [scene]);
  useEffect(() => { if (scene) setReady(true); }, [scene, setReady]);

  // Power from the solver only.
  const simResult = useStore((s) => s.simResult);
  const reading = useMemo(() => readRobot(board, simResult), [board, simResult]);
  useEffect(() => {
    if (!sim || !reading) return;
    sim.setPower({ mode: reading.state === "brownout" ? "off" : "on", stalled: reading.stalled });
  }, [sim, reading]);

  // Physics runs in real time, paced by the render loop.
  const progress = useRef(0);
  const lag = useRef(0);
  const stepping = useRef(false);
  const advance = (dt: number): void => {
    if (!sim || stepping.current) return;
    lag.current = Math.min(lag.current + dt, CONTROL_DT * MAX_CATCHUP_STEPS);
    const due = Math.floor(lag.current / CONTROL_DT);
    if (due <= 0) return;
    lag.current -= due * CONTROL_DT;
    stepping.current = true;
    void (async () => {
      try { for (let i = 0; i < due; i++) await sim.step(); }
      finally { stepping.current = false; }
      setPhase(sim.phase);
    })();
  };

  const { camera, controls, size } = useThree();
  const root = useRef<THREE.Group>(null);
  const cam = useRef<{ from: CameraPose; p0: number; goal: number } | null>(null);
  const followPrev = useRef<THREE.Vector3 | null>(null);
  const bounds = useMemo(() => boardBounds(board), [board]);
  const origin = useMemo(() => new THREE.Vector3(bounds.cx, bounds.cy, FLOOR_Z), [bounds]);

  useEffect(() => {
    const orbit = controls as { target?: THREE.Vector3 } | null;
    cam.current = {
      from: { position: camera.position.clone(), target: orbit?.target?.clone() ?? new THREE.Vector3(), distance: VIEW_DIST_MM },
      p0: progress.current,
      goal: active ? 1 : 0,
    };
    followPrev.current = null;
    if (active) sim?.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sim]);

  const tmp = useMemo(() => ({
    trunkPos: new THREE.Vector3(), trunkQ: new THREE.Quaternion(), seat: new THREE.Vector3(),
    c: new THREE.Vector3(), at: new THREE.Vector3(), q: new THREE.Quaternion(), v: new THREE.Vector3(),
  }), []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const goal = active ? 1 : 0;
    progress.current = THREE.MathUtils.clamp(progress.current + Math.sign(goal - progress.current) * (dt / TRANSITION_S), 0, 1);
    const e = ease(progress.current);
    const g = boardGroup.current;
    if (root.current) root.current.visible = progress.current > 0.001 && Boolean(scene);

    if (progress.current <= 0 && !active) {
      if (g) { g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.setScalar(1); }
      finishCamera(e);
      return;
    }
    if (!sim || !scene) return;
    advance(dt);

    // Bodies: MuJoCo world (m, Z-up) → scene (mm, Z-up) around the board's spot.
    const f = sim.frame();
    for (let b = 1; b < scene.bodies.length; b++) {
      const body = scene.bodies[b]!;
      body.position.set(f.xpos[b * 3]! * MM, f.xpos[b * 3 + 1]! * MM, f.xpos[b * 3 + 2]! * MM).add(origin);
      body.quaternion.set(f.xquat[b * 4 + 1]!, f.xquat[b * 4 + 2]!, f.xquat[b * 4 + 3]!, f.xquat[b * 4]!);
    }
    const powered = f.phase !== "collapse";
    for (const m of scene.eyes) m.emissiveIntensity += ((powered ? 1.6 : 0) - m.emissiveIntensity) * Math.min(1, dt * 6);

    // The board rides on the duck's back, flat, long side forward.
    const trunk = scene.bodies[scene.trunk]!;
    tmp.trunkPos.copy(trunk.position);
    tmp.trunkQ.copy(trunk.quaternion);
    // The shell curves away at its sides. A board sized to the full bounding
    // box overhangs that curve and appears to float above the duck's back.
    const s = Math.min(0.75, (0.9 * scene.trunkLen * MM) / bounds.w, (0.9 * scene.trunkWid * MM) / bounds.h);
    const lift = board.thicknessMm * s + 0.5;   // board's bottom face just clears the shell
    // Keep the front edge behind the neck joint; centering on the whole trunk
    // puts the PCB and its components through the moving neck hardware.
    const seatX = Math.min(scene.seat.x * MM, scene.neckX * MM - 12 - bounds.w * s / 2);
    tmp.seat.copy(scene.seat).multiplyScalar(MM).setX(seatX).addScaledVector(new THREE.Vector3(0, 0, 1), lift)
      .applyQuaternion(tmp.trunkQ).add(tmp.trunkPos);
    if (g) {
      const se = 1 + (s - 1) * e;
      tmp.c.set(bounds.cx, bounds.cy, 0);
      const R = g.quaternion.slerpQuaternions(IDENTITY, tmp.trunkQ, e);
      tmp.at.lerpVectors(tmp.c, tmp.seat, e);
      g.scale.setScalar(se);
      g.position.copy(tmp.at).sub(tmp.c.clone().multiplyScalar(se).applyQuaternion(R));
    }

    // Camera: fly in with the transition, then follow the duck around.
    const orbit = controls as { target?: THREE.Vector3; enabled?: boolean; update?: () => void } | null;
    const duckAt = tmp.v.set(tmp.trunkPos.x, tmp.trunkPos.y, FLOOR_Z + 90);
    const move = cam.current;
    if (move && move.goal === 1 && camera instanceof THREE.PerspectiveCamera) {
      const span = move.goal - move.p0;
      const k = span === 0 ? 1 : THREE.MathUtils.clamp((progress.current - move.p0) / span, 0, 1);
      const to = duckPose(duckAt);
      if (k >= 1) {
        applyPose(camera, controls, to);
        if (orbit) orbit.enabled = true;
        cam.current = null;
        followPrev.current = duckAt.clone();
      } else {
        const ke = ease(k);
        if (orbit) orbit.enabled = false;
        camera.position.lerpVectors(move.from.position, to.position, ke);
        const target = new THREE.Vector3().lerpVectors(move.from.target, to.target, ke);
        camera.far = Math.max(camera.far, to.distance * 20);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        if (orbit?.target) orbit.target.copy(target);
      }
    } else if (!move && active && followPrev.current && orbit?.target) {
      // Shift camera and target together: the user's orbit is kept.
      const d = duckAt.clone().sub(followPrev.current);
      camera.position.add(d);
      orbit.target.add(d);
      followPrev.current.copy(duckAt);
    } else if (move && move.goal === 0) {
      finishCamera(e);
    }
  });

  function duckPose(target: THREE.Vector3): CameraPose {
    const off = new THREE.Vector3(
      Math.cos(VIEW_ELEV) * Math.cos(VIEW_AZIM),
      Math.cos(VIEW_ELEV) * Math.sin(VIEW_AZIM),
      Math.sin(VIEW_ELEV),
    ).multiplyScalar(VIEW_DIST_MM);
    return { position: target.clone().add(off), target: target.clone(), distance: VIEW_DIST_MM };
  }

  /** Leaving the view: ease the camera back to the board's usual framing. */
  function finishCamera(e: number): void {
    const move = cam.current;
    if (!move || move.goal !== 0 || !(camera instanceof THREE.PerspectiveCamera)) return;
    const to = boardFitPose(board, camera.fov, size.width / Math.max(1, size.height));
    if (!to) { cam.current = null; return; }
    const orbit = controls as { target?: THREE.Vector3; enabled?: boolean } | null;
    const k = move.p0 === 0 ? 1 : THREE.MathUtils.clamp(1 - e / ease(move.p0), 0, 1);
    if (k >= 1 || progress.current <= 0) {
      applyPose(camera, controls, to);
      if (orbit) orbit.enabled = true;
      cam.current = null;
      return;
    }
    const ke = ease(k);
    if (orbit) orbit.enabled = false;
    camera.position.lerpVectors(move.from.position, to.position, ke);
    const target = new THREE.Vector3().lerpVectors(move.from.target, to.target, ke);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    if (orbit?.target) orbit.target.copy(target);
  }

  if (!scene) return null;
  return (
    <group ref={root} visible={false}>
      {scene.bodies.map((b, i) => (i === 0 ? null : <primitive key={i} object={b} />))}
      {/* A floor to walk on, wide enough for the duck's circuit. */}
      <gridHelper
        args={[3000, 60, "#1f6fb2", "#0e2a44"]}
        rotation={[Math.PI / 2, 0, 0]}
        position={[origin.x, origin.y, FLOOR_Z - 0.2]}
        raycast={() => null}
      />
      <mesh position={[origin.x, origin.y, FLOOR_Z - 0.4]} receiveShadow raycast={() => {}}>
        <circleGeometry args={[1500, 64]} />
        <meshStandardMaterial color="#071a2c" roughness={0.95} />
      </mesh>
    </group>
  );
}
