/**
 * Arm A of the sketch-to-3d latency benchmark.
 *
 * Splits the observed ~130s wall-clock into queue wait vs GPU compute. If most
 * of it is queue wait, splitting into two requests (sketch->image->3d) makes
 * things WORSE, because you queue twice.
 *
 *   node --env-file=../../../../.env scripts/bench-fal.mjs
 *   node --env-file=.env.local scripts/bench-fal.mjs <sketchUrl> "<prompt>"
 */
import { fal } from "@fal-ai/client";

const ENDPOINT = "fal-ai/hunyuan3d-v3/sketch-to-3d";
const RUNS = Number(process.env.RUNS ?? 3);

// fal's own documented sample, so a failure is a fal problem and not a bad PNG.
const SKETCH_URL =
  process.argv[2] ??
  "https://v3b.fal.media/files/b/0a86888c/Zlw8twOa43SKkCXmTdw3-.png";
const PROMPT = process.argv[3] ?? "orange cat";

if (!process.env.FAL_KEY) {
  console.error("FAL_KEY not set. Pass --env-file=<path to .env with FAL_KEY>.");
  process.exit(1);
}

const s = (ms) => `${(ms / 1000).toFixed(1)}s`;

async function runOnce(n) {
  const submittedAt = Date.now();
  let inProgressAt = null;
  let lastStatus = null;

  const result = await fal.subscribe(ENDPOINT, {
    input: { input_image_url: SKETCH_URL, prompt: PROMPT },
    logs: true,
    onQueueUpdate: (update) => {
      // subscribe() polls, so this fires on a ~1s granularity. Fine at 130s scale.
      if (update.status !== lastStatus) {
        lastStatus = update.status;
        console.log(`  [${s(Date.now() - submittedAt)}] ${update.status}`);
      }
      if (update.status === "IN_PROGRESS" && inProgressAt === null) {
        inProgressAt = Date.now();
      }
    },
  });

  const doneAt = Date.now();
  const total = doneAt - submittedAt;
  // If the first poll already showed IN_PROGRESS, queue wait was ~0 and this
  // attributes the whole run to compute — the conservative direction.
  const queue = inProgressAt ? inProgressAt - submittedAt : 0;

  console.log(
    `  run ${n}: total ${s(total)} = queue ${s(queue)} + compute ${s(total - queue)}`,
  );
  return { total, queue, compute: total - queue, requestId: result.requestId };
}

console.log(`${ENDPOINT} x${RUNS}`);
console.log(`sketch: ${SKETCH_URL}`);
console.log(`prompt: ${PROMPT}\n`);

const results = [];
for (let n = 1; n <= RUNS; n++) {
  console.log(`run ${n}/${RUNS}`);
  try {
    results.push(await runOnce(n));
  } catch (err) {
    console.error(`  run ${n} FAILED: ${err.message}`);
  }
  console.log("");
}

if (results.length === 0) {
  console.error("all runs failed");
  process.exit(1);
}

const avg = (k) => results.reduce((a, r) => a + r[k], 0) / results.length;
const range = (k) => {
  const v = results.map((r) => r[k]);
  return `${s(Math.min(...v))}-${s(Math.max(...v))}`;
};

console.log(`--- ${results.length}/${RUNS} succeeded ---`);
console.log(`total   avg ${s(avg("total"))}   range ${range("total")}`);
console.log(`queue   avg ${s(avg("queue"))}   range ${range("queue")}`);
console.log(`compute avg ${s(avg("compute"))} range ${range("compute")}`);
console.log(
  `\nqueue is ${((avg("queue") / avg("total")) * 100).toFixed(0)}% of wall-clock`,
);
