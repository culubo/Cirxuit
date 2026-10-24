/**
 * SchematicOverlay — the circuit's schematic floating above the exploded board,
 * the topmost layer. It fades in from 60 % explode, sits on a translucent dark
 * plane, and is scaled uniformly to fit inside the board outline.
 *
 * - Symbols are canvas textures (white lines), tinted cyan when highlighted.
 * - Wires are tinted by net voltage: 0 V dim, the board's highest voltage brightest.
 * - Current particles flow along the wires with the board's speeds and directions.
 * - Tethers drop from each symbol to its physical part.
 * - Hover and click on symbols and wires drive the shared focus, so a symbol and
 *   its part, or a wire and its traces, light up together.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { Line } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Board, Part, Vec2 } from "../../model/board-model";
import { useStore } from "../../store/useStore";
import { tokens } from "../../ui/tokens";
import { netColor } from "../../ui/semanticColors";
import { formatQuantity } from "../../ui/format";
import LabelSprite from "../LabelSprite";
import { EXPLODE_MM } from "../layers";
import { useExplodeSpring } from "../useExplodeSpring";
import type { Focus } from "../focus";
import { MIN_FLOW_A, netCurrent, netEndpoints, orientSegments, particleCount, particleSpeed } from "../flow";
import { placedPins, schematicFit, shortValue, toBoardSpace, type SchematicFit } from "./geometry";
import { drawSymbol } from "./symbolArt";

/** Height of the schematic at full explode: above the function layer. */
export const SCHEMATIC_Z_MM = EXPLODE_MM.blocks + 12;
/** Explode values over which the schematic fades in. */
export const SCHEMATIC_FADE_FROM = 0.6;
export const SCHEMATIC_FADE_TO = 1.0;

export function schematicFade(explode: number): number {
  const t = Math.min(1, Math.max(0, (explode - SCHEMATIC_FADE_FROM) / (SCHEMATIC_FADE_TO - SCHEMATIC_FADE_FROM)));
  return t * t * (3 - 2 * t);
}

const MAX_PARTICLES = 400;
const DIM = 0.2;
const HILITE = new THREE.Color(tokens.phosphor);
const WHITE = new THREE.Color("#ffffff");

const three = (p: Vec2, z = 0): THREE.Vector3 => new THREE.Vector3(p.x, -p.y, z);

interface SymbolItem {
  ref: string;
  part: Part;
  center: Vec2;            // board space
  halfW: number;           // board mm
  halfH: number;
  texture: THREE.CanvasTexture | null;
  pins: Map<string, Vec2>; // pad → board space
}

interface WireItem {
  key: string;
  netId: string;
  points: Vec2[];          // board space
}

