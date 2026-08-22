"use client";

import { useCallback, useEffect, useState } from "react";
import { ModeStrip } from "@/components/ModeStrip";
import { creationStore } from "./core/creationStore";
import { generate } from "./core/falClient";
import { generateMock, generateSpriteMock, USE_MOCK } from "./core/mockGenerator";
import { buildPrompt } from "./core/prompt";
import { generateSprite } from "./core/spriteClient";
import type { CreationMode, Generate, Progress } from "./core/types";
import { onSceneInputUnlocked } from "./r3f/useR3FSceneBridge";
import { SketchOverlay } from "./ui/SketchOverlay";

/** Resolves which generator to call, keyed on BOTH mode and mock-vs-real. */
function resolveGenerateFn(mode: CreationMode): Generate {
  if (mode === "sprite") return USE_MOCK ? generateSpriteMock : generateSprite;
  return USE_MOCK ? generateMock : generate;
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
    // Mode-aware: sprite mode steers SDXL, mesh mode steers Hunyuan. They are
    // different models and do not necessarily want the same style string.
    const prompt = buildPrompt(userText, mode);

    creationStore.getState().startCreation({ id, userText, prompt, mode, spawn });

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
