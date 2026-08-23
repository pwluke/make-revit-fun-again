"use client";

import { useMemo } from "react";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";
import { bearing, seededRandom } from "@/components/world/placementUtils";

/**
 * Where the bots live, derived from the streamed Revit voxels.
 *
 * Three nested sets come out of this, because they answer different questions:
 *
 *   walkable — every cell reachable on foot from the player's spawn. Seeding the
 *              flood fill there is what guarantees the player can follow a bot
 *              anywhere it can go.
 *   roam     — walkable ∩ the building footprint. Where bots are allowed to
 *              wander: inside the school, never out on the open apron.
 *   rooms    — roam ∩ "has geometry overhead", grouped and filtered to spaces
 *              big enough to be a room. Where bots spawn.
 *
 * Bots carry no rigid body (see Bots.tsx), so these sets are what stop them
 * walking through walls: a cell is walkable only if no voxel occupies the
 * knee-to-head band above it.
 *
 * Everything is derived from the grid rather than hard-coded, because
 * use-grid-points recomputes scale and recentring from the data at runtime: a
 * change to POINT_LAYERS would move any literal coordinate we wrote down.
 */

/** Walk-grid pitch. The plan voxel pitch is ~0.333, so this is a shade coarser
 *  than the geometry — fine enough to find doorways, coarse enough that the
 *  flood fill over a 68m-wide arena stays trivial. */
export const CELL = 0.5;

/** Obstruction band, in world Y. BUILDING_Y_OFFSET sits the ground storey on
 *  the Ground plane at y=0, so this is knee-to-head for a bot standing there.
 *  Starting above 0 ignores the floor slab itself; stopping at 1.9 ignores
 *  ceilings, which a bot can happily walk under. */
const HEAD_LOW = 0.25;
const HEAD_HIGH = 1.9;

/** Bounds the flood fill. The building spans x ±21.6 / z ±12.5, so this covers
 *  it plus the apron the player spawns on. */
const ARENA_RADIUS = 34;

/** Player spawn is [0, 8, 16] (Player.tsx SPAWN_POSITION), so the fill starts
 *  from the column the player lands in — by construction, everything it reaches
 *  is somewhere the player can walk too. */
const SEED_CELL: [number, number] = [0, Math.round(16 / CELL)];

/**
 * Roaming is clipped to the footprint plus this margin. Small and positive: a
 * bot hugging an outside wall still reads as being at the building, but none of
 * them wander off across the open ground.
 */
const ROAM_MARGIN = 1;

/**
 * A covered patch smaller than this is a cupboard, not a room — measured in
 * cells, so 24 is 6 m². Spawning a bot in one would have it pacing a closet.
 * Measured against the real model: the interior is 402 covered cells in 8
 * patches, and this keeps the two real ones (246 + 98) and drops five 10-cell
 * slivers.
 */
const MIN_ROOM_CELLS = 24;

/** Never spawn a bot within this of the player's spawn. */
const MIN_PLAYER_DISTANCE = 8;

const SEED = 0x1a5e42;

/** Body centre above the floor. Bots stand ~1.15 tall, the eye rides 1.25. */
export const BOT_HEIGHT_OFFSET = 0.5;

export type BotSpot = {
  id: string;
  cell: [number, number];
  pos: [number, number, number];
};

/** World-space footprint of the streamed voxels, derived at runtime. */
export type Bounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type Arena = {
  /** Everything reachable from the player's spawn. */
  walkable: Set<string>;
  /** Where bots may walk: inside the building. */
  roam: Set<string>;
  /** Same cells as `roam`, for the debug overlay. */
  cells: [number, number][];
  /** Candidate spawn cells: inside, and in a room worth the name. */
  rooms: [number, number][];
  bounds: Bounds;
  spots: BotSpot[];
};

export function cellKey(i: number, j: number) {
  return `${i},${j}`;
}

export function cellToWorld(i: number, j: number): [number, number] {
  return [i * CELL, j * CELL];
}

export function worldToCell(x: number, z: number): [number, number] {
  return [Math.round(x / CELL), Math.round(z / CELL)];
}

/** 4-connected neighbours, in a fixed order so the walk stays deterministic. */
export const NEIGHBOR_STEPS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Split a cell set into 4-connected components. */
function components(
  cells: [number, number][],
  member: Set<string>,
): [number, number][][] {
  const seen = new Set<string>();
  const groups: [number, number][][] = [];
  for (const start of cells) {
    if (seen.has(cellKey(...start))) continue;
    seen.add(cellKey(...start));
    const group: [number, number][] = [];
    const queue: [number, number][] = [start];
    while (queue.length > 0) {
      const [i, j] = queue.pop()!;
      group.push([i, j]);
      for (const [di, dj] of NEIGHBOR_STEPS) {
        const key = cellKey(i + di, j + dj);
        if (!member.has(key) || seen.has(key)) continue;
        seen.add(key);
        queue.push([i + di, j + dj]);
      }
    }
    groups.push(group);
  }
  return groups;
}

/**
 * Blocked columns from the obstruction band, covered columns from anything
 * overhead, then a flood fill out from the spawn. Runs once per grid change
 * (the grid is fetched once and shared — see lib/use-grid-points.ts).
 */
