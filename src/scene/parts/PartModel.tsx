/**
 * PartModel — places one component on the board and picks its package model.
 *
 * Each family is built in a local frame: two-terminal chips align their
 * terminals with the line between their pads; everything else uses the part's
 * KiCad rotation. Pads are handed to the family in that frame so leads, pins
 * and fillets land exactly on the copper.
 *
 * Owns selection behaviour: click to select, hover/selected outline traced on
 * the board, and the eased fade when another part has focus.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Part } from "../../model/board-model";
import { useStore } from "../../store/useStore";
import { tokens } from "../../ui/tokens";
import { assemblyElapsed, DROP_S, HOVER_MM, landing, useAssembly } from "../assembly";
import { packageFamily, type PackageFamily } from "../footprint";
import ChipLed from "./ChipLed";
import ChipPassive from "./ChipPassive";
import GenericBody from "./GenericBody";
import { MaterialKit } from "./kit";
import PinHeader from "./PinHeader";
import Qfp from "./Qfp";
import RadialCap from "./RadialCap";
import Sot23 from "./Sot23";
import Trimpot from "./Trimpot";
import Xt30 from "./Xt30";
import type { FamilyProps, LocalPad } from "./types";

interface PartModelProps {
  part: Part;
  /** True when a selection exists and this part is not in the focused set. */
  dimmed: boolean;
  thicknessMm: number;
}

/** Rated LED current used to normalise brightness. */
const LED_RATED_A = 0.02;

const FAMILY: Record<PackageFamily, React.ComponentType<FamilyProps>> = {
  "chip-resistor": ChipPassive,
  "chip-capacitor": ChipPassive,
  "chip-fuse": ChipPassive,
  "chip-led": ChipLed,
  sot23: Sot23,
  qfp: Qfp,
  "pin-header": PinHeader,
  trimpot: Trimpot,
  "radial-cap": RadialCap,
  xt30: Xt30,
  generic: GenericBody,
};

const isChip = (family: PackageFamily): boolean => family.startsWith("chip-");

/** Origin (three space) and rotation of a part's local frame. */
function frameOf(part: Part, family: PackageFamily): { origin: THREE.Vector2; angle: number } {
  const [a, b] = part.pads;
  if (isChip(family) && a && b) {
    return {
      origin: new THREE.Vector2((a.position.x + b.position.x) / 2, -(a.position.y + b.position.y) / 2),
      angle: Math.atan2(-(b.position.y - a.position.y), b.position.x - a.position.x),
    };
  }
  return { origin: new THREE.Vector2(part.position.x, -part.position.y), angle: (part.rotationDeg * Math.PI) / 180 };
}

function localPads(part: Part, origin: THREE.Vector2, angle: number): LocalPad[] {
  const cos = Math.cos(-angle), sin = Math.sin(-angle);
  return part.pads.filter((pad) => pad.layers.length > 0 && pad.number !== "" && pad.number !== "MP").map((pad) => {
    const dx = pad.position.x - origin.x, dy = -pad.position.y - origin.y;
    // Board-aligned pad size projected onto the local axes.
    const w = Math.abs(cos) * pad.sizeMm.w + Math.abs(sin) * pad.sizeMm.h;
    const h = Math.abs(sin) * pad.sizeMm.w + Math.abs(cos) * pad.sizeMm.h;
    return { pad, at: new THREE.Vector2(dx * cos - dy * sin, dx * sin + dy * cos), size: new THREE.Vector2(w, h) };
  });
}

