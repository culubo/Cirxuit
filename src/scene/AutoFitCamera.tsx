/**
 * AutoFitCamera — frames the board when it changes: a 3/4 view tilted ~35°
 * from top-down, board filling ~80% of the viewport, orbit target at the
 * board centre.
 */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store/useStore";

const TILT = (35 * Math.PI) / 180;
const FILL = 0.8;

export default function AutoFitCamera(): null {
  const board = useStore((s) => s.board);
  const { camera, controls, size } = useThree();
  const boardKey = board?.id ?? "";
  const ready = size.width > 0 && size.height > 0;

  useEffect(() => {
    if (!board || !ready || !(camera instanceof THREE.PerspectiveCamera)) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of board.outline) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    if (!Number.isFinite(minX)) return;
    const w = maxX - minX, h = maxY - minY;
    const cx = (minX + maxX) / 2, cy = -(minY + maxY) / 2;

    const halfFov = (camera.fov * Math.PI) / 360;
    const aspect = size.width / size.height;
    // Tilting foreshortens the board's depth; parts add a few mm of height.
    const fitH = ((h * Math.cos(TILT) + 6) / 2) / Math.tan(halfFov) / FILL;
    const fitW = (w / 2) / (Math.tan(halfFov) * aspect) / FILL;
    const d = Math.max(fitH, fitW);

    camera.up.set(0, 0, 1);
    camera.position.set(cx, cy - d * Math.sin(TILT), d * Math.cos(TILT));
    camera.near = Math.max(0.1, d / 200);
    camera.far = d * 20;
    camera.lookAt(cx, cy, 0);
    camera.updateProjectionMatrix();

    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void; object?: THREE.Camera } | null;
    if (orbit?.target) {
      orbit.target.set(cx, cy, 0);
      orbit.update?.();
    }
    // Only refit when the board itself (or the first real layout) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, ready, controls]);

  return null;
}
