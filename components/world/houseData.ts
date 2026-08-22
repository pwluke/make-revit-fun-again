/**
 * A modern two-storey house, authored as axis-aligned brick volumes on the
 * same 1m voxel grid the game builds on. Bricks are rendered as individual
 * cubes (so it reads as a Minecraft build) but collide as one box each —
 * a few dozen colliders instead of a few thousand.
 *
 * Coordinates are inclusive block indices: a block at (i, j, k) occupies
 * world space [i, i+1] x [j, j+1] x [k, k+1].
 *
 * Layout, looking from spawn (the front faces +z):
 *   - main volume  x -7..0,  z -26..-19,  two floors + roof terrace
 *   - side wing    x  1..6,  z -25..-20,  one floor, its roof is a balcony
 *   - a stone plinth under both, one block proud of the grass
 * Vertical route: front door -> interior stair -> upper floor -> balcony
 * door -> outdoor stair -> roof. Every step is one block, which the player
 * can clear in a single jump.
 */

export type HouseMaterial = "concrete" | "panel" | "wood" | "glass" | "stone";

export type Brick = {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  mat: HouseMaterial;
};

const b = (
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  mat: HouseMaterial,
): Brick => ({ x0, y0, z0, x1, y1, z1, mat });

export const HOUSE_BRICKS: Brick[] = [
  // --- plinth / terrace ---------------------------------------------------
  b(-8, 0, -27, 7, 0, -18, "stone"),

  // --- main volume, ground floor (j 1..3) ---------------------------------
  b(-7, 1, -26, -7, 3, -19, "concrete"), // west wall
  b(0, 1, -26, 0, 3, -19, "concrete"), // east wall
  b(-6, 1, -26, -1, 3, -26, "concrete"), // back wall
  b(-6, 1, -19, -5, 3, -19, "concrete"), // front, left of the door
  // door opening spans x -4..-3
  b(-2, 1, -19, -1, 3, -19, "glass"), // front picture window

  // --- interior stair, ground -> upper floor ------------------------------
  b(-6, 1, -25, -5, 1, -25, "wood"),
  b(-6, 1, -24, -5, 2, -24, "wood"),
  b(-6, 1, -23, -5, 3, -23, "wood"),
  b(-6, 1, -22, -5, 4, -22, "wood"),

  // --- floor slab between storeys (j 4), open over the stairwell ----------
  b(-4, 4, -25, -1, 4, -20, "wood"),
  b(-6, 4, -21, -5, 4, -20, "wood"),

  // --- main volume, upper floor (j 5..7) ----------------------------------
  b(-7, 5, -26, -7, 7, -19, "concrete"), // west wall
  b(-6, 5, -26, -1, 7, -26, "concrete"), // back wall
  b(0, 5, -26, 0, 7, -22, "concrete"), // east wall, north of the balcony door
  b(0, 7, -21, 0, 7, -20, "concrete"), // lintel over the balcony door
  b(0, 5, -19, 0, 7, -19, "concrete"), // east wall, south of the door
  b(-6, 5, -19, -1, 5, -19, "concrete"), // front sill
  b(-6, 6, -19, -1, 7, -19, "glass"), // front window band

  // --- main roof + parapet, with a gap at z -22 for the roof stair --------
  b(-7, 8, -26, 0, 8, -19, "panel"),
  b(-7, 9, -26, -7, 9, -19, "panel"),
  b(-6, 9, -26, -1, 9, -26, "panel"),
  b(-6, 9, -19, -1, 9, -19, "panel"),
  b(0, 9, -26, 0, 9, -23, "panel"),
  b(0, 9, -21, 0, 9, -19, "panel"),

  // --- side wing (j 1..3) -------------------------------------------------
  b(1, 1, -25, 1, 3, -20, "concrete"), // west wall
  b(6, 1, -25, 6, 3, -20, "concrete"), // east wall
  b(2, 1, -25, 5, 3, -25, "concrete"), // back wall
  b(2, 1, -20, 5, 3, -20, "glass"), // front glazing

  // --- wing roof (the balcony) + parapet ----------------------------------
  b(1, 4, -25, 6, 4, -20, "panel"),
  b(3, 5, -25, 5, 5, -25, "panel"), // back rail, clear of the roof stair
  b(3, 5, -20, 6, 5, -20, "panel"), // front rail, clear of the balcony door
  b(6, 5, -25, 6, 5, -23, "panel"), // east rail
  b(6, 5, -21, 6, 5, -21, "panel"), // east rail, gap at z -22 for the stair

  // --- outdoor stair, plinth -> balcony -----------------------------------
  b(7, 1, -19, 7, 1, -19, "wood"),
  b(7, 1, -20, 7, 2, -20, "wood"),
  b(7, 1, -21, 7, 3, -21, "wood"),
  b(7, 1, -22, 7, 4, -22, "wood"),

  // --- outdoor stair, balcony -> main roof --------------------------------
  b(1, 5, -25, 2, 5, -25, "wood"),
  b(1, 5, -24, 2, 6, -24, "wood"),
  b(1, 5, -23, 2, 7, -23, "wood"),
  b(1, 5, -22, 2, 8, -22, "wood"),
];

export const HOUSE_COLORS: Record<HouseMaterial, string> = {
  concrete: "#ece7dd",
  panel: "#454b58",
  wood: "#c08a4e",
  glass: "#8fc9e3",
  stone: "#a5a29b",
};

/**
 * Expand the bricks into one cube position list per material. Overlapping
 * bricks are resolved first-come, so a voxel is only ever drawn once.
 */
export function houseVoxels(): Record<HouseMaterial, [number, number, number][]> {
  const claimed = new Set<string>();
  const out: Record<HouseMaterial, [number, number, number][]> = {
    concrete: [],
    panel: [],
    wood: [],
    glass: [],
    stone: [],
  };
  for (const brick of HOUSE_BRICKS) {
    for (let x = brick.x0; x <= brick.x1; x++) {
      for (let y = brick.y0; y <= brick.y1; y++) {
        for (let z = brick.z0; z <= brick.z1; z++) {
          const key = `${x},${y},${z}`;
          if (claimed.has(key)) continue;
          claimed.add(key);
          out[brick.mat].push([x + 0.5, y + 0.5, z + 0.5]);
        }
      }
    }
  }
  return out;
}

/** Treasure-hunt star placements, ordered easiest to hardest. Each one is
 *  somewhere the player has to use a different gesture to reach. */
export const STAR_SPOTS: { id: string; hint: string; pos: [number, number, number] }[] = [
  { id: "lawn", hint: "On the front lawn", pos: [0, 1.2, -14] },
  { id: "living", hint: "Inside, past the front door", pos: [-3, 1.8, -22] },
  { id: "upstairs", hint: "Up the indoor stairs", pos: [-2, 5.8, -22] },
  { id: "balcony", hint: "Out on the balcony", pos: [4, 5.8, -22.5] },
  { id: "roof", hint: "On the roof terrace", pos: [-4, 9.8, -22] },
  { id: "backyard", hint: "Behind the house", pos: [-9, 1.2, -28] },
  { id: "sideyard", hint: "Round the side of the wing", pos: [7, 1.8, -26.5] },
  { id: "field", hint: "Far out in the field", pos: [14, 1.2, -6] },
];

/** How close the player has to get to pick a star up. */
export const STAR_PICKUP_RADIUS = 1.9;
