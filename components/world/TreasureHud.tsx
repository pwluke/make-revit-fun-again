"use client";

import { useEffect } from "react";
import { STAR_SPOTS } from "./houseData";
import { STAR_ABILITIES, useTreasureStore } from "./store";

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

/** Treasure-hunt scoreboard: stars found, a nudge toward the next one, and
 *  the abilities the found stars have unlocked. */
export default function TreasureHud() {
  const found = useTreasureStore((s) => s.found);
  const total = useTreasureStore((s) => s.total);
  const tinyOn = useTreasureStore((s) => s.tinyOn);
  const xrayOn = useTreasureStore((s) => s.xrayOn);
  const toggleTiny = useTreasureStore((s) => s.toggleTiny);
  const toggleXray = useTreasureStore((s) => s.toggleXray);
  const restart = useTreasureStore((s) => s.restart);
  const complete = found.length === total;
  const next = STAR_SPOTS.find((spot) => !found.includes(spot.id));

  // Hotkeys for the toggle abilities, so they work under pointer lock too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const store = useTreasureStore.getState();
      if (key === "t") store.toggleTiny();
      if (key === "x") store.toggleXray();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const unlocked = STAR_SPOTS.filter(
    (spot) => found.includes(spot.id) && STAR_ABILITIES[spot.id],
  );

  return (
    // Sits below the "All games" link, which owns the top-left corner.
    <div className="pointer-events-none absolute top-16 left-4 z-10 flex flex-col items-start gap-2">
      <div className="rounded-2xl bg-white/90 px-3 py-2 shadow-lg ring-1 ring-slate-900/10">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">
            Stars {found.length}/{total}
          </span>
          <div className="flex gap-0.5">
            {STAR_SPOTS.map((spot) => (
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

      {/* Unlocked abilities. Toggles are buttons (and hotkeys); passives
          just show that the power is on. */}
      {unlocked.length > 0 ? (
        <div className="pointer-events-auto flex flex-col gap-1 rounded-2xl bg-white/90 px-2 py-1.5 shadow-lg ring-1 ring-slate-900/10">
          {unlocked.map((spot) => {
            const ability = STAR_ABILITIES[spot.id]!;
            const isToggle = ability.kind === "toggle";
            const on =
              spot.id === "upstairs" ? tinyOn : spot.id === "roof" ? xrayOn : true;
            const onClick =
              spot.id === "upstairs"
                ? toggleTiny
                : spot.id === "roof"
                  ? toggleXray
                  : undefined;
            return (
              <button
                key={spot.id}
                onClick={onClick}
                disabled={!isToggle}
                title={ability.blurb}
                className={
                  "flex items-center gap-2 rounded-xl px-2 py-1 text-left text-xs font-bold transition-colors " +
                  (isToggle
                    ? on
                      ? "bg-amber-300 text-slate-900"
                      : "bg-slate-100 text-slate-500 hover:bg-amber-100"
                    : "text-slate-600")
                }
              >
                <span className="text-base leading-none">{ability.emoji}</span>
                <span>{ability.title}</span>
                {isToggle ? (
                  <kbd className="ml-auto rounded bg-slate-900/10 px-1.5 py-0.5 text-[10px] font-black uppercase">
                    {ability.hotkey}
                  </kbd>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

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
