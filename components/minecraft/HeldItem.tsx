"use client";

/**
 * What the player is carrying: their newest creation if they have made one,
 * otherwise the axe.
 *
 * Lives in `minecraft/` rather than in `sketch-to-3d/` because it composes the
 * game's own item (the axe) with the feature's output. Putting it inside the
 * feature would point that folder's dependencies outward at the scene, which is
 * the direction the ring rules exist to prevent.
 *
 * IMPORTANT: this must always render exactly one <group> child, because
 * Player.tsx animates `axe.current.children[0].rotation.x` every frame for the
 * walk bob. The Suspense fallback below is the axe rather than null for that
 * reason as much as for looks — a null fallback would leave children[0]
 * undefined while a generated model downloads.
 */

import { Suspense } from "react";
import { HeldCreation } from "@/components/sketch-to-3d/r3f/HeldCreation";
import Axe from "./Axe";

/** The axe's original placement, kept identical so the swap lands in the same spot. */
const AXE_POSITION: [number, number, number] = [0.3, -0.35, 0.5];

export function HeldItem() {
  return (
    <Suspense fallback={<Axe position={AXE_POSITION} />}>
      <HeldCreation fallback={<Axe position={AXE_POSITION} />} />
    </Suspense>
  );
}
