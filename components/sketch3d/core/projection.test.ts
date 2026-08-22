import { describe, expect, it } from "vitest";
import type { CameraPose } from "./types";
import {
  DRAW_DISTANCE,
  MAX_SAMPLES,
  freezePlane,
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
