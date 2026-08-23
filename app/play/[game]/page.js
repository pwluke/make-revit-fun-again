import Link from "next/link";
import { notFound } from "next/navigation";
import { GAMES, findGame } from "@/components/game-2/games";

export function generateStaticParams() {
  return GAMES.map((game) => ({ game: game.slug }));
}

export async function generateMetadata({ params }) {
  const { game: slug } = await params;
  const game = findGame(slug);
  if (!game) return {};
  return { title: `${game.title} · ${game.kindLabel}` };
}

// `params` is a Promise in Next 16 — see docs/01-app/01-getting-started/
// 03-layouts-and-pages.md ("Creating a dynamic segment").
export default async function PlayGame({ params }) {
  const { game: slug } = await params;
  const game = findGame(slug);
  if (!game) notFound();

  return (
    <main
      className="font-sans flex min-h-dvh flex-col items-center justify-center gap-4 bg-[linear-gradient(155deg,var(--tile-from)_0%,var(--tile-to)_100%)] px-6 text-center"
      style={{
        "--tile-from": game.palette.from,
        "--tile-to": game.palette.to,
        "--tile-accent": game.palette.accent,
      }}
    >
      <span className="text-xs font-semibold tracking-[0.2em] text-white/80 uppercase">
        {game.kindLabel}
      </span>
      <h1 className="text-4xl font-semibold text-white drop-shadow-sm sm:text-5xl">
        {game.title}
      </h1>
      <p className="max-w-md text-white/85">{game.tagline}</p>
      <p className="mt-2 rounded-full bg-black/25 px-4 py-1.5 text-sm text-white backdrop-blur-sm">
        This game is still in development.
      </p>
      <Link
        href="/"
        className="mt-4 text-sm font-semibold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white"
      >
        ← Back to all games
      </Link>
    </main>
  );
}
