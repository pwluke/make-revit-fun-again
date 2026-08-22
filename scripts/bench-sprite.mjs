/**
 * Sprite path: sketch -> photoreal image -> cutout PNG with alpha.
 *
 * The alternative to a 117s mesh. Verifies the alpha channel actually exists
 * by reading the PNG's IHDR colour type rather than trusting content_type.
 *
 *   node --env-file=<path to .env> scripts/bench-sprite.mjs
 */
import { fal } from "@fal-ai/client";

const SKETCH_URL =
  process.env.SKETCH_URL ??
  "https://v3b.fal.media/files/b/0a86888c/Zlw8twOa43SKkCXmTdw3-.png";
const PROMPT = process.env.PROMPT ?? "orange cat";

if (!process.env.FAL_KEY) {
  console.error("FAL_KEY not set. Pass --env-file=<path to .env with FAL_KEY>.");
  process.exit(1);
}

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

async function timed(label, endpoint, input) {
  const startedAt = Date.now();
  const result = await fal.subscribe(endpoint, { input });
  const total = Date.now() - startedAt;
  console.log(`  ${label}: ${s(total)}`);
  return { total, data: result.data };
}

/** PNG IHDR colour type: 6 == RGBA, 4 == grey+alpha, 3 == palette (alpha via tRNS). */
async function pngStats(url) {
  const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const view = new DataView(buf.buffer);
  const isPng = view.getUint32(0, false) === 0x89504e47;
  if (!isPng) return { bytes: buf.byteLength, isPng: false };

  const colourType = buf[25];
  const hasTrns = new TextDecoder("latin1")
    .decode(buf.subarray(0, Math.min(buf.length, 4096)))
    .includes("tRNS");

  return {
    bytes: buf.byteLength,
    isPng: true,
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
    colourType,
    hasAlpha: colourType === 6 || colourType === 4 || hasTrns,
  };
}

console.log(`sketch: ${SKETCH_URL}`);
console.log(`prompt: ${PROMPT}\n`);

const img = await timed("sketch -> image ", "fal-ai/fast-sdxl-controlnet-canny", {
  prompt: `${PROMPT}, photorealistic product photo, full body, centered, plain white background, soft studio lighting`,
  control_image_url: SKETCH_URL,
  format: "png",
});

const cut = await timed("image  -> cutout", "fal-ai/birefnet", {
  image_url: img.data.images[0].url,
  output_format: "png",
  refine_foreground: true,
});

const url = cut.data.image?.url ?? cut.data.images?.[0]?.url;
const stats = await pngStats(url);

console.log(`\ncutout: ${url}`);
console.log(
  `  ${stats.width}x${stats.height}, ${kb(stats.bytes)}, ` +
    `colourType ${stats.colourType} -> alpha ${stats.hasAlpha ? "PRESENT" : "MISSING"}`,
);
console.log(`\ntotal sprite path: ${s(img.total + cut.total)}`);
console.log(`mesh path (measured): 116.7s`);
