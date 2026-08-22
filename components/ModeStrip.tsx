"use client";

import { useStore } from "zustand";
import { sketchStore } from "@/components/sketch3d/core/strokeStore";

/**
 * Advertises every creation mode in the world at once.
 *
 * Three features now share one screen and one mouse button, and none of them is
 * discoverable on its own. This is a display, not a control surface: the game
 * holds pointer lock, so there is no cursor to click with and every entry point
 * has to be a key. `pointer-events-none` makes that explicit — a strip that
 * looks clickable but is not would be worse than one that plainly is not.
 */
export function ModeStrip() {
  const drawMode = useStore(sketchStore, (state) => state.drawMode);

  return (
    <div className="pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 font-sans select-none">
      <Row hotkey="E" label="Draw a picture → 3D model or 2.5D sprite" active={false} />
      <Row hotkey="B" label="Draw lines in 3D" active={drawMode} />
    </div>
  );
}

function Row({
  hotkey,
  label,
  active,
}: {
  hotkey: string;
  label: string;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs backdrop-blur-sm transition-colors ${
        active ? "bg-emerald-600/80 text-white" : "bg-black/40 text-white/90"
      }`}
    >
      <kbd
        className={`rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-bold ${
          active ? "bg-white/25 text-white" : "bg-white/15 text-white"
        }`}
      >
        {hotkey}
      </kbd>
      <span className="font-semibold">{label}</span>
      {active && <span className="text-[0.65rem] font-normal opacity-80">— on</span>}
    </div>
  );
}
