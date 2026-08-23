"use client";

import { useEffect, useState } from "react";
import { useAbilityCardSpots } from "./cardPlacement";
import {
  ABILITY_COLORS,
  ABILITY_ORDER,
  THEMES,
  useHeroStore,
  type AbilityId,
} from "./store";

/**
 * The whole ability UI lives in one top-left panel: how many cards are
 * found, the clue to the next one, the theme switch, and the six slots
 * themselves. A slot is the control — click/tap it or press its number to
 * switch that mode on and off. Modes stack, and an owned card can be used
 * as often as the player likes.
 */
export default function HeroHud({ topClass = "top-4" }: { topClass?: string }) {
  const theme = useHeroStore((s) => s.theme);
  const setTheme = useHeroStore((s) => s.setTheme);
  const found = useHeroStore((s) => s.found);
  const total = useHeroStore((s) => s.total);
  const active = useHeroStore((s) => s.active);
  const pending = useHeroStore((s) => s.pendingUnlocks);
  const toggle = useHeroStore((s) => s.toggle);
  const restart = useHeroStore((s) => s.restart);
  const spots = useAbilityCardSpots();
  const skins = THEMES[theme];
  const complete = found.length === total;
  const nextSpot = spots.find((spot) => !found.includes(spot.id));

  // Unlock animation, two beats: the card bursts and spins center-screen,
  // then flies up into the panel, whose slot pulses as it lands.
  const [unlockPhase, setUnlockPhase] = useState<"burst" | "dock" | null>(null);
  const [justLanded, setJustLanded] = useState<AbilityId | null>(null);
  const unlocking = pending[0] ?? null;
  useEffect(() => {
    if (!unlocking) return;
    setUnlockPhase("burst");
    const toDock = setTimeout(() => setUnlockPhase("dock"), 1400);
    const done = setTimeout(() => {
      setUnlockPhase(null);
      setJustLanded(unlocking);
      useHeroStore.getState().shiftUnlock();
    }, 1950);
    const landed = setTimeout(() => setJustLanded(null), 2800);
    return () => {
      clearTimeout(toDock);
      clearTimeout(done);
      clearTimeout(landed);
    };
  }, [unlocking]);

  // Number hotkeys, so modes toggle under pointer lock too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= ABILITY_ORDER.length) {
        useHeroStore.getState().toggle(ABILITY_ORDER[n - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <style>{`
        @keyframes card-burst {
          0% { transform: scale(0.2) rotate(0deg); opacity: 0; }
          25% { transform: scale(1.25) rotate(180deg); opacity: 1; }
          55% { transform: scale(0.95) rotate(360deg); }
          100% { transform: scale(1.1) rotate(540deg); }
        }
        @keyframes card-flash {
          0%, 100% { filter: brightness(1); }
          50% { filter: brightness(1.8); }
        }
        /* Flies to the top-left panel. Animating top/left keeps the target
           relative to the viewport box, not the window. */
        @keyframes card-dock {
          0% { top: 50%; left: 50%; transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { top: 14%; left: 13%; transform: translate(-50%, -50%) scale(0.16); opacity: 0.2; }
        }
        @keyframes slot-land {
          0% { transform: scale(1); box-shadow: 0 0 0 rgba(251,191,36,0); }
          35% { transform: scale(1.22); box-shadow: 0 0 26px rgba(251,191,36,0.95); }
          100% { transform: scale(1); box-shadow: 0 0 0 rgba(251,191,36,0); }
        }
      `}</style>

      <div
        className={`pointer-events-none absolute ${topClass} left-4 z-10 flex flex-col items-start gap-2`}
      >
        <div className="rounded-2xl bg-white/92 px-3 py-2.5 shadow-xl ring-1 ring-slate-900/10 backdrop-blur-sm">
          {/* header: count + theme switch */}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-black text-slate-700">
              Cards {found.length}/{total}
            </span>
            <div className="pointer-events-auto flex gap-1">
              {(["heroes", "animals"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors " +
                    (theme === t ? "bg-slate-800" : "bg-slate-100 hover:bg-slate-200")
                  }
                  // Inline: the playground's unlayered `button { color: inherit }`
                  // beats Tailwind text utilities.
                  style={{ color: theme === t ? "#ffffff" : "#64748b" }}
                >
                  {t === "heroes" ? "🦸" : "🐾"}
                </button>
              ))}
            </div>
          </div>

          {!complete && nextSpot ? (
            <p className="mt-0.5 max-w-[15rem] text-[11px] font-semibold text-slate-500">
              Next: {nextSpot.hint}
            </p>
          ) : null}

          {/* the six slots — this row IS the control surface */}
          <div className="pointer-events-auto mt-2 grid grid-cols-3 gap-1.5">
            {ABILITY_ORDER.map((id, i) => {
              const unlocked = found.includes(id);
              const on = active.includes(id);
              const skin = skins[id];
              return (
                <button
                  key={id}
                  onClick={() => toggle(id)}
                  disabled={!unlocked}
                  title={unlocked ? skin.power : "Find this card to unlock it"}
                  className={
                    "relative flex h-[68px] w-[76px] flex-col items-center justify-center gap-0.5 rounded-xl ring-2 transition-all " +
                    (on
                      ? "bg-amber-300 ring-amber-500"
                      : unlocked
                        ? "bg-slate-50 ring-slate-900/10 hover:bg-amber-100"
                        : "bg-slate-200/70 ring-transparent")
                  }
                  style={{
                    ...(on ? { boxShadow: `0 0 14px ${ABILITY_COLORS[id]}` } : null),
                    ...(justLanded === id ? { animation: "slot-land 0.8s ease-out" } : null),
                  }}
                >
                  {/* the number badge: lit means this key does something */}
                  <span
                    className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black shadow"
                    style={{
                      background: on
                        ? "#0f172a"
                        : unlocked
                          ? ABILITY_COLORS[id]
                          : "#cbd5e1",
                      color: on ? "#fcd34d" : unlocked ? "#ffffff" : "#94a3b8",
                    }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={"text-3xl leading-none " + (unlocked ? "" : "opacity-30 grayscale")}
                  >
                    {unlocked ? skin.emoji : "🃏"}
                  </span>
                  <span
                    className="max-w-full truncate px-1 text-[9px] font-bold"
                    style={{ color: on ? "#0f172a" : unlocked ? "#475569" : "#94a3b8" }}
                  >
                    {unlocked ? (on ? "ON" : skin.name) : "locked"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {complete ? (
          <div className="pointer-events-auto flex items-center gap-3 rounded-2xl bg-amber-300 px-3 py-2 shadow-lg ring-1 ring-amber-500/30">
            <span className="text-sm font-bold text-slate-900">
              🎉 Every card found!
            </span>
            <button
              onClick={restart}
              className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold transition hover:bg-white"
              style={{ color: "#334155" }}
            >
              Play again
            </button>
          </div>
        ) : null}
      </div>

      {/* center: unlock animation — burst, then fly up into the panel */}
      {unlocking ? (
        <div className="pointer-events-none absolute inset-0 z-20">
          <div
            className="absolute top-1/2 left-1/2"
            style={
              unlockPhase === "dock"
                ? { animation: "card-dock 0.55s ease-in forwards" }
                : { transform: "translate(-50%, -50%)" }
            }
          >
            <div
              className="flex flex-col items-center gap-2 rounded-3xl px-8 py-6 text-center shadow-2xl"
              style={{
                background: "rgba(255,255,255,0.95)",
                border: `4px solid ${ABILITY_COLORS[unlocking]}`,
                animation:
                  unlockPhase === "burst"
                    ? "card-burst 1.2s ease-out, card-flash 0.4s ease-in-out 3"
                    : undefined,
              }}
            >
              <span className="text-6xl leading-none">{skins[unlocking].emoji}</span>
              <span className="text-lg font-black text-slate-800">
                {skins[unlocking].name}
              </span>
              <span className="text-xs font-semibold text-slate-500">
                {skins[unlocking].power}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
