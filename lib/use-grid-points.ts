"use client";

import { db } from "@/lib/db";
import type { InstaQLEntity } from "@instantdb/react";
import type { AppSchema } from "@/instant.schema";

export type GridPoint = InstaQLEntity<AppSchema, "points">;

export function useGridPoints() {
  return db.useQuery({ points: {} });
}

export function occupiedPointCoords(points: GridPoint[] | undefined) {
  return (points ?? [])
    .filter((point) => point.occupied !== false)
    .map((point) => ({
      id: point.id,
      position: [point.x, point.y, point.z] as [number, number, number],
    }));
}
