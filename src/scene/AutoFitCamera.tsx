/**
 * AutoFitCamera — frames the board when it changes: a 3/4 view tilted ~35°
 * from top-down, the board filling ~80% of the viewport, orbit target at the
 * board centre. Boards with a schematic overlay are framed so the whole
 * exploded stack (up to the schematic layer) fits.
 */
import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store/useStore";
import { SCHEMATIC_Z_MM } from "./schematic/SchematicOverlay";

const TILT = (35 * Math.PI) / 180;
const FILL = 0.8;

export default function AutoFitCamera(): null {
  const board = useStore((s) => s.board);
  const { camera, controls, size } = useThree();
  const hasSchematic = Boolean(board?.schematic);
  const boardKey = `${board?.id ?? ""}|${hasSchematic ? "sch" : ""}`;
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
    // Height of the stack to keep in frame: parts only, or up to the schematic.
    const stack = hasSchematic ? SCHEMATIC_Z_MM : 6;
    const cz = hasSchematic ? stack * 0.45 : 0;

    const halfFov = (camera.fov * Math.PI) / 360;
    const aspect = size.width / size.height;
    // On screen the board's depth is foreshortened by the tilt and the stack's
    // height rises by its sine.
    const fitH = ((h * Math.cos(TILT) + stack * Math.sin(TILT)) / 2) / Math.tan(halfFov) / FILL;
    const fitW = (w / 2) / (Math.tan(halfFov) * aspect) / FILL;
    const d = Math.max(fitH, fitW);

    camera.up.set(0, 0, 1);
    camera.position.set(cx, cy - d * Math.sin(TILT), cz + d * Math.cos(TILT));
    camera.near = Math.max(0.1, d / 200);
    camera.far = d * 20;
    camera.lookAt(cx, cy, cz);
    camera.updateProjectionMatrix();

    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    if (orbit?.target) {
      orbit.target.set(cx, cy, cz);
      orbit.update?.();
    }
    // Only refit when the board itself (or whether it has a schematic) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardKey, ready, controls]);

  return null;
}
