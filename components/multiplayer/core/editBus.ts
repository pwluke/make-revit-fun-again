/**
 * The one-way channel from "the player edited a block" to "tell the other
 * clients", and the guard that stops that becoming an infinite loop.
 *
 * WHY A BUS RATHER THAN CALLING THE NETWORK DIRECTLY FROM Cube.tsx. Cube.tsx is
 * renderer code; making it import the db would mean the cube mesh no longer
 * renders without a network layer present, and would drag InstantDB into every
 * test that touches the cube store. The bus inverts that: Cube.tsx announces,
 * and whoever cares subscribes. With nothing subscribed — single player, or a
 * test — publishing is a no-op.
 *
 * THE ECHO PROBLEM. Remote edits are applied by calling the same store actions a
 * local edit calls, which would announce them straight back out to the room, and
 * every client would do the same on receipt. `applyWithoutBroadcast` suppresses
 * the announcement for exactly the duration of the remote apply.
 *
 * No three.js, no React, no db import.
 */

import type { EditOp } from "./protocol";

type EditListener = (op: EditOp) => void;

let listener: EditListener | null = null;
let suppressed = false;

/**
 * Register the network publisher. One listener, not a set: there is exactly one
 * room connection, and a set would quietly tolerate a leaked duplicate
 * subscription that double-publishes every edit. Returns an unsubscribe.
 */
export function setEditListener(next: EditListener | null): () => void {
  listener = next;
  return () => {
    if (listener === next) listener = null;
  };
}

/** Announce a local edit. No-op when nothing is listening. */
export function publishLocalEdit(op: EditOp): void {
  if (suppressed || !listener) return;
  listener(op);
}

/**
 * Run `apply` with local-edit announcements suppressed, for replaying an edit
 * that arrived from someone else.
 *
 * MUST be given a synchronous function. The flag is module-global, so an async
 * `apply` would return at its first await with the flag still set, and swallow
 * the next genuinely-local edit. Every current caller applies through a zustand
 * `set`, which is synchronous; `try/finally` keeps a throw from leaving the flag
 * stuck on and permanently muting this client.
 */
export function applyWithoutBroadcast(apply: () => void): void {
  const was = suppressed;
  suppressed = true;
  try {
    apply();
  } finally {
    suppressed = was;
  }
}

/** Test seam. */
export function isSuppressed(): boolean {
  return suppressed;
}
