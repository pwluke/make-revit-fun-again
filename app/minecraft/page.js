import Link from "next/link";
import App from "@/components/minecraft/App";
import GestureTracker from "@/components/gesture/GestureTracker";
import HeroHud from "@/components/world/HeroHud";
import PowerupHud from "@/components/world/PowerupHud";
import FloodHud from "@/components/world/FloodHud";
import { ThemeFrame, ThemeHud } from "@/components/world/ThemeHud";

// Deliberately no `flex-1` on <main>: it sets `flex-basis: 0%`, which resolves
// against the body's auto height and leaves <main>'s height *indefinite*. The
// r3f canvas wrapper is `height: 100%`, so it would collapse to the canvas's
// intrinsic 150px. `h-dvh` on its own is a definite height.
export default function MinecraftGame() {
  return (
    <ThemeFrame className="relative h-dvh w-full select-none overflow-hidden">
      <App />
      <ThemeHud />
      {/* Crosshair — PointerLockControls hides the cursor, so the scene needs
          its own aiming reticle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
      />
      {/* Top-left, clear of the centre where clicks grab pointer lock. Press
          Esc to release the lock before this becomes clickable again. */}
      <Link
        href="/"
        className="absolute top-4 left-4 rounded-full bg-black/40 px-3.5 py-1.5 text-sm text-white/90 backdrop-blur-sm transition-colors hover:bg-black/60 hover:text-white"
      >
        ← All games
      </Link>
      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/80">
        Click to look around · WASD to move · Space to jump · Left click to
        break a cluster · Right click to place one · or press Hands and build
        with gestures
      </p>
      <GestureTracker />
      <HeroHud topClass="top-16" />
      <PowerupHud />
      <FloodHud />
    </ThemeFrame>
  );
}
