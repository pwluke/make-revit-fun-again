/**
 * How big another player is, and whether your shot went through them.
 *
 * WHY THIS ISN'T A SCENE RAYCAST. Remote players are drawn as seven
 * InstancedMeshes (see r3f/RemotePlayers.tsx), and three.js tests an
 * InstancedMesh against a bounding sphere it computes ONCE and caches — at a
 * moment when every avatar's matrix is still identity. Raycasting them would
 * therefore work at the world origin and silently miss everywhere else, which is
 * exactly the stale-bounding-volume trap Cube.tsx documents for the cube mesh.
 * Clearing the cache every frame fixes it at the cost of recomputing 7 x 16
 * instance matrices on every ray, and bots cast a line-of-sight ray each per
 * frame.
 *
 * Testing the ray against one box per player instead is cheaper than that,
 * gives a single sane hitbox rather than seven limb-shaped ones, and — the
 * reason it lives here — is a pure function over numbers, so the thing that
 * decides whether a player got hit is unit-testable without a renderer.
 *
 * No three.js, no React, no db import. Vectors are plain `{x,y,z}` so callers
 * can pass a THREE.Vector3 straight in.
 */

/**
 * THE AVATAR RIG, canonical. Lives here rather than in RemotePlayers because
 * the hitbox has to be derived from the same numbers the figure is drawn from —
 * two copies would drift, and the failure mode of that drift is shots passing
 * through a player's head.
 *
 * Built to the LOCAL player's real dimensions, from Player.tsx: EYE_HEIGHT is
 * 1.25 and CAPSULE_NORMAL puts the body centre ~0.563 above the feet. Positions
 * on the wire are that body centre, so everything here is relative to it.
 */
export const FEET = -0.563;
export const LEG = 0.45;
export const TORSO = 0.48;
export const HEAD = 0.32;
export const HIP = FEET + LEG;
export const SHOULDER = HIP + TORSO;

/**
 * The box a shot has to pass through to count as a hit, relative to the
 * position on the wire.
 *
 * Square in plan, and yaw-independent on purpose: the figure is 0.3 wide at the
 * torso and 0.18 deep, so a box that respected yaw would make a player
 * meaningfully harder to hit side-on than face-on. Nobody reads a blocky avatar
 * closely enough to understand why their shot missed, so the footprint is one
 * size in both axes.
 *
 * `HALF` is a shade wider than the arms (which reach 0.265 out from centre),
 * because the position being tested against is up to 100ms stale — see
 * PRESENCE_INTERVAL_MS in net.ts — and a sprinting player would otherwise be
 * unhittable in a way that reads as the gun being broken.
 */
export const PEER_HALF = 0.34;
export const PEER_BOTTOM = FEET;
export const PEER_TOP = SHOULDER + HEAD; // 0.687 — the top of the head.

export type Vec = { x: number; y: number; z: number };

/** The minimum a hit needs to carry: who, and how far along the ray. */
export type PeerHit = {
  id: string;
  distance: number;
};

/** What `pickPeerHit` needs to know about a candidate. A superset of this is
 *  what `core/peers.ts` already holds, so callers pass peers in directly. */
export type Targetable = {
  id: string;
  armed: boolean;
  /** Where the avatar is DRAWN, not where it was last reported. Shooting at
   *  the reported position would mean leading a target whose body is visibly
   *  somewhere else — you have to be able to hit what you can see. */
  drawn: Vec;
};

/**
 * The nearest armed player the ray passes through, or null.
 *
 * `direction` must be normalised — the caller already has a unit vector from
 * `camera.getWorldDirection`, and normalising defensively here would hide the
 * bug rather than fix it, while costing a sqrt per shot.
 *
 * `maxDistance` is how far the shot actually travels: the caller passes the
 * distance to whatever scenery it hit, so a player standing behind a wall is
 * not hit through it. That is the whole occlusion story — no second raycast.
 *
 * THERE IS NO MINIMUM DISTANCE, deliberately. The scene raycast in LaserTag
 * needs one — a held gun model floats ~1m in front of the eye and every shot
 * would hit it — but nothing of yours is ever in this list, so the same guard
 * applied here only makes a player standing on top of you unshootable. It was
 * a parameter once; it is gone rather than defaulted to 0 so it cannot come
 * back by accident.
 */
export function pickPeerHit(
  origin: Vec,
  direction: Vec,
  maxDistance: number,
  peers: Iterable<Targetable>,
): PeerHit | null {
  let best: PeerHit | null = null;
  for (const peer of peers) {
    // Unarmed players are scenery: in another mode, or still on the setup card.
    if (!peer.armed) continue;
    const distance = rayBoxDistance(origin, direction, peer.drawn);
    if (distance === null) continue;
    if (distance > maxDistance) continue;
    if (!best || distance < best.distance) {
      best = { id: peer.id, distance };
    }
  }
  return best;
}

/**
 * Slab test: where the ray enters the player's box, or null if it misses.
 *
 * Returns the ENTRY distance, and returns 0 for a ray starting inside the box —
 * so a muzzle already inside someone counts as a point-blank hit rather than as
 * a miss out the far side. `pickPeerHit` passes that 0 straight through: at
 * knife range the bolt has nowhere to travel, and the alternative is a rushing
 * player being untouchable.
 */
function rayBoxDistance(origin: Vec, direction: Vec, centre: Vec): number | null {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;

  const axes: [number, number, number, number][] = [
    [origin.x, direction.x, centre.x - PEER_HALF, centre.x + PEER_HALF],
    [origin.y, direction.y, centre.y + PEER_BOTTOM, centre.y + PEER_TOP],
    [origin.z, direction.z, centre.z - PEER_HALF, centre.z + PEER_HALF],
  ];

  for (const [start, step, low, high] of axes) {
    if (step === 0) {
      // Parallel to this pair of faces: either the ray is between them for its
      // whole length, or it can never be. No division, which is also what keeps
      // a zero component from producing a NaN below.
      if (start < low || start > high) return null;
      continue;
    }
    const inverse = 1 / step;
    let t0 = (low - start) * inverse;
    let t1 = (high - start) * inverse;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > near) near = t0;
    if (t1 < far) far = t1;
    if (near > far) return null;
  }

  return near;
}
