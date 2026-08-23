/**
 * Saves finished creations to localStorage so they survive a reload.
 *
 * The voxel building persists because it ships as static JSON; nothing in the
 * app had a persistence layer, and cube edits are still lost on reload. This
 * gives creations one, without a backend: fal serves the GLB and sprite assets
 * from stable URLs (verified still resolving hours after generation), so only
 * the metadata needs storing.
 *
 * WHAT IS DELIBERATELY NOT SAVED:
 *
 * - In-flight jobs. A generation cannot be resumed across a reload — the fal
 *   request is gone — so a restored "generating" creation would hang forever
 *   showing a placeholder. Only `ready` creations are written.
 * - `sketchUrl`. It is an object URL created with URL.createObjectURL, valid
 *   only for the document that made it. Persisting it would restore a creation
 *   pointing at a dead blob, which fails as a broken texture rather than as a
 *   missing one. Dropped on save.
 *
 * This file must never import React or three.js — see the layering note in
 * `./types`.
 */

import { DEFAULT_TRANSFORM, clampScale, clampY } from "./transform";
import type { Creation } from "./types";

const STORAGE_KEY = "sketch-to-3d:creations";

/**
 * Bumped when the stored shape changes. A mismatch discards rather than
 * migrates: this is a booth demo, and silently loading a half-understood old
 * payload is worse than starting empty.
 */
const STORAGE_VERSION = 1;

/** Matches the store's in-memory cap, so a reload cannot exceed it. */
const MAX_STORED = 8;

type StoredPayload = {
  version: number;
  creations: Creation[];
};

/** True for creations worth writing: finished, and therefore restorable. */
function isRestorable(creation: Creation): boolean {
  return creation.state.status === "ready";
}

/** Strips per-session fields that cannot survive a reload. */
function forStorage(creation: Creation): Creation {
  // Object URLs die with the document that created them.
  const { sketchUrl: _dropped, ...rest } = creation;
  return rest;
}

export function saveCreations(creations: Creation[]): void {
  try {
    const restorable = creations.filter(isRestorable).slice(-MAX_STORED).map(forStorage);
    const payload: StoredPayload = { version: STORAGE_VERSION, creations: restorable };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    // Quota exceeded, private browsing, storage disabled — none of which should
    // break a session that is otherwise working. Persistence is a bonus here,
    // not a requirement.
    console.warn("[sketch-to-3d] could not save creations", err);
  }
}

/**
 * Validates as it loads. The payload is user-writable (it is localStorage) and
 * a malformed entry reaching the renderer becomes a crash inside useFrame,
 * which kills the render loop rather than dropping one creation.
 */
export function loadCreations(): Creation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as StoredPayload).version !== STORAGE_VERSION ||
      !Array.isArray((parsed as StoredPayload).creations)
    ) {
      return [];
    }

    return (parsed as StoredPayload).creations
      .filter(isValidCreation)
      .slice(-MAX_STORED)
      .map(normalise);
  } catch (err) {
    console.warn("[sketch-to-3d] could not load creations", err);
    return [];
  }
}

function isValidCreation(value: unknown): value is Creation {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Creation;
  if (typeof candidate.id !== "string") return false;
  if (!Array.isArray(candidate.spawn?.position) || candidate.spawn.position.length !== 3) {
    return false;
  }
  if (candidate.state?.status !== "ready") return false;

  const { result } = candidate.state;
  if (!result) return false;
  // The URL is what actually gets loaded; without it there is nothing to show.
  return result.mode === "sprite"
    ? typeof result.spriteUrl === "string"
    : typeof result.glbUrl === "string";
}

/** Re-clamps on the way in, so an edited payload cannot place a creation underground. */
function normalise(creation: Creation): Creation {
  const transform = creation.transform ?? DEFAULT_TRANSFORM;
  return {
    ...creation,
    transform: {
      scale: clampScale(transform.scale ?? DEFAULT_TRANSFORM.scale),
      y: clampY(transform.y ?? DEFAULT_TRANSFORM.y),
    },
  };
}

export function clearStoredCreations(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do — see saveCreations.
  }
}