function buildSymbols(board: Board, fit: SchematicFit): SymbolItem[] {
  const out: SymbolItem[] = [];
  for (const sym of board.schematic?.symbols ?? []) {
    const part = board.parts.find((p) => p.ref === sym.ref);
    if (!part) continue;
    const art = drawSymbol(part, sym.rotationDeg);
    let texture: THREE.CanvasTexture | null = null;
    if (art) {
      texture = new THREE.CanvasTexture(art.canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
    }
    const pins = new Map<string, Vec2>();
    for (const p of placedPins(part, sym.position, sym.rotationDeg)) pins.set(p.pad, toBoardSpace(board, fit, p.at));
    out.push({
      ref: sym.ref,
      part,
      center: toBoardSpace(board, fit, sym.position),
      halfW: (art?.halfW ?? 5) * fit.scale,
      halfH: (art?.halfH ?? 3) * fit.scale,
      texture,
      pins,
    });
  }
  return out;
}

function wireColor(board: Board, netId: string, volts: number, vmax: number): string {
  const strength = vmax > 1e-9 ? Math.min(1, Math.max(0, Math.abs(volts) / vmax)) : 0;
  const base = new THREE.Color(netColor(board, netId));
  return `#${base.multiplyScalar(0.58 + strength * 0.42).getHexString()}`;
}

export default function SchematicOverlay({ board, focus }: { board: Board; focus: Focus }): React.ReactElement | null {
  const simResult = useStore((s) => s.simResult);
  const showParticles = useStore((s) => s.showParticles);
  const fit = useMemo(() => schematicFit(board), [board]);

  // Rebuild symbol art only when the drawing could change, not on every value edit.
  const artKey = useMemo(
    () => JSON.stringify([board.schematic?.symbols, board.schematic?.size, board.parts.map((p) => [p.ref, p.kind, p.pads.map((d) => d.number)])]),
    [board],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const symbols = useMemo(() => (fit ? buildSymbols(board, fit) : []), [artKey, fit?.scale, fit?.center.x, fit?.center.y]);
  useEffect(() => () => { for (const s of symbols) s.texture?.dispose(); }, [symbols]);

  const wires: WireItem[] = useMemo(() => {
    if (!fit || !board.schematic) return [];
    return board.schematic.wires
      .filter((w) => w.points.length >= 2)
      .map((w, i) => ({ key: `${w.netId}-${i}`, netId: w.netId, points: w.points.map((p) => toBoardSpace(board, fit, p)) }));
  }, [board, fit]);

  const vmax = useMemo(() => {
    let m = 0;
    for (const v of Object.values(simResult?.netVoltages ?? {})) if (Number.isFinite(v)) m = Math.max(m, v);
    return m;
  }, [simResult]);

  // ── fade / opacity, applied every frame without re-rendering ──────────────
  const layer = useRef<THREE.Group>(null);
  const alive = useRef(false);
  const planeMat = useRef<THREE.MeshBasicMaterial>(null);
  const symbolMats = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const wireLines = useRef<({ material: THREE.Material & { opacity: number } } | null)[]>([]);
  const labelSprites = useRef<(THREE.Sprite | null)[]>([]);
  const voltSprites = useRef<(THREE.Sprite | null)[]>([]);
  const particleMat = useRef<THREE.MeshBasicMaterial>(null);
  const tetherMat = useRef<THREE.LineBasicMaterial>(null);

  // Per-item weight (1 normal, DIM dimmed), read by the frame loop.
  const symbolWeight = symbols.map((s) => (focus.active && !focus.parts.has(s.ref) ? DIM : 1));
  const wireWeight = wires.map((w) => (focus.active && !focus.nets.has(w.netId) ? DIM : 1));
  const weights = useRef({ symbolWeight, wireWeight });
  weights.current = { symbolWeight, wireWeight };

  // ── tethers: one LineSegments, positions updated per frame ────────────────
  const tether = useMemo(() => {
    const n = symbols.length;
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(n * 6), 3);
    const col = new THREE.BufferAttribute(new Float32Array(n * 8), 4);
    pos.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("position", pos);
    g.setAttribute("color", col);
    return { geometry: g, pos, col };
  }, [symbols]);
  useEffect(() => () => tether.geometry.dispose(), [tether]);

  useEffect(() => {
    // Tether colours follow the focus: highlighted cyan, normal faint white, dimmed fainter.
    symbols.forEach((s, i) => {
      const primary = focus.primaryParts.has(s.ref);
      const dimmed = focus.active && !focus.parts.has(s.ref);
      const c = primary ? HILITE : WHITE;
      const a = primary ? 0.95 : dimmed ? 0.06 : 0.3;
      for (const k of [0, 1]) tether.col.setXYZW(i * 2 + k, c.r, c.g, c.b, a);
    });
    tether.col.needsUpdate = true;
  }, [symbols, focus, tether]);

  const explodeNow = useRef(0);
  useExplodeSpring((f) => {
    explodeNow.current = f;
    const s = useStore.getState();
    const a = schematicFade(f) * (s.showSchematic ? 1 : 0) * s.schematicOpacity;
    alive.current = a > 0.05;
    if (layer.current) {
      layer.current.position.z = SCHEMATIC_Z_MM * f;
      layer.current.visible = a > 0.001;
    }
    if (planeMat.current) planeMat.current.opacity = 0.72 * a;
    const { symbolWeight: sw, wireWeight: ww } = weights.current;
    symbolMats.current.forEach((m, i) => { if (m) m.opacity = a * (sw[i] ?? 1); });
    labelSprites.current.forEach((sp, i) => { if (sp) (sp.material as THREE.SpriteMaterial).opacity = a * (sw[i] ?? 1); });
    wireLines.current.forEach((l, i) => { if (l) l.material.opacity = 0.95 * a * (ww[i] ?? 1); });
    voltSprites.current.forEach((sp) => { if (sp) (sp.material as THREE.SpriteMaterial).opacity = a; });
    if (particleMat.current) particleMat.current.opacity = a;
    if (tetherMat.current) tetherMat.current.opacity = a;

    // Tethers: symbol centre (on the layer) down to the part (on the component layer).
    const zTop = SCHEMATIC_Z_MM * f;
    const zParts = EXPLODE_MM.parts * f;
    symbols.forEach((sym, i) => {
      const p = sym.part;
      const zEnd = zParts + (p.side === "bottom" ? -board.thicknessMm : p.body.height * 0.5);
      tether.pos.setXYZ(i * 2, sym.center.x, -sym.center.y, zTop);
      tether.pos.setXYZ(i * 2 + 1, p.position.x, -p.position.y, zEnd);
    });
    tether.pos.needsUpdate = true;
  });

  // ── particles along the wires, in step with the board's ──────────────────
  const flow = useMemo(() => {
    const segs: { a: THREE.Vector3; b: THREE.Vector3; dir: number; speed: number; count: number }[] = [];
    if (!simResult) return { segs, total: 0 };
    let maxI = MIN_FLOW_A;
    for (const n of board.nets) maxI = Math.max(maxI, netCurrent(board, simResult, n.id));
    const pinOf = (ref: string, pad: string): Vec2 | null => symbols.find((s) => s.ref === ref)?.pins.get(pad) ?? null;
    let budget = MAX_PARTICLES;
    const byNet = new Map<string, WireItem[]>();
    for (const w of wires) byNet.set(w.netId, [...(byNet.get(w.netId) ?? []), w]);
    for (const [netId, list] of byNet) {
      const amps = netCurrent(board, simResult, netId);
      if (amps < MIN_FLOW_A) continue;
      const frac = amps / maxI;
      const raw = list.flatMap((w) => w.points.slice(1).map((b, i) => ({ a: w.points[i]!, b })));
      const { sources, sinks } = netEndpoints(board, simResult, netId);
      const dirs = orientSegments(
        raw,
        sources.map((r) => pinOf(r.ref, r.pad)).filter((p): p is Vec2 => p !== null),
        sinks.map((r) => pinOf(r.ref, r.pad)).filter((p): p is Vec2 => p !== null),
      );
      raw.forEach((s, i) => {
        if (budget <= 0) return;
        const count = Math.min(budget, particleCount(frac));
        budget -= count;
        segs.push({ a: three(s.a, 0.06), b: three(s.b, 0.06), dir: dirs[i] ?? 1, speed: particleSpeed(frac), count });
      });
    }
    return { segs, total: segs.reduce((n, s) => n + s.count, 0) };
  }, [board, simResult, wires, symbols]);

  const particles = useRef<THREE.InstancedMesh>(null);
  const phases = useRef(new Float32Array(MAX_PARTICLES));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame((_, delta) => {
    const mesh = particles.current;
    if (!mesh || flow.total === 0 || !layer.current?.visible) return;
    const sign = useStore.getState().electronFlow ? -1 : 1;
    let i = 0;
    for (const seg of flow.segs) {
      const len = Math.max(seg.a.distanceTo(seg.b), 0.001);
      for (let k = 0; k < seg.count; k++, i++) {
        let ph = phases.current[i] || k / seg.count;
        ph += (sign * seg.dir * seg.speed * delta) / len;
        ph = ((ph % 1) + 1) % 1;
        phases.current[i] = ph;
        dummy.position.lerpVectors(seg.a, seg.b, ph);
        dummy.scale.setScalar(0.42);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  });

  // ── interaction ────────────────────────────────────────────────────────────
  const hoverPart = (ref: string) => (e: ThreeEvent<PointerEvent>): void => {
    if (!alive.current) return;
    e.stopPropagation();
    useStore.getState().setHover({ kind: "part", ref });
  };
  const hoverNet = (netId: string) => (e: ThreeEvent<PointerEvent>): void => {
    if (!alive.current) return;
    e.stopPropagation();
    useStore.getState().setHover({ kind: "net", netId });
  };
  const select = (sel: { kind: "part"; ref: string } | { kind: "net"; netId: string }) => (e: ThreeEvent<MouseEvent>): void => {
    if (!alive.current) return;
    e.stopPropagation();
    useStore.getState().setSelection(sel);
  };

  if (!fit) return null;
  const { bounds } = fit;
  const plane = {
    cx: (bounds.minX + bounds.maxX) / 2,
    cy: -(bounds.minY + bounds.maxY) / 2,
    w: bounds.maxX - bounds.minX,
    h: bounds.maxY - bounds.minY,
  };

  // Voltage labels: only for the hovered or selected nets.
  const voltLabels = [...focus.primaryNets].flatMap((netId) => {
    const w = wires.find((x) => x.netId === netId);
    if (!w) return [];
    let best = 0, at = w.points[0]!;
    for (let i = 1; i < w.points.length; i++) {
      const a = w.points[i - 1]!, b = w.points[i]!;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > best) { best = d; at = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }
    }
    const v = simResult?.netVoltages[netId] ?? 0;
    const name = board.nets.find((n) => n.id === netId)?.name ?? netId;
    return [{ netId, at, text: name, detail: formatQuantity(v, "V") }];
  });

  return (
    <>
      <group ref={layer} visible={false}>
        {/* Translucent dark ground the schematic is drawn on. */}
        <mesh position={[plane.cx, plane.cy, 0]} raycast={() => null} renderOrder={20}>
          <planeGeometry args={[plane.w, plane.h]} />
          <meshBasicMaterial ref={planeMat} color={tokens.bg} transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>

        {/* Wires, tinted by voltage; cyan and thicker when highlighted. */}
        {wires.map((w, i) => {
          const primary = focus.primaryNets.has(w.netId);
          const v = simResult?.netVoltages[w.netId] ?? 0;
          return (
            <group key={w.key}>
              <Line
                ref={(l) => { wireLines.current[i] = l as unknown as { material: THREE.Material & { opacity: number } } | null; }}
                points={w.points.map((p) => three(p, 0.02))}
                color={primary ? tokens.phosphor : wireColor(board, w.netId, v, vmax)}
                lineWidth={primary ? 2.8 : 1.6}
                transparent
                opacity={0}
                depthWrite={false}
                toneMapped={false}
                renderOrder={21}
                raycast={() => null}
              />
              {/* Wide invisible ribbons so thin wires are easy to point at. */}
              {w.points.slice(1).map((b, k) => {
                const a = w.points[k]!;
                const len = Math.hypot(b.x - a.x, b.y - a.y);
                if (len < 1e-6) return null;
                return (
                  <mesh
                    key={k}
                    position={[(a.x + b.x) / 2, -(a.y + b.y) / 2, 0.03]}
                    rotation={[0, 0, Math.atan2(-(b.y - a.y), b.x - a.x)]}
                    onPointerOver={hoverNet(w.netId)}
                    onPointerOut={() => useStore.getState().clearHover({ kind: "net", netId: w.netId })}
                    onClick={select({ kind: "net", netId: w.netId })}
                  >
                    <planeGeometry args={[len + 0.6, 1.4]} />
                    <meshBasicMaterial visible={false} />
                  </mesh>
                );
              })}
            </group>
          );
        })}

        {/* Symbols. */}
        {symbols.map((s, i) => (
          <mesh
            key={s.ref}
            position={[s.center.x, -s.center.y, 0.04]}
            renderOrder={22}
            onPointerOver={hoverPart(s.ref)}
            onPointerOut={() => useStore.getState().clearHover({ kind: "part", ref: s.ref })}
            onClick={select({ kind: "part", ref: s.ref })}
          >
            <planeGeometry args={[s.halfW * 2, s.halfH * 2]} />
            <meshBasicMaterial
              ref={(m) => { symbolMats.current[i] = m; }}
              map={s.texture}
              color={focus.primaryParts.has(s.ref) ? HILITE : WHITE}
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}

        {/* Ref and value, upright and screen-sized. */}
        {symbols.map((s, i) => (
          <LabelSprite
            key={`label-${s.ref}`}
            ref={(sp) => { labelSprites.current[i] = sp; }}
            text={s.ref}
            detail={shortValue(s.part.value)}
            color={focus.primaryParts.has(s.ref) ? tokens.phosphor : tokens.text}
            position={[s.center.x - s.halfW, -(s.center.y - s.halfH) + 0.3, 0.1]}
            sizePx={10}
          />
        ))}

        {/* Voltage of the hovered or selected net. */}
        {voltLabels.map((l, i) => (
          <LabelSprite
            key={`v-${l.netId}`}
            ref={(sp) => { voltSprites.current[i] = sp; }}
            text={l.text}
            detail={l.detail}
            color={tokens.phosphor}
            position={[l.at.x, -l.at.y + 0.6, 0.12]}
            sizePx={11}
          />
        ))}

        {showParticles && flow.total > 0 && (
          <instancedMesh ref={particles} args={[undefined, undefined, Math.max(flow.total, 1)]} frustumCulled={false} renderOrder={23}>
            <sphereGeometry args={[0.5, 8, 6]} />
            <meshBasicMaterial
              ref={particleMat}
              color={tokens.phosphor}
              blending={THREE.AdditiveBlending}
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </instancedMesh>
        )}
      </group>

      {/* Tethers from each symbol down to its part. */}
      <lineSegments geometry={tether.geometry} frustumCulled={false} raycast={() => null} renderOrder={19} visible>
        <lineBasicMaterial ref={tetherMat} vertexColors transparent opacity={0} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </>
  );
}
