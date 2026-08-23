/** Ring: core. Pure TypeScript — no three, no React. */
import type { CameraPose, Plane, Vec3 } from "./types";
import { add, cross, distance, dot, scale, sub } from "./vec";

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

/**
 * Below this, the drawing plane is treated as parallel to the ground and there is
 * no meaningful line to draw. Reached by looking almost straight up or down.
 */
export const GROUND_PARALLEL_EPSILON = 1e-3;

/**
 * Where the drawing plane meets the ground.
 *
 * The plane is invisible, which makes it genuinely hard to tell where a stroke
 * will land in space. Its intersection with the ground is always a HORIZONTAL
 * line — any non-horizontal plane cuts a horizontal plane in one — so drawing
 * that single line tells you where you are about to draw without cluttering the
 * view with a grid or a translucent quad.
 *
 * Returns null when the plane is (near) parallel to the ground, i.e. the player
 * is looking almost straight up or down and no such line exists.
 */
export function planeGroundLine(
  plane: Plane,
  groundY = 0,
): { point: Vec3; direction: Vec3 } | null {
  const normal = plane.normal;

  // cross(normal, up) — horizontal by construction, since its y term cancels.
  const alongX = -normal[2];
  const alongZ = normal[0];
  const length = Math.hypot(alongX, alongZ);
  if (length < GROUND_PARALLEL_EPSILON) return null;
  const direction: Vec3 = [alongX / length, 0, alongZ / length];

  // Perpendicular to `direction` but still lying IN the plane: the plane's own
  // steepest-slope axis. Walking along it from plane.point is how we reach ground
  // height without leaving the plane.
  const slope = cross(direction, normal);
  if (Math.abs(slope[1]) < GROUND_PARALLEL_EPSILON) return null;

  const t = (groundY - plane.point[1]) / slope[1];
  const hit = add(plane.point, scale(slope, t));

  // Pin y exactly rather than trusting the arithmetic — this value is fed
  // straight to a mesh position and drifting off the ground would z-fight.
  return { point: [hit[0], groundY, hit[2]], direction };
}

/** Guards 2 and 3 from the spec: minimum spacing and the sample cap. */
export function shouldSample(last: Vec3 | undefined, candidate: Vec3, count: number): boolean {
  if (count >= MAX_SAMPLES) return false;
  if (!last) return true;
  return distance(last, candidate) >= MIN_SAMPLE_DISTANCE;
}
