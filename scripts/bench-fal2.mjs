/**
 * Arms A40 / B1 / B2 of the sketch-to-3d benchmark.
 *
 *   A40  sketch-to-3d with face_count 40000   -> does the floor get honoured, and is it faster?
 *   B1   sketch -> photoreal image (SDXL ControlNet canny)
 *   B2   that image -> 3d (hunyuan3d-v3/image-to-3d)
 *
 * A40 vs B1+B2 settles whether splitting the call is worth it. GLB stats are
 * parsed from the returned file because a 200 does not prove face_count was
 * respected -- see spec section 12 open question 2.
 *
 *   node --env-file=<path to .env> scripts/bench-fal2.mjs
 */
import { fal } from "@fal-ai/client";

const SKETCH_URL =
  process.env.SKETCH_URL ??
  "https://v3b.fal.media/files/b/0a86888c/Zlw8twOa43SKkCXmTdw3-.png";
const PROMPT = process.env.PROMPT ?? "orange cat";
const FACE_COUNT = 40000;

if (!process.env.FAL_KEY) {
  console.error("FAL_KEY not set. Pass --env-file=<path to .env with FAL_KEY>.");
  process.exit(1);
}

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Runs one endpoint, separating queue wait from compute. */
async function timed(label, endpoint, input) {
  const submittedAt = Date.now();
  let inProgressAt = null;
  let lastStatus = null;

  const result = await fal.subscribe(endpoint, {
    input,
    onQueueUpdate: (update) => {
      if (update.status !== lastStatus) {
        lastStatus = update.status;
        console.log(`  [${s(Date.now() - submittedAt)}] ${update.status}`);
      }
      if (update.status === "IN_PROGRESS" && inProgressAt === null) {
        inProgressAt = Date.now();
      }
    },
  });

  const total = Date.now() - submittedAt;
  const queue = inProgressAt ? inProgressAt - submittedAt : 0;
  console.log(
    `  ${label}: total ${s(total)} = queue ${s(queue)} + compute ${s(total - queue)}`,
  );
  return { label, total, queue, compute: total - queue, data: result.data };
}

/**
 * Counts triangles by parsing the GLB's JSON chunk directly. Sums over mesh
 * primitive definitions, so a mesh instanced by several nodes counts once --
 * fine for single-object output, worth remembering if that ever changes.
 */
async function glbStats(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const view = new DataView(buf.buffer);

  if (view.getUint32(0, true) !== 0x46546c67) throw new Error("not a GLB");
  const jsonLength = view.getUint32(12, true);
  const gltf = JSON.parse(
    new TextDecoder().decode(buf.subarray(20, 20 + jsonLength)),
  );

  let triangles = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      // mode 4 == TRIANGLES, and it is the glTF default when absent.
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

  return {
    bytes: buf.byteLength,
    triangles,
    images: (gltf.images ?? []).length,
    textureBytes,
  };
}

const glbUrl = (data) =>
  data.model_glb?.url ?? data.model_urls?.glb ?? data.model_mesh?.url;

async function reportGlb(data) {
  const url = glbUrl(data);
  if (!url) {
    console.log(`  no GLB url in response; keys: ${Object.keys(data).join(", ")}`);
    return null;
  }
  const stats = await glbStats(url);
  console.log(
    `  GLB ${mb(stats.bytes)}, ${stats.triangles.toLocaleString()} triangles, ` +
      `${stats.images} image(s) ${mb(stats.textureBytes)}`,
  );
  return stats;
}

console.log(`sketch: ${SKETCH_URL}`);
console.log(`prompt: ${PROMPT}\n`);

// --- A40 -------------------------------------------------------------------
console.log(`A40  sketch-to-3d, face_count ${FACE_COUNT}`);
const a40 = await timed("A40", "fal-ai/hunyuan3d-v3/sketch-to-3d", {
  input_image_url: SKETCH_URL,
  prompt: PROMPT,
  enable_pbr: false,
  face_count: FACE_COUNT,
});
const a40Glb = await reportGlb(a40.data);
console.log("");

// --- B1 --------------------------------------------------------------------
console.log("B1   sketch -> photoreal image");
const b1 = await timed("B1", "fal-ai/fast-sdxl-controlnet-canny", {
  prompt: `${PROMPT}, photorealistic product photo, plain background, soft studio lighting`,
  control_image_url: SKETCH_URL,
});
const imageUrl = b1.data.images?.[0]?.url;
console.log(`  image: ${imageUrl}`);
console.log("");

// --- B2 --------------------------------------------------------------------
console.log("B2   image -> 3d");
let b2;
try {
  b2 = await timed("B2", "fal-ai/hunyuan3d-v3/image-to-3d", {
    input_image_url: imageUrl,
    enable_pbr: false,
    face_count: FACE_COUNT,
  });
} catch (err) {
  // image-to-3d's documented schema only shows input_image_url; if the extra
  // params are rejected, fall back so the latency number is still obtained.
  console.log(`  rejected with face_count/enable_pbr (${err.message}); retrying bare`);
  b2 = await timed("B2", "fal-ai/hunyuan3d-v3/image-to-3d", {
    input_image_url: imageUrl,
  });
}
const b2Glb = await reportGlb(b2.data);
console.log("");

// --- verdict ---------------------------------------------------------------
const splitTotal = b1.total + b2.total;
console.log("--- verdict ---");
console.log(`A40 single-stage : ${s(a40.total)}`);
console.log(`B1 + B2 split    : ${s(splitTotal)}  (${s(b1.total)} + ${s(b2.total)})`);
console.log(
  `split is ${splitTotal < a40.total ? "FASTER" : "SLOWER"} by ${s(Math.abs(splitTotal - a40.total))}`,
);
console.log(
  `\nface_count ${FACE_COUNT} requested -> A40 got ${a40Glb?.triangles.toLocaleString() ?? "?"} triangles ` +
    `(${a40Glb && Math.abs(a40Glb.triangles - FACE_COUNT) / FACE_COUNT < 0.05 ? "HONOURED" : "NOT honoured"})`,
);
if (b2Glb) console.log(`B2 GLB: ${b2Glb.triangles.toLocaleString()} triangles`);
