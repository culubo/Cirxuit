/**
 * RobotRig — wraps the board scene and, in Robot view, mounts the biped robot
 * the board powers. Entering the view, the camera pulls back while the board
 * shrinks, stands up, and settles into a cutaway in the robot's chest, where
 * its current particles stay visible. The robot's gait is driven only by the
 * solver result (robotState.ts → robotAnim.ts).
 *
 * The model is three.js's RobotExpressive (CC0), served from public/models.
 * Clips used: "Walking" (walk, limp, freeze) and "Death" (collapse).
 */
import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Board } from "../model/board-model";
import { useStore } from "../store/useStore";
import { tokens } from "../ui/tokens";
import { applyPose, boardFitPose, type CameraPose } from "../scene/AutoFitCamera";
import { CLIPS, FREEZE_S, nextPhase, type RobotPhase } from "./robotAnim";
import { isRobotBoard, readRobot, type RobotReading } from "./robotState";
import { useRobotStore } from "./useRobotStore";

// Physics engine and policy runtime load only when the duck is first shown.
const DuckRig = lazy(() => import("./duck/DuckRig"));

export const ROBOT_MODEL_URL = `${import.meta.env.BASE_URL}models/RobotExpressive.glb`;

/** Robot height in scene millimetres. */
const ROBOT_HEIGHT_MM = 240;
/** Floor the robot stands on (matches the board's contact shadow plane). */
const FLOOR_Z = -9;
/** Seconds for the board-to-robot transition. */
const TRANSITION_S = 1.4;
/** Depth of the chest cutaway, mm. */
const CAVITY_MM = 12;
/** The board's width as a share of the torso's width once seated. */
const BOARD_IN_CHEST = 0.6;
/** Clearance between the board edge and the cutaway rim, mm. */
const RIM_GAP_MM = 2.5;
/** Eye glow when powered (above the bloom threshold). */
const EYE_ON = 2.6;
/** Camera tilt above horizontal in Robot view. */
const ROBOT_TILT = (10 * Math.PI) / 180;

const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const BOARD_FACE = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
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

/** Camera pose that frames the standing robot. */
function robotPose(board: Board, fovDeg: number, aspect: number): CameraPose {
  const { cx, cy } = boardBounds(board);
  // Aim a little below the middle so the feet clear the controls docked bottom-left.
  const target = new THREE.Vector3(cx, cy, FLOOR_Z + ROBOT_HEIGHT_MM * 0.44);
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const d = Math.max((ROBOT_HEIGHT_MM * 1.12) / 2 / t, (ROBOT_HEIGHT_MM * 0.9) / 2 / (t * aspect)) / 0.68;
  const position = target.clone().add(new THREE.Vector3(0, -d * Math.cos(ROBOT_TILT), d * Math.sin(ROBOT_TILT)));
  return { position, target, distance: d };
}

export default function RobotRig({ children }: { children: React.ReactNode }): React.ReactElement {
  const board = useStore((s) => s.board);
  const robotView = useRobotStore((s) => s.robotView);
  const which = useRobotStore((s) => s.model);
  const active = robotView && isRobotBoard(board);
  // Load each model the first time it is shown, then keep it for exits.
  const [mounted, setMounted] = useState<Record<string, boolean>>({});
  useEffect(() => { if (active) setMounted((m) => (m[which] ? m : { ...m, [which]: true })); }, [active, which]);
  const boardGroup = useRef<THREE.Group>(null);

  return (
    <>
      <group ref={boardGroup}>{children}</group>
      {board && isRobotBoard(board) && mounted[which] && (
        <Suspense fallback={null}>
          {which === "microduck"
            ? <DuckRig key="duck" board={board} active={active} boardGroup={boardGroup} />
            : <Robot key="expressive" board={board} active={active} boardGroup={boardGroup} />}
        </Suspense>
      )}
    </>
  );
}

interface Calibration {
  anchorLocal: THREE.Vector3;     // chest front, in the torso group's space
  bindInv: THREE.Quaternion;      // inverse of the torso bone's bind world rotation
  torsoW: number;
  torsoH: number;
}

