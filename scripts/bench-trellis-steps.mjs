/**
 * Step-count sweep for Fast 3D. Where does the time actually go, and how far can
 * the sampler steps come down before the output stops being worth showing?
 *
 * Baseline established 2026-08-22 (scripts/bench-trellis.mjs), compute not wall-clock:
 *   stage 1  fast-sdxl-controlnet-canny  6.5s   at its default 35 inference steps
 *   stage 2  trellis                    16.3s   at its default 12 + 12 sampler steps
 *
 * Both stages sit on defaults, and in diffusion the step count is nearly the whole
 * bill. Canny ControlNet in particular takes its structure from the edge map rather
 * than from denoising, so it should tolerate far fewer steps than an unconditioned
 * generation would -- but "should" is why this script exists.
 *
 * EXPERIMENTAL DESIGN, the part worth not breaking:
 *
 *   Stage A sweeps bridge steps and holds everything else fixed.
 *   Stage B sweeps TRELLIS steps against ONE FIXED bridge image -- the 35-step one.
 *
 * Stage B must not consume each arm's own bridge image, or bridge variance rides
 * along inside the geometry numbers and neither sweep means anything. Fixing the
 * input is what makes the TRELLIS deltas attributable to TRELLIS.
 *
 * TRELLIS has two sampler knobs, `ss_sampling_steps` (sparse structure) and
 * `slat_sampling_steps` (structured latent). They are moved together here: 4 arms
 * instead of 16, on the assumption they trade off similarly. If the knee turns out
 * to be sharp, split them and sweep independently -- that is a follow-up, not this.
 *
 * Some of stage 2 is fixed cost (mesh extraction, texturing) that no step count
 * touches, so expect diminishing returns rather than a straight line to zero.
 *
 *   node --env-file=<path to .env> scripts/bench-trellis-steps.mjs
 *
 * Cost: ~$0.15 (4 bridge calls + 4 TRELLIS calls). Writes trellis-speed-sweep.html
 * with every bridge image and every mesh side by side, because the knee is a
 * QUALITY judgement and a table of seconds cannot make it for you.
 */
import { fal } from "@fal-ai/client";
import { writeFileSync } from "node:fs";

const SKETCH_URL =
  process.env.SKETCH_URL ??
  "https://v3b.fal.media/files/b/0a86888c/Zlw8twOa43SKkCXmTdw3-.png";
const PROMPT = process.env.PROMPT ?? "orange cat";

/** Matches STYLE_SUFFIX_FAST in components/sketch-to-3d/core/prompt.ts. */
const BRIDGE_SUFFIX = "photorealistic product photo, plain background, soft studio lighting";

const BRIDGE_STEPS = [35, 20, 10, 6];
const TRELLIS_STEPS = [12, 8, 6, 4];

/**
 * Shipped settings, held constant so this sweep measures steps and nothing else.
 *
 * `texture_size` is a NUMBER. The first run of this script sent the string "512"
 * — matching @fal-ai/client's (incorrect) type declaration — and every TRELLIS arm
 * returned 422: "Input should be 512, 1024 or 2048". Two variables had changed at
 * once against the known-good bench-trellis.mjs, which is what made it look like
 * the sampler steps were unsupported. They are fine.
 */
const TRELLIS_FIXED = { texture_size: 512, mesh_simplify: 0.98 };

const OUT_HTML = "trellis-speed-sweep.html";

if (!process.env.FAL_KEY) {
  console.error("FAL_KEY not set. Pass --env-file=<path to .env with FAL_KEY>.");
  process.exit(1);
}

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

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

/** Parses the GLB rather than trusting the response -- see bench-trellis.mjs. */
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
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const acc =
        prim.indices !== undefined
          ? gltf.accessors[prim.indices]
          : gltf.accessors[prim.attributes.POSITION];
      triangles += acc.count / 3;
    }
  }

  return { bytes: buf.byteLength, triangles };
}

// --- Stage A: bridge step sweep --------------------------------------------
console.log(`sketch: ${SKETCH_URL}`);
console.log(`prompt: ${PROMPT}\n`);
console.log("=== Stage A: bridge (fast-sdxl-controlnet-canny) step sweep ===\n");

