"use client";

import { type ReactNode } from "react";
import { Sky, PointerLockControls, KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { SceneCanvas } from "@/components/canvas/SceneCanvas";
import { Ground } from "./Ground";
import { Player } from "./Player";
import { Cubes } from "./Cube";
import { GestureBuilder } from "./GestureBuilder";
import { House } from "../world/House";
import { Stars } from "../world/Stars";

// The original was made by Maksim Ivanow: https://www.youtube.com/watch?v=Lc2JvBXMesY&t=124s
// This example needs pointer-lock, that works only if you open it in a new window
// Controls: WASD + left click, or the camera gestures behind the Hands button

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
        <House />
        <Cubes />
      </Physics>
      {/* Outside <Physics>: stars are pickups, and the builder only raycasts. */}
      <Stars />
      <GestureBuilder />
      <PointerLockControls />
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
