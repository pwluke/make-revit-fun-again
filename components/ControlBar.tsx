"use client";

import { useStore } from "zustand";
import { useGestureStore } from "@/components/gesture/store";
import { creationStore } from "@/components/sketch-to-3d/core/creationStore";
import { sketchStore } from "@/components/sketch3d/core/strokeStore";

type Mode = "look" | "draw" | "hands";

/**
 * Clickable look / draw / hands switcher.
 *
 * Pointer lock hides the cursor, so while you are looking around this is only
 * a display — Esc (or Hands) gives the cursor back, then the buttons work.
 * The three modes share one mouse: Look is FPS pointer-lock (main's default),
 * Draw is the in-world 3D lines (B), Hands is the gesture camera.
 */
export function ControlBar() {
  const drawMode = useStore(sketchStore, (state) => state.drawMode);
  const handsOn = useGestureStore((state) => state.active);
  const mode: Mode = handsOn ? "hands" : drawMode ? "draw" : "look";

  return (
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 p-1 font-sans backdrop-blur-sm">
      <ModeButton
        label="Look"
        hotkey="click"
        active={mode === "look"}
        onClick={() => setMode("look")}
      />
      <ModeButton
        label="Draw"
        hotkey="B"
        active={mode === "draw"}
        onClick={() => setMode("draw")}
      />
      <ModeButton
        label="Hands"
        hotkey=""
        active={mode === "hands"}
        onClick={() => setMode("hands")}
      />
    </div>
  );
}

function setMode(next: Mode) {
  const sketch = sketchStore.getState();
  const hands = useGestureStore.getState();
  const bridge = creationStore.getState().bridge;

  if (next === "look") {
    sketch.setDrawMode(false);
    hands.setActive(false);
    // Re-lock if the controls are already mounted (Esc'd out of look).
    // Coming from Hands, LookLock remounts on the next paint — the following
    // click on the world is what actually grabs the pointer, same as main.
    bridge?.setInputEnabled(true);
    return;
  }

  if (next === "draw") {
    hands.setActive(false);
    sketch.setDrawMode(true);
    bridge?.setInputEnabled(true);
    return;
  }

  sketch.setDrawMode(false);
  hands.setActive(true);
  bridge?.setInputEnabled(false);
}

function ModeButton({
  label,
  hotkey,
  active,
  onClick,
}: {
  label: string;
  hotkey: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={(event) => {
        // Don't let the click bubble into a look-lock listener if this bar
        // ever sits inside the canvas host.
        event.stopPropagation();
        onClick();
      }}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-emerald-600 text-white"
          : "text-white/80 hover:bg-white/15 hover:text-white"
      }`}
    >
      {hotkey ? (
        <kbd className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[0.65rem] font-bold">
          {hotkey}
        </kbd>
      ) : null}
      {label}
    </button>
  );
}
