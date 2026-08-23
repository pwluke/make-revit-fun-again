/**
 * Style-suffix control: does the art-direction string change the model?
 *
 * n=1 per arm. fal returns seed: null for this endpoint, so runs cannot be
 * pinned -- any difference here could be the suffix OR a different roll.
 * Treat as suggestive, not conclusive.
 *
 * Both arms are submitted concurrently so they face the same queue depth.
 *
 *   node --env-file=<path to .env> scripts/bench-suffix.mjs
 */
import { writeFile } from "node:fs/promises";
import { fal } from "@fal-ai/client";

const SKETCH_URL =
  process.env.SKETCH_URL ??
  "https://v3b.fal.media/files/b/0a86888c/Zlw8twOa43SKkCXmTdw3-.png";
const USER_TEXT = process.env.PROMPT ?? "orange cat";
const STYLE_SUFFIX =
  "simple cute toy figure, smooth rounded forms, soft matte colors, clean silhouette";
const FACE_COUNT = 40000;
const OUT_DIR = new URL("../public/", import.meta.url);

if (!process.env.FAL_KEY) {
  console.error("FAL_KEY not set. Pass --env-file=<path to .env with FAL_KEY>.");
  process.exit(1);
}

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function glbStats(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const view = new DataView(buf.buffer);
  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");

  const gltf = JSON.parse(
    new TextDecoder().decode(buf.subarray(20, 20 + view.getUint32(12, true))),
  );

  let triangles = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const acc =
        prim.indices !== undefined
          ? gltf.accessors[prim.indices]
          : gltf.accessors[prim.attributes.POSITION];
      triangles += acc.count / 3;
    }
  }

  const textureBytes = (gltf.images ?? []).reduce((sum, img) => {
    const bv = img.bufferView !== undefined ? gltf.bufferViews[img.bufferView] : null;
    return sum + (bv?.byteLength ?? 0);
  }, 0);

  return { buf, bytes: buf.byteLength, triangles, textureBytes };
}

async function arm(label, prompt, filename) {
  const startedAt = Date.now();
  const result = await fal.subscribe("fal-ai/hunyuan3d-v3/sketch-to-3d", {
    input: {
      input_image_url: SKETCH_URL,
      prompt,
      enable_pbr: false,
      face_count: FACE_COUNT,
    },
  });
  const total = Date.now() - startedAt;

  const url =
    result.data.model_glb?.url ??
    result.data.model_urls?.glb ??
    result.data.model_mesh?.url;
  const stats = await glbStats(url);
  await writeFile(new URL(filename, OUT_DIR), stats.buf);

  return { label, prompt, total, filename, seed: result.data.seed ?? null, ...stats };
}

console.log(`sketch: ${SKETCH_URL}`);
console.log(`user text: "${USER_TEXT}"\n`);
console.log("submitting both arms concurrently...\n");

const [on, off] = await Promise.all([
  arm("suffix ON ", `${USER_TEXT}, ${STYLE_SUFFIX}`, "suffix-on.glb"),
  arm("suffix OFF", USER_TEXT, "suffix-off.glb"),
]);

for (const r of [on, off]) {
  console.log(`${r.label}  ${s(r.total)}  ${mb(r.bytes)}  ` +
    `${r.triangles.toLocaleString()} tris  texture ${mb(r.textureBytes)}  seed ${r.seed}`);
  console.log(`            prompt: "${r.prompt}"`);
  console.log(`            saved:  public/${r.filename}`);
}

console.log(
  `\ndelta: ${mb(Math.abs(on.bytes - off.bytes))} file, ` +
    `${Math.abs(on.triangles - off.triangles).toLocaleString()} tris, ` +
    `${mb(Math.abs(on.textureBytes - off.textureBytes))} texture`,
);
console.log("\nn=1 per arm and seed is null -- differences are suggestive, not proof.");
console.log("Visual comparison is the real test; both GLBs are in public/.");
