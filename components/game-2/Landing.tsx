import { GameTile } from "./GameTile";
import { ModeToggle } from "./ModeToggle";
import { GAMES } from "./games";

// Server component — only the tiles need client state.
export default function Landing() {
  return (
    // `font-sans` is load-bearing: globals.css sets `body { font-family: Arial }`,
    // which an element-level utility has to override for Geist to apply.
    <main className="font-sans mx-auto w-full max-w-[90rem] px-5 py-12 sm:px-8 sm:py-16">
      <ModeToggle />

      <header className="mb-10 max-w-2xl sm:mb-14">
        <p className="text-muted-foreground text-xs font-semibold tracking-[0.2em] uppercase">
          Make BIM Fun Again
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
          Pick a game to play.
        </h1>
        <p className="text-muted-foreground mt-4 text-base sm:text-lg">
          Every game starts from real Rhino and Revit models, imported straight
          from the studio. Four ways to play them — block by block, sketch by
          sketch, clue by clue, shot by shot.
        </p>
      </header>

      <ul className="grid list-none grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
        {GAMES.map((game, index) => (
          <li key={game.slug}>
            <GameTile game={game} index={index} />
          </li>
        ))}
      </ul>

      <p className="text-muted-foreground mt-10 text-sm">
        Only BIMCraft is playable today — the other three are in development.
      </p>
    </main>
  );
}
