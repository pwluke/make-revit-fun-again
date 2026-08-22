/** Ring: core. Pure TypeScript — no three, no React. */
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Plane, Stroke, Vec3 } from "./types";

/** Saturated, dark values — pastels do not read at booth distance or on a projector. */
export const PALETTE = ["#e5352b", "#f07d1a", "#f5c518", "#3aa655", "#2b6ee5", "#8b3ae0"] as const;

/** Base ribbon widths in metres. */
export const WIDTHS = [0.02, 0.05, 0.12] as const;

/** Draw-call ceiling. One committed stroke is one mesh. */
export const MAX_STROKES = 300;

export type SketchState = {
  strokes: Stroke[];
  active: Stroke | null;
  colorIndex: number;
  widthIndex: number;
  drawMode: boolean;

  beginStroke: (plane: Plane) => void;
  appendPoint: (point: Vec3, width: number) => void;
  commitStroke: () => void;
  cancelStroke: () => void;
  undo: () => void;
  clear: () => void;
  setColorIndex: (index: number) => void;
  cycleWidth: (delta: number) => void;
  toggleDrawMode: () => void;
};

export type StrokeStore = StoreApi<SketchState>;

let nextId = 0;
const makeId = () => `stroke-${nextId++}`;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createStrokeStore(): StrokeStore {
  return createStore<SketchState>((set, get) => ({
    strokes: [],
    active: null,
    colorIndex: 0,
    widthIndex: 1,
    drawMode: false,

    beginStroke: (plane) =>
      set((state) => ({
        active: {
          id: makeId(),
          points: [],
          widths: [],
          color: PALETTE[state.colorIndex],
          plane,
        },
      })),

    appendPoint: (point, width) =>
      set((state) =>
        state.active
          ? {
              active: {
                ...state.active,
                points: [...state.active.points, point],
                widths: [...state.active.widths, width],
              },
            }
          : state,
      ),

    commitStroke: () =>
      set((state) => {
        const { active } = state;
        if (!active) return state;
        // A stroke that never received a point is not a stroke.
        if (active.points.length === 0) return { active: null };
        const strokes = [...state.strokes, active];
        return {
          active: null,
          strokes: strokes.length > MAX_STROKES ? strokes.slice(strokes.length - MAX_STROKES) : strokes,
        };
      }),

    cancelStroke: () => set((state) => (state.active ? { active: null } : state)),

    // Undo means "take back what I just did" — mid-stroke, that is the stroke in progress.
    undo: () =>
      set((state) => {
        if (state.active) return { active: null };
        if (state.strokes.length === 0) return state;
        return { strokes: state.strokes.slice(0, -1) };
      }),

    clear: () =>
      set((state) => (state.strokes.length === 0 && state.active === null ? state : { strokes: [], active: null })),

    setColorIndex: (index) =>
      set((state) => (index >= 0 && index < PALETTE.length ? { colorIndex: index } : state)),

    cycleWidth: (delta) =>
      set((state) => {
        const widthIndex = clamp(state.widthIndex + delta, 0, WIDTHS.length - 1);
        return widthIndex === state.widthIndex ? state : { widthIndex };
      }),

    toggleDrawMode: () => set((state) => ({ drawMode: !state.drawMode, active: null })),
  }));
}

/** The app-wide instance. `r3f/`, `ui/` and `components/minecraft/Cube.tsx` all read this one. */
export const sketchStore = createStrokeStore();
