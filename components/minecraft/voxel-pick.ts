import type { CubeCoords } from "@/lib/use-grid-points";

/**
 * Crosshair picking by walking the voxel grid, instead of testing every cube.
 *
 * `InstancedMesh.raycast` is O(instances): once the ray is inside the batch's
 * bounding sphere it intersects every cube and sorts the hits. With ~270k cubes
 * that single call cost more than the entire GPU frame, and it runs constantly —
 * the crosshair has to know what it is pointing at to draw the highlight, not
 * just when you break something.
 *
 * The cubes sit on a regular lattice, so the ray can instead be marched cell by
 * cell (Amanatides & Woo) and stopped at the first occupied one. An 8-unit reach
 * over ~0.33-unit cells is a couple of dozen lookups, whatever the world size.
 *
 * The lattice is *offset* — the loader centres the model on x/z and lifts it by
 * BUILDING_Y_OFFSET — so the origin is derived from the data rather than assumed
 * to be zero.
 */

/** ±32k cells per axis, packed into one number that stays exact as a double. */
const CELL_BIAS = 32768;
const CELL_SPAN = CELL_BIAS * 2;

export const cellKey = (ix: number, iy: number, iz: number) =>
  (ix + CELL_BIAS) * CELL_SPAN * CELL_SPAN +
  (iy + CELL_BIAS) * CELL_SPAN +
  (iz + CELL_BIAS);

export type VoxelIndex = {
  /** cell key -> index into the cube array */
  cells: Map<number, number>;
  /** World position of cell (0,0,0)'s centre. */
  origin: [number, number, number];
  size: CubeCoords;
};

/**
 * Build the lookup. O(cubes), rebuilt only when the world changes — the same
 * cadence the instance matrices are already rewritten at.
 */
export function buildVoxelIndex(
  cubes: { position: CubeCoords }[],
  size: CubeCoords,
): VoxelIndex {
  const [sx, sy, sz] = size;
  const cells = new Map<number, number>();
  // Every cube from the model shares one fractional offset; recover it from the
  // first one rather than assuming the lattice starts at the world origin.
  const first = cubes[0]?.position ?? [0, 0, 0];
  const origin: [number, number, number] = [
    sx ? first[0] - Math.round(first[0] / sx) * sx : 0,
    sy ? first[1] - Math.round(first[1] / sy) * sy : 0,
    sz ? first[2] - Math.round(first[2] / sz) * sz : 0,
  ];

  if (!sx || !sy || !sz) return { cells, origin, size };

  for (let i = 0; i < cubes.length; i++) {
    const [x, y, z] = cubes[i].position;
    const key = cellKey(
      Math.round((x - origin[0]) / sx),
      Math.round((y - origin[1]) / sy),
      Math.round((z - origin[2]) / sz),
    );
    // First writer wins. A player block placed off-lattice (the ground snap
    // puts one at y = size/2 regardless of the model's offset) can land in a
    // cell the model already owns; keeping the model's cube means the wall
    // stays pickable rather than being shadowed by a stray block.
    if (!cells.has(key)) cells.set(key, i);
  }

  return { cells, origin, size };
}

export type VoxelHit = {
  /** Index into the cube array the index was built from. */
  instanceId: number;
  /** Unit axis pointing out of the face that was entered. */
  normal: { x: number; y: number; z: number };
};

/**
 * March the ray through the grid and return the first occupied cell within
 * `reach`, or null. `direction` must be normalised.
 */
export function pickVoxel(
  index: VoxelIndex,
  originPoint: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number },
  reach: number,
): VoxelHit | null {
  const { cells, origin, size } = index;
  const [sx, sy, sz] = size;
  if (!cells.size || !sx || !sy || !sz) return null;

  const org = [originPoint.x, originPoint.y, originPoint.z];
  const dir = [direction.x, direction.y, direction.z];
  const cellSize = [sx, sy, sz];

  const cell = [0, 0, 0];
  const step = [0, 0, 0];
  const tMax = [0, 0, 0];
  const tDelta = [0, 0, 0];

  for (let a = 0; a < 3; a++) {
    const s = cellSize[a];
    cell[a] = Math.round((org[a] - origin[a]) / s);
    if (dir[a] === 0) {
      step[a] = 0;
      tMax[a] = Infinity;
      tDelta[a] = Infinity;
      continue;
    }
    step[a] = dir[a] > 0 ? 1 : -1;
    // The boundary of the current cell in the direction of travel. Cell i is
    // centred on origin + i*size, so it spans half a cell either side.
    const boundary = origin[a] + (cell[a] + step[a] * 0.5) * s;
    tMax[a] = (boundary - org[a]) / dir[a];
    tDelta[a] = Math.abs(s / dir[a]);
  }

  // The cell the camera is standing in counts: being inside geometry should
  // still let you dig your way out.
  const startHit = cells.get(cellKey(cell[0], cell[1], cell[2]));
  if (startHit !== undefined) {
    // No face was crossed, so face the ray back the way it came, along whichever
    // axis it is most aligned with.
    const ax = Math.abs(dir[0]);
    const ay = Math.abs(dir[1]);
    const az = Math.abs(dir[2]);
    const normal = { x: 0, y: 0, z: 0 };
    if (ax >= ay && ax >= az) normal.x = dir[0] > 0 ? -1 : 1;
    else if (ay >= az) normal.y = dir[1] > 0 ? -1 : 1;
    else normal.z = dir[2] > 0 ? -1 : 1;
    return { instanceId: startHit, normal };
  }

  let travelled = 0;
  // Bounded by the reach: the loop can only take so many steps before the
  // nearest boundary exceeds it, but the guard keeps a degenerate ray finite.
  for (let guard = 0; guard < 4096; guard++) {
    let axis = 0;
    if (tMax[1] < tMax[0]) axis = 1;
    if (tMax[2] < tMax[axis]) axis = 2;

    travelled = tMax[axis];
    if (!Number.isFinite(travelled) || travelled > reach) return null;

    cell[axis] += step[axis];
    tMax[axis] += tDelta[axis];

    const found = cells.get(cellKey(cell[0], cell[1], cell[2]));
    if (found !== undefined) {
      const normal = { x: 0, y: 0, z: 0 };
      // Entered by crossing this axis, so the face hit is the one on the side
      // the ray came from.
      if (axis === 0) normal.x = -step[0];
      else if (axis === 1) normal.y = -step[1];
      else normal.z = -step[2];
      return { instanceId: found, normal };
    }
  }
  return null;
}
