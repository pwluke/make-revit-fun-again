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
