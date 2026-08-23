"use client";

/**
 * Shared helpers for scattering things across the streamed model.
 *
 * These used to live in `starPlacement.ts`. That file went with the star
 * hunt, but the bot arena imports the same two helpers, so they moved here
 * rather than being copied — one PRNG means two features that both claim to
 * be "seeded and stable" really are seeded the same way.
 */

/** mulberry32 — small deterministic PRNG, enough for scattering props. */
export function seededRandom(seed: number) {
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

export function bearing(x: number, z: number) {
  const angle = Math.atan2(x, -z); // 0 = -Z = north, clockwise
  const index = Math.round((angle / (Math.PI * 2)) * 8 + 8) % 8;
  return COMPASS[index];
}
