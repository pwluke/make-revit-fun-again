import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plane } from "./types";
import { MAX_STROKES, PALETTE, WIDTHS, createStrokeStore, type StrokeStore } from "./strokeStore";

const plane: Plane = { point: [0, 0, -4], normal: [0, 0, 1] };

let store: StrokeStore;
beforeEach(() => {
  store = createStrokeStore();
});

const drawOne = () => {
  store.getState().beginStroke(plane);
  store.getState().appendPoint([0, 0, -4], 0.05);
  store.getState().appendPoint([1, 0, -4], 0.05);
  store.getState().commitStroke();
};

describe("stroke lifecycle", () => {
  it("starts empty with no active stroke", () => {
    expect(store.getState().strokes).toHaveLength(0);
    expect(store.getState().active).toBeNull();
  });

  it("commits an active stroke into the list", () => {
    drawOne();
    expect(store.getState().strokes).toHaveLength(1);
    expect(store.getState().strokes[0].points).toHaveLength(2);
    expect(store.getState().active).toBeNull();
  });

  it("uses the currently selected colour and records the plane", () => {
    store.getState().setColorIndex(3);
    drawOne();
    expect(store.getState().strokes[0].color).toBe(PALETTE[3]);
    expect(store.getState().strokes[0].plane).toEqual(plane);
  });

  it("drops a stroke that never got a point", () => {
    store.getState().beginStroke(plane);
    store.getState().commitStroke();
    expect(store.getState().strokes).toHaveLength(0);
    expect(store.getState().active).toBeNull();
  });

  it("keeps a one-point stroke — it renders as a dot", () => {
    store.getState().beginStroke(plane);
    store.getState().appendPoint([0, 0, -4], 0.05);
    store.getState().commitStroke();
    expect(store.getState().strokes).toHaveLength(1);
    expect(store.getState().strokes[0].points).toHaveLength(1);
  });

  it("gives every stroke a distinct id", () => {
    drawOne();
    drawOne();
    const [a, b] = store.getState().strokes;
    expect(a.id).not.toBe(b.id);
  });
});

describe("undo", () => {
  it("removes the last committed stroke", () => {
    drawOne();
    drawOne();
    store.getState().undo();
    expect(store.getState().strokes).toHaveLength(1);
  });

  it("cancels the active stroke instead, leaving committed strokes alone", () => {
    drawOne();
    store.getState().beginStroke(plane);
    store.getState().appendPoint([0, 0, -4], 0.05);
    store.getState().undo();
    expect(store.getState().active).toBeNull();
    expect(store.getState().strokes).toHaveLength(1);
  });

  it("is a no-op on an empty store", () => {
    expect(() => store.getState().undo()).not.toThrow();
    expect(store.getState().strokes).toHaveLength(0);
  });
});

describe("stroke cap", () => {
  it("drops the oldest stroke past MAX_STROKES", () => {
    for (let i = 0; i < MAX_STROKES + 1; i++) drawOne();
    expect(store.getState().strokes).toHaveLength(MAX_STROKES);
  });

  it("keeps the newest stroke when it evicts", () => {
    for (let i = 0; i < MAX_STROKES; i++) drawOne();
    const firstId = store.getState().strokes[0].id;
    drawOne();
    expect(store.getState().strokes.map((s) => s.id)).not.toContain(firstId);
  });
});

describe("tool selection", () => {
  it("clamps the width index rather than wrapping", () => {
    store.getState().cycleWidth(-5);
    expect(store.getState().widthIndex).toBe(0);
    store.getState().cycleWidth(99);
    expect(store.getState().widthIndex).toBe(WIDTHS.length - 1);
  });

  it("ignores an out-of-range colour index", () => {
    store.getState().setColorIndex(99);
    expect(store.getState().colorIndex).toBe(0);
  });

  it("toggles draw mode", () => {
    expect(store.getState().drawMode).toBe(false);
    store.getState().toggleDrawMode();
    expect(store.getState().drawMode).toBe(true);
  });

  it("cancels an active stroke when draw mode is switched off", () => {
    store.getState().toggleDrawMode();
    store.getState().beginStroke(plane);
    store.getState().toggleDrawMode();
    expect(store.getState().active).toBeNull();
  });
});

describe("clear", () => {
  it("removes every stroke and any active one", () => {
    drawOne();
    store.getState().beginStroke(plane);
    store.getState().clear();
    expect(store.getState().strokes).toHaveLength(0);
    expect(store.getState().active).toBeNull();
  });
});

describe("idempotent no-ops do not notify subscribers", () => {
  it("undo on an empty store does not notify", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().undo();
    expect(listener).not.toHaveBeenCalled();
  });

  it("cancelStroke with no active stroke does not notify", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().cancelStroke();
    expect(listener).not.toHaveBeenCalled();
  });

  it("clear on an empty store does not notify", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().clear();
    expect(listener).not.toHaveBeenCalled();
  });

  it("cycleWidth(-1) when widthIndex is already 0 does not notify", () => {
    store.getState().cycleWidth(-5);
    expect(store.getState().widthIndex).toBe(0);
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().cycleWidth(-1);
    expect(listener).not.toHaveBeenCalled();
  });

  it("commitStroke with no active stroke does not notify", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().commitStroke();
    expect(listener).not.toHaveBeenCalled();
  });

  it("positive control: cancelStroke DOES notify when it actually clears an active stroke", () => {
    store.getState().beginStroke(plane);
    const listener = vi.fn();
    store.subscribe(listener);
    store.getState().cancelStroke();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getState().active).toBeNull();
  });
});
