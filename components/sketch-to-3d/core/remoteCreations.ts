/**
 * Translates between a `Creation` and the flat row shape InstantDB stores.
 *
 * Pure functions, no db import and no React — the network call lives in the hook
 * that uses these, so the encoding rules stay testable on their own. Getting
 * them wrong is how a shared gallery fills with creations that render at the
 * wrong size or in the floor.
 *
 * This file must never import React or three.js — see the layering note in
 * `./types`.
 */

import { DEFAULT_TRANSFORM, clampScale, clampY } from "./transform";
import type { Creation, CreationMode, SpawnTransform } from "./types";

/** The flat row as it exists in Instant. Nested objects are JSON strings. */
export type CreationRow = {
  creationId: string;
  mode: string;
  userText?: string;
  assetUrl: string;
  spawn: string;
  transform?: string;
  createdAt: number;
  deviceId?: string;
};

const MODES: CreationMode[] = ["sprite", "mesh", "fast"];

/**
 * The asset a creation actually renders. Sprites and meshes carry different
 * field names, but exactly one URL each — flattening to a single column keeps
 * the row shape from branching on mode.
 */
export function assetUrlOf(creation: Creation): string | null {
  if (creation.state.status !== "ready") return null;
  const { result } = creation.state;
  return result.mode === "sprite" ? result.spriteUrl : result.glbUrl;
}

/** Returns null for anything not worth publishing, rather than throwing. */
export function toRow(
  creation: Creation,
  deviceId: string,
  createdAt: number,
): CreationRow | null {
  const assetUrl = assetUrlOf(creation);
  // In-flight and failed creations have nothing to show on another machine.
  if (!assetUrl) return null;

  return {
    creationId: creation.id,
    mode: creation.mode,
    userText: creation.userText,
    assetUrl,
    spawn: JSON.stringify(creation.spawn),
    transform: JSON.stringify(creation.transform),
    createdAt,
    deviceId,
  };
}

/**
 * Rebuilds a Creation from a row, validating as it goes.
 *
 * Rows come from a world-writable table (see instant.perms.ts), so this treats
 * every field as untrusted. A malformed row reaching the renderer becomes a
 * throw inside useFrame, which kills the render loop rather than dropping one
 * creation — the same failure mode the localStorage loader guards against.
 */
export function fromRow(row: unknown): Creation | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as CreationRow;

  if (typeof candidate.creationId !== "string" || !candidate.creationId) return null;
  if (typeof candidate.assetUrl !== "string" || !candidate.assetUrl) return null;

  const mode = MODES.includes(candidate.mode as CreationMode)
    ? (candidate.mode as CreationMode)
    : null;
  if (!mode) return null;

  const spawn = parseSpawn(candidate.spawn);
  if (!spawn) return null;

  const transform = parseTransform(candidate.transform);

  return {
    id: candidate.creationId,
    userText: candidate.userText ?? "",
    // The prompt is not stored: it is only ever used to CALL the generator, and
    // a creation arriving from another machine has already been generated.
    prompt: "",
    mode,
    spawn,
    transform,
    state: {
      status: "ready",
      result:
        mode === "sprite"
          ? { mode: "sprite", spriteUrl: candidate.assetUrl }
          : { mode, glbUrl: candidate.assetUrl },
    },
  };
}

function parseSpawn(raw: unknown): SpawnTransform | null {
  if (typeof raw !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const spawn = parsed as SpawnTransform;
    if (!Array.isArray(spawn?.position) || spawn.position.length !== 3) return null;
    if (!spawn.position.every((value) => typeof value === "number" && Number.isFinite(value))) {
      return null;
    }
    return {
      position: [spawn.position[0], spawn.position[1], spawn.position[2]],
      rotationY: typeof spawn.rotationY === "number" ? spawn.rotationY : 0,
    };
  } catch {
    return null;
  }
}

/** Falls back to the default rather than rejecting — a bad transform is recoverable. */
function parseTransform(raw: unknown) {
  if (typeof raw !== "string") return { ...DEFAULT_TRANSFORM };
  try {
    const parsed = JSON.parse(raw) as { scale?: unknown; y?: unknown };
    return {
      scale:
        typeof parsed.scale === "number" && Number.isFinite(parsed.scale)
          ? clampScale(parsed.scale)
          : DEFAULT_TRANSFORM.scale,
      y:
        typeof parsed.y === "number" && Number.isFinite(parsed.y)
          ? clampY(parsed.y)
          : DEFAULT_TRANSFORM.y,
    };
  } catch {
    return { ...DEFAULT_TRANSFORM };
  }
}

/**
 * A stable per-browser id, so a machine can delete what it made without
 * touching the rest of the gallery. Not identity or auth — just a label.
 */
export function getDeviceId(storageKey = "sketch-to-3d:device"): string {
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(storageKey, fresh);
    return fresh;
  } catch {
    // Private browsing or storage disabled: a per-session id still works for
    // everything except surviving a reload, which is not worth failing over.
    return crypto.randomUUID();
  }
}
