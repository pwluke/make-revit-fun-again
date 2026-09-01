/**
 * Who is in the room right now, for the DOM — the player list under "Next
 * adventure" and the floating name tag over each remote avatar.
 *
 * Deliberately separate from peers.ts, which stays non-reactive on purpose
 * (see its header comment): presence lands ~10x a second per peer, and this
 * store only needs to update on the rare tick where somebody's id, name or
 * colour actually changed — not on every position update. `syncRoster` does
 * that comparison, so a room that's just standing around costs zero React
 * re-renders here even though peers.ts is being written to 10x a second.
 */

import { create } from "zustand";
import type { PeerState } from "./protocol";

export type RosterEntry = { id: string; name: string; color: string };

type RosterState = {
  entries: RosterEntry[];
};

export const usePeerRoster = create<RosterState>(() => ({ entries: [] }));

function sameRoster(a: RosterEntry[], b: RosterEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].name !== b[i].name || a[i].color !== b[i].color) {
      return false;
    }
  }
  return true;
}

/**
 * Called from net.ts alongside `syncPeers`, on every presence slice. No-ops
 * (skips the `set`, so nothing subscribed re-renders) unless the room's
 * membership, a name, or a colour actually changed.
 *
 * Entries are sorted by id rather than kept in slice order: `next` is rebuilt
 * from an object each call, and object key order is not a contract worth
 * depending on — a same-membership slice that happened to iterate differently
 * would otherwise look like a change and cause a pointless re-render.
 */
export function syncRoster(next: Map<string, PeerState>): void {
  const entries: RosterEntry[] = [];
  for (const [id, state] of next) {
    entries.push({ id, name: state.name, color: state.color });
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));

  const current = usePeerRoster.getState().entries;
  if (!sameRoster(current, entries)) usePeerRoster.setState({ entries });
}

/** For leaving the room, and for test isolation. */
export function clearRoster(): void {
  usePeerRoster.setState({ entries: [] });
}
