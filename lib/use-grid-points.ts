"use client";

import { useEffect, useState } from "react";
import {
  extractRawPoints,
  findBuiltInBuilding,
  readActiveBuildingId,
  type BuildingLayer,
  type RawPoint,
} from "./building-projects";

export type CubeCoords = [x: number, y: number, z: number];

export type GridPoint = {
  id: string;
  x: number;
  y: number;
  z: number;
  occupied: boolean;
  color: string;
  layer: string;
};

/** Kept as the old name so scene code that imports it does not have to change. */
export type PointLayer = BuildingLayer;

/** Edge length of the previous InstantDB cubes. This grid is ~1/3 of that. */
export const TARGET_BLOCK_SIZE = 1 / 3;

/** Extra world-Y shift after the grid is sat on the ground. Negative = down. */
export const BUILDING_Y_OFFSET = -4;

const DEFAULT_BLOCK_SIZE: CubeCoords = [
  TARGET_BLOCK_SIZE,
  TARGET_BLOCK_SIZE,
  TARGET_BLOCK_SIZE,
];

type GridState = {
  points: GridPoint[];
  blockSize: CubeCoords;
  isLoading: boolean;
  error: Error | null;
};

const initialState: GridState = {
  points: [],
  blockSize: DEFAULT_BLOCK_SIZE,
  isLoading: true,
  error: null,
};

let snapshot: GridState = initialState;
const listeners = new Set<(state: GridState) => void>();
let autoLoadStarted = false;
/** Bumped per load so a slow building that lost the race cannot overwrite. */
let loadToken = 0;

function emit(next: GridState) {
  snapshot = next;
  for (const listener of listeners) listener(next);
}

async function readLayer(layer: BuildingLayer): Promise<RawPoint[]> {
  if (layer.points) return layer.points;
  if (!layer.file) throw new Error(`Layer ${layer.id} has no file and no points`);
  const response = await fetch(layer.file);
  if (!response.ok) {
    throw new Error(`Could not load ${layer.file} (${response.status})`);
  }
  return extractRawPoints(await response.json(), layer.file);
}

/**
 * Swap the building on screen. Everything that reads `useGridPoints` — cubes,
 * the laser-tag arena, star and fossil placement — re-derives from the new
 * points, so this is the single switch the picker throws.
 *
 * A layer that fails is skipped rather than fatal: half a building beats an
 * error screen, and uploads routinely miss a layer or two. Only a building
 * where every layer failed reports an error.
 */
export function setBuildingLayers(layers: BuildingLayer[]) {
  autoLoadStarted = true;
  const token = ++loadToken;
  emit({ ...snapshot, isLoading: true, error: null });

  void (async () => {
    const enabled = layers.filter((layer) => layer.enabled);
    const loaded: { layer: BuildingLayer; raw: RawPoint[] }[] = [];
    const failures: string[] = [];

    await Promise.all(
      enabled.map(async (layer) => {
        try {
          loaded.push({ layer, raw: await readLayer(layer) });
        } catch (cause) {
          failures.push(cause instanceof Error ? cause.message : String(cause));
        }
      }),
    );

    if (token !== loadToken) return;

    if (loaded.length === 0) {
      emit({
        ...snapshot,
        isLoading: false,
        error: new Error(failures[0] ?? "This building has no layers to show"),
      });
      return;
    }
    if (failures.length > 0) {
      console.warn(`[buildings] skipped ${failures.length} layer(s):`, failures);
    }

    // `enabled` order, not completion order, or the colour of a shared cell
    // would change from one load to the next.
    loaded.sort(
      (a, b) => enabled.indexOf(a.layer) - enabled.indexOf(b.layer),
    );
    const prepared = preparePoints(loaded);
    emit({
      points: prepared.points,
      blockSize: prepared.blockSize,
      isLoading: false,
      error: null,
    });
  })();
}

/**
 * First mount with nobody having chosen a building yet. Only built-ins can be
 * resolved here — an uploaded id lives in IndexedDB, and reaching for it would
 * make this module depend on the store that depends on this module. The store
 * calls `setBuildingLayers` as soon as it has hydrated.
 */
