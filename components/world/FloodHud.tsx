"use client";

import { nextHighGround, useFloodStore } from "./floodStore";
import { cn } from "@/lib/utils";

function formatTime(seconds: number) {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/**
 * Flood readout: how high the water is, how much breath is left, and where the
 * next dry ground is. The hint matters — without it a new player drowns in the
 * living room not knowing the house has stairs.
 *
 * Collapsed from a three-line white card to a single pill matching the rest of
 * the floating chrome (see the note in TreasureHud). Everything still on screen
 * earns its place: the depth and the clock always, the breath bar only once it
 * starts draining, and the higher-ground hint only while it can still help —
 * once you are under, "get your head up" is the only useful instruction.
 */
export default function FloodHud({ className }: { className?: string }) {
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

      {/* Bottom-left, sitting directly above the star count. */}
      <div
        className={cn(
          "pointer-events-none absolute bottom-14 left-4 z-10 font-sans select-none",
          className,
        )}
      >
        <div className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-xs backdrop-blur-sm">
          <span className="text-sky-300">◆</span>
          <span className="font-semibold tabular-nums text-white">
            {level > 0 ? level.toFixed(1) : "0.0"}m
          </span>
          <span className="tabular-nums text-white/50">
            {formatTime(elapsed)}
          </span>

          {/* Only once it actually starts draining. */}
          {breath < 1 ? (
            <span className="h-1 w-12 overflow-hidden rounded-full bg-white/25">
              <span
                className={
                  "block h-full rounded-full transition-[width] duration-150 " +
                  (breath < 0.35 ? "bg-red-400" : "bg-sky-300")
                }
                style={{ width: `${Math.round(breath * 100)}%` }}
              />
            </span>
          ) : null}

          {submerged ? (
            <span className="font-semibold text-sky-200">
              Get your head up!
            </span>
          ) : next ? (
            <span className="font-medium text-white/60">{next.label}</span>
          ) : (
            <span className="font-medium text-white/60">
              Nowhere higher left
            </span>
          )}
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
