"use client";

import { BOOST_MULTIPLIER, BOOST_SECONDS, usePowerupStore } from "./powerupStore";

/** Boost readout. Only on screen while a boost is running — there's nothing
 *  useful to say the rest of the time, and the corners are busy. */
export default function PowerupHud() {
  const remaining = usePowerupStore((s) => s.remaining);
  const active = usePowerupStore((s) => s.active);

  if (!active) return null;

  return (
    // Above the controls strip, clear of both HUD corners and the crosshair.
    <div className="pointer-events-none absolute bottom-14 left-1/2 z-20 -translate-x-1/2">
      <div className="flex items-center gap-2 rounded-full bg-cyan-500/90 px-4 py-1.5 shadow-lg ring-1 ring-cyan-300/40">
        <span className="text-sm font-bold text-white">
          ⚡ Speed ×{BOOST_MULTIPLIER}
        </span>
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/30">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.round((remaining / BOOST_SECONDS) * 100)}%` }}
          />
        </div>
        <span className="w-6 text-right text-xs font-bold text-white tabular-nums">
          {Math.ceil(remaining)}s
        </span>
      </div>
    </div>
  );
}
