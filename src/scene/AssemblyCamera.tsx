/**
 * AssemblyCamera — cinematography for the pick-and-place build.
 *
 * While a board builds itself, the camera dollies in from the fitted overview,
 * rides close behind the placement head with a slow orbit, and when the last
 * part lands it eases back to the exact pose it started from (the auto-fit
 * framing). Orbit controls are paused for the shot and handed back after.
 */
import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { assemblyElapsed, headPosition, useAssembly } from "./assembly";

/** Close-up framing: distance from the nozzle tip, tilt from vertical, orbit speed. */
const FOLLOW_DIST = 46;
const FOLLOW_TILT = (40 * Math.PI) / 180;
const ORBIT_RAD_PER_S = 0.09;
/** Smoothing time constants (s): how fast the shot catches up with the head. */
const TARGET_TAU = 0.35;
const POSITION_TAU = 0.6;
/** Dolly-in at the start and pull-back at the end (s). */
const DOLLY_IN_S = 1.4;
const PULL_BACK_S = 2.4;

interface Orbit {
  enabled: boolean;
  target: THREE.Vector3;
  update?: () => void;
}

interface Shot {
  startedAt: number;
  duration: number;
  boardId: string;
  homePosition: THREE.Vector3;
  homeTarget: THREE.Vector3;
  /** Pose when the pull-back began. */
  endPosition: THREE.Vector3;
  endTarget: THREE.Vector3;
  pulling: boolean;
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

export default function AssemblyCamera(): null {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Orbit | null;
  const shot = useRef<Shot | null>(null);
  const target = useRef(new THREE.Vector3());

  useFrame((_, delta) => {
    const assembly = useAssembly.getState();
    const { startedAt, duration, boardId, pausedAt } = assembly;
    const now = performance.now() / 1000;
    let s = shot.current;

    // A new build started: remember where the overview camera is, take over.
    if (startedAt !== null && boardId && (!s || s.startedAt !== startedAt)) {
      const homeTarget = controls?.target.clone() ?? new THREE.Vector3();
      s = shot.current = {
        startedAt, duration, boardId,
        homePosition: camera.position.clone(),
        homeTarget,
        endPosition: new THREE.Vector3(),
        endTarget: new THREE.Vector3(),
        pulling: false,
      };
      target.current.copy(homeTarget);
      if (controls) controls.enabled = false;
    }
    if (!s) return;

    // Board switched mid-build: hand the camera straight back.
    if (boardId !== s.boardId) {
      shot.current = null;
      if (controls) controls.enabled = true;
      return;
    }

    if (pausedAt !== null) return;
    const t = assemblyElapsed(assembly, now);
    if (!s.pulling && t < s.duration) {
      // Follow the head with a slow orbit, easing in from the overview.
      const kT = 1 - Math.exp(-delta / TARGET_TAU);
      target.current.lerp(headPosition.clone().setZ(0), kT);
      const az = ORBIT_RAD_PER_S * t;
      const desired = new THREE.Vector3(
        target.current.x + FOLLOW_DIST * Math.sin(FOLLOW_TILT) * Math.sin(az),
        target.current.y - FOLLOW_DIST * Math.sin(FOLLOW_TILT) * Math.cos(az),
        FOLLOW_DIST * Math.cos(FOLLOW_TILT),
      );
      const intro = smooth(t / DOLLY_IN_S);
      const kP = 1 - Math.exp(-delta / POSITION_TAU);
      const goal = s.homePosition.clone().lerp(desired, intro);
      camera.position.lerp(goal, intro < 1 ? 1 : kP);
      camera.lookAt(s.homeTarget.clone().lerp(target.current, intro));
      return;
    }

    if (!s.pulling) {
      s.pulling = true;
      s.endPosition.copy(camera.position);
      s.endTarget.copy(target.current);
    }
    // Pull back to the overview the build started from.
    const u = smooth((t - s.duration) / PULL_BACK_S);
    camera.position.lerpVectors(s.endPosition, s.homePosition, u);
    const look = s.endTarget.clone().lerp(s.homeTarget, u);
    camera.lookAt(look);
    if (u >= 1) {
      shot.current = null;
      const assemblyState = useAssembly.getState();
      assemblyState.powerOn(s.boardId);
      assemblyState.finish();
      if (controls) {
        controls.target.copy(s.homeTarget);
        controls.enabled = true;
        controls.update?.();
      }
    }
  });

  return null;
}
