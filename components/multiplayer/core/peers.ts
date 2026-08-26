/**
 * Where the other players are, right now.
 *
 * A plain module-global Map rather than a zustand store, and that is the whole
 * point. Peers republish their position ~10x a second each; routing that through
 * React state would re-render the scene ~10N times a second, and a re-render of
 * <MinecraftScene /> remounts the post-processing chain. This is the same
 * pattern the codebase already uses for per-frame state that React must not
 * see — `playerOrigin` (a bare THREE.Vector3) and `powerupState` (a bare
 * object). The renderer reads this from inside useFrame; nothing subscribes.
 *
 * No three.js, no React, no db import.
 */

import type { PeerState } from "./protocol";

/** A peer plus the bookkeeping the renderer needs to animate it. */
export type Peer = PeerState & {
  id: string;
  /**
   * Where the avatar is currently drawn, as opposed to where the peer said they
   * are. Positions arrive ~10x a second but the scene renders ~60x, so drawing
   * the raw value would visibly step. The renderer eases this toward x/y/z and
   * draws from here.
   *
   * Seeded to the first reported position rather than the origin, so a peer
   * appears where they are instead of flying in from the middle of the map.
   */
  drawn: { x: number; y: number; z: number; yaw: number };
  /**
   * Walk-cycle state, kept per peer because each one is at a different point in
   * its stride. Derived entirely from how far the avatar moved — nobody
   * transmits an animation state, so this costs nothing on the wire.
   *
   * Lives beside `drawn` rather than inside it: `drawn` is compared field-for-
   * field in tests as the interpolation contract, and animation is not part of
   * that contract.
   */
  gait: { phase: number; speed: number };
};

const peers = new Map<string, Peer>();

/**
 * Replace what we know about the room. Instant's presence callback hands over
 * the FULL peer slice each time, not a delta, so this reconciles rather than
 * merges: anyone absent from `next` has disconnected and their avatar goes.
 *
 * Existing peers are mutated in place instead of replaced so that `drawn` and
 * `gait` survive — rebuilding the entry every tick would reset the
 * interpolation and pin every avatar to its last reported position, mid-stride.
 */
export function syncPeers(next: Map<string, PeerState>): void {
  for (const id of peers.keys()) {
    if (!next.has(id)) peers.delete(id);
  }
  for (const [id, state] of next) {
    const existing = peers.get(id);
    if (existing) {
      existing.color = state.color;
      existing.x = state.x;
      existing.y = state.y;
      existing.z = state.z;
      existing.yaw = state.yaw;
      existing.armed = state.armed;
    } else {
      peers.set(id, {
        id,
        ...state,
        drawn: { x: state.x, y: state.y, z: state.z, yaw: state.yaw },
        // Staggered by nothing in particular — two players who join together and
        // walk together will be in step. That reads as fine; de-syncing them
        // would mean seeding from a random, and randomness here buys nothing.
        gait: { phase: 0, speed: 0 },
      });
    }
  }
}

/**
 * Live view, not a copy. The renderer iterates this every frame, and allocating
 * a fresh array 60 times a second is exactly the kind of garbage that shows up
 * as periodic frame drops. Callers must not mutate it.
 */
export function peerList(): IterableIterator<Peer> {
  return peers.values();
}

export function peerCount(): number {
  return peers.size;
}

/**
 * One peer by id, for resolving a hit back to the player it landed on. Returns
 * the live entry, not a copy, for the same reason `peerList` does.
 */
export function peerById(id: string): Peer | undefined {
  return peers.get(id);
}

/** How many peers are in a live Laser Tag round. Drives whether the HUD shows
 *  a health bar at all — see LaserTagHud. */
export function armedPeerCount(): number {
  let count = 0;
  for (const peer of peers.values()) {
    if (peer.armed) count++;
  }
  return count;
}

/** Drop everyone. For leaving the room, and for test isolation. */
export function clearPeers(): void {
  peers.clear();
}