export function buildArena(points: ReturnType<typeof occupiedPointCoords>) {
  const blocked = new Set<string>();
  const covered = new Set<string>();
  const bounds: Bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };

  for (const { position } of points) {
    const [x, y, z] = position;
    // Footprint from every voxel, not just the obstruction band — the roof and
    // foundation are part of how big the building is.
    if (x < bounds.minX) bounds.minX = x;
    if (x > bounds.maxX) bounds.maxX = x;
    if (z < bounds.minZ) bounds.minZ = z;
    if (z > bounds.maxZ) bounds.maxZ = z;
    const key = cellKey(...worldToCell(x, z));
    // Anything overhead means this column is under cover — a ceiling, a slab or
    // the roof. That, not the footprint, is what separates a room from a
    // courtyard.
    if (y >= HEAD_HIGH) covered.add(key);
    else if (y > HEAD_LOW) blocked.add(key);
  }

  const radiusCells = Math.ceil(ARENA_RADIUS / CELL);
  const radiusSq = radiusCells * radiusCells;
  const walkable = new Set<string>();
  const reachable: [number, number][] = [];

  // Iterative queue rather than recursion — this visits tens of thousands of
  // cells and a recursive fill would blow the stack.
  const queue: [number, number][] = [SEED_CELL];
  const seen = new Set<string>([cellKey(...SEED_CELL)]);
  while (queue.length > 0) {
    const [i, j] = queue.pop()!;
    if (i * i + j * j > radiusSq) continue;
    if (blocked.has(cellKey(i, j))) continue;
    walkable.add(cellKey(i, j));
    reachable.push([i, j]);
    for (const [di, dj] of NEIGHBOR_STEPS) {
      const key = cellKey(i + di, j + dj);
      if (seen.has(key)) continue;
      seen.add(key);
      queue.push([i + di, j + dj]);
    }
  }

  // Roaming: reachable and inside the building.
  const insideFootprint = ([i, j]: [number, number]) => {
    const [x, z] = cellToWorld(i, j);
    return (
      x >= bounds.minX - ROAM_MARGIN &&
      x <= bounds.maxX + ROAM_MARGIN &&
      z >= bounds.minZ - ROAM_MARGIN &&
      z <= bounds.maxZ + ROAM_MARGIN
    );
  };
  const cells = reachable.filter(insideFootprint);
  const roam = new Set(cells.map(([i, j]) => cellKey(i, j)));

  // Spawns: under cover, and in a patch big enough to be a room.
  const indoor = cells.filter(([i, j]) => covered.has(cellKey(i, j)));
  const indoorSet = new Set(indoor.map(([i, j]) => cellKey(i, j)));
  const rooms = components(indoor, indoorSet)
    .filter((group) => group.length >= MIN_ROOM_CELLS)
    .flat();

  return { walkable, roam, cells, rooms, bounds };
}

/**
 * Farthest-point (k-centre greedy) placement: seed with one cell, then keep
 * adding whichever candidate is farthest from everything placed so far.
 *
 * This replaces rejection sampling because "as spread out as possible" is
 * exactly what it optimises — and unlike a minimum-separation filter it cannot
 * fail to fill the round when space is tight, it just packs a little closer.
 * The first pick is seeded, so each round re-scatters instead of being identical.
 */
export function spawnBots(
  candidates: [number, number][],
  fallback: [number, number][],
  count: number,
  seed: number,
): BotSpot[] {
  const pool = candidates.length > 0 ? candidates : fallback;
  if (pool.length === 0 || count <= 0) return [];

  const random = seededRandom(seed);
  const [playerX, playerZ] = cellToWorld(...SEED_CELL);
  const playerDistanceSq = MIN_PLAYER_DISTANCE * MIN_PLAYER_DISTANCE;

  const far = pool.filter(([i, j]) => {
    const [x, z] = cellToWorld(i, j);
    const dx = x - playerX;
    const dz = z - playerZ;
    return dx * dx + dz * dz >= playerDistanceSq;
  });
  const usable = far.length > 0 ? far : pool;

  // Seeded first pick, so rounds differ; everything after it is deterministic
  // given that start, which is what keeps the spread optimal.
  const picked: [number, number][] = [
    usable[Math.floor(random() * usable.length) % usable.length],
  ];

  while (picked.length < count) {
    let best: [number, number] | null = null;
    let bestDistance = -Infinity;
    for (const [i, j] of usable) {
      const [x, z] = cellToWorld(i, j);
      let nearest = Infinity;
      for (const [pi, pj] of picked) {
        const [px, pz] = cellToWorld(pi, pj);
        const distance = (x - px) * (x - px) + (z - pz) * (z - pz);
        if (distance < nearest) nearest = distance;
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = [i, j];
      }
    }
    // Every candidate is already taken — fewer bots than the arena can hold.
    if (!best || bestDistance <= 0) break;
    picked.push(best);
  }

  return picked.map(([i, j], index) => {
    const [x, z] = cellToWorld(i, j);
    return {
      id: `bot-${index}`,
      cell: [i, j] as [number, number],
      pos: [x, BOT_HEIGHT_OFFSET, z] as [number, number, number],
    };
  });
}

/** Bearing from the player's spawn, for the HUD hint. */
export function spotBearing(x: number, z: number) {
  return bearing(x, z);
}

/**
 * The arena for one round. Memoised on the grid, the round and the bot count,
 * so the scene and the HUD can both call it and get the same bots — and so a new
 * round re-scatters instead of repeating.
 */
export function useBotArena(roundToken: number, count: number): Arena {
  const { data } = useGridPoints();
  const points = data?.points;

  const arena = useMemo(
    () => buildArena(occupiedPointCoords(points)),
    [points],
  );

  const spots = useMemo(
    // A plain multiply would collide seeds across rounds; xor with the golden
    // ratio constant spreads them.
    () =>
      spawnBots(
        arena.rooms,
        arena.cells,
        count,
        SEED ^ (roundToken * 0x9e3779b1),
      ),
    [arena, count, roundToken],
  );

  return { ...arena, spots };
}
