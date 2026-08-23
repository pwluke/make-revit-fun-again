import { describe, expect, it } from "vitest";
import {
  GROUND_Y,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  clampY,
  heightFromDrag,
  scaleFromDrag,
} from "./transform";

describe("clampScale", () => {
  it("passes ordinary values through", () => {
    expect(clampScale(1)).toBe(1);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it("clamps both ends", () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(99)).toBe(MAX_SCALE);
  });
});

describe("clampY", () => {
  it("keeps a creation from sinking below the floor", () => {
    expect(clampY(-5)).toBe(GROUND_Y);
    expect(clampY(0)).toBe(GROUND_Y);
  });

  it("allows floating above it", () => {
    expect(clampY(3)).toBe(3);
  });
});

describe("scaleFromDrag", () => {
  it("keeps the scale when the pointer has not moved", () => {
    expect(scaleFromDrag(1, 100, 100)).toBe(1);
  });

  it("grows as the pointer moves away from the centre", () => {
    expect(scaleFromDrag(1, 100, 200)).toBe(2);
  });

  it("shrinks as the pointer moves toward the centre", () => {
    expect(scaleFromDrag(1, 100, 50)).toBe(0.5);
  });

  // Ratio, not delta: dragging 50px should double a small object and double a
  // large one, rather than moving both by the same absolute amount.
  it("is proportional to the starting scale", () => {
    expect(scaleFromDrag(2, 100, 200)).toBe(4);
  });

  it("clamps the result", () => {
    expect(scaleFromDrag(1, 100, 10_000)).toBe(MAX_SCALE);
    expect(scaleFromDrag(1, 100, 1)).toBe(MIN_SCALE);
  });

  // A drag begun exactly at the box centre has zero starting distance, which
  // would otherwise divide to Infinity and blow the object up instantly.
  it("survives a drag started at the centre", () => {
    expect(Number.isFinite(scaleFromDrag(1, 0, 250))).toBe(true);
    expect(scaleFromDrag(1, 0, 250)).toBe(1);
  });
});

describe("heightFromDrag", () => {
  // Screen Y grows downward, world Y grows upward. Inverting this is the
  // classic form of this bug, so it is pinned explicitly.
  it("raises the object when the pointer moves UP the screen", () => {
    expect(heightFromDrag(2, -100, 0.01)).toBeCloseTo(3);
  });

  it("lowers the object when the pointer moves DOWN the screen", () => {
    expect(heightFromDrag(2, 100, 0.01)).toBeCloseTo(1);
  });

  it("never drags below the ground", () => {
    expect(heightFromDrag(1, 10_000, 0.01)).toBe(GROUND_Y);
  });
});
