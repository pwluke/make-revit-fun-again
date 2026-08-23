import { describe, expect, it } from "vitest";
import type { CameraPose } from "./types";
import {
  DRAW_DISTANCE,
  MAX_SAMPLES,
  freezePlane,
  planeGroundLine,
  projectOntoPlane,
  shouldSample,
} from "./projection";

/** Three's default camera forward is -Z. */
const origin: CameraPose = { position: [0, 0, 0], forward: [0, 0, -1] };
const SQRT_HALF = Math.SQRT1_2;

describe("freezePlane", () => {
  it("places the plane DRAW_DISTANCE ahead, facing the camera", () => {
    const plane = freezePlane(origin);
    expect(plane.point).toEqual([0, 0, -DRAW_DISTANCE]);
    expect(plane.normal).toEqual([-0, -0, 1]);
  });

  it("honours a custom distance", () => {
    expect(freezePlane(origin, 10).point).toEqual([0, 0, -10]);
  });
});

describe("projectOntoPlane", () => {
  it("returns the plane centre when the pose has not moved", () => {
    const plane = freezePlane(origin);
    const hit = projectOntoPlane(origin, plane)!;
    expect(hit[0]).toBeCloseTo(0);
    expect(hit[1]).toBeCloseTo(0);
    expect(hit[2]).toBeCloseTo(-DRAW_DISTANCE);
  });

  it("moves the hit sideways as the camera turns", () => {
    const plane = freezePlane(origin);
    // Turned 45 degrees to the right: forward is now [+sin45, 0, -cos45].
    const turned: CameraPose = { position: [0, 0, 0], forward: [SQRT_HALF, 0, -SQRT_HALF] };
    const hit = projectOntoPlane(turned, plane)!;
    expect(hit[0]).toBeCloseTo(DRAW_DISTANCE);
    expect(hit[2]).toBeCloseTo(-DRAW_DISTANCE);
  });

  it("moves the hit when the camera walks, because the plane does not follow", () => {
    const plane = freezePlane(origin);
    const strafed: CameraPose = { position: [1, 0, 0], forward: [0, 0, -1] };
    const hit = projectOntoPlane(strafed, plane)!;
    expect(hit[0]).toBeCloseTo(1);
    expect(hit[2]).toBeCloseTo(-DRAW_DISTANCE);
  });

  it("returns null when the camera turns parallel to the plane", () => {
    const plane = freezePlane(origin);
    const sideways: CameraPose = { position: [0, 0, 0], forward: [1, 0, 0] };
    expect(projectOntoPlane(sideways, plane)).toBeNull();
  });

  it("returns null when the camera turns away from the plane", () => {
    const plane = freezePlane(origin);
    const away: CameraPose = { position: [0, 0, 0], forward: [0, 0, 1] };
    expect(projectOntoPlane(away, plane)).toBeNull();
  });

  it("returns null when the camera has walked past the plane", () => {
    const plane = freezePlane(origin);
    const past: CameraPose = { position: [0, 0, -10], forward: [0, 0, -1] };
    expect(projectOntoPlane(past, plane)).toBeNull();
  });
});

describe("planeGroundLine", () => {
  it("puts the line directly below the plane centre when standing level", () => {
    // Camera at head height looking level: the plane is vertical, so its ground
    // line runs straight under the point it was frozen at.
    const pose: CameraPose = { position: [0, 1.6, 0], forward: [0, 0, -1] };
    const line = planeGroundLine(freezePlane(pose))!;
    expect(line.point[0]).toBeCloseTo(0);
    expect(line.point[1]).toBe(0);
    expect(line.point[2]).toBeCloseTo(-DRAW_DISTANCE);
  });

  it("returns a horizontal direction, always", () => {
    const tilted: CameraPose = {
      position: [0, 1.6, 0],
      forward: [0.3, -0.5, -0.81],
    };
    const line = planeGroundLine(freezePlane(tilted))!;
    expect(line.direction[1]).toBe(0);
    expect(Math.hypot(...line.direction)).toBeCloseTo(1);
  });

  it("runs perpendicular to the way the camera is facing", () => {
    // Facing -Z, so the plane's ground line runs left-right along X.
    const pose: CameraPose = { position: [0, 1.6, 0], forward: [0, 0, -1] };
    const line = planeGroundLine(freezePlane(pose))!;
    expect(Math.abs(line.direction[0])).toBeCloseTo(1);
    expect(Math.abs(line.direction[2])).toBeCloseTo(0);
  });

  it("keeps the returned point on the plane itself", () => {
    const pose: CameraPose = { position: [2, 1.6, -3], forward: [0.4, -0.3, -0.87] };
    const plane = freezePlane(pose);
    const line = planeGroundLine(plane)!;
    // dot(point - planePoint, normal) == 0 is the definition of "on the plane".
    const offset = [
      line.point[0] - plane.point[0],
      line.point[1] - plane.point[1],
      line.point[2] - plane.point[2],
    ];
    const onPlane =
      offset[0] * plane.normal[0] + offset[1] * plane.normal[1] + offset[2] * plane.normal[2];
    expect(onPlane).toBeCloseTo(0);
  });

  it("honours a non-zero ground height", () => {
    const pose: CameraPose = { position: [0, 5, 0], forward: [0, 0, -1] };
    expect(planeGroundLine(freezePlane(pose), 2)!.point[1]).toBe(2);
  });

  // Looking straight down makes the drawing plane horizontal, so it never meets
  // the ground in a line — it is parallel to it.
  it("returns null when looking straight down", () => {
    const pose: CameraPose = { position: [0, 5, 0], forward: [0, -1, 0] };
    expect(planeGroundLine(freezePlane(pose))).toBeNull();
  });

  it("returns null when looking straight up", () => {
    const pose: CameraPose = { position: [0, 5, 0], forward: [0, 1, 0] };
    expect(planeGroundLine(freezePlane(pose))).toBeNull();
  });
});

describe("shouldSample", () => {
  it("always accepts the first point", () => {
    expect(shouldSample(undefined, [0, 0, 0], 0)).toBe(true);
  });

  it("rejects points closer than MIN_SAMPLE_DISTANCE", () => {
    expect(shouldSample([0, 0, 0], [0.01, 0, 0], 1)).toBe(false);
  });

  it("accepts points at or beyond MIN_SAMPLE_DISTANCE", () => {
    expect(shouldSample([0, 0, 0], [0.02, 0, 0], 1)).toBe(true);
  });

  it("rejects everything once MAX_SAMPLES is reached", () => {
    expect(shouldSample([0, 0, 0], [5, 5, 5], MAX_SAMPLES)).toBe(false);
  });
});
