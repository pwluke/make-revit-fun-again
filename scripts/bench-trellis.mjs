/**
 * TRELLIS spike: is a cheaper, possibly faster 3D stage worth switching to?
 *
 * Context from the measurements already in docs/specs/2026-08-22-sketch-to-3d-design.md:
 *   - hunyuan3d-v3/sketch-to-3d at face_count 40000 is 105.2s compute, $0.525,
 *     13.6 MB GLB of which 93% is ONE 12.6 MB base-colour texture.
 *   - The ControlNet prep stage is only 6.2s, so the 3D stage is essentially the
 *     entire time budget. That makes swapping just the 3D stage a clean experiment.
 *
 * TRELLIS is $0.02 (26x cheaper) but publishes no latency figure anywhere, so the
 * speed question can only be answered by running it. It also takes photo-like
 * images rather than line art, hence the ControlNet stage below.
 *
 * Two things this measures that the docs cannot tell you:
 *   1. Compute time. Unpublished. The whole reason this script exists.
 *   2. `texture_size`. Hunyuan's sketch endpoint has no such control, and texture
 *      is 93% of the current payload -- so 512 attacks the actual problem, where
 *      face_count only ever addressed the remaining 7%.
 *
 * On `mesh_simplify`: fal documents it only as "Mesh simplification factor",
 * default 0.95, without stating which direction is more aggressive. Arms T2/T3
 * differ ONLY in that value so the triangle counts reveal the direction. Do not
 * assume it -- read it off the output.
 *
 *   node --env-file=<path to .env> scripts/bench-trellis.mjs
 *
 * Cost: ~$0.06 (3 x TRELLIS) + one ControlNet call. Set IMAGE_URL to reuse an
 * image from a previous run and skip the ControlNet stage entirely.
 *
 * Helpers below mirror bench-fal2.mjs. These scripts are deliberately standalone
 * -- each one is the record of a run that was actually made, and sharing a module
 * between them would let a later edit silently change what an earlier result meant.
 */
import { fal } from "@fal-ai/client";

const SKETCH_URL =
  process.env.SKETCH_URL ??
  "https://v3b.fal.media/files/b/0a86888c/Zlw8twOa43SKkCXmTdw3-.png";
const PROMPT = process.env.PROMPT ?? "orange cat";
/** Set to skip the ControlNet stage and re-run only the TRELLIS arms. */
const IMAGE_URL = process.env.IMAGE_URL ?? null;

/** Recorded hunyuan baseline to compare against -- see spec section 6. */
const BASELINE = { label: "hunyuan sketch-to-3d @40k", compute: 105_200, bytes: 13.6e6 };

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
 * Counts triangles by parsing the GLB's JSON chunk directly. A 200 does not prove
 * a simplification parameter was respected -- the same lesson face_count taught.
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
  data.model_mesh?.url ?? data.model_glb?.url ?? data.model_urls?.glb;

async function reportGlb(data) {
  const url = glbUrl(data);
  if (!url) {
    console.log(`  no GLB url in response; keys: ${Object.keys(data).join(", ")}`);
    return null;
  }
  const stats = await glbStats(url);
  const share = stats.bytes ? Math.round((stats.textureBytes / stats.bytes) * 100) : 0;
  console.log(
    `  GLB ${mb(stats.bytes)}, ${stats.triangles.toLocaleString()} triangles, ` +
      `${stats.images} image(s) ${mb(stats.textureBytes)} (${share}% of payload)`,
  );
  console.log(`  url: ${url}`);
  return { ...stats, share };
}

console.log(`sketch: ${SKETCH_URL}`);
console.log(`prompt: ${PROMPT}\n`);

// --- C1: sketch -> photo-like image ----------------------------------------
// TRELLIS has no line-art support, so this bridges. Measured at 6.2s previously;
// it is not the bottleneck and is skipped entirely when IMAGE_URL is supplied.
let imageUrl = IMAGE_URL;
if (imageUrl) {
  console.log(`C1   skipped, reusing IMAGE_URL: ${imageUrl}\n`);
} else {
  console.log("C1   sketch -> photo-like image");
  const c1 = await timed("C1", "fal-ai/fast-sdxl-controlnet-canny", {
    prompt: `${PROMPT}, photorealistic product photo, plain background, soft studio lighting`,
    control_image_url: SKETCH_URL,
  });
  imageUrl = c1.data.images?.[0]?.url;
  console.log(`  image: ${imageUrl}`);
  console.log("  (re-run with IMAGE_URL=<that url> to skip this stage)\n");
}

if (!imageUrl) {
  console.error("No image URL produced; cannot run the TRELLIS arms.");
  process.exit(1);
}

// --- TRELLIS arms ----------------------------------------------------------
// T1 is stock defaults. T2 changes ONLY texture_size, so any payload delta is
// attributable to it. T3 changes ONLY mesh_simplify against T2, so the triangle
// delta reveals which direction that parameter runs.
const ARMS = [
  { label: "T1", texture_size: 1024, mesh_simplify: 0.95, note: "stock defaults" },
  { label: "T2", texture_size: 512, mesh_simplify: 0.95, note: "texture 512" },
  { label: "T3", texture_size: 512, mesh_simplify: 0.98, note: "texture 512 + more simplify" },
];

const results = [];
for (const arm of ARMS) {
  console.log(`${arm.label}   trellis, ${arm.note}`);
  try {
    const run = await timed(arm.label, "fal-ai/trellis", {
      image_url: imageUrl,
      texture_size: arm.texture_size,
      mesh_simplify: arm.mesh_simplify,
    });
    const glb = await reportGlb(run.data);
    results.push({ arm, run, glb });
  } catch (err) {
    // Report and continue: one rejected arm should not cost the other results.
    console.log(`  FAILED: ${err.message}`);
    results.push({ arm, run: null, glb: null });
  }
  console.log("");
}

// --- verdict ---------------------------------------------------------------
console.log("--- verdict ---");
console.log(
  `baseline ${BASELINE.label}: compute ${s(BASELINE.compute)}, ${mb(BASELINE.bytes)}, $0.525\n`,
);

for (const { arm, run, glb } of results) {
  if (!run) {
    console.log(`${arm.label}  FAILED (${arm.note})`);
    continue;
  }
  const speedup = BASELINE.compute / run.compute;
  console.log(
    `${arm.label}  compute ${s(run.compute)} (${speedup.toFixed(1)}x vs baseline)  ` +
      `${glb ? `${mb(glb.bytes)}, ${glb.triangles.toLocaleString()} tris, ${glb.share}% texture` : "no GLB"}  ` +
      `$0.02 (26x cheaper)`,
  );
}

const t2 = results.find((r) => r.arm.label === "T2");
const t3 = results.find((r) => r.arm.label === "T3");
if (t2?.glb && t3?.glb) {
  const direction =
    t3.glb.triangles < t2.glb.triangles
      ? "HIGHER mesh_simplify = FEWER triangles"
      : t3.glb.triangles > t2.glb.triangles
        ? "HIGHER mesh_simplify = MORE triangles"
        : "mesh_simplify had NO effect (suspect it is ignored)";
  console.log(
    `\nmesh_simplify 0.95 -> 0.98: ${t2.glb.triangles.toLocaleString()} -> ` +
      `${t3.glb.triangles.toLocaleString()} triangles. ${direction}.`,
  );
}

console.log(
  "\nSpeed and payload are answered above. QUALITY IS NOT -- open the GLB urls and " +
    "look at them before deciding. The sketch endpoint was chosen precisely because " +
    "it takes line art directly; this path adds an interpretation stage in between.",
);
