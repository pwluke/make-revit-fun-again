/**
 * Selection transform maths for creations — scale and height.
 *
 * Pure arithmetic, no three.js and no React, so the fiddly parts (a drag that
 * inverts through the centre, a height that sinks below the floor) are testable
 * without a renderer. See the layering note in `./types`.
 */

export type CreationTransform = {
  /** Uniform multiplier on the creation's normalised size. 1 = as generated. */
  scale: number;
  /** World height of the creation's BASE. Matches the spawn convention. */
  y: number;
};

export const MIN_SCALE = 0.25;
export const MAX_SCALE = 4;

/** The ground mesh sits at y=0; a hair above avoids z-fighting with it. */
export const GROUND_Y = 0.05;

export const DEFAULT_TRANSFORM: CreationTransform = { scale: 1, y: GROUND_Y };

export const clampScale = (scale: number): number =>
  Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/** Never below the floor — a creation under the ground is invisible. */
export const clampY = (y: number): number => Math.max(GROUND_Y, y);

/**
 * Scale from a corner-handle drag, Photoshop style: the further the pointer gets
 * from the box's centre, the bigger the object.
 *
 * Uses a RATIO of distances rather than a delta so the object tracks the corner
 * under the cursor at any starting size — a fixed pixels-to-scale factor feels
 * wrong on a small object and uncontrollable on a large one.
 *
 * `startDistance` is guarded because a drag begun exactly at the centre would
 * otherwise divide by zero and send the scale to Infinity.
 */
export function scaleFromDrag(
  startScale: number,
  startDistance: number,
  currentDistance: number,
): number {
  if (startDistance < 1) return clampScale(startScale);
  return clampScale(startScale * (currentDistance / startDistance));
}

/**
 * Height from a vertical drag. Screen Y grows downward and world Y grows upward,
 * hence the negation — getting this backwards is the classic version of this bug.
 *
 * `worldPerPixel` is supplied by the caller, which is the only part that needs a
 * camera: how much world space one screen pixel covers at the object's distance.
 */
export function heightFromDrag(
  startY: number,
  pixelDeltaY: number,
  worldPerPixel: number,
): number {
  return clampY(startY - pixelDeltaY * worldPerPixel);
}
