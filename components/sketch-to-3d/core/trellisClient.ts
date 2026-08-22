/**
 * Fast 3D: sketch -> photo-like bridge image -> TRELLIS mesh.
 *
 * This file must never import React or three.js — see the layering note in
 * `./types`. Only `@fal-ai/client` and `./types` are allowed here.
 *
 * Measured 2026-08-22 (scripts/bench-trellis.mjs), compute not wall-clock:
 *
 *   stage 1  fast-sdxl-controlnet-canny   6.5s
 *   stage 2  trellis                     16.3s
 *   total                               ~23s   0.4 MB   3,864 triangles   ~$0.02
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
  // A STRING, not a number: @fal-ai/client declares this as "512" | "1024" | "2048".
  // scripts/bench-trellis.mjs passes the number 512 and the endpoint honoured it
  // (1.1 MB texture at 1024 vs 0.3 MB at 512), so the API coerces — but the typed
  // client does not, and matching the declared type is the safer of the two.
  texture_size: "512",
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

  // Stage 2 — the actual reconstruction. ~70% of the time, so the progress bar
  // spends most of its life here.
  onProgress({ phase: "generating", message: "Building it in 3D…", pct: 0.35 });
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
