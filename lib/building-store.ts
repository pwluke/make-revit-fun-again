"use client";

import { create } from "zustand";
import {
  BUILT_IN_BUILDINGS,
  DEFAULT_BUILDING_ID,
  buildingNameFromFiles,
  countPoints,
  findBuiltInBuilding,
  layersFromFiles,
  readActiveBuildingId,
  writeActiveBuildingId,
  type BuildingLayer,
} from "./building-projects";
import {
  deleteStoredBuilding,
  listStoredBuildings,
  readStoredBuilding,
  storageAvailable,
  writeStoredBuilding,
} from "./building-db";
import { setBuildingLayers } from "./use-grid-points";

export type BuildingCard = {
  id: string;
  name: string;
  detail: string;
  origin: "builtin" | "upload";
};

type BuildingState = {
  buildings: BuildingCard[];
  activeId: string;
  /** True while an upload is being parsed and saved. */
  busy: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  /** False when the building could not be resolved (deleted, storage denied). */
  select: (id: string) => Promise<boolean>;
  /** Returns the new building's name so the caller can say so in a toast. */
  importFiles: (files: File[]) => Promise<{ name: string; skipped: number } | null>;
  remove: (id: string) => Promise<void>;
};

const builtInCards: BuildingCard[] = BUILT_IN_BUILDINGS.map((building) => ({
  id: building.id,
  name: building.name,
  detail: building.detail,
  origin: "builtin",
}));

function uploadDetail(pointCount: number, layerCount: number) {
  const points =
    pointCount >= 1000
      ? `${Math.round(pointCount / 1000)}k blocks`
      : `${pointCount} blocks`;
  return `Yours · ${layerCount} layer${layerCount === 1 ? "" : "s"} · ${points}`;
}

async function resolveLayers(id: string): Promise<BuildingLayer[] | null> {
  const builtIn = findBuiltInBuilding(id);
  if (builtIn) return builtIn.layers;
  return readStoredBuilding(id);
}

let hydrated = false;

export const useBuildingStore = create<BuildingState>((set, get) => ({
  buildings: builtInCards,
  activeId: DEFAULT_BUILDING_ID,
  busy: false,
  error: null,

  hydrate: async () => {
    if (hydrated) return;
    hydrated = true;
    const saved = readActiveBuildingId();
    try {
      const stored = await listStoredBuildings();
      set({
        buildings: [
          ...builtInCards,
          ...stored.map<BuildingCard>((meta) => ({
            id: meta.id,
            name: meta.name,
            detail: uploadDetail(meta.pointCount, meta.layerCount),
            origin: "upload",
          })),
        ],
      });
    } catch (cause) {
      console.warn("[buildings] could not list saved buildings", cause);
    }

    if (findBuiltInBuilding(saved)) {
      // `use-grid-points` reads the same key and has already started this one;
      // re-selecting would only throw away the fetch that is in flight.
      set({ activeId: saved });
      return;
    }
    // An upload: the only id `use-grid-points` cannot resolve by itself, so
    // nothing is loading yet and the fallback matters.
    if (!(await get().select(saved))) await get().select(DEFAULT_BUILDING_ID);
  },

  select: async (id) => {
    const layers = await resolveLayers(id).catch(() => null);
    if (!layers) {
      set({ error: "That building is no longer saved on this device." });
      return false;
    }
    set({ activeId: id, error: null });
    writeActiveBuildingId(id);
    setBuildingLayers(layers);
    return true;
  },

  importFiles: async (files) => {
    if (files.length === 0) return null;
    set({ busy: true, error: null });
    try {
      const { layers, skipped } = await layersFromFiles(files);
      if (layers.length === 0) {
        set({
          busy: false,
          error:
            skipped[0]?.reason ?? "None of those files held x / y / z points.",
        });
        return null;
      }

      const name =
        buildingNameFromFiles(files) ??
        `My building ${get().buildings.filter((b) => b.origin === "upload").length + 1}`;
      const id = `upload-${Date.now().toString(36)}`;
      const pointCount = countPoints(layers);
      const meta = {
        id,
        name,
        savedAt: Date.now(),
        layerCount: layers.length,
        pointCount,
      };

      if (storageAvailable()) {
        try {
          await writeStoredBuilding(meta, layers);
        } catch (cause) {
          // Quota or private browsing. The building still opens this session.
          console.warn("[buildings] could not save to IndexedDB", cause);
        }
      }

      set((state) => ({
        buildings: [
          ...state.buildings,
          {
            id,
            name,
            detail: uploadDetail(pointCount, layers.length),
            origin: "upload",
          },
        ],
        activeId: id,
        busy: false,
      }));
      writeActiveBuildingId(id);
      setBuildingLayers(layers);
      return { name, skipped: skipped.length };
    } catch (cause) {
      set({
        busy: false,
        error: cause instanceof Error ? cause.message : "Could not read those files.",
      });
      return null;
    }
  },

  remove: async (id) => {
    if (findBuiltInBuilding(id)) return;
    await deleteStoredBuilding(id).catch((cause) => {
      console.warn("[buildings] could not delete", cause);
    });
    const wasActive = get().activeId === id;
    set((state) => ({
      buildings: state.buildings.filter((building) => building.id !== id),
      error: null,
    }));
    if (wasActive) await get().select(DEFAULT_BUILDING_ID);
  },
}));
