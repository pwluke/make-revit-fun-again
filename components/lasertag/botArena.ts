"use client";

import { useMemo } from "react";
import {
  TARGET_BLOCK_SIZE,
  occupiedPointCoords,
  useGridPoints,
} from "@/lib/use-grid-points";
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

/**
 * How far below the highest voxel a column's top can sit and still count as
 * "the roof".
 *
 * Deliberately generous. At 1.2 (a parapet plus a slab) the band on the real
 * model is the set-back top deck only, and a boss standing there is occluded
 * from every point in the arena — measured: his head clears the facade in front
 * of him only from ~65 m back, and ARENA_RADIUS is 34. Taking the top storey
 * rather than the top slab brings the front parapet into the band, which is
 * where he ends up standing, in plain view from the lawn.
 */
const ROOF_BAND = 4.5;

/**
 * The smallest plateau worth putting a boss on, in cells. Below this the
 * "roof" found is a lift overrun or a chimney, and the Inspector would be
 * balanced on a post.
 */
const MIN_ROOF_CELLS = 12;

export type RoofPlan = {
  /** Cells he may pace: the perimeter ring of the top plateau, in walk-grid
   *  coordinates. See buildRoof for why it is the ring and not the whole top. */
  cells: [number, number][];
  /** Same cells, for O(1) membership from the frame loop. */
  set: Set<string>;
  /** Cell key -> world Y of that column's walking surface. */
  surface: Map<string, number>;
  /** Where the Inspector starts: the plateau cell nearest its centroid. */
  spawn: { cell: [number, number]; pos: [number, number, number] };
};

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
  /** The top of the building, where the Inspector waits. Null until the
   *  voxels have streamed in, or if the model has no plateau worth the name. */
  roof: RoofPlan | null;
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
 * The roof plateau: columns whose highest voxel is within ROOF_BAND of the
 * highest voxel anywhere, reduced to their largest connected patch.
 *
 * Deriving it from per-column tops rather than from the A-ROOF layer is
 * deliberate — the layer includes canopies and overhangs at every level, and
 * what the boss needs is "the surface nothing else is stacked on top of".
 */
function buildRoof(tops: Map<string, number>): RoofPlan | null {
  let highest = -Infinity;
  for (const top of tops.values()) if (top > highest) highest = top;
  if (!Number.isFinite(highest)) return null;

  const band: [number, number][] = [];
  for (const [key, top] of tops) {
    if (top < highest - ROOF_BAND) continue;
    const [i, j] = key.split(",").map(Number) as [number, number];
    band.push([i, j]);
  }
  const bandSet = new Set(band.map(([i, j]) => cellKey(i, j)));
  const plateau = components(band, bandSet).sort(
    (a, b) => b.length - a.length,
  )[0];
  if (!plateau || plateau.length < MIN_ROOF_CELLS) return null;

  // Voxel y values are cube centres, so the surface you stand on is half a
  // block above the top one.
  const surface = new Map<string, number>();
  for (const [i, j] of plateau) {
    const key = cellKey(i, j);
    surface.set(key, tops.get(key)! + TARGET_BLOCK_SIZE / 2);
  }

  // He paces the perimeter, not the interior — and this is a visibility
  // requirement, not a stylistic one. Standing at the centre of the roof he is
  // occluded by his own parapet from every point in the arena: from a 1.25 m
  // camera, a 4.4 m figure 19 m behind an 18 m roof edge only clears that edge
  // from ~68 m back, and ARENA_RADIUS is 34. A boss nobody can see is a round
  // nobody can win. The ring is every plateau cell with a neighbour off it.
  const plateauSet = new Set(plateau.map(([i, j]) => cellKey(i, j)));
  const ring = plateau.filter(([i, j]) =>
    NEIGHBOR_STEPS.some(([di, dj]) => !plateauSet.has(cellKey(i + di, j + dj))),
  );
  // A plateau small enough to be all edge has nothing to gain from the ring.
  const walk = ring.length >= MIN_ROOF_CELLS ? ring : plateau;

  // Spawn on the side of the ring nearest the player, so he is in view on the
  // approach rather than something you have to circle the building to find.
  const [playerX, playerZ] = cellToWorld(...SEED_CELL);
  let spawnCell = walk[0];
  let best = Infinity;
  for (const [i, j] of walk) {
    const [x, z] = cellToWorld(i, j);
    const distance = (x - playerX) * (x - playerX) + (z - playerZ) * (z - playerZ);
    if (distance < best) {
      best = distance;
      spawnCell = [i, j];
    }
  }

  const [x, z] = cellToWorld(...spawnCell);
  return {
    cells: walk,
    set: new Set(walk.map(([i, j]) => cellKey(i, j))),
    surface,
    spawn: {
      cell: [...spawnCell] as [number, number],
      pos: [x, surface.get(cellKey(...spawnCell))!, z],
    },
  };
}

/**
 * Blocked columns from the obstruction band, covered columns from anything
 * overhead, then a flood fill out from the spawn. Runs once per grid change
 * (the grid is fetched once and shared — see lib/use-grid-points.ts).
 */
export function buildArena(points: ReturnType<typeof occupiedPointCoords>) {
  const blocked = new Set<string>();
  const covered = new Set<string>();
  /** Highest voxel centre per column — the roof, before it is filtered. */
  const tops = new Map<string, number>();
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
    const top = tops.get(key);
    if (top === undefined || y > top) tops.set(key, y);
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

  return { walkable, roam, cells, rooms, roof: buildRoof(tops), bounds };
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
