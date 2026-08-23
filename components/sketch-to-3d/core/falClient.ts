/**
 * Talks to fal.ai's hunyuan3d-v3 sketch-to-3D endpoint.
 *
 * This file must never import React or three.js — see the layering note in
 * `./types`. Only `@fal-ai/client` and `./types` are allowed here.
 */

import { fal } from "@fal-ai/client";
import type { Generate, Progress } from "./types";

// The proxy injects FAL_KEY server-side; the browser must never see a key.
fal.config({ proxyUrl: "/api/fal/proxy" });

/**
 * Uploads a sketch PNG and generates a 3D model from it.
 *
 * Owns both steps (upload, then generate) so the caller never sees the
 * intermediate image URL.
 */
export const generate: Generate = async (
  png: Blob,
  prompt: string,
  onProgress: (progress: Progress) => void,
) => {
  onProgress({ phase: "uploading" });
  const imageUrl = await fal.storage.upload(png);

  const result = await fal.subscribe("fal-ai/hunyuan3d-v3/sketch-to-3d", {
    input: {
      input_image_url: imageUrl,
      prompt,
      // PBR off is only correct because the R3F viewer overrides materials
      // with flatShading and keeps just the base-colour map — the
      // metallic/roughness/normal maps PBR would generate get thrown away
      // on arrival, for a real +$0.15/call. This setting is coupled to the
      // viewer's material override by intent, not by code: if the viewer
      // ever stops overriding materials, revisit this.
      enable_pbr: false,
      // 40,000 triangles vs the 500,000 default costs +$0.15 per call, but
      // is required: a measured default-settings GLB was 500,000 triangles
      // / 26.2 MB, and having several of those in one live physics scene
      // destroys the frame rate.
      face_count: 40000,
    },
    logs: true,
    onQueueUpdate: (update) => {
      const logs = "logs" in update ? update.logs : undefined;
      const lastLog = logs && logs.length > 0 ? logs[logs.length - 1]?.message : undefined;
      const message = lastLog ?? update.status;
      onProgress({ phase: "generating", message });
    },
  });

  const glbUrl = result.data?.model_glb?.url ?? result.data?.model_urls?.glb?.url;
  if (!glbUrl) {
    throw new Error("fal.ai response did not include a GLB URL (model_glb.url / model_urls.glb.url)");
  }

  return { mode: "mesh", glbUrl };
};
