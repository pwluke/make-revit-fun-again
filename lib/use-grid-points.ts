"use client";

import { useEffect, useState } from "react";

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

type RawPoint = {
  x: number;
  y: number;
  z: number;
};

export type PointLayer = {
  id: string;
  file: string;
  color: string;
  enabled: boolean;
};

/**
 * Ten warm pastel layers, one `_voxels.json` file each. Colors stay distinct
 * so walls / floors / roof read apart once they stack on the shared grid.
 */
export const POINT_LAYERS: PointLayer[] = [
  { id: "S-FNDN", file: "/S-FNDN_voxels.json", color: "#e8d2b0", enabled: true },
  { id: "A-FLOR", file: "/A-FLOR_voxels.json", color: "#f8d3a3", enabled: true },
  { id: "A-FLOR-OTLN", file: "/A-FLOR-OTLN_voxels.json", color: "#f3b8c2", enabled: true },
  { id: "A-WALL", file: "/A-WALL_voxels.json", color: "#f4c7a1", enabled: true },
  { id: "I-WALL", file: "/I-WALL_voxels.json", color: "#f5a99a", enabled: true },
  { id: "A-COLS", file: "/A-COLS_voxels.json", color: "#eed49a", enabled: true },
  { id: "S-STRS", file: "/S-STRS_voxels.json", color: "#f2b8a8", enabled: true },
  { id: "A-CLNG", file: "/A-CLNG_voxels.json", color: "#f6e3a8", enabled: true },
  { id: "A-ROOF", file: "/A-ROOF_voxels.json", color: "#e8a990", enabled: true },
  { id: "A-GENM", file: "/A-GENM_voxels.json", color: "#f5c4c8", enabled: true },
];

/** Edge length of the previous InstantDB cubes. This grid is ~1/3 of that. */
export const TARGET_BLOCK_SIZE = 1 / 3;

/** Extra world-Y shift after the grid is sat on the ground. Negative = down. */
export const BUILDING_Y_OFFSET = -2;

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
let loadStarted = false;

function emit(next: GridState) {
  snapshot = next;
  for (const listener of listeners) listener(next);
}

function ensureLoad() {
  if (loadStarted) return;
  loadStarted = true;

  void (async () => {
    try {
      const enabled = POINT_LAYERS.filter((layer) => layer.enabled);
      const loaded = await Promise.all(
        enabled.map(async (layer) => {
          const response = await fetch(layer.file);
          if (!response.ok) {
            throw new Error(`Could not load ${layer.file} (${response.status})`);
          }
          const json: unknown = await response.json();
          return { layer, raw: extractRawPoints(json, layer.file) };
        }),
      );
      const prepared = preparePoints(loaded);
      emit({
        points: prepared.points,
        blockSize: prepared.blockSize,
        isLoading: false,
        error: null,
      });
    } catch (cause) {
      emit({
        ...snapshot,
        isLoading: false,
        error: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }
  })();
}

function extractRawPoints(json: unknown, file: string): RawPoint[] {
  if (Array.isArray(json)) return json as RawPoint[];
  if (
    json &&
    typeof json === "object" &&
    Array.isArray((json as { points?: unknown }).points)
  ) {
    return (json as { points: RawPoint[] }).points;
  }
  throw new Error(`${file} must be an array or { points: [] }`);
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
