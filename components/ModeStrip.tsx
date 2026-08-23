"use client";

import { useStore } from "zustand";
import { creationStore } from "@/components/sketch-to-3d/core/creationStore";
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
  const selectedId = useStore(creationStore, (state) => state.selectedId);

  // While editing, the strip stops advertising modes and explains the controls
  // instead — the bounding box is otherwise undiscoverable, and the player has
  // just lost pointer lock, which needs explaining on its own.
  if (selectedId) {
    return (
      <div className="pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 font-sans select-none">
        <div className="rounded-full bg-sky-600/90 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
          Drag a corner to resize · drag the middle to move it up and down
        </div>
        <div className="rounded-full bg-black/50 px-3 py-1 text-[0.7rem] text-white/90 backdrop-blur-sm">
          <b>G</b> drop to ground · <b>Esc</b> or click away to finish
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 font-sans select-none">
      <Row hotkey="E" label="Draw a picture → quick sprite, fast 3D, or detailed 3D" active={false} />
      <Row hotkey="B" label="Draw lines in 3D" active={drawMode} />
      {!drawMode && (
        <Row hotkey="click" label="Look at something you made to move or resize it" active={false} />
      )}
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
