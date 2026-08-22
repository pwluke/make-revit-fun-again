"use client";

import { type ReactNode } from "react";
import { Sky, PointerLockControls, KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { SceneCanvas } from "@/components/canvas/SceneCanvas";
import { Ground } from "./Ground";
import { Player } from "./Player";
import { Creations } from "@/components/sketch-to-3d/r3f/Creations";
import { SketchController } from "@/components/sketch3d/r3f/SketchController";
import { Strokes } from "@/components/sketch3d/r3f/Strokes";

// The original was made by Maksim Ivanow: https://www.youtube.com/watch?v=Lc2JvBXMesY&t=124s
// This example needs pointer-lock, that works only if you open it in a new window
// Controls: WASD + left click

export const minecraftKeyMap = [
  { name: "forward", keys: ["ArrowUp", "w", "W"] },
  { name: "backward", keys: ["ArrowDown", "s", "S"] },
  { name: "left", keys: ["ArrowLeft", "a", "A"] },
  { name: "right", keys: ["ArrowRight", "d", "D"] },
  { name: "jump", keys: ["Space"] },
];

export function MinecraftScene() {
  return (
    <>
      <Sky sunPosition={[100, 20, 100]} />
      <ambientLight intensity={0.3 * Math.PI} />
      <pointLight
        castShadow
        intensity={0.8 * Math.PI}
        decay={0}
        position={[100, 100, 100]}
      />
      <Physics gravity={[0, -30, 0]}>
        <Ground />
        <Player />
        {/* Dirt voxels are disabled entirely — they were the frame-rate problem.
            <Cubes /> renders one rapier RigidBody (mesh + SIX materials) per
            occupied point returned by `db.useQuery({ points: {} })`, an unbounded
            InstantDB query. Cube.tsx's own comment notes the approach "wouldn't
            allow for more than a few thousand boxes" and needs instancing to scale.
            Note its filter is `occupied !== false`, so points where `occupied` is
            merely undefined render too.

            Restoring is one line — <Cubes /> — plus, for click-to-place building,
            a seed cube: <Cube position={[0, 0.5, -10]} /> (Ground has no click
            handler, so without a seed there is nothing to place blocks against).
            Both need `Cube`/`Cubes` re-imported from "./Cube".

            Removed so the scene renders the player's own creations, not scaffolding. */}
        {/* Renders whatever the player has drawn, and registers the SceneBridge
            that the DOM-side overlay calls back through. */}
        <Creations />
      </Physics>
      {/* Third creation mode: freehand 3D lines (press B). Deliberately OUTSIDE
          <Physics> — strokes carry no colliders and do not belong in the physics
          world. SketchController is headless (it only reads the camera and binds
          pointer events); Strokes mounts the stroke meshes. The DOM half of this
          feature, <PaletteHUD />, is a sibling of the canvas in
          app/minecraft/page.js — it cannot live here, inside <Canvas>. */}
      <SketchController />
      <Strokes />
      {/* Both props here are load-bearing, for different reasons.

          `selector`: without it drei attaches a document-level `click` listener
          that re-locks the pointer on ANY click anywhere on the page (see
          node_modules/@react-three/drei/core/PointerLockControls.js:60-63). That
          re-locks on clicks inside the sketch overlay — colour swatches, the
          drawing canvas, "Make it real" — hiding the cursor mid-draw. Scoping it
          to #game-surface (the wrapper div in app/minecraft/page.js) restricts
          re-locking to clicks on the game itself.

          `makeDefault`: publishes the controls into R3F's store so that
          `useThree((s) => s.controls)` resolves. drei does that in an effect, so
          without it the scene bridge binds to null on first render and pointer
          lock never releases when the overlay opens. */}
      <PointerLockControls makeDefault selector="#game-surface" />
    </>
  );
}

export function MinecraftControls({ children }: { children: ReactNode }) {
  return <KeyboardControls map={minecraftKeyMap}>{children}</KeyboardControls>;
}

export default function App() {
  return (
    <MinecraftControls>
      <SceneCanvas>
        <MinecraftScene />
      </SceneCanvas>
    </MinecraftControls>
  );
}
