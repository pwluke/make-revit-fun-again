"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { db } from "@/lib/db";
import type { InstaQLEntity } from "@instantdb/react";
import type { AppSchema } from "@/instant.schema";

export type GridSource = "points" | "voxels";

export type GridPoint = InstaQLEntity<AppSchema, "points">;
export type GridVoxel = InstaQLEntity<AppSchema, "voxels">;

export type GridCube = {
  id: string;
  position: [number, number, number];
  size: number;
  color?: [number, number, number];
};

type GridSourceStore = {
  source: GridSource;
  setSource: (source: GridSource) => void;
};

export const useGridSourceStore = create<GridSourceStore>((set) => ({
  source: "points",
  setSource: (source) => set({ source }),
}));

export function useGridPoints() {
  return db.useQuery({ points: {} });
}

export function useGridVoxels() {
  return db.useQuery({ voxels: {} });
}

export function occupiedPointCoords(points: GridPoint[] | undefined): GridCube[] {
  return (points ?? [])
    .filter((point) => point.occupied !== false)
    .map((point) => ({
      id: point.id,
      // Points were authored at Minecraft scale (~1 unit per block). A 1×1×1
      // cube at the raw coordinate is the size that already looks right.
      position: [point.x, point.y, point.z],
      size: 1,
    }));
}

export function occupiedVoxelCoords(
  voxels: GridVoxel[] | undefined,
): GridCube[] {
  const rows = voxels ?? [];
  if (rows.length === 0) return [];

  // `size` is the cube edge in the same units as x/y/z. The live data is 1,
  // which matches the point cubes, so no extra multiplier is applied.
  // Elevations arrive ~60 units up (Revit feet); shift the whole set so the
  // lowest cube sits on the ground the way the scaled points already do.
  const minY = Math.min(...rows.map((voxel) => voxel.y));

  return rows.map((voxel) => {
    const size = voxel.size ?? 1;
    return {
      id: voxel.id,
      position: [voxel.x, voxel.y - minY + size / 2, voxel.z],
      size,
      color: [
        (voxel.r ?? 255) / 255,
        (voxel.g ?? 255) / 255,
        (voxel.b ?? 255) / 255,
      ],
    };
  });
}

export function useOccupiedGridCubes() {
  const source = useGridSourceStore((state) => state.source);
  const { data: pointData } = useGridPoints();
  const { data: voxelData } = useGridVoxels();

  return useMemo(
    () =>
      source === "voxels"
        ? occupiedVoxelCoords(voxelData?.voxels)
        : occupiedPointCoords(pointData?.points),
    [source, pointData?.points, voxelData?.voxels],
  );
}
