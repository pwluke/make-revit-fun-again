"use client";

import { ACTIVE_DINO, DINOS, useDinoStore } from "./dinoStore";

/**
 * The dinosaur, sitting to the LEFT of the power slots.
 *
 * The whole animal shows from the start as a flat grey ghost — so a player
 * can see there is something to rebuild — and each fragment found paints
 * its own piece back in over the top.
 */
export function DinoOutline() {
  const found = useDinoStore((s) => s.found);
  const dino = DINOS[ACTIVE_DINO];
  const total = dino.parts.length;
  const started = found.length > 0;

  return (
    <div
      className="flex h-[62px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl ring-2 transition-colors"
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
      <span className="relative block h-8 w-9">
        {/* Grey ghost of the whole animal, always there. */}
        <img
          src={dino.whole}
          alt=""
          className="absolute inset-0 h-full w-full object-contain opacity-45"
          style={{ filter: "grayscale(1) brightness(0.75)" }}
        />
        {/* Each found fragment paints back in, laid over the ghost. */}
        {dino.parts.map((part, i) =>
          found.includes(part.id) ? (
            <img
              key={part.id}
              src={part.src}
              alt=""
              className="absolute h-full w-full object-contain"
              // Fanned very slightly so overlapping pieces stay legible at
              // 36px — they are separate cut-outs, not a jigsaw that aligns.
              style={{
                transform: `translate(${(i % 3) - 1}px, ${((i / 3) | 0) - 0.5}px) scale(0.9)`,
              }}
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

/** The full-screen reveal once every fragment is in. */
export function DinoReveal() {
  const revealed = useDinoStore((s) => s.revealed);
  const dismiss = useDinoStore((s) => s.dismissReveal);
  const dino = DINOS[ACTIVE_DINO];
  if (!revealed) return null;

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
