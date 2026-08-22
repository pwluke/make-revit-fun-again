import Link from "next/link";
import { World } from "@/components/World";

// Deliberately no `flex-1` on <main>: it sets `flex-basis: 0%`, which resolves
// against the body's auto height and leaves <main>'s height *indefinite*. The
// r3f canvas wrapper is `height: 100%`, so it would collapse to the canvas's
// intrinsic 150px. `h-dvh` on its own is a definite height.
export default function WorldPage() {
  return (
    <main className="relative h-dvh w-full select-none overflow-hidden bg-zinc-900">
      <World />
      {/* Top-right, clear of World.tsx's scene toggle at top-left. */}
      <Link
        href="/"
        className="absolute top-4 right-4 z-10 rounded-full bg-black/40 px-3.5 py-1.5 text-sm text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
      >
        ← All games
      </Link>
    </main>
  );
}
