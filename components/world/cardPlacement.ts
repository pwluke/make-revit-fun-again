"use client";

import { useMemo } from "react";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";
import { ABILITY_ORDER, type AbilityId } from "./store";

/**
 * Procedural placement for the six ability cards, over whatever model is
 * currently streamed into the InstantDB grid. Nothing is hand-authored:
 * cards scatter on walkable ground around spawn, so they are reachable no
 * matter what Rhino pushed in. Adapted from the star placement the old
 * hunt used (same seeded-PRNG approach, same stability guarantees).
 */

export const CARD_PICKUP_RADIUS = 1.9;

/** One seed per page load: the scatter is different every session, but
 *  stable within it. Both the scene and the HUD derive the list from this
 *  module, so they agree — and a live InstantDB push must not move a card
 *  the player is already walking toward. */
const SEED = Math.floor(Math.random() * 0xffffff) + 1;
const MIN_RADIUS = 8;
const MAX_RADIUS = 32;
const CARD_HEIGHT = 1.6;
/** A column with geometry this low would swallow a card standing in it. */
const BLOCKED_BELOW = 3;
const MIN_SEPARATION = 7;

/** mulberry32 — small deterministic PRNG, enough for scattering props. */
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
const COMPASS = [
  "north",
  "north-east",
  "east",
  "south-east",
  "south",
  "south-west",
  "west",
  "north-west",
];

function bearing(x: number, z: number) {
  const angle = Math.atan2(x, -z); // 0 = -Z = north, clockwise
  const index = Math.round((angle / (Math.PI * 2)) * 8 + 8) % 8;
  return COMPASS[index];
}

export type CardSpot = {
  id: AbilityId;
  hint: string;
  pos: [number, number, number];
};

export function useAbilityCardSpots(): CardSpot[] {
  const { data } = useGridPoints();
  return useMemo(() => {
    const points = occupiedPointCoords(data?.points);
    const blocked = new Set<string>();
    for (const { position } of points) {
      const [x, y, z] = position;
      if (y < BLOCKED_BELOW) blocked.add(`${Math.round(x)},${Math.round(z)}`);
    }

    const random = seededRandom(SEED);
    const picked: [number, number][] = [];
    const sepSq = MIN_SEPARATION * MIN_SEPARATION;
    const tooClose = (x: number, z: number) =>
      picked.some(([px, pz]) => (px - x) ** 2 + (pz - z) ** 2 < sepSq);

    // Bounded: a fully built-up neighbourhood must not spin forever.
    for (
      let attempt = 0;
      attempt < 600 && picked.length < ABILITY_ORDER.length;
      attempt++
    ) {
      const angle = random() * Math.PI * 2;
      // sqrt keeps the sample area-uniform instead of bunching at the centre.
      const radius = MIN_RADIUS + Math.sqrt(random()) * (MAX_RADIUS - MIN_RADIUS);
      const x = Math.round(Math.cos(angle) * radius);
      const z = Math.round(Math.sin(angle) * radius);
      if (blocked.has(`${x},${z}`)) continue;
      if (tooClose(x, z)) continue;
      picked.push([x, z]);
    }
    // Fallback ring if the world is too crowded to sample freely. Pushed
    // outward until it clears everything already placed, so two cards can
    // never end up stacked on the same spot.
    for (let ring = 12; picked.length < ABILITY_ORDER.length; ring += 4) {
      for (let k = 0; k < ABILITY_ORDER.length && picked.length < ABILITY_ORDER.length; k++) {
        const angle = (k / ABILITY_ORDER.length) * Math.PI * 2;
        const x = Math.round(Math.cos(angle) * ring);
        const z = Math.round(Math.sin(angle) * ring);
        if (!tooClose(x, z)) picked.push([x, z]);
      }
      if (ring > 80) break; // never spin forever
    }

    // Nearest card first, so the "next" hint walks outward.
    picked.sort((a, b) => a[0] ** 2 + a[1] ** 2 - (b[0] ** 2 + b[1] ** 2));

    return picked.map(([x, z], i) => ({
      id: ABILITY_ORDER[i],
      hint: `On the ground, ${bearing(x, z)} of where you started`,
      pos: [x, CARD_HEIGHT, z] as [number, number, number],
    }));
  }, [data?.points]);
}
