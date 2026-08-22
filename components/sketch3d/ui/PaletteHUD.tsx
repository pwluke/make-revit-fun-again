"use client";

/** Ring: ui. DOM only — never imports three. */
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { PALETTE, WIDTHS, sketchStore } from "../core/strokeStore";

export function PaletteHUD() {
  const drawMode = useStore(sketchStore, (state) => state.drawMode);
  const colorIndex = useStore(sketchStore, (state) => state.colorIndex);
  const widthIndex = useStore(sketchStore, (state) => state.widthIndex);
  const strokeCount = useStore(sketchStore, (state) => state.strokes.length);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const { setColorIndex, cycleWidth, toggleDrawMode, undo, clear } = sketchStore.getState();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === "KeyB") {
        toggleDrawMode();
        return;
      }
      if (!sketchStore.getState().drawMode) return;

      if (event.code === "KeyZ" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        undo();
      } else if (event.code === "Backspace") {
        event.preventDefault();
        undo();
      } else if (event.code === "BracketLeft") {
        cycleWidth(-1);
      } else if (event.code === "BracketRight") {
        cycleWidth(1);
      } else if (event.code === "KeyC") {
        // Two-press confirm — kids will hit this by accident.
        if (confirmingClear) {
          clear();
          setConfirmingClear(false);
        } else {
          setConfirmingClear(true);
          clearTimer.current = setTimeout(() => setConfirmingClear(false), 2000);
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
  }, [confirmingClear]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 flex flex-col items-center gap-2 font-sans select-none">
      {confirmingClear && (
        <div className="rounded bg-red-600/90 px-3 py-1 text-sm text-white">
          Press C again to clear everything
        </div>
      )}
      <div className="flex items-center gap-3 rounded-full bg-black/50 px-4 py-2 backdrop-blur-sm">
        <span className="text-sm text-white/90">{drawMode ? "✏ drawing" : "press B to draw"}</span>
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
