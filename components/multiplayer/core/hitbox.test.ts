import { describe, expect, it } from "vitest";
import {
  PEER_BOTTOM,
  PEER_HALF,
  PEER_TOP,
  pickPeerHit,
  type Targetable,
} from "./hitbox";

const peer = (
  id: string,
  x: number,
  z: number,
  armed = true,
  y = 0,
): Targetable => ({ id, armed, drawn: { x, y, z } });

/** Straight down -Z, the direction yaw 0 looks. */
const ahead = { x: 0, y: 0, z: -1 };
const origin = { x: 0, y: 0, z: 0 };

describe("pickPeerHit", () => {
  it("hits a player standing in the line of fire", () => {
    const hit = pickPeerHit(origin, ahead, 0, 50, [peer("a", 0, -10)]);
    expect(hit?.id).toBe("a");
    // Entry face, not the centre: the bolt should stop at the near side.
    expect(hit?.distance).toBeCloseTo(10 - PEER_HALF, 5);
  });

  it("misses a player off to the side", () => {
    expect(pickPeerHit(origin, ahead, 0, 50, [peer("a", 2, -10)])).toBeNull();
  });

  it("ignores an unarmed player", () => {
    // Somebody in another mode, or still on the setup card, is scenery — the
    // shot passes through rather than scoring.
    expect(
      pickPeerHit(origin, ahead, 0, 50, [peer("a", 0, -10, false)]),
    ).toBeNull();
  });

  it("takes the nearest of several in a line", () => {
    const hit = pickPeerHit(origin, ahead, 0, 50, [
      peer("far", 0, -30),
      peer("near", 0, -8),
      peer("mid", 0, -20),
    ]);
    expect(hit?.id).toBe("near");
  });

  it("does not shoot through scenery", () => {
    // `maxDistance` is the distance to the wall the scene raycast already found.
    // This is the whole of the occlusion story, so it is the case that matters.
    expect(pickPeerHit(origin, ahead, 0, 5, [peer("a", 0, -10)])).toBeNull();
  });

  it("respects the shooter's minimum reach", () => {
    // Same guard as MIN_REACH in LaserTag: anything closer is your own gun.
    expect(pickPeerHit(origin, ahead, 1.6, 50, [peer("a", 0, -1)])).toBeNull();
  });

  it("misses over a player's head and under their feet", () => {
    // A level shot passes well above someone standing 10 below, and well below
    // someone standing 10 above.
    expect(
      pickPeerHit(origin, ahead, 0, 50, [peer("low", 0, -10, true, -10)]),
    ).toBeNull();
    expect(
      pickPeerHit(origin, ahead, 0, 50, [peer("high", 0, -10, true, 10)]),
    ).toBeNull();
  });

  it("hits a player standing on a floor above, when aimed up at them", () => {
    // The arena is a building: shots go up stairwells and through floors that
    // have been broken open, so a vertical component must work.
    const target = peer("up", 0, -10, true, 6);
    const dy = 6 + (PEER_BOTTOM + PEER_TOP) / 2;
    const length = Math.hypot(10, dy);
    const aim = { x: 0, y: dy / length, z: -10 / length };
    expect(pickPeerHit(origin, aim, 0, 50, [target])?.id).toBe("up");
  });

  it("counts a muzzle already inside someone as point blank", () => {
    // Returning the far face here would read as the shot passing through them.
    const hit = pickPeerHit(
      { x: 0, y: 0, z: -10 },
      ahead,
      0,
      50,
      [peer("a", 0, -10)],
    );
    expect(hit?.distance).toBe(0);
  });

  it("handles an axis-aligned ray without dividing by zero", () => {
    // Straight down: every component but y is exactly 0, the case a naive slab
    // test turns into NaN and silently never hits.
    const straightDown = { x: 0, y: -1, z: 0 };
    expect(
      pickPeerHit({ x: 0, y: 10, z: 0 }, straightDown, 0, 50, [peer("a", 0, 0)])
        ?.id,
    ).toBe("a");
  });

  it("finds nobody in an empty room", () => {
    expect(pickPeerHit(origin, ahead, 0, 50, [])).toBeNull();
  });
});
