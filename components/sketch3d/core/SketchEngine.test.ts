import { beforeEach, describe, expect, it } from "vitest";
import { SketchEngine } from "./SketchEngine";
import { MAX_SAMPLES } from "./projection";
import { createStrokeStore, WIDTHS, type StrokeStore } from "./strokeStore";
import type { CameraPose } from "./types";

const at = (x: number): CameraPose => ({ position: [x, 0, 0], forward: [0, 0, -1] });
const origin = at(0);

let store: StrokeStore;
let engine: SketchEngine;

beforeEach(() => {
  store = createStrokeStore();
  engine = new SketchEngine(store);
});

describe("stroke construction", () => {
  it("opens a stroke on pointerDown and seeds the first point", () => {
    engine.pointerDown(origin, 0);
    expect(store.getState().active).not.toBeNull();
    expect(store.getState().active!.points).toHaveLength(1);
    expect(engine.isDrawing).toBe(true);
  });

  it("appends a point once the cursor has moved far enough", () => {
    engine.pointerDown(origin, 0);
    engine.update(at(1), 100);
    expect(store.getState().active!.points).toHaveLength(2);
  });

  it("ignores a pose that has barely moved", () => {
    engine.pointerDown(origin, 0);
    engine.update(at(0.001), 16);
    expect(store.getState().active!.points).toHaveLength(1);
  });

  it("commits on pointerUp", () => {
    engine.pointerDown(origin, 0);
    engine.update(at(1), 100);
    engine.pointerUp();
    expect(store.getState().strokes).toHaveLength(1);
    expect(store.getState().active).toBeNull();
    expect(engine.isDrawing).toBe(false);
  });

  it("ignores update when no stroke is open", () => {
    engine.update(at(1), 100);
    expect(store.getState().active).toBeNull();
    expect(store.getState().strokes).toHaveLength(0);
  });

  it("stops sampling at MAX_SAMPLES but keeps the stroke open", () => {
    engine.pointerDown(origin, 0);
    for (let i = 1; i <= MAX_SAMPLES + 50; i++) engine.update(at(i * 0.5), i * 16);
    expect(store.getState().active!.points).toHaveLength(MAX_SAMPLES);
    expect(engine.isDrawing).toBe(true);
  });
});

describe("the parallel guard", () => {
  it("pauses sampling when the camera turns away, without closing the stroke", () => {
    engine.pointerDown(origin, 0);
    engine.update({ position: [0, 0, 0], forward: [1, 0, 0] }, 100);
    expect(store.getState().active!.points).toHaveLength(1);
    expect(engine.isDrawing).toBe(true);
  });

  it("resumes cleanly when the camera turns back", () => {
    engine.pointerDown(origin, 0);
    engine.update({ position: [0, 0, 0], forward: [1, 0, 0] }, 100);
    engine.update(at(1), 200);
    expect(store.getState().active!.points).toHaveLength(2);
  });

  it("does not spike the taper width across a long pause", () => {
    engine.pointerDown(origin, 0);
    engine.update(at(0.5), 500); // 1 m/s — establishes a slow pre-pause smoothed speed
    const preWidth = store.getState().active!.widths.at(-1)!;

    // Turn away for many frames. No points are recorded while paused.
    for (let i = 1; i <= 300; i++) {
      engine.update({ position: [0, 0, 0], forward: [1, 0, 0] }, 500 + i * 16);
    }
    expect(store.getState().active!.points).toHaveLength(2);

    // Turn back one frame later, having moved 1m across the ~4.8s pause. If the
    // engine measured that whole distance over a single frame's elapsed time, it
    // would compute a bogus ~60+ m/s spike and pin the width to the taper minimum.
    engine.update(at(1.5), 500 + 300 * 16 + 16);
    const resumedWidth = store.getState().active!.widths.at(-1)!;

    // The resumed sample should carry the pre-pause smoothed speed forward, not
    // a spike — so its width matches the pre-pause width rather than collapsing
    // toward MIN_WIDTH_SCALE.
    expect(resumedWidth).toBeCloseTo(preWidth, 10);
  });
});

describe("taper", () => {
  it("records a thinner width for a fast sweep than a slow one", () => {
    engine.pointerDown(origin, 0);
    engine.update(at(0.5), 500); // 1 m/s — slow
    const slow = store.getState().active!.widths.at(-1)!;

    engine.pointerUp();
    engine.pointerDown(origin, 1000);
    engine.update(at(5), 1100); // 50 m/s — fast
    const fast = store.getState().active!.widths.at(-1)!;

    expect(fast).toBeLessThan(slow);
  });

  it("uses the store's selected base width for the first point", () => {
    store.getState().cycleWidth(-9); // index 0
    engine.pointerDown(origin, 0);
    expect(store.getState().active!.widths[0]).toBeCloseTo(WIDTHS[0]);
  });

  it("survives a zero time delta without producing NaN", () => {
    engine.pointerDown(origin, 0);
    engine.update(at(1), 0);
    expect(store.getState().active!.widths.every(Number.isFinite)).toBe(true);
  });
});
