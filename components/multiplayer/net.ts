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
  decodeShot,
  decodeTag,
  encodeEdit,
  encodeShot,
  encodeTag,
  randomAvatarColor,
  type EditOp,
  type PeerState,
  type ShotOp,
  type TagOp,
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
 * Whether this tab is in a live Laser Tag round. Published with every presence
 * update; owned by <LaserTag/> via `setSelfArmed`.
 *
 * Module state rather than a parameter on `publishSelf` because Player.tsx is
 * the only caller of that and it must not have to know that Laser Tag exists.
 */
let selfArmed = false;
/**
 * This tab's own peer id, learned from the presence slice — Instant assigns it,
 * so it cannot be known at join time. Needed to answer the only question PvP
 * really asks: "was that shot aimed at me?"
 *
 * Empty until the first slice lands, which is a fraction of a second after
 * joining. During that window incoming shots resolve to "not for me", which is
 * the right answer in the only case it can be wrong — you are not in a round
 * that early either.
 */
let selfId = "";

/** Callbacks the Laser Tag mode registers while it is mounted. */
type CombatListener = {
  /** Someone fired. Includes shots at other people, and misses — everyone in
   *  the room should see the bolt, not just whoever was aimed at. */
  onShot: (op: ShotOp, fromPeerId: string) => void;
  /** A victim confirmed a hit. Only ever acted on by the credited shooter. */
  onTag: (op: TagOp) => void;
};

/**
 * One listener, matching `setEditListener`'s reasoning: there is exactly one
 * Laser Tag mode, and a set would quietly tolerate a leaked subscription that
 * double-counted every tag.
 */
let combat: CombatListener | null = null;

/**
 * Register the combat handlers. Independent of `connectWorldRoom` because the
 * mode mounts and unmounts freely while the room connection stays up for the
 * life of the scene — mount order between the two is not defined.
 */
export function setCombatListener(next: CombatListener | null): () => void {
  combat = next;
  return () => {
    if (combat === next) combat = null;
  };
}

/** This tab's peer id, or "" before the first presence slice arrives. */
export function selfPeerId(): string {
  return selfId;
}

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
    // `armed` is included so a reconnect mid-round does not hand the player a
    // window of being unshootable. It is NOT reset here: <LaserTag/> owns the
    // flag and its unmount clears it, so a value surviving a reconnect is a
    // player who is genuinely still in a round. Clearing it here would also
    // race the mode's own mount effect and could strand a live round unarmed.
    initialPresence: { color: selfColor, armed: selfArmed },
  });
  room = joined;
  lastPublishAt = 0;

  const unsubscribePresence = joined.subscribePresence({}, (slice) => {
    // `user` is this tab. The only thing wanted from it is the id Instant
    // assigned us; the position and colour we already know, having sent them.
    const own = slice.user as { peerId?: string } | undefined;
    if (own?.peerId) selfId = own.peerId;

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

  const unsubscribeShots = joined.subscribeTopic("shot", (event, peer) => {
    // Nobody in a round on this tab, so nothing to draw and nothing to take.
    if (!combat) return;
    const op = decodeShot(event);
    if (!op) return;
    // The SENDER's identity comes from Instant, not from the payload, so a
    // client cannot attribute its shots to somebody else. Missing means the
    // sender's presence has not landed here yet: draw their bolt, but there is
    // nobody to credit for it, so it cannot be a hit.
    const from = (peer as { peerId?: string } | undefined)?.peerId ?? "";
    combat.onShot(op, from);
  });

  const unsubscribeTags = joined.subscribeTopic("tag", (event) => {
    if (!combat) return;
    const op = decodeTag(event);
    if (op) combat.onTag(op);
  });

  return () => {
    unsubscribeLocalEdits();
    unsubscribeTags();
    unsubscribeShots();
    unsubscribeEdits();
    unsubscribePresence();
    joined.leaveRoom();
    clearPeers();
    selfId = "";
    room = null;
  };
}

/**
 * Broadcast a shot. Sent for misses too: seeing where other people's fire lands
 * is most of what makes a room feel occupied, and one small message per shot at
 * ~5 shots a second is a fraction of what presence already costs.
 */
export function publishShot(op: ShotOp): void {
  if (!room) return;
  room.publishTopic("shot", encodeShot(op));
}

/** Confirm to the shooter that their hit landed on you. */
export function publishTag(op: TagOp): void {
  if (!room) return;
  room.publishTopic("tag", encodeTag(op));
}

/**
 * Declare whether this tab can shoot and be shot. Called by <LaserTag/> on
 * mount, on leaving setup, and on unmount.
 *
 * Publishes immediately rather than waiting for the next `publishSelf` tick:
 * the flag decides whether other players' shots can hurt you, and up to 100ms
 * of "still unarmed" at the start of a round is 100ms of free invulnerability.
 *
 * That immediate publish is an optimisation, not the mechanism. Instant drops a
 * `publishPresence` made before the room is connected, so the flag ALSO rides
 * along on every `publishSelf` — which is what makes this correct regardless of
 * whether the mode mounts before or after the room connects.
 */
export function setSelfArmed(armed: boolean): void {
  if (selfArmed === armed) return;
  selfArmed = armed;
  room?.publishPresence({ armed });
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
  room.publishPresence({ color: selfColor, x, y, z, yaw, armed: selfArmed });
}