const bridgeArms = [];
for (const steps of BRIDGE_STEPS) {
  console.log(`A${steps}  num_inference_steps ${steps}`);
  try {
    const run = await timed(`A${steps}`, "fal-ai/fast-sdxl-controlnet-canny", {
      prompt: `${PROMPT}, ${BRIDGE_SUFFIX}`,
      control_image_url: SKETCH_URL,
      num_inference_steps: steps,
    });
    const url = run.data.images?.[0]?.url ?? run.data.image?.url;
    console.log(`  image: ${url}`);
    bridgeArms.push({ steps, compute: run.compute, url });
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
    bridgeArms.push({ steps, compute: null, url: null, error: err.message });
  }
  console.log("");
}

// The reference image for stage B: full-quality 35 steps, so TRELLIS deltas are
// attributable to TRELLIS alone.
const referenceBridge = bridgeArms.find((a) => a.steps === 35 && a.url);
if (!referenceBridge) {
  console.error("The 35-step bridge arm failed; stage B has no fixed input. Stopping.");
  process.exit(1);
}
console.log(`Stage B input (fixed, 35-step bridge): ${referenceBridge.url}\n`);

// --- Stage B: TRELLIS step sweep -------------------------------------------
console.log("=== Stage B: trellis sampler step sweep (fixed input) ===\n");

const trellisArms = [];
for (const steps of TRELLIS_STEPS) {
  console.log(`B${steps}  ss_sampling_steps + slat_sampling_steps = ${steps}`);
  try {
    const run = await timed(`B${steps}`, "fal-ai/trellis", {
      image_url: referenceBridge.url,
      ...TRELLIS_FIXED,
      ss_sampling_steps: steps,
      slat_sampling_steps: steps,
    });
    const url =
      run.data.model_mesh?.url ?? run.data.model_glb?.url ?? run.data.model_urls?.glb;
    const stats = url ? await glbStats(url) : null;
    if (stats) {
      console.log(
        `  GLB ${mb(stats.bytes)}, ${stats.triangles.toLocaleString()} triangles`,
      );
      console.log(`  url: ${url}`);
    }
    trellisArms.push({ steps, compute: run.compute, url, stats });
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
    trellisArms.push({ steps, compute: null, url: null, stats: null, error: err.message });
  }
  console.log("");
}

// --- Summary ---------------------------------------------------------------
console.log("--- summary ---\n");
console.log("Stage A  bridge steps -> compute");
for (const a of bridgeArms) {
  console.log(`  ${String(a.steps).padStart(2)} steps  ${a.compute ? s(a.compute) : "FAILED"}`);
}
console.log("\nStage B  trellis steps -> compute / triangles");
for (const b of trellisArms) {
  console.log(
    `  ${String(b.steps).padStart(2)} steps  ${b.compute ? s(b.compute) : "FAILED"}` +
      `${b.stats ? `  ${b.stats.triangles.toLocaleString()} tris  ${mb(b.stats.bytes)}` : ""}`,
  );
}

const fastestA = bridgeArms.filter((a) => a.compute).sort((x, y) => x.compute - y.compute)[0];
const fastestB = trellisArms.filter((b) => b.compute).sort((x, y) => x.compute - y.compute)[0];
if (fastestA && fastestB) {
  const best = fastestA.compute + fastestB.compute;
  console.log(
    `\nfastest combination: bridge ${fastestA.steps} + trellis ${fastestB.steps} = ` +
      `${s(best)} compute, against 22.7s shipped (${(22700 / best).toFixed(1)}x)`,
  );
}

// --- Viewer ----------------------------------------------------------------
// The numbers above cannot tell you where quality breaks. This can.
const card = (title, body, stats) => `
  <div class="card">
    <h2>${title}</h2>
    ${body}
    <div class="stats">${stats}</div>
  </div>`;

const bridgeCards = bridgeArms
  .map((a) =>
    card(
      `${a.steps} steps`,
      a.url
        ? `<img src="${a.url}" alt="bridge at ${a.steps} steps" />`
        : `<div class="err">FAILED: ${a.error ?? "unknown"}</div>`,
      a.compute ? `compute <b>${s(a.compute)}</b>` : "—",
    ),
  )
  .join("");

