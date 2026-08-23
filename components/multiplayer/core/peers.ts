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
};

const peers = new Map<string, Peer>();

/**
 * Replace what we know about the room. Instant's presence callback hands over
 * the FULL peer slice each time, not a delta, so this reconciles rather than
 * merges: anyone absent from `next` has disconnected and their avatar goes.
 *
 * Existing peers are mutated in place instead of replaced so that `drawn`
 * survives — rebuilding the entry every tick would reset the interpolation and
 * pin every avatar to its last reported position.
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
    } else {
      peers.set(id, {
        id,
        ...state,
        drawn: { x: state.x, y: state.y, z: state.z, yaw: state.yaw },
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

/** Drop everyone. For leaving the room, and for test isolation. */
export function clearPeers(): void {
  peers.clear();
}
