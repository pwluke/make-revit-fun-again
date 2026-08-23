"use client";

import { useCallback, useEffect, useState } from "react";
import { ModeStrip } from "@/components/ModeStrip";
import { creationStore } from "./core/creationStore";
import { generate } from "./core/falClient";
import {
  generateFastMock,
  generateMock,
  generateSpriteMock,
  USE_MOCK,
} from "./core/mockGenerator";
import { buildPrompt } from "./core/prompt";
import { generateSprite } from "./core/spriteClient";
import { generateFast } from "./core/trellisClient";
import { warmAll } from "./core/warmup";
import type { CreationMode, Generate, Progress } from "./core/types";
import { onSceneInputUnlocked } from "./r3f/useR3FSceneBridge";
import { SketchOverlay } from "./ui/SketchOverlay";

/** Resolves which generator to call, keyed on BOTH mode and mock-vs-real. */
const GENERATORS: Record<CreationMode, { real: Generate; mock: Generate }> = {
  sprite: { real: generateSprite, mock: generateSpriteMock },
  mesh: { real: generate, mock: generateMock },
  fast: { real: generateFast, mock: generateFastMock },
};

function resolveGenerateFn(mode: CreationMode): Generate {
  // Keyed on CreationMode so a new mode is a compile error here rather than
  // silently falling through to the mesh generator, which would spend $0.525
  // and 105s on a path that asked for neither.
  const pair = GENERATORS[mode];
  return USE_MOCK ? pair.mock : pair.real;
}

/**
 * DOM-side container for the sketch-to-3D block. Renders as a sibling of the
 * R3F <App/>, never inside <Canvas> — this file owns overlay-open state and
 * the fal.ai call, both DOM/JS concerns that don't belong in the scene.
 */
export function SketchToWorld() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "e" || open) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      setOpen(true);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Escape releases pointer lock natively, without going through our code.
  // While the overlay is open the pointer is already unlocked (we did that
  // ourselves below), so this only ever fires for a native, player-driven
  // unlock — the source of truth the r3f bridge exposes for exactly this.
  useEffect(() => {
    onSceneInputUnlocked(() => setOpen(false));
    return () => onSceneInputUnlocked(null);
  }, []);

  useEffect(() => {
    const bridge = creationStore.getState().bridge;
    bridge?.setInputEnabled(!open);
  }, [open]);

  // Warm the endpoints the moment the overlay opens. The user then spends 20-60s
  // drawing and typing, which is exactly the window a cold fal machine needs to
  // boot — measured queue waits on this project have hit 48.8s, more than the
  // entire compute budget. warmAll rather than warmForMode because the mode is
  // chosen inside the overlay, after this fires. No-op unless
  // NEXT_PUBLIC_WARM_ENDPOINTS=1; warming is billed like any other generation.
  useEffect(() => {
    if (open) warmAll();
  }, [open]);

  const handleCancel = useCallback(() => setOpen(false), []);

  const handleSubmit = useCallback((png: Blob, userText: string, mode: CreationMode) => {
    const bridge = creationStore.getState().bridge;
    if (!bridge) {
      // No scene mounted yet — nothing to spawn into.
      setOpen(false);
      return;
    }

    // Capture spawn NOW: generation takes ~130s, so recomputing on arrival
    // would spawn the model at wherever the kid wandered off to later.
    const spawn = bridge.getSpawnTransform();
    const id = crypto.randomUUID();
    // Shown in-world immediately, so the moment the overlay closes the child sees
    // their own drawing standing where it will become a model — rather than a
    // placeholder box, or nothing. Revoked once the job settles, below.
    const sketchUrl = URL.createObjectURL(png);
    // Mode-aware: sprite mode steers SDXL, mesh mode steers Hunyuan. They are
    // different models and do not necessarily want the same style string.
    const prompt = buildPrompt(userText, mode);

    creationStore.getState().startCreation({ id, userText, prompt, mode, spawn, sketchUrl });

    // Close immediately — the kid returns to the world and walks around
    // while it generates. Multiple generations can be in flight at once, so
    // this never blocks on the promise below.
    setOpen(false);

    const onProgress = (progress: Progress) => {
      if (progress.phase === "uploading") {
        creationStore.getState().updateJob(id, { status: "uploading" });
      } else {
        creationStore.getState().updateJob(id, {
          status: "generating",
          message: progress.message,
          // Carried through so the scene can show fast mode's bridge image while
          // the mesh is still generating. Undefined for the other two modes.
          previewUrl: progress.previewUrl,
        });
      }
    };

    const generateFn = resolveGenerateFn(mode);
    generateFn(png, prompt, onProgress)
      .then((result) => {
        creationStore.getState().updateJob(id, { status: "ready", result });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Generation failed";
        creationStore.getState().updateJob(id, { status: "error", message, retryable: true });
      })
      .finally(() => {
        // Safe once the job has settled: the sketch is only rendered while
        // generating, and a texture already uploaded to the GPU is unaffected by
        // revoking the URL it was loaded from. Without this each submission
        // leaks its PNG for the lifetime of the page.
        URL.revokeObjectURL(sketchUrl);
      });
  }, []);

  return (
    <>
      {/* Three creation modes now share this world, so the hint lists all of
          them rather than just this one. E opens the overlay below (which picks
          between a 3D model and a 2.5D sprite); B is the separate freehand
          3D-line feature in components/sketch3d, which draws in the world and
          never opens an overlay. Hidden while the overlay is open, as before. */}
      {!open && <ModeStrip />}
      <SketchOverlay open={open} onCancel={handleCancel} onSubmit={handleSubmit} />
    </>
  );
}
