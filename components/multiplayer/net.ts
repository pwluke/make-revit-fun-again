/**
 * The single connection to the shared world room.
 *
 * WHY NOT THE REACT HOOKS. InstantDB ships `db.rooms.usePresence` /
 * `useTopicEffect`, and they are the documented path — but they re-render the
 * calling component on every peer update. Peers publish ~10x a second each, and
 * the only component that could host these hooks lives inside <MinecraftScene />,
 * where a re-render remounts the EffectComposer (see the comment on <PostFX />
 * in App.tsx). N players would mean tearing down the post chain 10N times a
 * second.
 *
 * `db.core.joinRoom` is the same feature with an imperative handle instead —
 * subscribe callbacks, no React involvement — so peer updates land in a plain
 * Map (core/peers.ts) that the renderer polls from inside useFrame. React never
 * learns that anyone moved.
 *
 * This module owns no renderer types: the caller passes in what to do with a
 * remote edit, so nothing here imports three.js or a component.
 */

import { db } from "@/lib/db";
import { setEditListener } from "./core/editBus";
import { clearPeers, syncPeers } from "./core/peers";
import {
  decodeEdit,
  decodePresence,
  encodeEdit,
  randomAvatarColor,
  type EditOp,
  type PeerState,
} from "./core/protocol";

/**
 * One global room: everyone who opens /minecraft is in the same world. There is
 * no room-code UI because there are no accounts and the whole point is that
 * opening the page twice just works.
 */
const WORLD_ROOM_ID = "make-revit-fun-again:world";

/**
 * ~10Hz. Chosen against the interpolation in RemotePlayers: at 100ms the eased
 * avatar stays visually smooth, and dropping to 50ms roughly doubles outbound
 * traffic for a difference nobody watching can see.
 */
const PRESENCE_INTERVAL_MS = 100;

type WorldRoom = ReturnType<typeof db.core.joinRoom<"world">>;

let room: WorldRoom | null = null;
let lastPublishAt = 0;
/** This tab's avatar tint, fixed for the session. */
let selfColor = "";

/**
 * Join the room and start mirroring edits and positions. Returns a disconnect.
 *
 * Guards against a second connection: React 19 StrictMode mounts effects twice
 * in development, and two joins would mean this tab appearing as two avatars and
 * every local edit being published twice.
 */
export function connectWorldRoom(
  onRemoteEdit: (op: EditOp) => void,
): () => void {
  if (room) return () => {};

  selfColor = randomAvatarColor();
  // Position is deliberately omitted: `decodePresence` rejects a slice with no
  // coordinates, so other clients simply do not draw this tab until its first
  // real position arrives (within PRESENCE_INTERVAL_MS). Publishing a
  // placeholder here would flash every new player's avatar at the world origin.
  const joined = db.core.joinRoom("world", WORLD_ROOM_ID, {
    initialPresence: { color: selfColor },
  });
  room = joined;
  lastPublishAt = 0;

  const unsubscribePresence = joined.subscribePresence({}, (slice) => {
    // `peers` excludes this client, so the avatar list is other players only —
    // no need to filter self out, and no risk of rendering an avatar inside the
    // local camera. Disconnected peers vanish from this map, which is why there
    // is no explicit "player left" message.
    const next = new Map<string, PeerState>();
    for (const [peerId, raw] of Object.entries(slice.peers ?? {})) {
      const state = decodePresence(raw);
      if (state) next.set(peerId, state);
    }
    syncPeers(next);
  });

  const unsubscribeEdits = joined.subscribeTopic("edit", (event) => {
    const op = decodeEdit(event);
    // Malformed payloads are dropped rather than thrown on: this callback owns
    // the subscription, and throwing here would end multiplayer for the session.
    if (!op) return;
    onRemoteEdit(op);
  });

  const unsubscribeLocalEdits = setEditListener((op) => {
    joined.publishTopic("edit", encodeEdit(op));
  });

  return () => {
    unsubscribeLocalEdits();
    unsubscribeEdits();
    unsubscribePresence();
    joined.leaveRoom();
    clearPeers();
    room = null;
  };
}

/**
 * Report where this player is. Safe to call every frame — it self-throttles to
 * PRESENCE_INTERVAL_MS.
 *
 * Publishes unconditionally rather than only on movement: presence is
 * last-write-wins and a stationary player costs one small message per 100ms,
 * whereas a "has it changed enough" threshold is exactly the kind of thing that
 * strands an avatar a few centimetres from where its player actually stopped.
 */
export function publishSelf(
  x: number,
  y: number,
  z: number,
  yaw: number,
  now: number,
): void {
  if (!room) return;
  if (now - lastPublishAt < PRESENCE_INTERVAL_MS) return;
  lastPublishAt = now;
  room.publishPresence({ color: selfColor, x, y, z, yaw });
}
