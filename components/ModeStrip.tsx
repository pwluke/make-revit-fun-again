"use client";

import { useStore } from "zustand";
import { creationStore } from "@/components/sketch-to-3d/core/creationStore";
import { cn } from "@/lib/utils";

/**
 * Controls help for editing a creation.
 *
 * This used to also advertise the creation modes — an `E` / `B` / `click` strip
 * pinned to the top centre of the world. That has been removed: mode discovery
 * is moving to a dedicated UI element, and two things explaining the same keys
 * is exactly the visual noise we are cutting.
 *
 * What is left is not mode advertisement and does not overlap with it. Selecting
 * a creation drops you into a direct-manipulation mode with no cursor affordance
 * of its own: the bounding box is undiscoverable, and pointer lock has just been
 * released, which needs saying. This is a display, not a control surface —
 * `pointer-events-none` makes that explicit.
 *
 * `className` exists because the strip is `absolute`, so its offsets are read
 * against whatever the host page positions it in. On /minecraft that is the
 * whole viewport and the default top-centre is free; inside the playground's
 * `.model-viewport` the orbit hint already owns that spot, so ModelStage pushes
 * the strip down. Same component, two different neighbourhoods.
 */
export function ModeStrip({ className }: { className?: string }) {
  const selectedId = useStore(creationStore, (state) => state.selectedId);

  // Nothing to say unless a creation is being edited.
  if (!selectedId) return null;

  return (
    <div
      className={cn(
        "pointer-events-none absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1.5 font-sans select-none",
        className,
      )}
    >
      <div className="rounded-full bg-sky-600/90 px-4 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
        Drag a corner to resize · drag the middle to move it up and down
      </div>
      <div className="rounded-full bg-black/50 px-3 py-1 text-[0.7rem] text-white/90 backdrop-blur-sm">
        <b>G</b> drop to ground · <b>Esc</b> or click away to finish
      </div>
    </div>
  );
}
