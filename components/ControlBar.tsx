"use client";

import { useStore } from "zustand";
import { useGestureStore } from "@/components/gesture/store";
import { creationStore } from "@/components/sketch-to-3d/core/creationStore";
import { sketchStore } from "@/components/sketch3d/core/strokeStore";
import { useSketchTools } from "@/components/world/sketchTools";

type Mode = "look" | "crayon" | "draw" | "hands";

/**
 * Clickable look / draw / hands switcher.
 *
 * Pointer lock hides the cursor, so while you are looking around this is only
 * a display — Esc (or Hands) gives the cursor back, then the buttons work.
 * The three modes share one mouse: Look is FPS pointer-lock (main's default),
 * Draw is the in-world 3D lines (B), Hands is the gesture camera.
 */
export function ControlBar({ onCreate }: { onCreate?: () => void } = {}) {
  const drawMode = useStore(sketchStore, (state) => state.drawMode);
  const handsOn = useGestureStore((state) => state.active);
  // Draw is only offered where Sketch-to-3D is available: always on /minecraft,
  // and in the playground only in its "Sketch to 3D" mode. Disabled rather than
  // hidden, so the bar keeps its shape and the player can see the mode exists —
  // a control that vanishes reads as a bug, one that greys out reads as "not
  // here". Matches `B` being inert under the same condition.
  const canDraw = useSketchTools((state) => state.enabled);
  // Crayon is different: it is HIDDEN where it does not exist rather than
  // greyed, because /minecraft renders no 2D crayon surface at all. Greying it
  // there would advertise a mode that page can never enter.
  const hasCrayon = useSketchTools((state) => state.crayonAvailable);
  const crayonOn = useSketchTools((state) => state.crayon);

  // Priority order matters: exactly one of these is ever true, because setMode
  // below sets all four together, but deriving rather than storing a fifth copy
  // of "the mode" keeps the existing stores authoritative.
  const mode: Mode = handsOn
    ? "hands"
    : drawMode
      ? "draw"
      : crayonOn
        ? "crayon"
        : "look";

  return (
    // White rather than the translucent black it started as, matching ThemeHud's
    // swatch strip — the light chrome is what this codebase uses for things you
    // click, and the dark pills for things you only read.
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/90 p-1 font-sans shadow-lg ring-1 ring-slate-900/10 backdrop-blur-sm">
      <ModeButton
        label="Look"
        hotkey="click"
        active={mode === "look"}
        onClick={() => setMode("look")}
      />
      {hasCrayon ? (
        <ModeButton
          label="Crayon"
          hotkey=""
          active={mode === "crayon"}
          title="Draw flat on the picture"
          onClick={() => setMode("crayon")}
        />
      ) : null}
      <ModeButton
        label="Draw"
        hotkey="B"
        active={mode === "draw"}
        disabled={!canDraw}
        title={canDraw ? undefined : "Switch to Sketch to 3D to draw"}
        onClick={() => setMode("draw")}
      />
      <ModeButton
        label="Hands"
        hotkey=""
        active={mode === "hands"}
        onClick={() => setMode("hands")}
      />

      {/* `E` is an ACTION, not a mode — it opens the generate overlay and
          returns you to whatever mode you were in. Hence the divider: the three
          buttons to the left are a radio group, this is a push button.

          It lives here because the E/B hint strip was removed and nothing else
          advertised `E`, leaving the single most important entry point in the
          app undiscoverable. A button rather than a tip also gives it a
          pointer-driven route: press Esc for the cursor, then click. */}
      {onCreate ? (
        <>
          <span aria-hidden className="mx-0.5 h-6 w-px bg-slate-900/15" />
          <ModeButton
            label="Make"
            hotkey="E"
            active={false}
            disabled={!canDraw}
            title={
              canDraw
                ? "Draw a picture and turn it into a 3D thing"
                : "Switch to Sketch to 3D to make something"
            }
            onClick={onCreate}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Enter one input mode and leave the other three.
 *
 * Written as four unconditional assignments rather than a branch per mode: the
 * modes are mutually exclusive by construction, so there is no ordering of
 * partial updates in which two of them are briefly on together. The previous
 * per-branch version had to remember to turn off every other mode in every
 * branch, which is exactly the kind of thing that rots when a fourth is added.
 */
function setMode(next: Mode) {
  const bridge = creationStore.getState().bridge;

  sketchStore.getState().setDrawMode(next === "draw");
  useGestureStore.getState().setActive(next === "hands");
  useSketchTools.getState().setCrayon(next === "crayon");
  // Leaving any mode also drops a selection: the bounding box is a fifth thing
  // that wants the mouse, and it must not survive into Hands or Crayon.
  creationStore.getState().select(null);

  // Hands and Crayon need a real cursor — the gesture camera drives the view
  // itself, and the crayon canvas is drawn on with the pointer. Look and Draw
  // are both pointer-locked, first-person modes.
  //
  // For Look this re-locks if the controls are already mounted (Esc'd out).
  // Coming from Hands, LookLock remounts on the next paint and the following
  // click on the world is what actually grabs the pointer, same as main.
  bridge?.setInputEnabled(next === "look" || next === "draw");
}

function ModeButton({
  label,
  hotkey,
  active,
  disabled = false,
  title,
  onClick,
}: {
  label: string;
  hotkey: string;
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={(event) => {
        // Don't let the click bubble into a look-lock listener if this bar
        // ever sits inside the canvas host.
        event.stopPropagation();
        onClick();
      }}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-emerald-600 text-white"
          : disabled
            ? "cursor-not-allowed text-slate-400"
            : "text-slate-600 hover:bg-slate-900/10 hover:text-slate-900"
      }`}
    >
      {/* The keycap has to follow the button, not the bar: the active button is
          still emerald, so a light cap reads there, while an inactive one now
          sits on white and needs a dark cap to be legible at all. */}
      {hotkey ? (
        <kbd
          className={`rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-bold ${
            active ? "bg-white/25 text-white" : "bg-slate-900/10 text-slate-500"
          }`}
        >
          {hotkey}
        </kbd>
      ) : null}
      {label}
    </button>
  );
}
