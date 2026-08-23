"use client";

import { type ReactNode } from "react";
import { PointerLockControls, KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { useStore } from "zustand";
import { SceneCanvas } from "@/components/canvas/SceneCanvas";
import { PostFX } from "@/components/canvas/PostFX";
import { Ground } from "./Ground";
import { Player } from "./Player";
import { Cubes } from "./Cube";
import { GestureBuilder } from "./GestureBuilder";
import { House } from "../world/House";
import { Stars } from "../world/Stars";
import { Powerups } from "../world/Powerups";
import { Flood } from "../world/Flood";
import { ThemeAtmosphere } from "../world/ThemeAtmosphere";
import { useFastMode } from "../world/themeStore";
import { creationStore } from "@/components/sketch-to-3d/core/creationStore";
import { Creations } from "@/components/sketch-to-3d/r3f/Creations";
import { RemotePlayers } from "@/components/multiplayer/r3f/RemotePlayers";
import { GroundGuide } from "@/components/sketch3d/r3f/GroundGuide";
import { SketchController } from "@/components/sketch3d/r3f/SketchController";
import { Strokes } from "@/components/sketch3d/r3f/Strokes";

// The original was made by Maksim Ivanow: https://www.youtube.com/watch?v=Lc2JvBXMesY&t=124s
// This example needs pointer-lock, that works only if you open it in a new window
// Controls: WASD + left click, or the camera gestures behind the Hands button

export const minecraftKeyMap = [
  { name: "forward", keys: ["ArrowUp", "w", "W"] },
  { name: "backward", keys: ["ArrowDown", "s", "S"] },
  { name: "left", keys: ["ArrowLeft", "a", "A"] },
  { name: "right", keys: ["ArrowRight", "d", "D"] },
  { name: "jump", keys: ["Space"] },
  // Only used by the fly powerup — the descend key. Harmless otherwise.
  { name: "crouch", keys: ["ShiftLeft", "ShiftRight", "Shift", "c", "C"] },
];

export function MinecraftScene() {
  // Editing a creation needs a real cursor, and PointerLockControls actively
  // prevents one in two ways: it overrides R3F's hit-test compute to always
  // raycast from the SCREEN CENTRE (drei/core/PointerLockControls.js:38-42), so
  // no off-centre handle is ever clickable, and it re-locks the pointer on any
  // click inside its selector (line 60-62). `enabled={false}` fixes neither —
  // three-stdlib's disconnect() leaves domElement set, so lock() still fires.
  // Unmounting is the only clean answer.
  const selectedId = useStore(creationStore, (state) => state.selectedId);
  const fast = useFastMode();

  return (
    <>
      <ThemeAtmosphere />
      <Physics gravity={[0, -30, 0]}>
        <Ground />
        <Player />
        <House />
        <Cubes />
        {/* Renders whatever the player has drawn, and registers the SceneBridge
            that the DOM-side overlay calls back through. */}
        <Creations />
      </Physics>
      {/* Outside <Physics>: stars and powerups are pickups, the builder only
          raycasts, and the flood is visual — you swim through it, the breath
          timer is what actually threatens you. */}
      <Stars />
      <Powerups />
      <Flood />
      {/* Also outside <Physics>, and that is the design: other players are
          drawn, not simulated. Each client owns only its own capsule, which is
          what keeps this free of authority and rollback machinery. It also owns
          the room connection — mounting it is what makes this tab multiplayer. */}
      <RemotePlayers />
      <GestureBuilder />
      {/* Also outside <Physics>: strokes carry no colliders and do not belong in
          the physics world. SketchController is headless (it only reads the
          camera and binds pointer events); Strokes mounts the stroke meshes. The
          DOM half of this feature, <PaletteHUD />, is a sibling of the canvas in
          app/minecraft/page.js — it cannot live here, inside <Canvas>. */}
      <SketchController />
      <Strokes />
      {/* Shows where the invisible drawing plane meets the ground. Only visible
          in draw mode, and it freezes with the plane the moment a stroke starts. */}
      <GroundGuide />
      {/* Both props are load-bearing, and were RE-ADDED during the merge with
          main, which had reverted to a bare <PointerLockControls />. Do not
          simplify this back.

          `selector`: without it drei attaches a DOCUMENT-level click listener
          that re-locks the pointer on any click anywhere on the page (see
          node_modules/@react-three/drei/core/PointerLockControls.js:60-63) —
          including clicks inside the sketch overlay, hiding the cursor mid-draw.

          `makeDefault`: publishes the controls into R3F's store so
          `useThree((s) => s.controls)` resolves. Without it the SceneBridge binds
          to null and setInputEnabled becomes a silent no-op, so neither the
          drawing overlay nor creation selection can release the pointer — which
          reads as "the cursor never appears", with no error anywhere. */}
      {!selectedId && <PointerLockControls makeDefault selector="#game-surface" />}
      {/* The post chain is seven full-screen passes and by far the most
          expensive thing in the frame. Fast mode drops it entirely — see the
          ⚡ Fast button in ThemeHud. Unmounted rather than disabled so the
          EffectComposer and its render targets are actually freed. */}
      {!fast && <PostFX />}
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
