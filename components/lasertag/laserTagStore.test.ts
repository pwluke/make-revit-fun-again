/**
 * The PvP half of the round state — the part that decides what the HUD is
 * allowed to say about other players.
 *
 * These live here rather than under a `core/` folder because the store already
 * is what a core module would be: zustand and plain numbers, no three.js and no
 * component. The reason they exist is that the "taking fire" banner used to be
 * sticky for a whole round, and that is a rule about elapsed time — exactly the
 * kind of thing that goes wrong again silently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_HEALTH,
  UNDER_FIRE_MS,
  damageFromPeer,
  publishLaserTag,
  resetLaserTag,
  useLaserTagStore,
} from "./laserTagStore";

const RIVAL = "#e85675";

/** A round in progress, which is the only phase PvP applies in. */
function startHunting() {
  useLaserTagStore.getState().startRound({
    botCount: 3,
    returnFire: false,
    difficulty: "beginner",
  });
  // `startRound` bumps the round token, which the arena reads; the total is
  // normally filled in once the voxels land. Left at 0 here so no win check
  // fires and the round stays open for the duration of a test.
}

beforeEach(() => {
  vi.useFakeTimers();
  startHunting();
});

afterEach(() => {
  vi.useRealTimers();
  resetLaserTag();
  useLaserTagStore.getState().backToSetup();
});

describe("taking fire from another player", () => {
  it("names the rival's colour as soon as they hit you", () => {
    damageFromPeer(15, RIVAL);
    publishLaserTag();
    expect(useLaserTagStore.getState().lastHitByColor).toBe(RIVAL);
    expect(useLaserTagStore.getState().health).toBe(MAX_HEALTH - 15);
  });

  it("stops saying so once the shooting has stopped", () => {
    // The banner is present tense. Left to the end of the round it claims you
    // are under fire from somebody who shot you once, minutes ago.
    damageFromPeer(15, RIVAL);
    publishLaserTag();

    vi.advanceTimersByTime(UNDER_FIRE_MS - 1);
    publishLaserTag();
    expect(useLaserTagStore.getState().lastHitByColor).toBe(RIVAL);

    vi.advanceTimersByTime(2);
    publishLaserTag();
    expect(useLaserTagStore.getState().lastHitByColor).toBeNull();
  });

  it("holds through an exchange of fire, because each hit restarts it", () => {
    damageFromPeer(15, RIVAL);
    publishLaserTag();
    // Well past the window in total, but never with a quiet gap in it.
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(UNDER_FIRE_MS - 100);
      damageFromPeer(15, RIVAL);
      publishLaserTag();
      expect(useLaserTagStore.getState().lastHitByColor).toBe(RIVAL);
    }
  });

  it("says nothing about players when only bots have been shooting", () => {
    publishLaserTag();
    expect(useLaserTagStore.getState().lastHitByColor).toBeNull();
  });

  it("still records who ended the round, after the banner has lapsed", () => {
    // `downedByPeer` is what the end card reads, and unlike the banner it is a
    // fact about the round rather than about the last two seconds.
    for (let i = 0; i < 7; i++) damageFromPeer(15, RIVAL);
    publishLaserTag();
    expect(useLaserTagStore.getState().phase).toBe("lost");
    expect(useLaserTagStore.getState().downedByPeer).toBe(true);

    vi.advanceTimersByTime(UNDER_FIRE_MS * 2);
    publishLaserTag();
    expect(useLaserTagStore.getState().downedByPeer).toBe(true);
  });
});
