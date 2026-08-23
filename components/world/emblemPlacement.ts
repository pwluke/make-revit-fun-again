"use client";

import { useMemo } from "react";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";
import { ABILITY_ORDER, type AbilityId } from "./store";

/**
 * Where the five animal emblems hide. All of them sit on the ground floor,
 * so nothing needs a power you have not found yet to reach: the Bunny
 * waits just outside the entrance, and the rest are spread across real
 * `A-FLOR` slabs inside, ordered outward so each one is a little further
 * in than the last.
 */

export const EMBLEM_PICKUP_RADIUS = 1.1;

/** Player spawn, mirroring SPAWN_POSITION in Player.tsx. */
const SPAWN: [number, number] = [0, 16];
/** The Bunny sits between spawn and the facade — the first thing you see.
 *  The building's +Z face is at z ~= 12.5, so this is on the approach. */
const ENTRANCE: [number, number] = [0, 14];
/** Emblem float height above the slab it sits on. */
const HOVER = 0.85;
/** Ground floor only: its slabs sit ~1.0-1.5m above the model's lowest
 *  point, and the storey above starts at ~4m. */
const GROUND_FLOOR_MAX = 3;
/** Clearance a spot needs above the slab, in world units. */
const HEADROOM = 2.1;
/** Keep emblems from crowding each other. */
const MIN_SEPARATION = 7;

/** mulberry32 — small deterministic PRNG. Reseeded per page load so the
 *  hunt differs each session, but stable within it: both the scene and the
 *  HUD read this module, and an emblem must not move mid-walk. */
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

export function useAbilityEmblemSpots(): EmblemSpot[] {
  const { data, blockSize } = useGridPoints();

  return useMemo(() => {
    const points = occupiedPointCoords(data?.points);
    const random = seededRandom(SEED);

    let groundY = 0;
    if (points.length > 0) {
      groundY = Infinity;
      for (const { position } of points) {
        if (position[1] < groundY) groundY = position[1];
      }
    }

    // The Bunny is always first and always outside: it is the tutorial, so
    // it cannot depend on the sampler finding anything.
    const picked: [number, number, number][] = [
      [ENTRANCE[0], groundY + HOVER, ENTRANCE[1]],
    ];
    const sepSq = MIN_SEPARATION * MIN_SEPARATION;
    const tooClose = (x: number, y: number, z: number) =>
      picked.some(
        ([px, py, pz]) => (px - x) ** 2 + (py - y) ** 2 + (pz - z) ** 2 < sepSq,
      );

    const step = Math.max(blockSize[1], 0.01);
    const key = (x: number, y: number, z: number) =>
      `${Math.round(x / blockSize[0])},${Math.round(y / step)},${Math.round(
        z / blockSize[2],
      )}`;
    const solid = new Set<string>();
    for (const { position } of points) {
      solid.add(key(position[0], position[1], position[2]));
    }

    const groundFloor = points.filter(
      (p) => p.layer === "A-FLOR" && p.position[1] - groundY < GROUND_FLOOR_MAX,
    );
    const clearanceSteps = Math.ceil(HEADROOM / step);
    const hasHeadroom = (x: number, y: number, z: number) => {
      for (let i = 1; i <= clearanceSteps; i++) {
        if (solid.has(key(x, y + i * step, z))) return false;
      }
      return true;
    };

    // Bounded sampling: the ground-floor slab has tens of thousands of
    // candidates, so random probes beat scanning, and the cap keeps a dense
    // model from stalling the first frame.
    for (
      let attempt = 0;
      attempt < 4000 &&
      picked.length < ABILITY_ORDER.length &&
      groundFloor.length > 0;
      attempt++
    ) {
      const [x, fy, z] = groundFloor[Math.floor(random() * groundFloor.length)]
        .position;
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

    // Everything after the Bunny is ordered outward from spawn, so the slot
    // order (Bunny, Mouse, Butterfly, Spider, Pangolin) is also the order a
    // player naturally walks into them.
    const spawnDistSq = (p: [number, number, number]) =>
      (p[0] - SPAWN[0]) ** 2 + (p[2] - SPAWN[1]) ** 2;
    const rest = picked.slice(1).sort((a, b) => spawnDistSq(a) - spawnDistSq(b));
    const ordered = [picked[0], ...rest].slice(0, ABILITY_ORDER.length);

    return ordered.map((pos, i) => ({
      id: ABILITY_ORDER[i],
      hint:
        i === 0
          ? "right in front of the entrance"
          : "on the ground floor, further inside",
      pos,
    }));
  }, [data?.points, blockSize]);
}
