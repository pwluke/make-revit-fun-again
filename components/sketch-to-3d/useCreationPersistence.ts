"use client";

/**
 * Loads saved creations on mount and writes them back as they change.
 *
 * Called once, from the DOM-side container. Deliberately NOT inside <Canvas>:
 * this is storage, not rendering, and R3F components can remount for reasons
 * that have nothing to do with the data.
 */

import { useEffect } from "react";
import { creationStore } from "./core/creationStore";
import { loadCreations, saveCreations } from "./core/persistence";

export function useCreationPersistence(): void {
  useEffect(() => {
    const restored = loadCreations();
    if (restored.length > 0) creationStore.getState().hydrate(restored);

    // Subscribe AFTER hydrating, so the restore itself does not trigger a
    // redundant write of what was just read.
    let previous = creationStore.getState().creations;
    const unsubscribe = creationStore.subscribe((state) => {
      if (state.creations === previous) return;
      previous = state.creations;
      saveCreations(state.creations);
    });

    return unsubscribe;
  }, []);
}
