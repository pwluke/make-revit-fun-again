import App from "@/components/minecraft/App";
import { SketchToWorld } from "@/components/sketch-to-3d/SketchToWorld";

// Deliberately no `flex-1` on <main>: it sets `flex-basis: 0%`, which resolves
// against the body's auto height and leaves <main>'s height *indefinite*. The
// r3f canvas wrapper is `height: 100%`, so it would collapse to the canvas's
// intrinsic 150px. `h-dvh` on its own is a definite height.
export default function Home() {
  return (
    <main className="relative h-dvh w-full select-none overflow-hidden bg-sky-200">
      {/* PointerLockControls' selector="#game-surface" (see components/minecraft/App.tsx)
          scopes the pointer's re-lock-on-click listener to this div, so clicks on
          <SketchToWorld />'s overlay (which renders after it, on top) don't re-lock. */}
      <div id="game-surface" className="absolute inset-0">
        <App />
      </div>
      <SketchToWorld />
      {/* Crosshair — PointerLockControls hides the cursor, so the scene needs
          its own aiming reticle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
      />
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80">
        Click to look around · WASD to move · Space to jump · Click a block to
        place another
      </p>
    </main>
  );
}
