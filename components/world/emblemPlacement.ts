"use client";

import { useMemo } from "react";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";
import { ABILITY_ORDER, type AbilityId } from "./store";

/**
 * Where the five animal emblems hide.
 *
 * The model is sunk 4m (BUILDING_Y_OFFSET), so its own lowest storeys are
 * BELOW the ground plane the player walks on — an emblem placed on the
 * model's "ground floor" is buried and unreachable. Everything here is
 * therefore placed against the world's y=0 plane, not the model's.
 *
 * Layout: the Bunny sits straight ahead of spawn, three more ring the
 * building outside so they are visible while you walk up to it, and one
 * waits inside on the first slab you can actually stand on.
 */

export const EMBLEM_PICKUP_RADIUS = 1.3;

/** Player spawn, mirroring SPAWN_POSITION in Player.tsx. Spawn looks -Z. */
const SPAWN: [number, number] = [0, 16];
/** Straight ahead of spawn, before the facade — the first thing you see. */
const ENTRANCE: [number, number] = [0, 13.5];
/** Emblems float this far above whatever surface they sit on. */
const HOVER = 1.2;
/** The world's walkable ground. The model's own floors are sunk below it. */
const GROUND_Y = 0;
/** Ring radius for the outdoor emblems, clear of the facade. */
const OUTSIDE_MARGIN = 5;
/** An indoor emblem must stand on a slab in this band above ground — the
 *  first storey the player can actually reach on foot. */
const INDOOR_MIN = 0.2;
const INDOOR_MAX = 1.6;
/** Clearance an indoor spot needs overhead. */
const HEADROOM = 2;
/** How many of the five wait inside; the rest ring the building. */
const INDOOR_COUNT = 1;

/** mulberry32 — small deterministic PRNG. Reseeded per page load so the
 *  hunt differs each session but is stable within it: the scene and the
 *  HUD both read this module, and an emblem must not move mid-walk. */
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
  inside: boolean;
};

export function useAbilityEmblemSpots(): EmblemSpot[] {
  const { data, blockSize } = useGridPoints();

  return useMemo(() => {
    const points = occupiedPointCoords(data?.points);
    const random = seededRandom(SEED);

    // Plan extent of the model, so the outdoor ring can clear it.
    let minX = -10;
    let maxX = 10;
    let minZ = -10;
    let maxZ = 10;
    if (points.length > 0) {
      minX = Infinity;
      maxX = -Infinity;
      minZ = Infinity;
      maxZ = -Infinity;
      for (const { position } of points) {
        if (position[0] < minX) minX = position[0];
        if (position[0] > maxX) maxX = position[0];
        if (position[2] < minZ) minZ = position[2];
        if (position[2] > maxZ) maxZ = position[2];
      }
    }

    const out: { pos: [number, number, number]; inside: boolean }[] = [
      // 1. Bunny: fixed, straight ahead of spawn. It is the tutorial, so it
      // must not depend on the sampler finding anything.
      { pos: [ENTRANCE[0], GROUND_Y + HOVER, ENTRANCE[1]], inside: false },
    ];

    // 2-4. Around the building, on the walking plane. Corners on the spawn
    // side first so they are in frame as you approach, then the far side.
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const halfX = (maxX - minX) / 2 + OUTSIDE_MARGIN;
    const halfZ = (maxZ - minZ) / 2 + OUTSIDE_MARGIN;
    const jitter = () => (random() - 0.5) * 4;
    const ring: [number, number][] = [
      [cx - halfX * 0.75, cz + halfZ], // near-left corner
      [cx + halfX * 0.75, cz + halfZ], // near-right corner
      [cx + halfX, cz - halfZ * 0.4], // round the side
      [cx - halfX, cz - halfZ * 0.4],
      [cx, cz - halfZ], // behind
    ];
    const outdoorWanted = ABILITY_ORDER.length - 1 - INDOOR_COUNT;
    for (let i = 0; i < outdoorWanted && i < ring.length; i++) {
      out.push({
        pos: [ring[i][0] + jitter(), GROUND_Y + HOVER, ring[i][1] + jitter()],
        inside: false,
      });
    }

    // 5. Inside, on the lowest slab that is actually above the ground plane.
    const step = Math.max(blockSize[1], 0.01);
    const key = (x: number, y: number, z: number) =>
      `${Math.round(x / blockSize[0])},${Math.round(y / step)},${Math.round(
        z / blockSize[2],
      )}`;
    const solid = new Set<string>();
    for (const { position } of points) {
      solid.add(key(position[0], position[1], position[2]));
    }
    const clearanceSteps = Math.ceil(HEADROOM / step);
    const indoorSlabs = points.filter(
      (p) =>
        p.layer === "A-FLOR" &&
        p.position[1] > INDOOR_MIN &&
        p.position[1] < INDOOR_MAX,
    );
    for (
      let attempt = 0;
      attempt < 3000 &&
      out.length < ABILITY_ORDER.length &&
      indoorSlabs.length > 0;
      attempt++
    ) {
      const [x, fy, z] =
        indoorSlabs[Math.floor(random() * indoorSlabs.length)].position;
      let blocked = false;
      for (let i = 1; i <= clearanceSteps; i++) {
        if (solid.has(key(x, fy + i * step, z))) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      out.push({ pos: [x, fy + HOVER, z], inside: true });
    }

    // Fallback: widen the ring rather than leave a power unobtainable.
    for (let i = 0; out.length < ABILITY_ORDER.length; i++) {
      const angle = (i / ABILITY_ORDER.length) * Math.PI * 2;
      out.push({
        pos: [
          cx + Math.cos(angle) * (halfX + 4),
          GROUND_Y + HOVER,
          cz + Math.sin(angle) * (halfZ + 4),
        ],
        inside: false,
      });
      if (i > 12) break;
    }

    return out.slice(0, ABILITY_ORDER.length).map((spot, i) => ({
      id: ABILITY_ORDER[i],
      hint:
        i === 0
          ? "straight ahead, before the building"
          : spot.inside
            ? "inside the building"
            : "outside, around the building",
      pos: spot.pos,
      inside: spot.inside,
    }));
  }, [data?.points, blockSize]);
}
