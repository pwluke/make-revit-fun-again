import { beforeEach, describe, expect, it } from "vitest";
import {
  armedPeerCount,
  clearPeers,
  peerById,
  peerCount,
  peerList,
  syncPeers,
} from "./peers";
import type { PeerState } from "./protocol";

const at = (x: number, yaw = 0): PeerState => ({
  color: "#5f63df",
  x,
  y: 2,
  z: 3,
  yaw,
  armed: false,
  name: "",
});

const listed = () => [...peerList()];

beforeEach(clearPeers);

describe("syncPeers", () => {
  it("adds a peer with its drawn position seeded to where it actually is", () => {
    // Seeding to the reported position rather than the origin is what stops a
    // joining player's avatar sliding in from the middle of the map.
    syncPeers(new Map([["a", at(10)]]));
    const [peer] = listed();
    expect(peer.id).toBe("a");
    expect(peer.drawn).toEqual({ x: 10, y: 2, z: 3, yaw: 0 });
  });

  it("removes peers absent from the new slice", () => {
    syncPeers(new Map([["a", at(1)], ["b", at(2)]]));
    expect(peerCount()).toBe(2);
    // Instant hands over the full peer set each time, not a delta, so an absent
    // peer means disconnected.
    syncPeers(new Map([["b", at(2)]]));
    expect(listed().map((p) => p.id)).toEqual(["b"]);
  });

  it("keeps the drawn position across updates so interpolation survives", () => {
    syncPeers(new Map([["a", at(0)]]));
    const [peer] = listed();
    // Pretend a frame eased the avatar part-way toward its target.
    peer.drawn.x = 0.5;

    syncPeers(new Map([["a", at(10)]]));

    const [updated] = listed();
    expect(updated.x).toBe(10); // target moved
    expect(updated.drawn.x).toBe(0.5); // but the easing state was not reset
  });

  it("keeps walk-cycle state across updates", () => {
    // Presence lands ~10x a second. Resetting the stride on each one would snap
    // every avatar back to a neutral pose several times per second, which reads
    // as a twitch rather than as walking.
    syncPeers(new Map([["a", at(0)]]));
    const [peer] = listed();
    peer.gait.phase = 2.5;
    peer.gait.speed = 4;

    syncPeers(new Map([["a", at(1)]]));

    const [updated] = listed();
    expect(updated.gait).toEqual({ phase: 2.5, speed: 4 });
  });

  it("starts a new peer at rest", () => {
    syncPeers(new Map([["a", at(0)]]));
    expect(listed()[0].gait).toEqual({ phase: 0, speed: 0 });
  });

  it("updates colour in place", () => {
    syncPeers(new Map([["a", at(0)]]));
    syncPeers(new Map([["a", { ...at(0), color: "#2cae87" }]]));
    expect(listed()[0].color).toBe("#2cae87");
  });

  it("re-seeds drawn position when a peer rejoins", () => {
    syncPeers(new Map([["a", at(0)]]));
    syncPeers(new Map());
    syncPeers(new Map([["a", at(50)]]));
    expect(listed()[0].drawn.x).toBe(50);
  });

  it("updates the armed flag in place", () => {
    // A peer starting a round has to become shootable without losing the
    // interpolation state that keeps their avatar smooth.
    syncPeers(new Map([["a", at(0)]]));
    syncPeers(new Map([["a", { ...at(0), armed: true }]]));
    expect(peerById("a")?.armed).toBe(true);
  });
});

describe("armedPeerCount", () => {
  it("counts only peers in a live round", () => {
    syncPeers(
      new Map([
        ["a", { ...at(0), armed: true }],
        ["b", at(1)],
        ["c", { ...at(2), armed: true }],
      ]),
    );
    expect(armedPeerCount()).toBe(2);
    expect(peerCount()).toBe(3);
  });
});

describe("peerById", () => {
  it("returns undefined for someone who has left", () => {
    syncPeers(new Map([["a", at(0)]]));
    syncPeers(new Map());
    expect(peerById("a")).toBeUndefined();
  });
});
