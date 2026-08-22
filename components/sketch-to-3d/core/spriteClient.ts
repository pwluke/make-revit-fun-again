/**
 * Talks to fal.ai's two-step sprite pipeline: sketch-to-image, then background
 * cutout to RGBA.
 *
 * This file must never import React or three.js — see the layering note in
 * `./types`. Only `@fal-ai/client` and `./types` are allowed here.
 *
 * Cost/latency contrast with the mesh path (falClient.ts) is the entire
 * reason sprite mode exists: ~$0.05 and ~10.7s measured here, vs ~$0.525 and
 * ~117s for `fal-ai/hunyuan3d-v3/sketch-to-3d`.
 */

import { fal } from "@fal-ai/client";
import type { Generate, Progress } from "./types";

// The proxy injects FAL_KEY server-side; the browser must never see a key.
fal.config({ proxyUrl: "/api/fal/proxy" });

/**
 * The client's generated types for each endpoint only declare the one shape
 * its docs promise (`images[]` for fast-sdxl-controlnet-canny, `image` for
 * birefnet). We read both defensively per the brief, since the shapes were
 * not verified against a live paid call — so responses are widened to this
 * loose type before the defensive `??` chain below.
 */
type ImageUrlResponse = {
  image?: { url?: string };
  images?: Array<{ url?: string }>;
};

/**
 * Uploads a sketch PNG, stylises it with a canny-conditioned SDXL pass, then
 * cuts the background out to produce an RGBA sprite.
 */
export const generateSprite: Generate = async (
  png: Blob,
  prompt: string,
  onProgress: (progress: Progress) => void,
) => {
  onProgress({ phase: "uploading" });
  const sketchUrl = await fal.storage.upload(png);

  onProgress({ phase: "generating", message: "Drawing your picture…", pct: 0.15 });
  const styleResult = await fal.subscribe("fal-ai/fast-sdxl-controlnet-canny", {
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
        message: lastLog ?? "Drawing your picture…",
        pct: 0.15,
      });
    },
  });

  const styleData = styleResult.data as ImageUrlResponse | undefined;
  const styledImageUrl = styleData?.images?.[0]?.url ?? styleData?.image?.url;
  if (!styledImageUrl) {
    throw new Error(
      "fal-ai/fast-sdxl-controlnet-canny response did not include an image URL " +
        "(expected images[0].url or image.url)",
    );
  }

  onProgress({ phase: "generating", message: "Cutting it out…", pct: 0.8 });
  const cutoutResult = await fal.subscribe("fal-ai/birefnet", {
    input: {
      image_url: styledImageUrl,
      output_format: "png",
      refine_foreground: true,
    },
    logs: true,
    onQueueUpdate: (update) => {
      const logs = "logs" in update ? update.logs : undefined;
      const lastLog = logs && logs.length > 0 ? logs[logs.length - 1]?.message : undefined;
      onProgress({
        phase: "generating",
        message: lastLog ?? "Cutting it out…",
        pct: 0.8,
      });
    },
  });

  const cutoutData = cutoutResult.data as ImageUrlResponse | undefined;
  const spriteUrl = cutoutData?.image?.url ?? cutoutData?.images?.[0]?.url;
  if (!spriteUrl) {
    throw new Error(
      "fal-ai/birefnet response did not include an image URL " +
        "(expected image.url or images[0].url)",
    );
  }

  return { mode: "sprite", spriteUrl };
};
