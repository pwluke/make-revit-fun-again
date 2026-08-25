/**
 * What a "building" is, and which ones ship with the app.
 *
 * One building = a folder of `{LAYER}_voxels.json` files, one per Revit layer.
 * Built-ins live under `public/building-projects/<folder>/` and are fetched by
 * URL. Uploaded ones are parsed in the browser and carry their points inline,
 * so the two kinds are interchangeable everywhere downstream.
 *
 * This module is the innermost ring: no React, no zustand, no IndexedDB, so
 * `use-grid-points` can read the built-in registry without a cycle.
 */

export type RawPoint = { x: number; y: number; z: number };

export type BuildingLayer = {
  id: string;
  color: string;
  enabled: boolean;
  /** Built-in layers stream from `public/`. Mutually exclusive with `points`. */
  file?: string;
  /** Uploaded layers carry their points with them. */
  points?: RawPoint[];
};

export type BuildingSource = {
  id: string;
  name: string;
  /** Subtitle for the picker card. */
  detail: string;
  layers: BuildingLayer[];
};

/**
 * The ten warm pastel layers a Revit export produces. Colors stay distinct so
 * walls / floors / roof read apart once they stack on the shared grid.
 *
 * Order matters: it is the order cubes get pushed, so later layers win a tie
 * on a shared cell.
 */
export const LAYER_ORDER = [
  "S-FNDN",
  "A-FLOR",
  "A-FLOR-OTLN",
  "A-WALL",
  "I-WALL",
  "A-COLS",
  "S-STRS",
  "A-CLNG",
  "A-ROOF",
  "A-GENM",
] as const;

export const LAYER_COLORS: Record<string, string> = {
  "S-FNDN": "#e8d2b0",
  "A-FLOR": "#f8d3a3",
  "A-FLOR-OTLN": "#f3b8c2",
  "A-WALL": "#f4c7a1",
  "I-WALL": "#f5a99a",
  "A-COLS": "#eed49a",
  "S-STRS": "#f2b8a8",
  "A-CLNG": "#f6e3a8",
  "A-ROOF": "#e8a990",
  "A-GENM": "#f5c4c8",
};

/** For uploads that use layer names we have never seen. */
const FALLBACK_COLORS = [
  "#f8d3a3",
  "#f4c7a1",
  "#f5a99a",
  "#eed49a",
  "#f6e3a8",
  "#e8a990",
  "#f5c4c8",
  "#f3b8c2",
];

export function colorForLayer(layerId: string, index: number): string {
  return LAYER_COLORS[layerId] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

function folderLayers(folder: string): BuildingLayer[] {
  return LAYER_ORDER.map((id) => ({
    id,
    color: LAYER_COLORS[id],
    enabled: true,
    file: `/building-projects/${folder}/${id}_voxels.json`,
  }));
}

/**
 * Buildings that ship in `public/`. Adding one is: drop the folder in, add a
 * line here. Nothing else in the app hard-codes a path.
 */
export const BUILT_IN_BUILDINGS: BuildingSource[] = [
  {
    id: "riverside-school",
    name: "Riverside School",
    detail: "Built in · 10 layers",
    layers: folderLayers("riverside-school"),
  },
  {
    id: "snowdon",
    name: "Snowdon Building",
    detail: "Built in · 10 layers",
    layers: folderLayers("snowdon"),
  },
];

export const DEFAULT_BUILDING_ID = BUILT_IN_BUILDINGS[0].id;

export function findBuiltInBuilding(id: string): BuildingSource | undefined {
  return BUILT_IN_BUILDINGS.find((building) => building.id === id);
}

/** Where the picker remembers the open building between visits. */
export const ACTIVE_BUILDING_KEY = "mrfa.active-building";

export function readActiveBuildingId(): string {
  if (typeof window === "undefined") return DEFAULT_BUILDING_ID;
  try {
    return window.localStorage.getItem(ACTIVE_BUILDING_KEY) ?? DEFAULT_BUILDING_ID;
  } catch {
    return DEFAULT_BUILDING_ID;
  }
}

export function writeActiveBuildingId(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_BUILDING_KEY, id);
  } catch {
    // Private browsing with storage denied. The picker still works, it just
    // forgets the choice on reload.
  }
}

function isRawPoint(value: unknown): value is RawPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as RawPoint;
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.z)
  );
}

/**
 * Both shapes the exporters have produced over time: a bare array, and the
 * `{ points: [...], point_count: n }` wrapper the Revit add-in writes.
 *
 * Entries that are not three finite numbers are dropped rather than trusted —
 * this parses files the user picked off their disk.
 */
export function extractRawPoints(json: unknown, label: string): RawPoint[] {
  const list = Array.isArray(json)
    ? json
    : json &&
        typeof json === "object" &&
        Array.isArray((json as { points?: unknown }).points)
      ? (json as { points: unknown[] }).points
      : null;
  if (!list) {
    throw new Error(`${label} must be an array or { "points": [...] }`);
  }
  const points = list.filter(isRawPoint);
  if (points.length === 0 && list.length > 0) {
    throw new Error(`${label} has no points with numeric x, y and z`);
  }
  return points;
}

/** `A-WALL_voxels.json` -> `A-WALL`. Anything else keeps its stem. */
export function layerIdFromFileName(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "");
  const stripped = stem.replace(/[_-]?voxels$/i, "");
  return (stripped || stem).toUpperCase();
}

export type ParsedUpload = {
  layers: BuildingLayer[];
  /** `name: reason` for files we could not use, so the UI can say why. */
  skipped: { name: string; reason: string }[];
};

/**
 * Turn a set of picked `.json` files into layers. One bad file does not sink
 * the upload — it lands in `skipped` and the rest still load.
 */
export async function layersFromFiles(files: File[]): Promise<ParsedUpload> {
  const layers: BuildingLayer[] = [];
  const skipped: ParsedUpload["skipped"] = [];

  for (const file of files) {
    if (!/\.json$/i.test(file.name)) {
      skipped.push({ name: file.name, reason: "not a .json file" });
      continue;
    }
    try {
      const points = extractRawPoints(JSON.parse(await file.text()), file.name);
      const id = layerIdFromFileName(file.name);
      layers.push({ id, color: colorForLayer(id, layers.length), enabled: true, points });
    } catch (cause) {
      skipped.push({
        name: file.name,
        reason: cause instanceof Error ? cause.message : "could not be read",
      });
    }
  }

  // Known layers first and in export order, so an upload themes the same way a
  // built-in does; unrecognised ones keep the order they were picked in.
  const rank = (id: string) => {
    const index = (LAYER_ORDER as readonly string[]).indexOf(id);
    return index === -1 ? LAYER_ORDER.length : index;
  };
  layers.sort((a, b) => rank(a.id) - rank(b.id));

  return { layers, skipped };
}

/**
 * The folder the files came from, when the browser tells us (directory picks
 * set `webkitRelativePath`). Plain multi-file picks do not, hence the null.
 */
export function buildingNameFromFiles(files: File[]): string | null {
  for (const file of files) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    if (path && path.includes("/")) return path.split("/")[0];
  }
  return null;
}

export function countPoints(layers: BuildingLayer[]): number {
  return layers.reduce((total, layer) => total + (layer.points?.length ?? 0), 0);
}
