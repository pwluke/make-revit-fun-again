import { createStore, type StoreApi } from "zustand/vanilla";
import {
  DEFAULT_TRANSFORM,
  GROUND_Y,
  clampScale,
  clampY,
  type CreationTransform,
} from "./transform";
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
    /** Object URL of the submitted drawing — shown in-world until a result lands. */
    sketchUrl?: string;
  }) => void;
  updateJob: (id: string, state: JobState) => void;
  removeCreation: (id: string) => void;

  /** Which creation the player has selected for editing, if any. */
  selectedId: string | null;
  select: (id: string | null) => void;
  /** Applies a partial transform, clamped. Ignores unknown ids. */
  setTransform: (id: string, patch: Partial<CreationTransform>) => void;
  /** Puts a creation's base back on the floor. */
  dropToGround: (id: string) => void;

  /**
   * Replaces the list with creations restored from storage.
   *
   * Only ever called once, on mount, before anything can be generated — hence a
   * replace rather than a merge. Merging would need identity rules for a
   * conflict that cannot happen.
   */
  hydrate: (creations: Creation[]) => void;
};

export function createCreationStore(): StoreApi<CreationStoreState> {
  return createStore<CreationStoreState>((set) => ({
    creations: [],
    bridge: null,

    registerBridge: (bridge) => set({ bridge }),

    startCreation: ({ id, userText, prompt, mode, spawn, sketchUrl }) =>
      set((state) => {
        const next: Creation = {
          id,
          userText,
          prompt,
          mode,
          spawn,
          sketchUrl,
          // Starts at the height it was spawned at, so an untouched creation
          // hangs where the player was looking rather than snapping to the floor.
          transform: { ...DEFAULT_TRANSFORM, y: Math.max(spawn.position[1], GROUND_Y) },
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
        // Never leave a selection pointing at something that no longer exists —
        // the eviction cap removes creations without asking.
        selectedId: state.selectedId === id ? null : state.selectedId,
      })),

    selectedId: null,

    select: (id) => set((state) => (state.selectedId === id ? state : { selectedId: id })),

    setTransform: (id, patch) =>
      set((state) => ({
        creations: state.creations.map((creation) => {
          if (creation.id !== id) return creation;
          const next: CreationTransform = {
            scale: patch.scale !== undefined ? clampScale(patch.scale) : creation.transform.scale,
            y: patch.y !== undefined ? clampY(patch.y) : creation.transform.y,
          };
          return { ...creation, transform: next };
        }),
      })),

    dropToGround: (id) =>
      set((state) => ({
        creations: state.creations.map((creation) =>
          creation.id === id
            ? { ...creation, transform: { ...creation.transform, y: GROUND_Y } }
            : creation,
        ),
      })),

    hydrate: (creations) => set({ creations, selectedId: null }),
  }));
}

/** App-wide instance. Tests use `createCreationStore()` for isolation. */
export const creationStore = createCreationStore();
