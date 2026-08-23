"use client";

import { useEffect, useState } from "react";
import { ACTIVE_DINO, DINOS, useDinoStore, type DinoPartId } from "./dinoStore";
import { playDinoComplete, playFragment } from "./sfx";

/** `clip` is an inset box in percent; CSS wants the same four numbers. */
const insetOf = (clip: [number, number, number, number]) =>
  `inset(${clip[0]}% ${clip[1]}% ${clip[2]}% ${clip[3]}%)`;

/**
 * The dinosaur, sitting to the LEFT of the power slots.
 *
 * The assembled animal shows from the start as a flat grey ghost, and each
 * fragment found un-greys ITS OWN REGION of that picture — so one head
 * lights up a head, not a whole dinosaur. The loose cut-outs are drawn at
 * their own angles on the sheet, which is why they are used for the
 * fragments out in the world but not here.
 */
export function DinoOutline() {
  const found = useDinoStore((s) => s.found);
  const dino = DINOS[ACTIVE_DINO];
  const total = dino.parts.length;
  const started = found.length > 0;

  return (
    <div
      id="dino-slot"
      className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl ring-2 ring-transparent transition-colors"
      style={{
        background: started ? "rgba(248,250,252,0.95)" : "rgba(226,232,240,0.7)",
        boxShadow: started ? `0 0 12px ${dino.color}55` : undefined,
      }}
      title={
        started
          ? `${dino.name}: ${found.length}/${total} fragments`
          : "Find a fossil fragment to start"
      }
    >
      <span className="relative block h-9 w-10">
        <img
          src={dino.whole}
          alt=""
          className="absolute inset-0 h-full w-full object-contain opacity-40"
          style={{ filter: "grayscale(1) brightness(0.7)" }}
        />
        {dino.parts.map((part) =>
          found.includes(part.id) ? (
            <img
              key={part.id}
              src={dino.whole}
              alt=""
              className="absolute inset-0 h-full w-full object-contain"
              style={{ clipPath: insetOf(part.clip) }}
            />
          ) : null,
        )}
      </span>
      <span
        className="text-[9px] font-bold"
        style={{ color: started ? dino.color : "#94a3b8" }}
      >
        {found.length}/{total}
      </span>
    </div>
  );
}

/**
 * Fragment pickup feedback: the piece bursts centre-screen, then flies to
 * the dinosaur slot in the corner — the same two beats the ability unlock
 * uses, so both collectables behave the same way.
 */
export function DinoPickup() {
  const pending = useDinoStore((s) => s.pending);
  const found = useDinoStore((s) => s.found);
  const [phase, setPhase] = useState<"burst" | "fly" | null>(null);
  const current: DinoPartId | null = pending[0] ?? null;
  const dino = DINOS[ACTIVE_DINO];

  useEffect(() => {
    if (!current) return;
    const index = dino.parts.findIndex((p) => p.id === current);
    const complete = found.length >= dino.parts.length;
    if (complete) playDinoComplete();
    else playFragment(Math.max(index, found.length - 1), dino.parts.length);
    setPhase("burst");
    const toFly = setTimeout(() => setPhase("fly"), 750);
    const done = setTimeout(() => {
      setPhase(null);
      useDinoStore.getState().shiftPending();
    }, 1350);
    return () => {
      clearTimeout(toFly);
      clearTimeout(done);
    };
    // `found` is read for the completion check only; re-running on it would
    // replay the cue when a later fragment lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  if (!current) return null;
  const part = dino.parts.find((p) => p.id === current);
  if (!part) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <style>{`
        @keyframes frag-burst {
          0% { transform: scale(0.3) rotate(-14deg); opacity: 0; }
          45% { transform: scale(1.15) rotate(6deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes frag-fly {
          0% { top: 50%; left: 50%; transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { top: 17%; left: 74%; transform: translate(-50%, -50%) scale(0.18); opacity: 0.25; }
        }
      `}</style>
      <div
        className="absolute top-1/2 left-1/2"
        style={
          phase === "fly"
            ? { animation: "frag-fly 0.6s ease-in forwards" }
            : { transform: "translate(-50%, -50%)" }
        }
      >
        <div
          className="flex flex-col items-center gap-2 rounded-3xl bg-white/95 px-7 py-5 shadow-2xl"
          style={{
            border: `4px solid ${dino.color}`,
            animation: phase === "burst" ? "frag-burst 0.7s ease-out" : undefined,
          }}
        >
          <img src={part.src} alt="" className="h-24 w-auto object-contain" />
          <span className="text-base font-black text-slate-800">
            {part.label} found!
          </span>
          <span className="text-xs font-bold" style={{ color: dino.color }}>
            {found.length}/{dino.parts.length} fragments
          </span>
        </div>
      </div>
    </div>
  );
}

/** The full-screen reveal once every fragment is in. */
export function DinoReveal() {
  const revealed = useDinoStore((s) => s.revealed);
  const pending = useDinoStore((s) => s.pending);
  const dismiss = useDinoStore((s) => s.dismissReveal);
  const dino = DINOS[ACTIVE_DINO];
  // Let the last fragment finish flying home before the card covers it.
  if (!revealed || pending.length > 0) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-slate-900/55 backdrop-blur-sm">
      <style>{`
        @keyframes dino-rise {
          0% { transform: scale(0.4) translateY(30px); opacity: 0; }
          60% { transform: scale(1.06) translateY(0); opacity: 1; }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes dino-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
      `}</style>
      <div
        className="mx-4 flex max-w-md flex-col items-center gap-3 rounded-3xl bg-white px-8 py-7 text-center shadow-2xl"
        style={{
          border: `5px solid ${dino.color}`,
          animation: "dino-rise 0.6s cubic-bezier(.2,.9,.3,1.2)",
        }}
      >
        <img
          src={dino.whole}
          alt={dino.name}
          className="h-44 w-auto object-contain"
          style={{ animation: "dino-bob 2.4s ease-in-out infinite" }}
        />
        <span className="text-2xl font-black text-slate-800">
          You rebuilt the {dino.name}!
        </span>
        <span className="text-sm font-bold italic" style={{ color: dino.color }}>
          {dino.species}
        </span>
        <p className="text-sm leading-relaxed font-medium text-slate-600">
          {dino.blurb}
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-1.5">
          {dino.parts.map((part) => (
            <span
              key={part.id}
              className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white"
              style={{ background: dino.color }}
            >
              {part.label}
            </span>
          ))}
        </div>
        <button
          onClick={dismiss}
          className="mt-3 rounded-full px-6 py-2 text-sm font-black text-white shadow-lg transition hover:brightness-110"
          style={{ background: dino.color }}
        >
          Back to the game
        </button>
      </div>
    </div>
  );
}
