/**
 * kit.ts — per-part material set.
 *
 * Every part instance owns its materials so selection focus can fade one part
 * without touching the others. Materials are created on first use, and the kit
 * eases all of them toward a target opacity each frame.
 */
import * as THREE from "three";
import { part as finish } from "../palette";

type Finish =
  | "epoxy" | "tin" | "gold" | "solder" | "alumina" | "resistorTop" | "mlcc"
  | "nylonBlack" | "nylonYellow" | "trimmerBlue" | "trimmerRotor" | "aluminium"
  | "rubber" | "ledBase" | "fuseBody" | "cavity";

function create(kind: Finish): THREE.MeshStandardMaterial {
  const m = (color: string, roughness: number, metalness: number) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  switch (kind) {
    case "epoxy": return m(finish.epoxy, 0.55, 0);
    case "tin": return m(finish.tin, 0.38, 1);
    case "gold": return m(finish.gold, 0.22, 1);
    case "solder": return m(finish.solder, 0.18, 1);
    case "alumina": return m(finish.alumina, 0.6, 0);
    case "resistorTop": return m(finish.resistorTop, 0.4, 0);
    case "mlcc": return m(finish.mlcc, 0.62, 0);
    case "nylonBlack": return m(finish.nylonBlack, 0.68, 0);
    case "nylonYellow": return m(finish.nylonYellow, 0.5, 0);
    case "trimmerBlue": return m(finish.trimmerBlue, 0.38, 0);
    case "trimmerRotor": return m(finish.trimmerRotor, 0.55, 0);
    case "aluminium": return m(finish.canAluminium, 0.3, 0.95);
    case "rubber": return m(finish.rubber, 0.9, 0);
    case "ledBase": return m(finish.ledBase, 0.5, 0);
    case "fuseBody": return m(finish.fuseBody, 0.55, 0);
    case "cavity": return m("#050505", 0.95, 0);
  }
}

const DIM_OPACITY = 0.18;
/** Opacity time constant: ~200 ms to settle. */
const DIM_TAU = 0.06;

export class MaterialKit {
  private readonly cache = new Map<string, THREE.Material>();
  private readonly owned: THREE.Material[] = [];
  private readonly textures: THREE.Texture[] = [];
  private opacity = 1;

  get(kind: Finish): THREE.MeshStandardMaterial {
    const hit = this.cache.get(kind);
    if (hit) return hit as THREE.MeshStandardMaterial;
    const made = create(kind);
    this.cache.set(kind, made);
    this.owned.push(made);
    return made;
  }

  /** Register a material built by a family (decals, lenses) so it dims too. */
  adopt<T extends THREE.Material>(material: T): T {
    this.owned.push(material);
    return material;
  }

  /** A decal material: canvas-drawn marking over a base colour. */
  decal(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, widthPx: number, heightPx: number, params: Partial<THREE.MeshStandardMaterialParameters>): THREE.MeshStandardMaterial {
    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (ctx) draw(ctx, widthPx, heightPx);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    this.textures.push(map);
    return this.adopt(new THREE.MeshStandardMaterial({ map, ...params }));
  }

  /** Current focus opacity (1 = fully shown), for materials a family animates itself. */
  get focus(): number {
    return this.opacity;
  }

  /** Ease every material toward the dimmed or focused opacity. */
  step(dimmed: boolean, delta: number): void {
    const target = dimmed ? DIM_OPACITY : 1;
    if (Math.abs(this.opacity - target) < 1e-3) return;
    this.opacity += (target - this.opacity) * (1 - Math.exp(-delta / DIM_TAU));
    if (Math.abs(this.opacity - target) < 1e-3) this.opacity = target;
    const fading = this.opacity < 0.995;
    for (const m of this.owned) {
      const base = (m.userData["baseOpacity"] as number | undefined) ?? 1;
      if (m.transparent !== (fading || base < 1)) {
        m.transparent = fading || base < 1;
        m.needsUpdate = true;
      }
      m.opacity = base * this.opacity;
      m.depthWrite = !fading;
    }
  }

  dispose(): void {
    for (const m of this.owned) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
