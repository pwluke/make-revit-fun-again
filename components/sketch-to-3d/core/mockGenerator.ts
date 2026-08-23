/**
 * Offline stand-in for `falClient.generate`, matching its exact signature so
 * the two are drop-in interchangeable.
 *
 * This exists for two reasons: it's the demo path when venue wifi fails, and
 * it lets UI work proceed without spending $0.525 (upload + generate) per
 * refresh during development.
 */

import type { Generate, Progress } from "./types";

export const USE_MOCK: boolean = process.env.NEXT_PUBLIC_USE_MOCK === "1";

const MOCK_MESSAGES = ["IN_QUEUE", "IN_PROGRESS", "Refining mesh detail…"];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const generateMock: Generate = async (
  png: Blob,
  prompt: string,
  onProgress: (progress: Progress) => void,
) => {
  onProgress({ phase: "uploading" });
  await delay(600);

  for (const message of MOCK_MESSAGES) {
    onProgress({ phase: "generating", message });
    await delay(1000);
  }

  // "/axe.glb" already ships in public/ and is already loaded by the app
  // (see components/minecraft/Axe.tsx), so the mock path needs no committed
  // fallback asset of its own — no 26 MB binary just to have something to
  // show offline.
  return { mode: "mesh", glbUrl: "/axe.glb" };
};

const MOCK_FAST_MESSAGES: Array<{ message: string; pct: number; preview?: string }> = [
  { message: "Colouring it in…", pct: 0.1 },
  // Carries a previewUrl exactly as the real pipeline does once the bridge stage
  // returns — so the offline path exercises the progressive reveal rather than
  // sitting on a Ghost, and the feature can be demoed with the wifi down.
  { message: "Building it in 3D…", pct: 0.35, preview: "/cutout-cat.png" },
];

/**
 * Fast mode's offline stand-in. Delays are shorter than generateMock's because
 * the real thing is ~23s against ~105s — a mock that takes as long as the slow
 * path would misrepresent the one property this mode exists for.
 */
export const generateFastMock: Generate = async (
  png: Blob,
  prompt: string,
  onProgress: (progress: Progress) => void,
) => {
  onProgress({ phase: "uploading" });
  await delay(300);

  for (const { message, pct, preview } of MOCK_FAST_MESSAGES) {
    onProgress({ phase: "generating", message, pct, previewUrl: preview });
    // The second step lingers, mirroring the real split: the bridge lands in
    // ~2.3s and the mesh takes ~16s more, so the preview is on screen for most
    // of the wait. A uniform delay would hide the very behaviour being tested.
    await delay(preview ? 2500 : 500);
  }

  // Same reasoning as generateMock: reuse an asset already in public/ rather
  // than committing a binary purely for the offline path.
  return { mode: "fast", glbUrl: "/axe.glb" };
};

const MOCK_SPRITE_MESSAGES: Array<{ message: string; pct: number }> = [
  { message: "Drawing your picture…", pct: 0.15 },
  { message: "Cutting it out…", pct: 0.8 },
];

export const generateSpriteMock: Generate = async (
  png: Blob,
  prompt: string,
  onProgress: (progress: Progress) => void,
) => {
  onProgress({ phase: "uploading" });
  await delay(300);

  for (const { message, pct } of MOCK_SPRITE_MESSAGES) {
    onProgress({ phase: "generating", message, pct });
    await delay(600);
  }

  // "/cutout-cat.png" already ships in public/, so the sprite mock path
  // needs no committed fallback asset of its own.
  return { mode: "sprite", spriteUrl: "/cutout-cat.png" };
};
