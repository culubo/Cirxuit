/**
 * geometry.ts — reusable component geometry, built in a part's local frame
 * (mm, +x/+y in the board plane with +y toward the board's top edge, +z up
 * off the copper).
 */
import * as THREE from "three";

export interface GullWing {
  /** Where the lead leaves the body, in the local plane. */
  from: THREE.Vector2;
  /** Unit direction out of the body. */
  dir: THREE.Vector2;
  /** Body edge to toe, measured along dir. */
  reach: number;
  /** Length of the flat foot that sits on the land. */
  foot: number;
  /** Height above the copper where the lead exits the moulding. */
  exitZ: number;
  width: number;
  thickness: number;
}

/** One formed gull-wing lead: shoulder, bend, and foot. */
function gullWingGeometry(lead: GullWing): THREE.BufferGeometry {
  const t = lead.thickness;
  const shoulder = Math.min(0.15, lead.reach * 0.2);
  const knee = lead.reach - lead.foot;
  // Profile in (along, z), extruded across the lead width.
  const profile = new THREE.Shape();
  profile.moveTo(0, lead.exitZ + t / 2);
  profile.lineTo(shoulder, lead.exitZ + t / 2);
  profile.lineTo(knee, t);
  profile.lineTo(lead.reach, t);
  profile.lineTo(lead.reach, 0);
  profile.lineTo(knee - t * 0.6, 0);
  profile.lineTo(shoulder - t * 0.4, lead.exitZ - t / 2);
  profile.lineTo(0, lead.exitZ - t / 2);
  profile.closePath();
  const geom = new THREE.ExtrudeGeometry(profile, { depth: lead.width, bevelEnabled: false });
  // Shape x → along, shape y → z, extrusion → across.
  geom.translate(0, 0, -lead.width / 2);
  geom.rotateX(Math.PI / 2);
  geom.rotateZ(Math.atan2(lead.dir.y, lead.dir.x));
  geom.translate(lead.from.x, lead.from.y, 0);
  return geom;
}

export function gullWings(leads: GullWing[]): THREE.BufferGeometry {
  return merge(leads.map(gullWingGeometry));
}

/**
 * A solder fillet: a wedge rising from the land toward a termination face.
 * `at` is the foot of the termination face; the wedge runs `run` mm along dir.
 */
export function solderFillet(at: THREE.Vector2, dir: THREE.Vector2, width: number, run: number, rise: number): THREE.BufferGeometry {
  const profile = new THREE.Shape();
  profile.moveTo(0, 0);
  profile.lineTo(run, 0);
  profile.quadraticCurveTo(run * 0.25, rise * 0.15, 0, rise);
  profile.closePath();
  const geom = new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false, curveSegments: 6 });
  geom.translate(0, 0, -width / 2);
  geom.rotateX(Math.PI / 2);
  geom.rotateZ(Math.atan2(dir.y, dir.x));
  geom.translate(at.x, at.y, 0);
  return geom;
}

/** A box with its base on z = z0. */
export function box(w: number, d: number, h: number, x = 0, y = 0, z0 = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, d, h);
  g.translate(x, y, z0 + h / 2);
  return g;
}

/**
 * A moulded block whose sides taper inward by `draft` mm toward the top, base
 * on z0. Keeps BoxGeometry's face groups (+x, -x, +y, -y, +z, -z), so a
 * material array can put a marking decal on the top face (index 4).
 */
export function draftedBlock(w: number, d: number, h: number, draft: number, z0 = 0): THREE.BoxGeometry {
  const geom = new THREE.BoxGeometry(w, d, h);
  const pos = geom.attributes["position"] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) <= 0) continue;
    pos.setXY(i, pos.getX(i) * (1 - (2 * draft) / w), pos.getY(i) * (1 - (2 * draft) / d));
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  geom.translate(0, 0, z0 + h / 2);
  return geom;
}

/**
 * Concatenate geometries into one non-indexed geometry (position, normal, uv)
 * so a part's leads or pins draw in a single call. Disposes the inputs.
 */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const count = flat.reduce((n, g) => n + (g.attributes["position"]?.count ?? 0), 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let offset = 0;
  for (const g of flat) {
    const pos = g.attributes["position"];
    if (!pos) continue;
    if (!g.attributes["normal"]) g.computeVertexNormals();
    position.set(pos.array as Float32Array, offset * 3);
    normal.set(g.attributes["normal"]!.array as Float32Array, offset * 3);
    const tex = g.attributes["uv"];
    if (tex) uv.set(tex.array as Float32Array, offset * 2);
    offset += pos.count;
  }
  for (const g of new Set([...parts, ...flat])) g.dispose();
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return merged;
}
