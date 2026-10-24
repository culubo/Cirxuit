#!/usr/bin/env node
/**
 * prepare-microduck — fetches the Microduck model and walking policy and writes
 * a browser-sized copy to public/models/microduck/.
 *
 *   node scripts/prepare-microduck.mjs
 *
 * Sources (pinned):
 *   - MJCF + meshes: github.com/pollen-robotics/microduck_rl @ MODEL_COMMIT
 *     (XML: Apache-2.0; STL meshes: CC BY-NC-SA 4.0, Pollen Robotics)
 *   - Policy: huggingface.co/pollen-robotics/microduck-policies @ POLICY_REV
 *     (velstand.onnx, Apache-2.0)
 *
 * The STL meshes are decimated (meshoptimizer) so the model loads in a browser;
 * that is a modification under CC BY-NC-SA 4.0, noted in the generated README.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MeshoptSimplifier } from "meshoptimizer";

const MODEL_REPO = "https://github.com/pollen-robotics/microduck_rl.git";
const MODEL_COMMIT = "b02fdea4902c2b93b7d34a83a6f05da4ececb7d3";
const POLICY_REV = "665ae4eb20bfe13bca1ef4ea6d4bb6b4a096e448";
const POLICY_FILE = "velstand.onnx";
const ROBOT_DIR = "src/mjlab_microduck/robot/microduck";
const OUT = path.resolve("public/models/microduck");

/** Keep this share of each mesh's triangles (at least MIN_TRIS). */
const KEEP = 0.06;
const MIN_TRIS = 120;

function run(cmd, args, cwd) {
  execFileSync(cmd, args, { cwd, stdio: ["ignore", "ignore", "inherit"] });
}

function checkout() {
  const dir = path.join(os.tmpdir(), "microduck_rl-" + MODEL_COMMIT.slice(0, 7));
  if (!fs.existsSync(path.join(dir, ROBOT_DIR, "scene.xml"))) {
    fs.rmSync(dir, { recursive: true, force: true });
    run("git", ["clone", "--filter=blob:none", "--no-checkout", MODEL_REPO, dir]);
    run("git", ["sparse-checkout", "set", ROBOT_DIR], dir);
    run("git", ["checkout", MODEL_COMMIT], dir);
  }
  return path.join(dir, ROBOT_DIR);
}

/** Binary or ASCII STL → welded, indexed triangle mesh. */
function readStl(buf) {
  const ascii = buf.subarray(0, 5).toString() === "solid" && !buf.subarray(80, 84).equals(Buffer.alloc(4)) &&
    buf.length !== 84 + buf.readUInt32LE(80) * 50;
  const soup = [];
  if (ascii) {
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
    for (let m; (m = re.exec(buf.toString())); ) soup.push(+m[1], +m[2], +m[3]);
  } else {
    const n = buf.readUInt32LE(80);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let k = 0; k < 9; k++) soup.push(buf.readFloatLE(o + k * 4));
    }
  }
  const map = new Map();
  const verts = [];
  const index = new Uint32Array(soup.length / 3);
  for (let i = 0; i < soup.length; i += 3) {
    const key = `${soup[i].toFixed(6)},${soup[i + 1].toFixed(6)},${soup[i + 2].toFixed(6)}`;
    let id = map.get(key);
    if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(soup[i], soup[i + 1], soup[i + 2]); }
    index[i / 3] = id;
  }
  return { positions: new Float32Array(verts), index };
}

function writeStl(positions, index) {
  const tris = index.length / 3;
  const buf = Buffer.alloc(84 + tris * 50);
  buf.write("decimated from Pollen Robotics Microduck (CC BY-NC-SA 4.0)".padEnd(80).slice(0, 80), 0, "ascii");
  buf.writeUInt32LE(tris, 80);
  for (let t = 0; t < tris; t++) {
    const o = 84 + t * 50;
    const p = [0, 1, 2].map((k) => index[t * 3 + k] * 3);
    const [a, b, c] = p.map((i) => [positions[i], positions[i + 1], positions[i + 2]]);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = u[1] * v[2] - u[2] * v[1], ny = u[2] * v[0] - u[0] * v[2], nz = u[0] * v[1] - u[1] * v[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    [nx, ny, nz, ...a, ...b, ...c].forEach((x, k) => buf.writeFloatLE(x, o + k * 4));
  }
  return buf;
}

async function main() {
  await MeshoptSimplifier.ready;
  const src = checkout();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, "assets"), { recursive: true });

  // scene.xml includes robot_groundcontact.xml: the model with body collision,
  // so a fallen duck lies on the floor instead of sinking through it.
  const files = ["scene.xml", "robot_groundcontact.xml"];
  for (const f of files) fs.copyFileSync(path.join(src, f), path.join(OUT, f));
  const xml = fs.readFileSync(path.join(src, "robot_groundcontact.xml"), "utf8");
  const meshes = [...new Set([...xml.matchAll(/<mesh\b[^>]*\bfile="([^"]+)"/g)].map((m) => m[1]))];

  let before = 0, after = 0;
  for (const file of meshes) {
    const buf = fs.readFileSync(path.join(src, "assets", file));
    before += buf.length;
    const { positions, index } = readStl(buf);
    const target = Math.max(MIN_TRIS * 3, Math.floor((index.length * KEEP) / 3) * 3);
    const [simplified] = target < index.length
      // Error bound is relative to the mesh's extent: 1% keeps silhouettes intact.
      ? MeshoptSimplifier.simplify(index, positions, 3, target, 0.01)
      : [index];
    const out = writeStl(positions, simplified.length >= 12 ? simplified : index);
    fs.writeFileSync(path.join(OUT, "assets", file), out);
    after += out.length;
  }

  const res = await fetch(`https://huggingface.co/pollen-robotics/microduck-policies/resolve/${POLICY_REV}/${POLICY_FILE}`);
  if (!res.ok) throw new Error(`policy download failed: ${res.status}`);
  fs.writeFileSync(path.join(OUT, POLICY_FILE), Buffer.from(await res.arrayBuffer()));

  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({
    scene: "scene.xml",
    xml: files,
    meshes: meshes.map((m) => `assets/${m}`),
    policy: POLICY_FILE,
    source: { model: `${MODEL_REPO}@${MODEL_COMMIT}`, policy: `pollen-robotics/microduck-policies@${POLICY_REV}` },
  }, null, 2) + "\n");

  fs.writeFileSync(path.join(OUT, "README.md"), `# Microduck

Model and walking policy of Microduck by **Pollen Robotics**, used by Circxit's
Robot view (non-commercial project).

- MJCF (\`scene.xml\`, \`robot_groundcontact.xml\`): from
  [pollen-robotics/microduck_rl](https://github.com/pollen-robotics/microduck_rl)
  @ \`${MODEL_COMMIT.slice(0, 7)}\`, Apache License 2.0.
- Meshes (\`assets/*.stl\`): Copyright Pollen Robotics, licensed under
  [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).
  **Modified**: decimated to about ${Math.round(KEEP * 100)}% of their triangles so the model
  loads in a browser. These adapted meshes are licensed under CC BY-NC-SA 4.0 as well.
- Policy (\`${POLICY_FILE}\`): from
  [pollen-robotics/microduck-policies](https://huggingface.co/pollen-robotics/microduck-policies)
  @ \`${POLICY_REV.slice(0, 7)}\`, Apache License 2.0. Unmodified.

Regenerate with \`node scripts/prepare-microduck.mjs\`.
`);
  console.log(`meshes: ${meshes.length}, ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(2)} MB`);
}

await main();
