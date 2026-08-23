/**
 * Keeps fal endpoints warm so a generation lands on a hot machine.
 *
 * This file must never import React or three.js — see the layering note in
 * `./types`. Only `@fal-ai/client` and `./types` are allowed here.
 *
 * WHY THIS EXISTS, and why it matters more than any remaining compute tuning:
 * measured queue waits on this project have ranged from 0.1s to 48.8s. One
 * end-to-end run of fast mode's shipped settings took 45.7s wall-clock for ~19s
 * of compute — the queue was more than half the wait. Shaving seconds off
 * inference is pointless next to that.
 *
 * WHEN IT FIRES: on the drawing overlay opening, not on a timer. A child then
 * spends 20–60s drawing and typing before submitting, which is exactly the
 * window needed to boot a machine. A timer would spend money while nobody is
 * at the booth; this spends it only when someone is actually about to create.
 *
 * COST, because this is real money and nothing here is free: a warm call is a
 * full billed generation (~$0.02 for TRELLIS). It is therefore OFF unless
 * `NEXT_PUBLIC_WARM_ENDPOINTS=1`, and rate-limited to one cycle per
 * WARM_INTERVAL_MS per endpoint. At a busy booth that is roughly one extra
 * generation's cost every few minutes; with the flag off it is exactly zero.
 */

import { fal } from "@fal-ai/client";
import type { CreationMode } from "./types";

// The proxy injects FAL_KEY server-side; the browser must never see a key.
fal.config({ proxyUrl: "/api/fal/proxy" });

/** Opt-in. Warming costs real money, so it must never be the silent default. */
export const WARM_ENABLED: boolean = process.env.NEXT_PUBLIC_WARM_ENDPOINTS === "1";

/**
 * Don't re-warm more often than this. fal keeps a machine hot for a while after
 * a request; re-warming every overlay open at a busy booth would just burn money
 * on an already-hot endpoint.
 */
const WARM_INTERVAL_MS = 4 * 60 * 1000;

/**
 * A 1x1 transparent PNG. Small enough to cost nothing to transfer, and valid
 * enough that the endpoint boots its model rather than rejecting at validation —
 * a request that 422s never reaches the GPU and warms nothing.
 */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Minimum work each endpoint will accept, so a warm costs as little as possible. */
const WARM_CALLS: Record<string, () => Promise<unknown>> = {
  "fal-ai/fast-sdxl-controlnet-canny": () =>
    fal.subscribe("fal-ai/fast-sdxl-controlnet-canny", {
      input: { prompt: "warm", control_image_url: TINY_PNG, num_inference_steps: 1 },
    }),
  "fal-ai/trellis": () =>
    fal.subscribe("fal-ai/trellis", {
      input: {
        image_url: TINY_PNG,
        // texture_size is a NUMBER despite @fal-ai/client's types — see trellisClient.ts.
        texture_size: 512 as unknown as "512",
        ss_sampling_steps: 1,
        slat_sampling_steps: 1,
      },
    }),
  "fal-ai/hunyuan3d-v3/sketch-to-3d": () =>
    fal.subscribe("fal-ai/hunyuan3d-v3/sketch-to-3d", {
      input: { input_image_url: TINY_PNG, prompt: "warm", face_count: 40000 },
    }),
  "fal-ai/birefnet": () =>
    fal.subscribe("fal-ai/birefnet", { input: { image_url: TINY_PNG } }),
};

/** Which endpoints each mode will actually hit. Keyed so a new mode is a compile error. */
const ENDPOINTS_BY_MODE: Record<CreationMode, readonly string[]> = {
  sprite: ["fal-ai/fast-sdxl-controlnet-canny", "fal-ai/birefnet"],
  fast: ["fal-ai/fast-sdxl-controlnet-canny", "fal-ai/trellis"],
  mesh: ["fal-ai/hunyuan3d-v3/sketch-to-3d"],
};

const lastWarmedAt = new Map<string, number>();

/**
 * Fire-and-forget warm for the endpoints `mode` will use.
 *
 * Never throws and never blocks: a failed warm is not a failed generation, and
 * the caller is on a UI path. Errors are swallowed deliberately — surfacing
 * "warm-up failed" to a child about to draw would be noise about an
 * optimisation they never asked for.
 */
export function warmForMode(mode: CreationMode, now: number = Date.now()): void {
  if (!WARM_ENABLED) return;

  for (const endpoint of ENDPOINTS_BY_MODE[mode]) {
    const last = lastWarmedAt.get(endpoint);
    if (last !== undefined && now - last < WARM_INTERVAL_MS) continue;

    // Recorded BEFORE awaiting, so several overlay opens in quick succession
    // cannot each start their own warm while the first is still in flight.
    lastWarmedAt.set(endpoint, now);

    const call = WARM_CALLS[endpoint];
    if (!call) continue;
    void call().catch(() => {
      // Allow a retry sooner if the warm itself failed — it did not warm anything.
      lastWarmedAt.delete(endpoint);
    });
  }
}

/** Warms every endpoint any mode could use. For a booth opening its doors. */
export function warmAll(now: number = Date.now()): void {
  for (const mode of Object.keys(ENDPOINTS_BY_MODE) as CreationMode[]) {
    warmForMode(mode, now);
  }
}

/** Test seam — the module-level rate-limit map would otherwise leak between tests. */
export function resetWarmState(): void {
  lastWarmedAt.clear();
}
