"use client";

import { useMemo } from "react";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";
import { ABILITY_ORDER, type AbilityId } from "./store";

/**
 * Where the six ability emblems hide. The model arrives as semantic voxel
 * layers, so placement can use them: emblems sit on real `A-FLOR` slabs
 * with real headroom above, scattered through the building on whatever
 * storeys it happens to have. Two are dropped near spawn so a player finds
 * one immediately and learns what they are.
 */

export const EMBLEM_PICKUP_RADIUS = 1.1;

/** How many of the six start outside, by the spawn point. */
const SPAWN_COUNT = 2;
/** Player spawn, mirroring SPAWN_POSITION in Player.tsx. */
const SPAWN: [number, number] = [0, 16];
/** Ring around spawn the outdoor pair sits on. */
const SPAWN_RING = 4;
/** Emblem float height above the slab it sits on. */
const HOVER = 0.85;
/** Clearance a spot needs above the slab, in world units. */
const HEADROOM = 2.1;
/** Keep emblems from crowding each other. */
const MIN_SEPARATION = 7;

/** mulberry32 — small deterministic PRNG. Reseeded per page load so the
 *  hunt differs each session, but stable within it: both the scene and the
 *  HUD read this module, and a card must not move mid-walk. */
const SEED = Math.floor(Math.random() * 0xffffff) + 1;
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type EmblemSpot = {
  id: AbilityId;
  hint: string;
  pos: [number, number, number];
};

/** Rough storey wording from height above the building's own ground. */
function storeyHint(y: number, groundY: number, topY: number) {
  const span = Math.max(topY - groundY, 1);
  const t = (y - groundY) / span;
  if (t < 0.28) return "on the ground floor";
  if (t < 0.62) return "on a middle floor";
  return "high up in the building";
}

export function useAbilityEmblemSpots(): EmblemSpot[] {
  const { data, blockSize } = useGridPoints();

  return useMemo(() => {
    const points = occupiedPointCoords(data?.points);
    const random = seededRandom(SEED);
    const picked: [number, number, number][] = [];
    const sepSq = MIN_SEPARATION * MIN_SEPARATION;
    /** Straight 3D distance. An earlier version only rejected neighbours that
     *  were BOTH close in plan AND close in height, which let two emblems land
     *  a metre apart on the same slab. */
    const tooClose = (x: number, y: number, z: number) =>
      picked.some(
        ([px, py, pz]) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 < sepSq,
      );

    // Ground level, needed both for the outdoor pair and for storey wording.
    let groundY = 0;
    let topY = 1;
    if (points.length > 0) {
      groundY = Infinity;
      topY = -Infinity;
      for (const { position } of points) {
        if (position[1] < groundY) groundY = position[1];
        if (position[1] > topY) topY = position[1];
      }
    }

    // Two by the spawn point, on opposite sides so one is always in view.
    for (let i = 0; i < SPAWN_COUNT; i++) {
      const angle = random() * Math.PI * 2 + i * Math.PI;
      picked.push([
        SPAWN[0] + Math.cos(angle) * SPAWN_RING,
        groundY + HOVER,
        SPAWN[1] + Math.sin(angle) * SPAWN_RING,
      ]);
    }

    // The rest go inside, standing on floor slabs with headroom.
    const step = Math.max(blockSize[1], 0.01);
    const solid = new Set<string>();
    const key = (x: number, y: number, z: number) =>
      `${Math.round(x / blockSize[0])},${Math.round(y / step)},${Math.round(
        z / blockSize[2],
      )}`;
    for (const { position } of points) {
      solid.add(key(position[0], position[1], position[2]));
    }

    const floors = points.filter((p) => p.layer === "A-FLOR");
    const clearanceSteps = Math.ceil(HEADROOM / step);
    const hasHeadroom = (x: number, y: number, z: number) => {
      for (let i = 1; i <= clearanceSteps; i++) {
        if (solid.has(key(x, y + i * step, z))) return false;
      }
      return true;
    };

    // Bounded sampling: the floor layer has ~100k candidates, so random
    // probes beat scanning, and a cap keeps a dense model from stalling.
    for (
      let attempt = 0;
      attempt < 4000 && picked.length < ABILITY_ORDER.length && floors.length > 0;
      attempt++
    ) {
      const cand = floors[Math.floor(random() * floors.length)].position;
      const [x, fy, z] = cand;
      if (!hasHeadroom(x, fy, z)) continue;
      const y = fy + HOVER;
      if (tooClose(x, y, z)) continue;
      picked.push([x, y, z]);
    }

    // Fallback ring outside, pushed out until it clears everything placed.
    for (let ring = 8; picked.length < ABILITY_ORDER.length; ring += 5) {
      for (let k = 0; k < 8 && picked.length < ABILITY_ORDER.length; k++) {
        const angle = (k / 8) * Math.PI * 2;
        const x = Math.cos(angle) * ring;
        const z = SPAWN[1] + Math.sin(angle) * ring;
        if (!tooClose(x, groundY + HOVER, z)) picked.push([x, groundY + HOVER, z]);
      }
      if (ring > 60) break;
    }

    // Nearest first, so the "next" hint leads outward and upward.
    const spawnDistSq = (p: [number, number, number]) =>
      (p[0] - SPAWN[0]) ** 2 + (p[2] - SPAWN[1]) ** 2 + (p[1] - groundY) ** 2;
    picked.sort((a, b) => spawnDistSq(a) - spawnDistSq(b));

    return picked.slice(0, ABILITY_ORDER.length).map((pos, i) => {
      const outside = Math.abs(pos[2] - SPAWN[1]) < SPAWN_RING * 1.6 && pos[1] - groundY < 1.5;
      return {
        id: ABILITY_ORDER[i],
        hint: outside
          ? "outside, near where you started"
          : storeyHint(pos[1], groundY, topY),
        pos,
      };
    });
  }, [data?.points, blockSize]);
}
