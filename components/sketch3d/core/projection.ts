/** Ring: core. Pure TypeScript — no three, no React. */
import type { CameraPose, Plane, Vec3 } from "./types";
import { add, distance, dot, scale, sub } from "./vec";

/** Metres ahead of the camera where a stroke's plane freezes. */
export const DRAW_DISTANCE = 4;
/** Minimum gap between samples. Below this, segments collapse and tangents go NaN. */
export const MIN_SAMPLE_DISTANCE = 0.02;
/** Hard cap on samples per stroke — bounds memory and geometry. */
export const MAX_SAMPLES = 512;
/**
 * Reject rays that are near-parallel to the plane. `dot(forward, normal)` is -1 when
 * facing the plane head-on and rises toward +1 as you turn away; anything above this
 * threshold sends the intersection toward infinity.
 */
export const PARALLEL_EPSILON = -0.05;

/** Freeze a plane DRAW_DISTANCE ahead of the camera, facing back at it. */
export function freezePlane(pose: CameraPose, distance = DRAW_DISTANCE): Plane {
  return {
    point: add(pose.position, scale(pose.forward, distance)),
    normal: scale(pose.forward, -1),
  };
}

/**
 * Intersect the crosshair ray with a frozen plane.
 * Returns null when the ray is near-parallel, facing away, or the plane is behind —
 * all of which mean "pause sampling", not "error".
 */
export function projectOntoPlane(pose: CameraPose, plane: Plane): Vec3 | null {
  const denominator = dot(pose.forward, plane.normal);
  if (denominator > PARALLEL_EPSILON) return null;

  const t = dot(sub(plane.point, pose.position), plane.normal) / denominator;
  if (t <= 0) return null;

  return add(pose.position, scale(pose.forward, t));
}

/** Guards 2 and 3 from the spec: minimum spacing and the sample cap. */
export function shouldSample(last: Vec3 | undefined, candidate: Vec3, count: number): boolean {
  if (count >= MAX_SAMPLES) return false;
  if (!last) return true;
  return distance(last, candidate) >= MIN_SAMPLE_DISTANCE;
}
