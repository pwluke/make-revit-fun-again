/**
 * Translates between the game's own types and the flat shapes an InstantDB room
 * can carry, and validates everything arriving from another client.
 *
 * Pure functions, no db import and no three.js — the network call lives in
 * `../net.ts`, so the encoding rules stay testable on their own. Same split, and
 * the same reasons, as `components/sketch-to-3d/core/remoteCreations.ts`.
 *
 * WHY VALIDATION MATTERS MORE HERE THAN IT LOOKS. A malformed edit does not just
 * render wrong, it corrupts world state on every client that receives it: the
 * coordinates go into `useCubeStore`, get keyed with `toFixed(4)`, and are
 * written straight into an InstancedMesh matrix. A single NaN there collapses
 * the instance bounding sphere, which silently makes the whole cube mesh
 * unpickable — you would see "breaking blocks stopped working" and have no
 * reason to suspect the network. So: finite numbers only, checked once, here.
 */

// Relative, not the `@/` alias: vitest.config.ts registers no path-alias plugin,
// so an aliased import here would make this whole module untestable. Every other
// tested `core/` module imports relatively for the same reason.
import { UI } from "../../../lib/palette";

export type Vec3 = [x: number, y: number, z: number];

/** A world edit, as intent rather than as resulting state. */
export type EditOp = {
  kind: "add" | "remove";
  positions: Vec3[];
};

/** The flat row Instant broadcasts. Nested values are JSON strings. */
export type EditMessage = {
  kind: string;
  positions: string;
};

/**
 * Upper bound on coordinates in one message. A break cluster is 11
 * (`BREAK_NEIGHBORS` + 1) and a place is 1, so this is ~5x the largest real
 * payload. It exists so one buggy or hostile client cannot make every other
 * client rebuild its cube list against a hundred thousand coordinates.
 */
export const MAX_EDIT_POSITIONS = 64;

const KINDS: EditOp["kind"][] = ["add", "remove"];

export function encodeEdit(op: EditOp): EditMessage {
  return { kind: op.kind, positions: JSON.stringify(op.positions) };
}

/**
 * Returns null for anything not worth applying, rather than throwing: this runs
 * inside a network callback, where a throw would tear down the subscription and
 * silently end multiplayer for the rest of the session.
 */
export function decodeEdit(raw: unknown): EditOp | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as EditMessage;

  const kind = KINDS.includes(candidate.kind as EditOp["kind"])
    ? (candidate.kind as EditOp["kind"])
    : null;
  if (!kind) return null;

  const positions = parsePositions(candidate.positions);
  if (!positions) return null;

  return { kind, positions };
}

function parsePositions(raw: unknown): Vec3[] | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  // An empty edit is well-formed but means nothing; treat it as nothing to do
  // so callers never have to special-case a no-op op.
  if (parsed.length === 0 || parsed.length > MAX_EDIT_POSITIONS) return null;

  const out: Vec3[] = [];
  for (const entry of parsed) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [x, y, z] = entry as unknown[];
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
      return null;
    }
    out.push([x, y, z]);
  }
  return out;
}

/** Rejects NaN and ±Infinity, which `typeof === "number"` happily admits. */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Where one other player is. Mirrors the `world` room's presence entity. */
export type PeerState = {
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /**
   * Whether they are in a live Laser Tag round, and therefore both able to
   * shoot and able to be shot. Not optional here even though the wire field is:
   * `decodePresence` resolves the absent case to `false` once, so no caller has
   * to decide what a missing flag means.
   */
  armed: boolean;
};

/**
 * Same untrusted-input treatment as edits, for the same reason: these numbers
 * are written into an instance matrix. A peer mid-connection can also publish a
 * partial slice, so a missing field is normal rather than exceptional — it just
 * means "not ready to draw yet".
 */
