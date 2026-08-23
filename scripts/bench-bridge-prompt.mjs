/**
 * Why does the typed text barely affect the output?
 *
 * Reported against BOTH fast and quick modes. Those two share exactly one thing
 * — the `fast-sdxl-controlnet-canny` bridge — and quick runs it at the stock 35
 * steps with a suffix nobody has changed, so the cause is in the bridge's inputs
 * rather than in any recent edit.
 *
 * Three candidates, and this sweep separates them by moving ONE at a time:
 *
 *   1. THE SUFFIX DROWNS THE USER. "mickey mouse" is two words; the style suffix
 *      is another ten. CLIP weights tokens roughly evenly, so the user supplies
 *      about a sixth of the prompt and the house style supplies the rest.
 *   2. CONTROLNET OVERRIDES THE PROMPT. `controlnet_conditioning_scale` (0.5 by
 *      default) pins the output's structure to the drawn edges. If the drawing
 *      is a cat, no amount of prompting makes it Mickey Mouse — by design.
 *   3. GUIDANCE IS TOO LOW to enforce what prompt there is (7.5 by default).
 *
 * Deliberately uses a CAT sketch with the prompt "mickey mouse", because the
 * question is not "is the picture nice" but "did the text move the output away
 * from the drawing at all". A prompt that agrees with the sketch cannot answer
 * that.
 *
 *   node --env-file=<path to .env> scripts/bench-bridge-prompt.mjs
 *
 * ~$0.10 for 7 arms. Writes bridge-prompt-sweep.html — this is a judgement about
 * likeness, which no number reports.
 */
import { fal } from "@fal-ai/client";
import { writeFileSync } from "node:fs";

const SKETCH_URL =
  process.env.SKETCH_URL ??
  "https://v3b.fal.media/files/b/0a86888c/Zlw8twOa43SKkCXmTdw3-.png";
/** Deliberately at odds with the sketch — that is the whole measurement. */
const USER_TEXT = process.env.PROMPT ?? "mickey mouse";

/** Verbatim from components/sketch-to-3d/core/prompt.ts. */
const SUFFIX_SPRITE =
  "simple cute toy figure, smooth rounded forms, soft matte colors, clean silhouette";
const SUFFIX_FAST = "photorealistic product photo, plain background, soft studio lighting";

const ENDPOINT = "fal-ai/fast-sdxl-controlnet-canny";

if (!process.env.FAL_KEY) {
  console.error("FAL_KEY not set. Pass --env-file=<path to .env with FAL_KEY>.");
  process.exit(1);
}

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;

/**
 * One variable moved per arm, against arm A. `note` says what to look for, so
 * the viewer is readable without cross-referencing this file.
 */
const ARMS = [
  {
    id: "A",
    title: "baseline — what ships today (quick mode)",
    note: "35 steps, full sprite suffix, stock ControlNet. The reported behaviour.",
    input: { prompt: `${USER_TEXT}, ${SUFFIX_SPRITE}`, num_inference_steps: 35 },
  },
  {
    id: "B",
    title: "no suffix at all",
    note: "Prompt is ONLY the user's words. If B looks more like Mickey than A, the suffix is drowning the user.",
    input: { prompt: USER_TEXT, num_inference_steps: 35 },
  },
  {
    id: "C",
    title: "ControlNet 0.5 → 0.3",
    note: "Loosens the grip of the drawn edges. More room for the prompt to reshape things.",
    input: {
      prompt: `${USER_TEXT}, ${SUFFIX_SPRITE}`,
      num_inference_steps: 35,
      controlnet_conditioning_scale: 0.3,
    },
  },
  {
    id: "D",
    title: "ControlNet 0.5 → 0.15",
    note: "Barely conditioned. Expect strong prompt influence and weak resemblance to the drawing — the trade-off in its extreme form.",
    input: {
      prompt: `${USER_TEXT}, ${SUFFIX_SPRITE}`,
      num_inference_steps: 35,
      controlnet_conditioning_scale: 0.15,
    },
  },
  {
    id: "E",
    title: "guidance 7.5 → 12",
    note: "Pushes harder toward whatever the prompt says, without touching the structure.",
    input: {
      prompt: `${USER_TEXT}, ${SUFFIX_SPRITE}`,
      num_inference_steps: 35,
      guidance_scale: 12,
    },
  },
  {
    id: "F",
    title: "10 steps (what fast mode ships)",
    note: "Isolates my speed change. If F is clearly worse than A, the step cut cost prompt adherence and should be reverted.",
    input: { prompt: `${USER_TEXT}, ${SUFFIX_FAST}`, num_inference_steps: 10 },
  },
  {
    id: "G",
    title: "combined — short suffix + looser ControlNet + higher guidance",
    note: "The candidate fix, if the individual arms point this way.",
    input: {
      prompt: `${USER_TEXT}, cute toy figure`,
      num_inference_steps: 35,
      controlnet_conditioning_scale: 0.3,
      guidance_scale: 10,
    },
  },
];

