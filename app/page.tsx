import { World } from "@/components/World";

// Deliberately no `flex-1` on <main>: it sets `flex-basis: 0%`, which resolves
// against the body's auto height and leaves <main>'s height *indefinite*. The
// r3f canvas wrapper is `height: 100%`, so it would collapse to the canvas's
// intrinsic 150px. `h-dvh` on its own is a definite height.
export default function Home() {
  return (
    <main className="relative h-dvh w-full select-none overflow-hidden bg-zinc-900">
      <World />
    </main>
  );
}