const trellisCards = trellisArms
  .map((b) =>
    card(
      `${b.steps} steps`,
      b.url
        ? `<div class="viewport" data-glb="${b.url}"></div>`
        : `<div class="err">FAILED: ${b.error ?? "unknown"}</div>`,
      b.compute
        ? `compute <b>${s(b.compute)}</b>${b.stats ? ` · ${b.stats.triangles.toLocaleString()} tris · ${mb(b.stats.bytes)}` : ""}`
        : "—",
    ),
  )
  .join("");

writeFileSync(
  OUT_HTML,
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<title>Fast 3D — step sweep</title>
<style>
* { box-sizing: border-box; }
body { margin:0; background:#1e1e2e; color:#cdd6f4; font-family:'Segoe UI',sans-serif; }
header { padding:14px 20px 10px; border-bottom:1px solid #313244; }
header h1 { margin:0; font-size:1.05rem; color:#cba6f7; }
header p { margin:3px 0 0; font-size:.78rem; color:#6c7086; }
.section-label { padding:14px 20px 0; font-size:.7rem; letter-spacing:.09em; text-transform:uppercase; color:#585b70; }
.row { display:flex; gap:12px; padding:10px 20px 16px; flex-wrap:wrap; }
.card { background:#181825; border:1px solid #313244; border-radius:10px; overflow:hidden; flex:1 1 240px; min-width:240px; display:flex; flex-direction:column; }
.card h2 { margin:0; padding:8px 11px; font-size:.8rem; color:#f9e2af; background:#11111b; border-bottom:1px solid #313244; }
.card img { width:100%; height:300px; object-fit:contain; background:#fff; }
.viewport { width:100%; height:300px; background:#11111b; }
.err { padding:20px; font-size:.75rem; color:#f38ba8; height:300px; display:flex; align-items:center; }
.stats { padding:8px 11px; font-size:.73rem; color:#a6adc8; border-top:1px solid #313244; background:#11111b; }
.stats b { color:#a6e3a1; }
footer { padding:4px 20px 22px; font-size:.74rem; color:#6c7086; }
</style></head><body>
<header>
  <h1>Fast 3D — step sweep</h1>
  <p>Look for the arm where quality visibly breaks. That is the knee; ship the step count just above it.</p>
</header>
<div class="section-label">Stage A — bridge, num_inference_steps (default 35). Structure comes from the edge map, so low steps may hold up well.</div>
<div class="row">${bridgeCards}</div>
<div class="section-label">Stage B — TRELLIS sampler steps (default 12). All four ran against the SAME 35-step bridge image, so differences are TRELLIS's alone.</div>
<div class="row">${trellisCards}</div>
<footer>Shipped today: bridge 35 + trellis 12 = <b>22.7s</b> compute. Baseline Hunyuan: 105.2s, $0.525.</footer>
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.185.0/build/three.module.js",
               "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.185.0/examples/jsm/" } }
</script>
<script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
const loader = new GLTFLoader();
for (const el of document.querySelectorAll(".viewport")) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x11111b);
  scene.add(new THREE.AmbientLight(0xffffff, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3,5,4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, .7); fill.position.set(-4,1,-3); scene.add(fill);
  const camera = new THREE.PerspectiveCamera(40, el.clientWidth/el.clientHeight, .01, 100);
  const renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  el.appendChild(renderer.domElement);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.6;
  loader.load(el.dataset.glb, (gltf) => {
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3()).length();
    model.position.sub(box.getCenter(new THREE.Vector3()));
    scene.add(model);
    camera.position.set(0, size*.08, size*.62);
    controls.target.set(0,0,0); controls.update();
  }, undefined, (err) => {
    const d = document.createElement("div");
    d.className = "err"; d.textContent = "Could not load GLB: " + err.message;
    el.appendChild(d);
  });
  (function animate(){ requestAnimationFrame(animate); controls.update(); renderer.render(scene,camera); })();
}
</script></body></html>`,
  "utf8",
);

console.log(`\nwrote ${OUT_HTML} — open it and find where quality breaks.`);
