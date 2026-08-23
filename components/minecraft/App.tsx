"use client";

import { type ReactNode } from "react";
import { PointerLockControls, KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { SceneCanvas } from "@/components/canvas/SceneCanvas";
import { PostFX } from "@/components/canvas/PostFX";
import { SCENE } from "@/lib/palette";
import { Ground } from "./Ground";
import { Player } from "./Player";
import { Cubes } from "./Cube";
import { GestureBuilder } from "./GestureBuilder";
import { House } from "../world/House";
import { GradientSky } from "../world/GradientSky";
import { Stars } from "../world/Stars";
import { Flood } from "../world/Flood";

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
      {/* Haze in the same blush as the sky's horizon stop — the two have to
          agree or the ground plane ends in a visible seam. */}
      <fogExp2 attach="fog" args={[SCENE.fog, 0.0075]} />
      <GradientSky />

      {/* Two-tone ambient: mint down from the sky, lilac up off the pale
          floor. This is the cheap half of what makes a white wall read pink on
          one face and periwinkle on the other. */}
      <hemisphereLight
        color={SCENE.fillSky}
        groundColor={SCENE.fillGround}
        intensity={0.75 * Math.PI}
      />
      {/* A floor under the ambient, so house interiors stay legible. */}
      <ambientLight color={SCENE.fillGround} intensity={0.22 * Math.PI} />
      {/* Sun. Directional rather than the point light this replaced, so
          shadows fall parallel and soft instead of splaying out from one
          corner of a 1000-unit map. */}
      <directionalLight
        castShadow
        color={SCENE.keyLight}
        intensity={1.15 * Math.PI}
        position={[38, 54, 26]}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-camera-near={1}
        shadow-camera-far={220}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
      />
      {/* Cool rim from behind the sun, casting nothing — the expensive half of
          the same two-tone effect. */}
      <directionalLight
        color={SCENE.rimLight}
        intensity={0.42 * Math.PI}
        position={[-44, 22, -34]}
      />

      <Physics gravity={[0, -30, 0]}>
        <Ground />
        <Player />
        <House />
        <Cubes />
      </Physics>
      {/* Outside <Physics>: stars are pickups, the builder only raycasts, and
          the flood is visual — you swim through it, the breath timer is what
          actually threatens you. */}
      <Stars />
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
