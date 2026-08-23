"use client";

/** Ring: ui. DOM only — never imports three. */
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useGestureStore } from "@/components/gesture/store";
import { PALETTE, WIDTHS, sketchStore } from "../core/strokeStore";

export function PaletteHUD() {
  const drawMode = useStore(sketchStore, (state) => state.drawMode);
  const colorIndex = useStore(sketchStore, (state) => state.colorIndex);
  const widthIndex = useStore(sketchStore, (state) => state.widthIndex);
  const strokeCount = useStore(sketchStore, (state) => state.strokes.length);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const confirmingClearRef = useRef(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep a ref in sync with the state so the (mount-only) key handler below
  // always sees the latest value without needing to be recreated on every
  // change — recreating it on every confirmingClear change would tear down
  // and cancel the very timeout that change just scheduled.
  useEffect(() => {
    confirmingClearRef.current = confirmingClear;
  }, [confirmingClear]);

  useEffect(() => {
    const { setColorIndex, cycleColor, cycleWidth, toggleDrawMode, undo, clear } =
      sketchStore.getState();

    const onKeyDown = (event: KeyboardEvent) => {
      // The sketch-to-3D overlay (press E) has a text prompt input. Without this
      // guard, typing "a bunny" would toggle draw mode on the `b`, and `c` would
      // arm the clear-everything confirm. Mirrors the same guard in
      // components/sketch-to-3d/SketchToWorld.tsx.
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if (event.code === "KeyB") {
        toggleDrawMode();
        // Draw and Hands both own the mouse; they cannot run together.
        if (sketchStore.getState().drawMode) {
          useGestureStore.getState().setActive(false);
        }
        return;
      }
      if (!sketchStore.getState().drawMode) return;

      if (event.code === "KeyZ" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        undo();
      } else if (event.code === "Backspace") {
        event.preventDefault();
        undo();
      } else if (event.code === "KeyX") {
        // One key to step through the palette. Reaching for 1-6 means looking
        // away from the crosshair mid-drawing; X is under the left hand that is
        // already on WASD, so you can change colour without stopping.
        // Shift+X steps back, so overshooting costs one press rather than five.
        cycleColor(event.shiftKey ? -1 : 1);
      } else if (event.code === "BracketLeft") {
        cycleWidth(-1);
      } else if (event.code === "BracketRight") {
        cycleWidth(1);
      } else if (event.code === "KeyC") {
        // Two-press confirm — kids will hit this by accident.
        if (confirmingClearRef.current) {
          clear();
          confirmingClearRef.current = false;
          setConfirmingClear(false);
          if (clearTimer.current) clearTimeout(clearTimer.current);
        } else {
          confirmingClearRef.current = true;
          setConfirmingClear(true);
          clearTimer.current = setTimeout(() => {
            confirmingClearRef.current = false;
            setConfirmingClear(false);
          }, 2000);
        }
      } else if (event.code.startsWith("Digit")) {
        const index = Number(event.code.slice(5)) - 1;
        if (index >= 0 && index < PALETTE.length) setColorIndex(index);
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (!sketchStore.getState().drawMode) return;
      cycleWidth(event.deltaY > 0 ? -1 : 1);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("wheel", onWheel);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  // Renders nothing at rest. Advertising `B` is somebody else's job — it was
  // <ModeStrip/>'s until that strip was cut, and is moving to a dedicated UI
  // element — and three features sharing one screen cannot each keep a
  // permanent pill up. Everything below is draw-mode-only, including the clear
  // confirm — which previously survived toggling draw mode off.
  if (!drawMode) return null;

  return (
    // `absolute`, not `fixed`. On /minecraft the two are indistinguishable —
    // ThemeFrame is a `relative h-dvh` box filling the viewport. Inside the
    // playground they are not: `fixed` would pin the palette to the bottom of
    // the browser window, below the stage toolbar and outside the viewport the
    // strokes are actually being drawn in. z-20 clears the playground's own
    // overlay stack (the sketch canvas is z-7, the zoom controls z-10).
    <div className="pointer-events-none absolute inset-x-0 bottom-14 z-20 flex flex-col items-center gap-2 font-sans select-none">
      {confirmingClear && (
        <div className="rounded bg-red-600/90 px-3 py-1 text-sm text-white">
          Press C again to clear everything
        </div>
      )}
      <div className="flex items-center gap-3 rounded-full bg-black/50 px-4 py-2 backdrop-blur-sm">
        <span className="text-sm text-white/90">✏ drawing</span>
        {drawMode && (
          <>
            <div className="flex gap-2">
              {PALETTE.map((color, index) => (
                <div
                  key={color}
                  className={`h-5 w-5 rounded-full transition-transform ${
                    index === colorIndex ? "scale-125 ring-2 ring-white" : "opacity-60"
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-1">
              {WIDTHS.map((width, index) => (
                <div
                  key={width}
                  className={`rounded-full bg-white ${index === widthIndex ? "" : "opacity-30"}`}
                  style={{ width: 4 + index * 4, height: 4 + index * 4 }}
                />
              ))}
            </div>
            <span className="text-xs text-white/50">{strokeCount} strokes</span>
          </>
        )}
      </div>
    </div>
  );
}
