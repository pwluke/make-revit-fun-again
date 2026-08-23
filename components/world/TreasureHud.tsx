"use client";

import { useStarSpots } from "./starPlacement";
import { useTreasureStore } from "./store";
import { cn } from "@/lib/utils";

function StarPip({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={"h-5 w-5 " + (filled ? "text-amber-400" : "text-slate-300")}
      fill="currentColor"
    >
      <path d="M12 2.2l2.9 6.2 6.8.9-5 4.7 1.3 6.8-6-3.3-6 3.3 1.3-6.8-5-4.7 6.8-.9z" />
    </svg>
  );
}

/** Treasure-hunt scoreboard: how many stars are found, and a nudge toward
 *  the next one so a child is never stuck wandering.
 *
 *  `className` overrides the offsets, because what the top-left corner already
 *  holds differs per host. On /minecraft it is the "All games" link and the
 *  default top-16 clears it; the playground moves <ThemeHud/> to the left, and
 *  its swatch row plus theme-name pill run past 64px — so ModelStage passes a
 *  lower offset rather than letting the two overlap. */
export default function TreasureHud({ className }: { className?: string }) {
  const spots = useStarSpots();
  const found = useTreasureStore((s) => s.found);
  const total = useTreasureStore((s) => s.total);
  const restart = useTreasureStore((s) => s.restart);
  const complete = found.length === total;
  const next = spots.find((spot) => !found.includes(spot.id));

  return (
    // Sits below the "All games" link, which owns the top-left corner.
    <div
      className={cn(
        "pointer-events-none absolute top-16 left-4 z-10 flex flex-col items-start gap-2",
        className,
      )}
    >
      <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-lg ring-1 ring-slate-900/10">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">
            Stars {found.length}/{total}
          </span>
          {/* Wraps: the procedural spots make this list longer than the eight
              authored ones, and it shouldn't push the panel off the screen. */}
          <div className="flex max-w-45 flex-wrap gap-0.5">
            {spots.map((spot) => (
              <StarPip key={spot.id} filled={found.includes(spot.id)} />
            ))}
          </div>
        </div>
        {!complete && next ? (
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Next: {next.hint}
          </p>
        ) : null}
      </div>

      {complete ? (
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-amber-300 px-3 py-2 shadow-lg ring-1 ring-amber-500/30">
          <span className="text-sm font-bold text-slate-900">
            🎉 You found every star!
          </span>
          <button
            onClick={restart}
            className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-700 transition hover:bg-white"
          >
            Play again
          </button>
        </div>
      ) : null}
    </div>
  );
}