console.log(`sketch: ${SKETCH_URL}`);
console.log(`user text: "${USER_TEXT}"  (deliberately unlike the sketch)\n`);

const results = [];
for (const arm of ARMS) {
  console.log(`${arm.id}  ${arm.title}`);
  console.log(`    prompt: "${arm.input.prompt}"`);
  const startedAt = Date.now();
  try {
    const result = await fal.subscribe(ENDPOINT, {
      input: { control_image_url: SKETCH_URL, ...arm.input },
    });
    const url = result.data.images?.[0]?.url ?? result.data.image?.url;
    console.log(`    ${s(Date.now() - startedAt)}  ${url}\n`);
    results.push({ arm, url });
  } catch (err) {
    console.log(`    FAILED: ${err.message}\n`);
    results.push({ arm, url: null, error: err.message });
  }
}

const cards = results
  .map(
    ({ arm, url, error }) => `
    <div class="card">
      <h2><span>${arm.id} — ${arm.title}</span></h2>
      ${url ? `<img src="${url}" alt="${arm.id}" />` : `<div class="err">FAILED: ${error ?? "unknown"}</div>`}
      <div class="stats"><code>${arm.input.prompt}</code><br />${arm.note}</div>
    </div>`,
  )
  .join("");

writeFileSync(
  "bridge-prompt-sweep.html",
  `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" />
<title>Bridge prompt influence sweep</title>
<style>
* { box-sizing:border-box; }
body { margin:0; background:#1e1e2e; color:#cdd6f4; font-family:'Segoe UI',sans-serif; }
header { padding:14px 20px 10px; border-bottom:1px solid #313244; }
header h1 { margin:0; font-size:1.05rem; color:#cba6f7; }
header p { margin:4px 0 0; font-size:.8rem; color:#a6adc8; }
.row { display:flex; gap:14px; padding:16px 20px; flex-wrap:wrap; }
.card { background:#181825; border:1px solid #313244; border-radius:10px; overflow:hidden; flex:1 1 300px; min-width:300px; display:flex; flex-direction:column; }
.card h2 { margin:0; padding:9px 12px; font-size:.78rem; color:#f9e2af; background:#11111b; border-bottom:1px solid #313244; }
.card img { width:100%; height:340px; object-fit:contain; background:#fff; }
.err { height:340px; display:flex; align-items:center; padding:20px; color:#f38ba8; font-size:.78rem; }
.stats { padding:9px 12px; font-size:.73rem; color:#a6adc8; line-height:1.6; border-top:1px solid #313244; background:#11111b; }
.stats code { color:#a6e3a1; font-size:.7rem; }
</style></head><body>
<header>
  <h1>Does the typed text actually influence the output?</h1>
  <p>Sketch is a <b>cat</b>. Prompt is <b>"${USER_TEXT}"</b>. The question is not which picture is nicest —
  it is <b>which arm moved away from the cat and toward the words</b>.</p>
</header>
<div class="row">
  <div class="card">
    <h2><span>input sketch</span></h2>
    <img src="${SKETCH_URL}" alt="input sketch" />
    <div class="stats">Every arm is conditioned on these edges.</div>
  </div>
</div>
<div class="row">${cards}</div>
</body></html>`,
  "utf8",
);

console.log("wrote bridge-prompt-sweep.html — compare A vs B vs C/D for the answer.");
