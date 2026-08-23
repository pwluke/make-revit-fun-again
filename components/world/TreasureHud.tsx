"use client";

import { useStarSpots } from "./starPlacement";
import { useTreasureStore } from "./treasureStore";
import { cn } from "@/lib/utils";

/**
 * Treasure-hunt scoreboard: how many stars are found, and a nudge toward the
 * next one so a child is never stuck wandering.
 *
 * One pill, always exactly one. The previous version was a white card carrying
 * a row of one pip per star — with the procedural spots that is fourteen glyphs
 * restating a number already printed next to them — plus a separate celebration
 * banner that appeared as a second floating element. Both are gone: the count
 * is the count, and completing the hunt swaps this pill's contents rather than
 * stacking another one on top of it.
 *
 * Styling matches <ModeStrip/>, <PaletteHUD/> and <PowerupHud/> — translucent
 * dark pill, no shadow, no ring. Those were already the house style for chrome
 * that floats over the scene; the light card this replaces was the odd one out
 * and read as an interface panel rather than a readout.
 */
export default function TreasureHud({ className }: { className?: string }) {
  const spots = useStarSpots();
  const found = useTreasureStore((s) => s.found);
  const total = useTreasureStore((s) => s.total);
  const restart = useTreasureStore((s) => s.restart);
  const complete = found.length === total;
  const next = spots.find((spot) => !found.includes(spot.id));

  return (
    // Bottom-left, with the flood readout stacked directly above it. Hosts that
    // have something else in this corner pass their own offset — see the note in
    // components/playground/ModelStage.tsx.
    <div
      className={cn(
        "pointer-events-none absolute bottom-4 left-4 z-10 font-sans select-none",
        className,
      )}
    >
      {complete ? (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-500/85 px-3 py-1 text-xs backdrop-blur-sm">
          <span className="font-semibold text-white">
            🎉 Every star found
          </span>
          <button
            onClick={restart}
            className="rounded-full bg-white/25 px-2 py-0.5 text-[0.7rem] font-bold text-white transition hover:bg-white/40"
          >
            Play again
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-xs backdrop-blur-sm">
          <span className="text-amber-300">★</span>
          <span className="font-semibold tabular-nums text-white">
            {found.length}/{total}
          </span>
          {next ? (
            <span className="font-medium text-white/60">{next.hint}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}
