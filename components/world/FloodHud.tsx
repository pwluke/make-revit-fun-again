"use client";

import { nextHighGround, useFloodStore } from "./floodStore";

function formatTime(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Flood readout: how high the water is, how much breath is left, and where the
 * next dry ground is. The hint matters — without it a new player drowns in the
 * living room not knowing the house has stairs.
 */
export default function FloodHud() {
  const level = useFloodStore((s) => s.level);
  const elapsed = useFloodStore((s) => s.elapsed);
  const breath = useFloodStore((s) => s.breath);
  const submerged = useFloodStore((s) => s.submerged);
  const drowned = useFloodStore((s) => s.drowned);
  const best = useFloodStore((s) => s.best);
  const reset = useFloodStore((s) => s.reset);

  const next = nextHighGround(level);

  return (
    <>
      {/* Underwater tint. A DOM overlay rather than scene fog: it costs nothing
          per frame and doesn't touch the renderer's state. */}
      {submerged && !drowned ? (
        <div
          aria-hidden
          // Normal blend, not multiply: multiply darkens everything underneath
          // it, and the scene already arrives graded and vignetted. A light
          // wash reads as "underwater" without turning the frame to mud.
          className="pointer-events-none absolute inset-0 z-10 bg-sky-400/20"
        />
      ) : null}

      {/* Top-right; the treasure scoreboard owns the left. */}
      <div className="pointer-events-none absolute top-24 right-4 z-20 flex w-56 flex-col items-end gap-2">
        <div className="w-full rounded-2xl bg-white/90 px-3 py-2 shadow-lg ring-1 ring-slate-900/10">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-slate-700">
              Water {level > 0 ? level.toFixed(1) : "0.0"}m
            </span>
            <span className="text-xs font-semibold text-slate-500">
              {formatTime(elapsed)}
            </span>
          </div>

          {/* Breath bar — only once it actually starts draining. */}
          {breath < 1 ? (
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className={
                  "h-full rounded-full transition-[width] duration-150 " +
                  (breath < 0.35 ? "bg-red-500" : "bg-sky-500")
                }
                style={{ width: `${Math.round(breath * 100)}%` }}
              />
            </div>
          ) : null}

          <p className="mt-1 text-xs font-semibold text-slate-500">
            {submerged
              ? "Underwater — get your head up!"
              : next
                ? `Higher ground: ${next.label}`
                : "Nowhere higher left — hold out!"}
          </p>
        </div>
      </div>

      {drowned ? (
        // Was bg-sky-950/55 — near-black over the whole frame, and the drowned
        // state persists until the player restarts, so that was the screen for
        // as long as they left it. Enough scrim to lift the card off the scene,
        // no more.
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-sky-900/25 backdrop-blur-[2px]">
          <div className="pointer-events-auto flex flex-col items-center gap-3 rounded-3xl bg-white/95 px-8 py-6 shadow-2xl">
            <span className="text-xl font-bold text-slate-800">
              🌊 The flood got you
            </span>
            <span className="text-sm font-semibold text-slate-500">
              You stayed dry for {formatTime(elapsed)}
              {best > elapsed ? ` · best ${formatTime(best)}` : ""}
            </span>
            <button
              onClick={reset}
              className="rounded-full bg-sky-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-sky-600"
            >
              Run it again
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
