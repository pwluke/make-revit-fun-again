/**
 * Shared contracts for the sketch-to-3D block.
 *
 * This file must never import React or three.js. It is the base of a layering
 * rule that makes the whole block portable: `core/` and `ui/` compile with
 * `three` and `@react-three/*` uninstalled, so moving to a different renderer
 * means replacing `r3f/` and nothing else.
 */

import type { CreationTransform } from "./transform";

export type { CreationTransform };

export type SpawnTransform = {
  position: [number, number, number];
  rotationY: number;
};

/**
 * Which generation pipeline produced (or will produce) a creation. Exactly one
 * is active per creation — there is no hybrid, no auto-upgrade from sprite to
 * mesh, no swapping one for the other after the fact.
 *
 * "sprite": 2.5D billboard, ~10s, ~$0.05 — fast, for a booth queue.
 * "mesh": full 3D model, ~117s, ~$0.525 — the real thing, walk around it.
 * "fast": full 3D model via TRELLIS, ~23s, ~$0.02 — measured 2026-08-22, see
 *   scripts/bench-trellis.mjs. Same deliverable as "mesh" (a walkable GLB) at
 *   6.5x the speed, 26x less cost and a 23x smaller payload. It is a separate
 *   mode rather than a replacement because TRELLIS cannot read line art: it
 *   needs a ControlNet bridge stage, and that stage's fidelity on genuinely
 *   wobbly children's drawings is still unproven (n=1, on clean line art).
 */
export type CreationMode = "sprite" | "mesh" | "fast";

/**
 * What a generator actually produced. A discriminated union rather than two optional
 * URLs so that "neither" and "both" are unrepresentable, and so the renderer switches
 * on the result's own tag — it cannot disagree with what was really generated.
 */
export type GenerationResult =
  | { mode: "mesh"; glbUrl: string }
  | { mode: "fast"; glbUrl: string }
  | { mode: "sprite"; spriteUrl: string };

/** The one interface every generator implements. Adding a third is one more impl. */
export type Generate = (
  png: Blob,
  prompt: string,
  onProgress: (progress: Progress) => void,
) => Promise<GenerationResult>;

/**
 * Lifecycle of one generation.
 *
 * There is deliberately no `idle` state: a Creation only exists once the user has
 * submitted one. "Idle" is the absence of an in-flight job, not a job in an idle
 * state — modelling it otherwise leaves a permanent phantom creation in the store.
 */
export type JobState =
  | { status: "uploading" }
  | {
      status: "generating";
      message: string;
      /**
       * An intermediate artifact worth showing before the real result lands.
       *
       * Fast mode's ControlNet bridge produces a coloured picture of the drawing
       * in ~2.3s, while the mesh takes ~16s more. Showing it turns a ~19s wait
       * into a ~3s one for the child, who sees something of theirs immediately
       * and can walk around while the geometry finishes.
       *
       * Optional because only fast mode has such an artifact: mesh and sprite
       * produce nothing meaningful until they are done.
       */
      previewUrl?: string;
    }
  | { status: "ready"; result: GenerationResult; thumbnailUrl?: string }
  | { status: "error"; message: string; retryable: boolean };

/** One thing the user made. `spawn` is captured at submit time and never recomputed. */
export type Creation = {
  id: string;
  /** What the user actually typed, for display. */
  userText: string;
  /** The full prompt sent to the model, style suffix included. */
  prompt: string;
  /**
   * Which pipeline this creation was REQUESTED through. Fixed for its lifetime.
   * The result's own `mode` tag (in `JobState`'s ready variant) records what was
   * actually PRODUCED — a different fact, so it lives in a different field.
   */
  mode: CreationMode;
  spawn: SpawnTransform;
  /**
   * An object URL for the PNG the user actually drew.
   *
   * Shown in the world from the instant they submit, so there is never a moment
   * where their drawing has vanished and nothing of theirs has appeared yet.
   * Fast mode later replaces it with the coloured bridge image; the other two
   * modes keep it for the whole wait, which for the ~105s mesh path is the
   * difference between watching a placeholder box and watching your own drawing.
   *
   * Optional so a Creation restored from anywhere other than a live submit is
   * still representable.
   */
  sketchUrl?: string;
  /**
   * Player-applied scale and height, edited via the selection bounding box.
   *
   * Separate from `spawn`, which records where the creation was BORN and is
   * never recomputed. This is where the player has since put it — two different
   * facts, so two different fields.
   */
  transform: CreationTransform;
  state: JobState;
};

/**
 * Phase-tagged progress, so the store maps directly and never infers a transition.
 *
 * `pct` is optional on purpose: the mesh path gets no percentage from fal (only
 * IN_QUEUE / IN_PROGRESS plus log lines), so inventing one would be dishonest — the
 * UI renders an indeterminate pulse when it is absent. The sprite path has two known
 * sub-steps and can populate it.
 */
export type Progress =
  | { phase: "uploading" }
  | {
      phase: "generating";
      message: string;
      pct?: number;
      /** See `JobState`'s generating variant — an intermediate artifact to show early. */
      previewUrl?: string;
    };

/**
 * The seam that makes this block renderer-agnostic.
 *
 * The block never calls into the scene. The scene registers a bridge and the
 * block calls back through it — dependency inversion, which is what lets the
 * same `core/` and `ui/` drive an R3F scene, a vanilla three.js scene, or a test.
 */
export interface SceneBridge {
  /** Where should the next creation appear? Called at submit time, not on arrival. */
  getSpawnTransform(): SpawnTransform;

  /** Called once a creation reaches `ready`. */
  onModelReady(creation: Creation): void;

  /**
   * Called when draw mode opens and closes.
   *
   * The portable answer to pointer lock: R3F calls `controls.unlock()`,
   * OrbitControls sets `enabled = false`, another scene does whatever it needs.
   * The overlay stays ignorant of which.
   */
  setInputEnabled(enabled: boolean): void;
}
