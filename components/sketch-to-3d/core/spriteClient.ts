/**
 * OWNED BY the fal-bench agent — replace this file wholesale; do not extend it.
 *
 * This is a minimal stub so `mode: "sprite"` has something to call while the
 * real implementation is built elsewhere. Real pipeline: `fal-ai/fast-sdxl-controlnet-canny`
 * -> `fal-ai/birefnet` (refine_foreground: true, output_format: "png"), ~10.7s, ~$0.05.
 * "/cutout-cat.png" is a placeholder path and may not exist yet.
 */

import type { Progress } from "./types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateSprite(
  png: Blob,
  prompt: string,
  onProgress: (progress: Progress) => void,
): Promise<{ mode: "sprite"; spriteUrl: string }> {
  onProgress({ phase: "uploading" });
  onProgress({ phase: "generating", message: "Generating sprite…" });
  await delay(800);

  return { mode: "sprite", spriteUrl: "/cutout-cat.png" };
}
