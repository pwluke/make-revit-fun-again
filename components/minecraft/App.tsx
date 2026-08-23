"use client";

import { type ReactNode } from "react";
import { PointerLockControls, KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
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
import { MarineGarden } from "../world/MarineGarden";

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
  return (
    <>
      <ThemeAtmosphere />
      <Physics gravity={[0, -30, 0]}>
        <Ground />
        <Player />
        <House />
        <Cubes />
      </Physics>
      {/* Outside <Physics>: stars and powerups are pickups, the builder only
          raycasts, and the flood is visual — you swim through it, the breath
          timer is what actually threatens you. */}
      <Stars />
      <Powerups />
      <MarineGarden />
      <Flood />
      <GestureBuilder />
      <PointerLockControls />
      <PostFX />
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
