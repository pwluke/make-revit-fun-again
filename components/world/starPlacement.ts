"use client";

import { useMemo } from "react";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";
import { HOUSE_FOOTPRINT, STAR_SPOTS, type StarSpot } from "./houseData";

/**
 * The hand-placed STAR_SPOTS are authored against the house, so they only work
 * in worlds that have the house in them. This adds a procedural set scattered
 * over whatever geometry Rhino streamed into the grid, so the treasure hunt
 * still has something to find in a world nobody hand-authored.
 */

const PROCEDURAL_COUNT = 6;
/** Fixed seed: the placement must be identical for every consumer and stable
 *  across re-renders. Stars.tsx and TreasureHud.tsx derive the list separately,
 *  and a live InstantDB push must not move a star the player is walking toward. */
const SEED = 0x5741b2;
const MIN_RADIUS = 10;
const MAX_RADIUS = 40;
/** Matches the hand-placed spots on flat ground: the player capsule is
 *  half-height 0.75 + radius 0.5, so the camera rides 1.25 above the floor. */
const STAR_HEIGHT = 1.2;
/** A column with terrain this low would swallow a star standing in it. */
const BLOCKED_BELOW = 3;
/** Keep procedural stars from crowding each other or the authored ones. */
const MIN_SEPARATION = 6;

/** mulberry32 — small deterministic PRNG, enough for scattering a few props. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** -Z is the direction the player faces at spawn, so call that north. */
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];

function bearing(x: number, z: number) {
  const angle = Math.atan2(x, -z); // 0 = -Z = north, clockwise
  const index = Math.round((angle / (Math.PI * 2)) * 8 + 8) % 8;
  return COMPASS[index];
}

export function proceduralStarSpots(
  points: ReturnType<typeof occupiedPointCoords>,
): StarSpot[] {
  const blocked = new Set<string>();
  for (const { position } of points) {
    const [x, y, z] = position;
    if (y < BLOCKED_BELOW) blocked.add(`${Math.round(x)},${Math.round(z)}`);
  }

  const random = seededRandom(SEED);
  const spots: StarSpot[] = [];
  const separationSq = MIN_SEPARATION * MIN_SEPARATION;
  const tooClose = (x: number, z: number) =>
    [...STAR_SPOTS, ...spots].some((spot) => {
      const dx = spot.pos[0] - x;
      const dz = spot.pos[2] - z;
      return dx * dx + dz * dz < separationSq;
    });

  // Bounded: a fully built-up neighbourhood would otherwise spin forever.
  for (let attempt = 0; attempt < 400 && spots.length < PROCEDURAL_COUNT; attempt++) {
    const angle = random() * Math.PI * 2;
    // sqrt keeps the sample area-uniform instead of bunching toward the centre.
    const radius = MIN_RADIUS + Math.sqrt(random()) * (MAX_RADIUS - MIN_RADIUS);
    const x = Math.round(Math.cos(angle) * radius);
    const z = Math.round(Math.sin(angle) * radius);

    if (blocked.has(`${x},${z}`)) continue;
    if (
      x >= HOUSE_FOOTPRINT.x0 &&
      x <= HOUSE_FOOTPRINT.x1 &&
      z >= HOUSE_FOOTPRINT.z0 &&
      z <= HOUSE_FOOTPRINT.z1
    ) {
      continue;
    }
    if (tooClose(x, z)) continue;

    spots.push({
      id: `grid-${x},${z}`,
      hint: `Out in the grid, ${bearing(x, z)} of the house`,
      // Left on the walkable plane rather than on top of the terrain: a jump
      // clears exactly one block, so a star on a two-block stack would be
      // scenery. Flat ground is reachable whatever Rhino streamed in.
      pos: [x, STAR_HEIGHT, z],
      // No point light: these sit in open daylight where emissive alone reads
      // fine, and lighting all of them costs ~13fps. See StarSpot.glow.
      glow: false,
    });
  }

  return spots;
}

/**
 * The full star list: authored spots around the house, plus procedural ones
 * over the streamed grid. Both the scene and the HUD call this, and both get
 * the same list — the seed is fixed and the grid query is shared.
 */
export function useStarSpots(): StarSpot[] {
  const { data } = useGridPoints();
  return useMemo(
    () => [...STAR_SPOTS, ...proceduralStarSpots(occupiedPointCoords(data?.points))],
    [data?.points],
  );
}
