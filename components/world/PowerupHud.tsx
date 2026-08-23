"use client";

import { POWERUPS, usePowerupStore } from "./powerupStore";

/** Active-powerup readout. Only on screen while one is running — there's
 *  nothing useful to say the rest of the time, and the corners are busy. */
export default function PowerupHud() {
  const kind = usePowerupStore((s) => s.kind);
  const remaining = usePowerupStore((s) => s.remaining);

  if (!kind) return null;

  const def = POWERUPS[kind];
  const fraction = Math.max(0, Math.min(1, remaining / def.seconds));

  return (
    // Above the controls strip, clear of both HUD corners and the crosshair.
    <div className="pointer-events-none absolute bottom-14 left-1/2 z-20 -translate-x-1/2">
      <div
        className={
          "flex items-center gap-2 rounded-full px-4 py-1.5 shadow-lg ring-1 " +
          // The trap reads as a warning, not a prize.
          (def.trap
            ? "bg-amber-600/90 ring-amber-300/40"
            : "bg-cyan-500/90 ring-cyan-300/40")
        }
      >
        <span className="text-sm font-bold text-white">
          {def.icon} {def.label}
        </span>
        <span className="hidden text-xs font-semibold text-white/80 sm:inline">
          {def.blurb}
        </span>
        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/30">
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
        <span className="w-6 text-right text-xs font-bold tabular-nums text-white">
          {Math.ceil(remaining)}s
        </span>
      </div>
    </div>
  );
}
