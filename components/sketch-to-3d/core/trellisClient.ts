/**
 * Fast 3D: sketch -> photo-like bridge image -> TRELLIS mesh.
 *
 * This file must never import React or three.js — see the layering note in
 * `./types`. Only `@fal-ai/client` and `./types` are allowed here.
 *
 * Measured 2026-08-22 (scripts/bench-trellis.mjs), compute not wall-clock:
 *
 *   stage 1  fast-sdxl-controlnet-canny   2.3s  (at 10 steps, tuned down from 35)
 *   stage 2  trellis                     16.3s
 *   total                               ~19s   0.4 MB   ~4,000 triangles   ~$0.02
 *
 * Stage 2 is a floor, not a budget: a sampler-step sweep moved it only between
 * 15.1s and 18.2s, and 4 steps came out SLOWER than 6 — i.e. inside the noise.
 * TRELLIS's time is dominated by fixed mesh extraction and texturing work that no
 * step count touches, so there is nothing further to win there. Don't go looking.
 *
 * against hunyuan3d-v3/sketch-to-3d at 105.2s, 13.6 MB, 39,318 triangles, $0.525.
 * Same deliverable — a walkable GLB — for 6.5x the speed and 26x less money.
 *
 * Why two stages when falClient.ts needs only one: TRELLIS has no line-art input.
 * It wants a photo-like image with tonal and depth cues, so the bridge is not
 * optional decoration, it is what makes the endpoint usable at all. The bridge is
 * also only ~28% of the time, which is why this is still far ahead.
 */

import { fal } from "@fal-ai/client";
import type { Generate, Progress } from "./types";

// The proxy injects FAL_KEY server-side; the browser must never see a key.
fal.config({ proxyUrl: "/api/fal/proxy" });

/**
 * Chosen from the spike's three arms. `mesh_simplify` is the more surprising of
 * the two: fal documents it only as "Mesh simplification factor" without stating
 * a direction, and the spike established that HIGHER means FEWER triangles
 * (0.95 -> 9,192 tris, 0.98 -> 3,864). Do not "increase quality" by raising it.
 *
 * `texture_size: 512` is the bigger win and has no equivalent on Hunyuan's sketch
 * endpoint. At face_count 40000 that endpoint returns 13.6 MB of which 93% is one
 * base-colour PNG, so texture — not geometry — was always the payload problem.
 */
const TRELLIS_INPUT = {
  /**
   * A NUMBER, and the cast below is load-bearing. `@fal-ai/client` declares
   * `texture_size` as `"512" | "1024" | "2048"` — strings. **That declaration is
   * wrong.** Sending the string is rejected by the API with:
   *
   *   {"type":"literal_error","loc":["body","texture_size"],
   *    "msg":"Input should be 512, 1024 or 2048","input":"512"}
   *
   * Verified 2026-08-22 by an isolation probe: number + no steps → OK, string +
   * no steps → 422, number + sampler steps → OK. So the generated types cannot be
   * trusted here and TypeScript would happily enforce the broken form. Do not
   * "fix" this cast to satisfy the type checker — that is exactly how it broke.
   */
  texture_size: 512 as unknown as "512",
  mesh_simplify: 0.98,
} as const;

/**
 * The client's generated types declare only the shape each endpoint's docs
 * promise. Both are read defensively, matching spriteClient.ts.
 */
type ImageUrlResponse = {
  image?: { url?: string };
  images?: Array<{ url?: string }>;
};

type MeshResponse = {
  model_mesh?: { url?: string };
  model_glb?: { url?: string };
  model_urls?: { glb?: string };
};

export const generateFast: Generate = async (
  png: Blob,
  prompt: string,
  onProgress: (progress: Progress) => void,
) => {
  onProgress({ phase: "uploading" });
  const sketchUrl = await fal.storage.upload(png);

  // Stage 1 — line art into something TRELLIS can actually read.
  onProgress({ phase: "generating", message: "Colouring it in…", pct: 0.1 });
  const bridgeResult = await fal.subscribe("fal-ai/fast-sdxl-controlnet-canny", {
    input: {
      prompt,
      control_image_url: sketchUrl,
      // 10, down from the endpoint's default of 35. This is the ONLY step count in
      // the pipeline worth tuning — see the sweep in scripts/bench-trellis-steps.mjs:
      //   bridge  35 → 6.3s   20 → 3.8s   10 → 2.3s   6 → 1.7s
      //   trellis 12 → 18.2s   8 → 16.8s   6 → 15.1s  4 → 16.2s
      // Canny ControlNet takes its structure from the edge map rather than from
      // denoising, so 10 steps is visually indistinguishable from 35 here.
      //
      // DO NOT GO LOWER. At 6 steps the endpoint returns a fully BLACK image — and
      // returns it with a 200, so nothing downstream notices; TRELLIS then happily
      // reconstructs garbage from it. The only outward tell was file size, 34 KB
      // against ~610 KB for a real render.
      num_inference_steps: 10,
    },
    logs: true,
    onQueueUpdate: (update) => {
      const logs = "logs" in update ? update.logs : undefined;
      const lastLog = logs && logs.length > 0 ? logs[logs.length - 1]?.message : undefined;
      onProgress({
        phase: "generating",
        message: lastLog ?? "Colouring it in…",
        pct: 0.1,
      });
    },
  });

  const bridgeData = bridgeResult.data as ImageUrlResponse | undefined;
  const bridgeImageUrl = bridgeData?.images?.[0]?.url ?? bridgeData?.image?.url;
  if (!bridgeImageUrl) {
    throw new Error(
      "fal-ai/fast-sdxl-controlnet-canny response did not include an image URL " +
        "(expected images[0].url or image.url)",
    );
  }

  // Stage 2 — the actual reconstruction, and ~85% of the wait now that the bridge
  // runs at 10 steps. Every progress event from here carries `previewUrl`, so the
  // scene can show the child their coloured drawing at ~2.3s instead of ~19s.
  onProgress({
    phase: "generating",
    message: "Building it in 3D…",
    pct: 0.35,
    previewUrl: bridgeImageUrl,
  });
  const meshResult = await fal.subscribe("fal-ai/trellis", {
    input: {
      image_url: bridgeImageUrl,
      ...TRELLIS_INPUT,
    },
    logs: true,
    onQueueUpdate: (update) => {
      const logs = "logs" in update ? update.logs : undefined;
      const lastLog = logs && logs.length > 0 ? logs[logs.length - 1]?.message : undefined;
      onProgress({
        phase: "generating",
        message: lastLog ?? "Building it in 3D…",
        pct: 0.35,
        previewUrl: bridgeImageUrl,
      });
    },
  });

  const meshData = meshResult.data as MeshResponse | undefined;
  // TRELLIS returns `model_mesh`; the other two are read so a response-shape
  // change does not silently become "generation failed" at a booth.
  const glbUrl =
    meshData?.model_mesh?.url ?? meshData?.model_glb?.url ?? meshData?.model_urls?.glb;
  if (!glbUrl) {
    throw new Error(
      "fal-ai/trellis response did not include a mesh URL (expected model_mesh.url)",
    );
  }

  return { mode: "fast", glbUrl };
};
