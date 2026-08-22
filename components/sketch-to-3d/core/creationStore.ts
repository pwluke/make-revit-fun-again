import { createStore, type StoreApi } from "zustand/vanilla";
import type { Creation, CreationMode, JobState, SceneBridge, SpawnTransform } from "./types";

/**
 * Hard cap on creations kept in the scene.
 *
 * A measured generation is 26.2 MB with a 12 MB base-colour texture, so eight is
 * already ~100 MB of GPU memory before the texture downscale in `r3f/Creations`.
 * This is a demo-safety valve, not a product decision.
 */
export const MAX_CREATIONS = 8;

export type CreationStoreState = {
  creations: Creation[];
  /**
   * Registered by the scene. Held here because R3F uses a separate reconciler, so
   * React context does not cross the <Canvas> boundary — the DOM overlay and the
   * in-Canvas bridge have no shared provider, but they do share this store.
   */
  bridge: SceneBridge | null;

  registerBridge: (bridge: SceneBridge | null) => void;
  startCreation: (input: {
    id: string;
    userText: string;
    prompt: string;
    mode: CreationMode;
    spawn: SpawnTransform;
  }) => void;
  updateJob: (id: string, state: JobState) => void;
  removeCreation: (id: string) => void;
};

export function createCreationStore(): StoreApi<CreationStoreState> {
  return createStore<CreationStoreState>((set) => ({
    creations: [],
    bridge: null,

    registerBridge: (bridge) => set({ bridge }),

    startCreation: ({ id, userText, prompt, mode, spawn }) =>
      set((state) => {
        const next: Creation = {
          id,
          userText,
          prompt,
          mode,
          spawn,
          state: { status: "uploading" },
        };
        // Array order is insertion order, so the oldest is always at the front.
        const kept =
          state.creations.length >= MAX_CREATIONS
            ? state.creations.slice(state.creations.length - MAX_CREATIONS + 1)
            : state.creations;
        return { creations: [...kept, next] };
      }),

    updateJob: (id, jobState) =>
      set((state) => ({
        creations: state.creations.map((creation) =>
          creation.id === id ? { ...creation, state: jobState } : creation,
        ),
      })),

    removeCreation: (id) =>
      set((state) => ({
        creations: state.creations.filter((creation) => creation.id !== id),
      })),
  }));
}

/** App-wide instance. Tests use `createCreationStore()` for isolation. */
export const creationStore = createCreationStore();
