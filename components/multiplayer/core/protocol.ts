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

/** One laser bolt someone fired, muzzle to impact. */
export type ShotOp = {
  from: Vec3;
  to: Vec3;
  /** Whether the shooter's ray landed on a surface, rather than running out of
   *  range in mid-air. Decides whether the receiver throws sparks. */
  hit: boolean;
};

/** The flat row Instant broadcasts. See the `shot` topic in instant.schema.ts. */
export type ShotMessage = {
  fx: number;
  fy: number;
  fz: number;
  tx: number;
  ty: number;
  tz: number;
  hit: boolean;
};

/**
 * Longest bolt worth drawing, in world units. LaserTag's MAX_RANGE is 45, so
 * this is ~4x the longest real shot.
 *
 * The bolt is drawn by scaling a unit cylinder to the muzzle-to-impact
 * distance, so an absurd length is not merely wrong — it puts a kilometre of
 * unlit, tone-mapping-exempt geometry through the middle of the frame, which
 * the bloom pass then blows out to white. Cheaper to reject it here.
 */
export const MAX_SHOT_LENGTH = 200;

export function encodeShot(op: ShotOp): ShotMessage {
  return {
    fx: op.from[0],
    fy: op.from[1],
    fz: op.from[2],
    tx: op.to[0],
    ty: op.to[1],
    tz: op.to[2],
    hit: op.hit,
  };
}

/**
 * Same null-not-throw contract as `decodeEdit`, for the same reason: this runs
 * inside the topic subscription, and a throw would end multiplayer for the
 * session.
 *
 * `hit` is read as `=== true` rather than type-checked, because a wrong answer
 * there costs eight spark particles — not worth dropping a visible bolt over.
 */
export function decodeShot(raw: unknown): ShotOp | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as ShotMessage;

  const { fx, fy, fz, tx, ty, tz } = candidate;
  if (
    !isFiniteNumber(fx) ||
    !isFiniteNumber(fy) ||
    !isFiniteNumber(fz) ||
    !isFiniteNumber(tx) ||
    !isFiniteNumber(ty) ||
    !isFiniteNumber(tz)
  ) {
    return null;
  }
  if (Math.hypot(tx - fx, ty - fy, tz - fz) > MAX_SHOT_LENGTH) return null;

  return { from: [fx, fy, fz], to: [tx, ty, tz], hit: candidate.hit === true };
}

/**
 * The avatar colour out of a peer's presence, for tinting what they fired.
 *
 * Separate from `decodePresence` on purpose: that one requires a position and
 * returns null without one, which is the right answer for drawing an avatar and
 * the wrong answer for a bolt. A peer can legitimately publish a shot in the
 * window between joining and their first position — the bolt should still be
 * drawn, in their colour.
 */
export function decodePeerColor(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const { color } = raw as { color?: unknown };
  return typeof color === "string" && color ? color : null;
}

/** Where one other player is. Mirrors the `world` room's presence entity. */
export type PeerState = {
  color: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
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
  };
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