function ensureLoad() {
  if (autoLoadStarted) return;
  const saved = findBuiltInBuilding(readActiveBuildingId());
  if (!saved) return;
  setBuildingLayers(saved.layers);
}

/**
 * Rhino is Z-up; three.js is Y-up. Same rotation the InstantDB stream used
 * (`python/rhino-stream.py` `_to_three`), so the building sits upright.
 */
export function rhinoToThree(x: number, y: number, z: number): CubeCoords {
  return [x, z, -y];
}

function roundTo(value: number, digits: number) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Median gap between unique values on one axis — the voxel pitch. */
export function axisStep(values: number[]): number {
  const unique = [...new Set(values.map((value) => roundTo(value, 4)))].sort(
    (a, b) => a - b,
  );
  if (unique.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    const gap = unique[i] - unique[i - 1];
    if (gap > 1e-4) gaps.push(gap);
  }
  if (gaps.length === 0) return 0;
  gaps.sort((a, b) => a - b);
  return gaps[Math.floor(gaps.length / 2)];
}

function preparePoints(
  layers: { layer: PointLayer; raw: RawPoint[] }[],
): Pick<GridState, "points" | "blockSize"> {
  if (layers.length === 0) {
    return { points: [], blockSize: DEFAULT_BLOCK_SIZE };
  }

  const converted = layers.map(({ layer, raw }) => ({
    layer,
    positions: raw.map((point) => rhinoToThree(point.x, point.y, point.z)),
  }));

  const sample = converted.flatMap(({ positions }) => positions);
  const xStep = axisStep(sample.map((position) => position[0]));
  const yStep = axisStep(sample.map((position) => position[1]));
  const zStep = axisStep(sample.map((position) => position[2]));
  const planStep = Math.max(xStep, zStep, 1e-6);
  const scale = TARGET_BLOCK_SIZE / planStep;

  const blockSize: CubeCoords = [
    (xStep || planStep) * scale,
    (yStep || planStep) * scale,
    (zStep || planStep) * scale,
  ];

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const { positions } of converted) {
    for (const [x, y, z] of positions) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
    }
  }

  const shiftX = -((minX + maxX) / 2) * scale;
  const shiftY = blockSize[1] / 2 - minY * scale + BUILDING_Y_OFFSET;
  const shiftZ = -((minZ + maxZ) / 2) * scale;

  const points: GridPoint[] = [];
  for (const { layer, positions } of converted) {
    positions.forEach(([x, y, z], index) => {
      points.push({
        id: `${layer.id}-${index}`,
        x: x * scale + shiftX,
        y: y * scale + shiftY,
        z: z * scale + shiftZ,
        occupied: true,
        color: layer.color,
        layer: layer.id,
      });
    });
  }

  return { points, blockSize };
}

export function useGridPoints() {
  const [state, setState] = useState<GridState>(snapshot);

  useEffect(() => {
    listeners.add(setState);
    ensureLoad();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return {
    data: { points: state.points },
    blockSize: state.blockSize,
    isLoading: state.isLoading,
    error: state.error,
  };
}

export function occupiedPointCoords(points: GridPoint[] | undefined) {
  return (points ?? [])
    .filter((point) => point.occupied !== false)
    .map((point) => ({
      id: point.id,
      position: [point.x, point.y, point.z] as CubeCoords,
      color: point.color,
      layer: point.layer,
    }));
}

export function neighborPosition(
  position: CubeCoords,
  normal: { x: number; y: number; z: number },
  size: CubeCoords,
): CubeCoords {
  return [
    position[0] + Math.round(normal.x) * size[0],
    position[1] + Math.round(normal.y) * size[1],
    position[2] + Math.round(normal.z) * size[2],
  ];
}

export function snapToGroundGrid(
  x: number,
  z: number,
  size: CubeCoords,
): CubeCoords {
  return [
    Math.round(x / size[0]) * size[0],
    size[1] / 2,
    Math.round(z / size[2]) * size[2],
  ];
}
