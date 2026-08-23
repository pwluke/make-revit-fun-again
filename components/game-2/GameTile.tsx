"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { CSSProperties } from "react";
import type { Game } from "./games";

// A client component only because of `onError`: the game art lives in
// `public/` and may not be there yet, so a failed load has to swap the tile
// back to its gradient instead of showing a broken-image icon.
export function GameTile({ game, index }: { game: Game; index: number }) {
  const [artFailed, setArtFailed] = useState(false);

  // Tailwind can't generate classes from runtime values, so the sampled palette
  // rides in as custom properties and the utilities below read them.
  const paletteVars = {
    "--tile-from": game.palette.from,
    "--tile-to": game.palette.to,
    "--tile-accent": game.palette.accent,
  } as CSSProperties;

  return (
    <Link
      href={game.href}
      style={paletteVars}
      className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-3xl bg-[linear-gradient(155deg,var(--tile-from)_0%,var(--tile-to)_100%)] shadow-lg ring-1 ring-black/10 transition-transform duration-300 outline-none hover:-translate-y-1.5 focus-visible:-translate-y-1.5 focus-visible:ring-4 focus-visible:ring-[var(--tile-accent)]"
    >
      {/* The gradient above is the base layer and shows through wherever the
          art is absent, so the tile always reads as deliberate. */}
      {!artFailed && (
        <Image
          src={game.image}
          alt={game.imageAlt}
          fill
          // Uniform 4/5 frame across four differently-shaped sources, so
          // `object-cover` plus each game's optional focus point does the
          // reconciling.
          className="object-cover transition-transform duration-500 group-hover:scale-[1.06]"
          style={game.focus ? { objectPosition: game.focus } : undefined}
          sizes="(min-width: 1280px) 22vw, (min-width: 640px) 45vw, 92vw"
          priority={index < 2}
          onError={() => setArtFailed(true)}
        />
      )}

      {/* Scrim: keeps the copy legible over photographic art and over the
          lighter palettes alike. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
      />

      <div className="relative flex flex-col gap-1.5 p-5 sm:p-6">
        <span className="text-xs font-semibold tracking-[0.18em] text-[var(--tile-accent)] uppercase">
          {game.kindLabel}
        </span>
        <h2 className="text-2xl font-semibold text-white sm:text-[1.7rem]">
          {game.title}
        </h2>
        <p className="text-sm leading-snug text-white/80">{game.tagline}</p>
        <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-white opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 sm:-translate-x-2">
          Play
          <span aria-hidden>→</span>
        </span>
      </div>
    </Link>
  );
}