/** Rounded outline around the part's pads and body, traced on the board. */
function outlinePoints(part: Part, pads: LocalPad[], family: PackageFamily): THREE.Vector3[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const { at, size } of pads) {
    minX = Math.min(minX, at.x - size.x / 2); maxX = Math.max(maxX, at.x + size.x / 2);
    minY = Math.min(minY, at.y - size.y / 2); maxY = Math.max(maxY, at.y + size.y / 2);
  }
  if (!isChip(family)) {
    minX = Math.min(minX, -part.body.w / 2); maxX = Math.max(maxX, part.body.w / 2);
    minY = Math.min(minY, -part.body.h / 2); maxY = Math.max(maxY, part.body.h / 2);
  }
  const m = 0.45;
  minX -= m; minY -= m; maxX += m; maxY += m;
  const r = Math.min(0.6, (maxX - minX) / 4, (maxY - minY) / 4);
  const pts: THREE.Vector3[] = [];
  const corner = (cx: number, cy: number, start: number) => {
    for (let i = 0; i <= 6; i++) {
      const t = start + (i / 6) * (Math.PI / 2);
      pts.push(new THREE.Vector3(cx + r * Math.cos(t), cy + r * Math.sin(t), 0.06));
    }
  };
  corner(maxX - r, maxY - r, 0);
  corner(minX + r, maxY - r, Math.PI / 2);
  corner(minX + r, minY + r, Math.PI);
  corner(maxX - r, minY + r, (3 * Math.PI) / 2);
  pts.push(pts[0]!.clone());
  return pts;
}

export default function PartModel({ part, dimmed, thicknessMm }: PartModelProps): React.ReactElement {
  const family = packageFamily(part);
  const Family = FAMILY[family];
  const selected = useStore((s) => s.selection?.kind === "part" && s.selection.ref === part.ref);
  const setSelection = useStore((s) => s.setSelection);
  const amps = useStore((s) => s.simResult?.branches.find((b) => b.ref === part.ref)?.amps ?? 0);
  const [hovered, setHovered] = useState(false);

  // One kit per physical part; parameter edits keep the same materials.
  const kit = useMemo(() => new MaterialKit(), [part.ref, part.footprint]);
  useEffect(() => () => kit.dispose(), [kit]);
  useFrame((_, delta) => kit.step(dimmed, delta));

  // Pick-and-place: hidden until the head reaches this part, then dropped into the paste.
  const placed = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = placed.current;
    if (!g) return;
    const state = useAssembly.getState();
    const { startedAt, placements } = state;
    const slot = startedAt === null ? undefined : placements.get(part.ref);
    if (!slot || startedAt === null) {
      g.visible = true;
      g.position.z = 0;
      return;
    }
    const t = assemblyElapsed(state) - slot.at;
    g.visible = t >= 0;
    g.position.z = HOVER_MM * (1 - landing(t / DROP_S));
  });

  const { origin, angle } = useMemo(() => frameOf(part, family), [part, family]);
  const pads = useMemo(() => localPads(part, origin, angle), [part, origin, angle]);
  const outline = useMemo(() => outlinePoints(part, pads, family), [part, pads, family]);
  const glow = part.model?.type === "led" ? amps / LED_RATED_A : 0;

  useEffect(() => {
    if (!hovered) return;
    document.body.style.cursor = "pointer";
    return () => { document.body.style.cursor = ""; };
  }, [hovered]);

  const bottom = part.side === "bottom";

  return (
    <group
      position={[origin.x, origin.y, bottom ? -thicknessMm : 0]}
      rotation={bottom ? [Math.PI, 0, -angle] : [0, 0, angle]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        setSelection({ kind: "part", ref: part.ref });
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        useStore.getState().setHover({ kind: "part", ref: part.ref });
      }}
      onPointerOut={() => {
        setHovered(false);
        useStore.getState().clearHover({ kind: "part", ref: part.ref });
      }}
    >
      <group ref={placed}>
        {part.fitted !== false && <Family part={part} pads={pads} kit={kit} thicknessMm={thicknessMm} glow={glow} />}
      </group>
      {(selected || hovered) && (
        <Line
          points={outline}
          color={tokens.phosphor}
          lineWidth={selected ? 2 : 1.2}
          transparent
          opacity={selected ? 0.95 : 0.5}
          toneMapped={false}
          raycast={() => null}
        />
      )}
    </group>
  );
}