export function decodePresence(raw: unknown): PeerState | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as PeerState;
  if (typeof candidate.color !== "string" || !candidate.color) return null;
  if (
    !isFiniteNumber(candidate.x) ||
    !isFiniteNumber(candidate.y) ||
    !isFiniteNumber(candidate.z) ||
    !isFiniteNumber(candidate.yaw)
  ) {
    return null;
  }
  return {
    color: candidate.color,
    x: candidate.x,
    y: candidate.y,
    z: candidate.z,
    yaw: candidate.yaw,
    // Anything but an explicit `true` is unarmed. A peer on an older build, or
    // one whose first presence slice has not filled in yet, is scenery rather
    // than a target — the direction that fails safe.
    armed: candidate.armed === true,
  };
}

/**
 * Health a player loses per hit from another player, applied by the VICTIM from
 * this constant rather than read off the wire. Attacker-supplied damage is the
 * one thing in this protocol a client could trivially cheat with, and the fix
 * costs nothing: the number lives on both ends and never travels.
 *
 * Sized against the bot presets in laserTagStore: seven hits to put someone
 * down, so a duel is a duel and not a coin flip on who clicks first.
 */
export const PVP_DAMAGE = 15;

/**
 * Sanity bound on a peer id from the wire. Instant's own ids are UUID-shaped;
 * this only exists so a hostile client cannot make every other client carry a
 * megabyte string around in a Map key.
 */
export const MAX_PEER_ID_LENGTH = 64;

/** One laser bolt. `targetId` is "" when the shot hit scenery. */
export type ShotOp = {
  targetId: string;
  from: Vec3;
  to: Vec3;
};

/** The flat row Instant broadcasts. Nested values are JSON strings. */
export type ShotMessage = {
  targetId: string;
  from: string;
  to: string;
};

export function encodeShot(op: ShotOp): ShotMessage {
  return {
    targetId: op.targetId,
    from: JSON.stringify(op.from),
    to: JSON.stringify(op.to),
  };
}

/**
 * Same null-not-throw contract as `decodeEdit`, and the same NaN paranoia: these
 * endpoints go straight into a bolt's instance matrix in laser-fx, where a
 * non-finite value collapses the bolt mesh's bounding sphere and takes every
 * other bolt on screen with it.
 */
export function decodeShot(raw: unknown): ShotOp | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as ShotMessage;

  // "" is the miss case and is valid; anything non-string, or absurdly long, is
  // not. A target id that matches nobody is harmless — it simply hits no one.
  if (typeof candidate.targetId !== "string") return null;
  if (candidate.targetId.length > MAX_PEER_ID_LENGTH) return null;

  const from = parseVec3(candidate.from);
  const to = parseVec3(candidate.to);
  if (!from || !to) return null;

  return { targetId: candidate.targetId, from, to };
}

/** The victim's acknowledgement that a shot landed on them. */
export type TagOp = {
  shooterId: string;
  down: boolean;
};

export type TagMessage = TagOp;

export function encodeTag(op: TagOp): TagMessage {
  return { shooterId: op.shooterId, down: op.down };
}

export function decodeTag(raw: unknown): TagOp | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as TagMessage;
  if (typeof candidate.shooterId !== "string" || !candidate.shooterId) {
    return null;
  }
  if (candidate.shooterId.length > MAX_PEER_ID_LENGTH) return null;
  if (typeof candidate.down !== "boolean") return null;
  return { shooterId: candidate.shooterId, down: candidate.down };
}

function parseVec3(raw: unknown): Vec3 | null {
  if (typeof raw !== "string") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null;
  const [x, y, z] = parsed as unknown[];
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(z)) {
    return null;
  }
  return [x, y, z];
}

/**
 * Avatar colours, drawn from the playground tokens so a second player reads as
 * part of the scene rather than as debug geometry. Deliberately excludes the
 * warm sand/coral range the themed bricks occupy — an avatar has to be
 * identifiable against the house it is standing in front of.
 */
export const AVATAR_COLORS = [
  UI.brand,
  UI.mint,
  UI.sky,
  UI.gold,
  UI.coral,
  UI.amber,
] as const;

/**
 * Picked once per tab, not per machine: `getDeviceId()` is localStorage-backed,
 * so two tabs on one laptop — the normal way this gets demoed — would be given
 * the same identity and render as one avatar.
 */
export function randomAvatarColor(
  random: () => number = Math.random,
): string {
  return AVATAR_COLORS[Math.floor(random() * AVATAR_COLORS.length)];
}