function Robot({ board, active, boardGroup }: {
  board: Board;
  active: boolean;
  boardGroup: React.RefObject<THREE.Group | null>;
}): React.ReactElement {
  const gltf = useGLTF(ROBOT_MODEL_URL, false, false);
  const { camera, controls, size, gl } = useThree();
  const simResult = useStore((s) => s.simResult);
  const reading = useMemo(() => readRobot(board, simResult), [board, simResult]);
  const readingRef = useRef<RobotReading | null>(reading);
  readingRef.current = reading;

  // A private copy of the rig: own skeleton, own materials (for the cutaway and eyes).
  const model = useMemo(() => {
    const scene = cloneSkinned(gltf.scene) as THREE.Group;
    const torsoMats: THREE.Material[] = [];
    const eyeMats: THREE.MeshStandardMaterial[] = [];
    const torsoMeshes: THREE.Mesh[] = [];
    // The robot's parts are rigid meshes parented to bones. The torso is a group
    // ("Torso", two primitives) hanging off the "Body" bone; the board rides it.
    let torsoBone: THREE.Object3D | null = null;
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.raycast = () => {};          // never block clicks on the board
      const parent = mesh.parent;
      const inTorsoGroup = Boolean(parent && parent.name.startsWith("Torso") && !(parent as THREE.Bone).isBone);
      const isTorso = inTorsoGroup || mesh.name === "Torso";
      if (isTorso && !torsoBone) torsoBone = inTorsoGroup && parent ? parent : mesh;
      const list = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m.clone());
      mesh.material = Array.isArray(mesh.material) ? list : list[0]!;
      for (const m of list) {
        if (m.name === "Black") eyeMats.push(m as THREE.MeshStandardMaterial);
        if (isTorso) torsoMats.push(m);
      }
      if (isTorso) torsoMeshes.push(mesh);
    });
    scene.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(scene);
    const heightUnits = Math.max(1e-6, box.max.y - box.min.y);

    const planes = [0, 1, 2, 3, 4].map(() => new THREE.Plane(new THREE.Vector3(0, 0, 1), 0));
    for (const m of torsoMats) {
      m.clippingPlanes = planes;
      m.clipIntersection = true;        // cut only where every plane agrees: a box
      m.side = THREE.DoubleSide;
    }
    const eyeColor = new THREE.Color(tokens.phosphor);
    for (const m of eyeMats) { m.emissive = eyeColor.clone(); m.emissiveIntensity = EYE_ON; m.toneMapped = false; }

    const mixer = new THREE.AnimationMixer(scene);
    const clip = (name: string): THREE.AnimationClip | null => {
      const c = THREE.AnimationClip.findByName(gltf.animations, name);
      if (!c) console.warn(`[RobotRig] clip "${name}" not found; have: ${gltf.animations.map((a) => a.name).join(", ")}`);
      return c ?? null;
    };
    const walkClip = clip(CLIPS.walk), deathClip = clip(CLIPS.collapse);
    const walk = walkClip ? mixer.clipAction(walkClip) : null;
    const death = deathClip ? mixer.clipAction(deathClip) : null;
    if (death) { death.setLoop(THREE.LoopOnce, 1); death.clampWhenFinished = true; }
    walk?.play();

    return {
      scene, mixer, walk, death, planes, eyeMats, torsoMeshes, torsoBone: torsoBone as THREE.Object3D | null,
      scale: ROBOT_HEIGHT_MM / heightUnits, footY: -box.min.y, heightUnits,
    };
  }, [gltf]);

  useEffect(() => () => { model.mixer.stopAllAction(); }, [model]);

  // Clipping planes only apply with local clipping on.
  useEffect(() => { gl.localClippingEnabled = true; }, [gl]);

  const setReady = useRobotStore((s) => s.setReady);
  const setPhase = useRobotStore((s) => s.setPhase);
  useEffect(() => { setReady(true); return () => setReady(false); }, [setReady]);

  const root = useRef<THREE.Group>(null);
  const sway = useRef<THREE.Group>(null);
  const cavity = useRef<THREE.Group>(null);
  const calib = useRef<Calibration | null>(null);
  const progress = useRef(0);
  const phase = useRef<{ name: RobotPhase; elapsed: number }>({ name: "walk", elapsed: 0 });
  const eye = useRef(EYE_ON);
  const cam = useRef<{ from: CameraPose; to: CameraPose; p0: number; goal: number } | null>(null);
  const bounds = useMemo(() => boardBounds(board), [board]);

  // Start a camera move whenever the view is entered or left.
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const aspect = size.width / Math.max(1, size.height);
    const orbit = controls as { target?: THREE.Vector3 } | null;
    const to = active ? robotPose(board, camera.fov, aspect) : boardFitPose(board, camera.fov, aspect);
    if (!to) return;
    cam.current = {
      from: { position: camera.position.clone(), target: orbit?.target?.clone() ?? to.target.clone(), distance: to.distance },
      to,
      p0: progress.current,
      goal: active ? 1 : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Scratch objects reused every frame.
  const tmp = useMemo(() => ({
    p: new THREE.Vector3(), q: new THREE.Quaternion(), qBone: new THREE.Quaternion(),
    out: new THREE.Vector3(), ex: new THREE.Vector3(), ey: new THREE.Vector3(),
    c: new THREE.Vector3(), seat: new THREE.Vector3(), back: new THREE.Vector3(), v: new THREE.Vector3(),
  }), []);

  useFrame((_, rawDelta) => {
    const dt = Math.min(rawDelta, 0.1);
    const goal = active ? 1 : 0;
    progress.current = THREE.MathUtils.clamp(progress.current + Math.sign(goal - progress.current) * (dt / TRANSITION_S), 0, 1);
    const e = ease(progress.current);
    if (root.current) root.current.visible = progress.current > 0.001;

    // Camera follows the same transition.
    const move = cam.current;
    if (move && camera instanceof THREE.PerspectiveCamera) {
      const span = move.goal - move.p0;
      const k = span === 0 ? 1 : THREE.MathUtils.clamp((progress.current - move.p0) / span, 0, 1);
      const orbit = controls as { target?: THREE.Vector3; enabled?: boolean; update?: () => void } | null;
      if (k >= 1) {
        applyPose(camera, controls, move.to);
        if (orbit) orbit.enabled = true;
        cam.current = null;
      } else {
        const ke = ease(k);
        if (orbit) orbit.enabled = false;
        camera.position.lerpVectors(move.from.position, move.to.position, ke);
        const target = tmp.v.lerpVectors(move.from.target, move.to.target, ke);
        camera.far = Math.max(camera.far, move.to.distance * 20, move.from.distance * 20);
        camera.lookAt(target);
        camera.updateProjectionMatrix();
        if (orbit?.target) orbit.target.copy(target);
      }
    }

    if (progress.current <= 0 && !active) {
      // Fully back on the bench: the board sits exactly where it always does.
      const g = boardGroup.current;
      if (g) { g.position.set(0, 0, 0); g.quaternion.identity(); g.scale.setScalar(1); }
      return;
    }

    // ── Gait, from the solver state only ──
    const state = readingRef.current?.state ?? "walking";
    const ph = phase.current;
    ph.elapsed += dt;
    const next = nextPhase(ph.name, ph.elapsed, state);
    if (next !== ph.name) {
      const { walk, death } = model;
      if (next === "collapse" && walk && death) {
        death.reset().play();
        walk.crossFadeTo(death, 0.35, false);
      } else if (next === "recover" && walk && death) {
        walk.reset().play();
        death.crossFadeTo(walk, 0.9, false);
      }
      ph.name = next;
      ph.elapsed = 0;
      setPhase(next);
    }
    const walk = model.walk;
    let limp = 0;
    if (walk) {
      const frac = walk.getClip().duration > 0 ? (walk.time / walk.getClip().duration) % 1 : 0;
      switch (ph.name) {
        case "walk": walk.timeScale = 1; break;
        // Slower overall, and lopsided: one stride drags.
        case "limp": walk.timeScale = frac < 0.5 ? 0.7 : 0.32; limp = 1; break;
        case "freeze": walk.timeScale = 0; break;
        case "recover": walk.timeScale = 0.8; break;
        default: break;
      }
      if (sway.current) {
        const s = sway.current;
        const wantRoll = limp * Math.sin(frac * Math.PI * 2) * 0.08;
        const wantDip = limp * (frac >= 0.5 ? -Math.sin((frac - 0.5) * Math.PI * 2) * 0.035 * model.heightUnits : 0);
        s.rotation.z += (wantRoll - s.rotation.z) * Math.min(1, dt * 8);
        s.position.y += (wantDip - s.position.y) * Math.min(1, dt * 8);
      }
    }
    model.mixer.update(dt);

    // Eyes: lit while powered, flicker out when the rail sags.
    let eyeGoal = EYE_ON;
    if (ph.name === "freeze") eyeGoal = EYE_ON * (1 - ph.elapsed / FREEZE_S) * (Math.random() < 0.35 ? 0.15 : 1);
    else if (ph.name === "collapse") eyeGoal = 0;
    eye.current = ph.name === "freeze" ? eyeGoal : eye.current + (eyeGoal - eye.current) * Math.min(1, dt * 4);
    for (const m of model.eyeMats) m.emissiveIntensity = Math.max(0, eye.current);

    // ── Seat the board in the chest ──
    const rootGroup = root.current;
    const bone = model.torsoBone;
    const g = boardGroup.current;
    if (!rootGroup || !bone || !g) return;
    rootGroup.updateMatrixWorld(true);

    if (!calib.current) {
      // Measure the chest once, in the bind pose's first frame.
      const box = new THREE.Box3();
      for (const m of model.torsoMeshes) {
        m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld));
      }
      if (box.isEmpty()) return;
      const sizeV = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const front = new THREE.Vector3(center.x, box.min.y, center.z + sizeV.z * 0.08);
      calib.current = {
        anchorLocal: bone.worldToLocal(front.clone()),
        bindInv: bone.getWorldQuaternion(new THREE.Quaternion()).invert(),
        torsoW: sizeV.x,
        torsoH: sizeV.z,
      };
    }
    const cal = calib.current;

    // Chest frame: bone rotation since bind, then the board standing face-out.
    bone.getWorldQuaternion(tmp.qBone);
    const chestQ = tmp.q.copy(tmp.qBone).multiply(cal.bindInv).multiply(BOARD_FACE);
    const anchor = bone.localToWorld(tmp.p.copy(cal.anchorLocal));
    tmp.out.set(0, 0, 1).applyQuaternion(chestQ);   // out of the chest, toward the viewer
    tmp.ex.set(1, 0, 0).applyQuaternion(chestQ);
    tmp.ey.set(0, 1, 0).applyQuaternion(chestQ);

    const s = Math.min(BOARD_IN_CHEST * cal.torsoW / bounds.w, 0.62 * cal.torsoH / bounds.h);
    tmp.seat.copy(anchor).addScaledVector(tmp.out, -CAVITY_MM * 0.55);
    tmp.back.copy(anchor).addScaledVector(tmp.out, -CAVITY_MM);

    // Blend the board from the bench to the seat: T = lerp(c, seat) − R·(s·c).
    const se = 1 + (s - 1) * e;
    tmp.c.set(bounds.cx, bounds.cy, 0);
    const R = g.quaternion.slerpQuaternions(IDENTITY, chestQ, e);
    const at = tmp.v.lerpVectors(tmp.c, tmp.seat, e);
    g.scale.setScalar(se);
    g.position.copy(at).sub(tmp.c.clone().multiplyScalar(se).applyQuaternion(R));

    // Cut a box out of the chest front, opening with the transition.
    const hw = (s * bounds.w / 2 + RIM_GAP_MM) * e;
    const hh = (s * bounds.h / 2 + RIM_GAP_MM) * e;
    const [back, left, right, bottom, top] = model.planes as [THREE.Plane, THREE.Plane, THREE.Plane, THREE.Plane, THREE.Plane];
    // Each plane is negative inside the hole; clipIntersection removes where all are.
    back.normal.copy(tmp.out).negate(); back.constant = tmp.out.dot(tmp.back);
    left.normal.copy(tmp.ex).negate(); left.constant = tmp.ex.dot(anchor) - hw;
    right.normal.copy(tmp.ex); right.constant = -tmp.ex.dot(anchor) - hw;
    bottom.normal.copy(tmp.ey).negate(); bottom.constant = tmp.ey.dot(anchor) - hh;
    top.normal.copy(tmp.ey); top.constant = -tmp.ey.dot(anchor) - hh;

    const cv = cavity.current;
    if (cv) {
      cv.visible = e > 0.01;
      cv.position.copy(anchor);
      cv.quaternion.copy(chestQ);
      cv.scale.set(Math.max(hw, 1e-3), Math.max(hh, 1e-3), CAVITY_MM);
    }
  });

  const robotX = bounds.cx, robotY = bounds.cy;
  return (
    <>
      {/* Z-up scene, Y-up model: stand it up facing -Y (toward the camera). */}
      <group ref={root} position={[robotX, robotY, FLOOR_Z]} rotation={[Math.PI / 2, 0, 0]} scale={model.scale} visible={false}>
        <group ref={sway}>
          <primitive object={model.scene} position={[0, model.footY, 0]} />
        </group>
      </group>
      {/* Cutaway lining: a unit box (x, y half-extents; z depth) scaled each frame. */}
      <group ref={cavity} visible={false}>
        <mesh position={[0, 0, -1]} raycast={() => {}}>
          <planeGeometry args={[2, 2]} />
          <meshStandardMaterial color="#061322" roughness={0.9} metalness={0.1} />
        </mesh>
        {([[-1, 0, Math.PI / 2, 0], [1, 0, -Math.PI / 2, 0], [0, -1, 0, -Math.PI / 2], [0, 1, 0, Math.PI / 2]] as const).map(([x, y, ry, rx], i) => (
          <mesh key={`wall-${i}`} position={[x, y, -0.5]} rotation={[rx, ry, 0]} raycast={() => {}}>
            {/* Side walls span depth along their local x; top/bottom along local y. */}
            <planeGeometry args={x !== 0 ? [1, 2] : [2, 1]} />
            <meshStandardMaterial color="#0b2034" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
        ))}
        {/* Glowing rim around the opening. */}
        {([[0, 1, 2, 0.04], [0, -1, 2, 0.04], [1, 0, 0.04, 2], [-1, 0, 0.04, 2]] as const).map(([x, y, w, h], i) => (
          <mesh key={`rim-${i}`} position={[x, y, 0.02]} raycast={() => {}}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color={tokens.phosphor} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </>
  );
}
