import { create } from "zustand";

/**
 * What the Sketch-to-3D activity makes available, and which drawing surface
 * currently owns the pointer.
 *
 * Sketch-to-3D is one feature with four entry points — `E` to generate, `B` to
 * draw 3D lines, a click to edit a creation, and the playground's 2D crayon
 * canvas — and they cannot all hold the mouse at once. This store is what makes
 * them exclusive.
 *
 * Why a store rather than props: the consumers do not share a React tree.
 * PaletteHUD, ControlBar and the crayon overlay are DOM siblings of the canvas,
 * while SelectionController lives *inside* `<Canvas>`. A zustand store is the
 * only thing all of them can read, and it is the idiom the rest of
 * components/world already uses.
 *
 * The defaults are chosen so /minecraft works without touching this module at
 * all — it is the unrestricted sandbox with no activity rail:
 *
 *   `enabled: true`  — E, B and creation editing all work there, always. The
 *                      gate is opt-in NARROWING, so a host that forgets to wire
 *                      it fails open (works) rather than closed (dead keys with
 *                      nothing on screen to explain why).
 *   `crayonAvailable: false` — the 2D crayon canvas is a playground-only
 *                      surface. /minecraft must not show a Crayon button for a
 *                      thing it does not render.
 *
 * Only the playground narrows these, and it restores the defaults on unmount so
 * a client-side navigation from / to /minecraft cannot leave the sandbox gated.
 */
type SketchTools = {
  /** Sketch-to-3D is available: `E`, `B`, and selecting a creation to edit. */
  enabled: boolean;
  /** This host renders a 2D crayon surface, so the Crayon mode exists here. */
  crayonAvailable: boolean;
  /** The crayon surface currently owns the pointer. */
  crayon: boolean;
  setCrayon: (crayon: boolean) => void;
  /** Apply a host's whole capability set at once — see the playground's mode effect. */
  configure: (next: Pick<SketchTools, "enabled" | "crayonAvailable" | "crayon">) => void;
};

export const useSketchTools = create<SketchTools>((set) => ({
  enabled: true,
  crayonAvailable: false,
  crayon: false,
  setCrayon: (crayon) =>
    set((state) => (state.crayon === crayon ? state : { crayon })),
  configure: (next) =>
    set((state) =>
      state.enabled === next.enabled &&
      state.crayonAvailable === next.crayonAvailable &&
      state.crayon === next.crayon
        ? state
        : next,
    ),
}));

/** Read outside React — the key and pointer handlers are all imperative. */
export const toolsEnabled = () => useSketchTools.getState().enabled;

/** The permissive default, restored when a narrowing host unmounts. */
export const SANDBOX_TOOLS = {
  enabled: true,
  crayonAvailable: false,
  crayon: false,
} as const;
