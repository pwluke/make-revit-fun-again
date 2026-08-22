import { describe, expect, it } from "vitest";
import { FAST_SPEED, MAX_WIDTH_SCALE, MIN_WIDTH_SCALE, SLOW_SPEED, widthAt } from "./taper";

describe("widthAt", () => {
  it("gives full width to a stationary cursor", () => {
    expect(widthAt(1, 0)).toBeCloseTo(MAX_WIDTH_SCALE);
  });

  it("gives full width at or below SLOW_SPEED", () => {
    expect(widthAt(1, SLOW_SPEED)).toBeCloseTo(MAX_WIDTH_SCALE);
  });

  it("gives minimum width at or above FAST_SPEED", () => {
    expect(widthAt(1, FAST_SPEED)).toBeCloseTo(MIN_WIDTH_SCALE);
    expect(widthAt(1, FAST_SPEED * 10)).toBeCloseTo(MIN_WIDTH_SCALE);
  });

  it("interpolates linearly in between", () => {
    const mid = (SLOW_SPEED + FAST_SPEED) / 2;
    expect(widthAt(1, mid)).toBeCloseTo((MAX_WIDTH_SCALE + MIN_WIDTH_SCALE) / 2);
  });

  it("scales with the base width", () => {
    expect(widthAt(0.5, 0)).toBeCloseTo(0.5 * MAX_WIDTH_SCALE);
  });
});
