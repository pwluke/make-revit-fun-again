"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { Sky, PointerLockControls, KeyboardControls } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { Ground } from "./Ground";
import { Player } from "./Player";
import { Cube, Cubes } from "./Cube";
import { SketchController } from "../sketch3d/r3f/SketchController";
import { Strokes } from "../sketch3d/r3f/Strokes";

// The original was made by Maksim Ivanow: https://www.youtube.com/watch?v=Lc2JvBXMesY&t=124s
// This example needs pointer-lock, that works only if you open it in a new window
// Controls: WASD + left click

export default function App() {
  return (
    <KeyboardControls
      map={[
        { name: "forward", keys: ["ArrowUp", "w", "W"] },
        { name: "backward", keys: ["ArrowDown", "s", "S"] },
        { name: "left", keys: ["ArrowLeft", "a", "A"] },
        { name: "right", keys: ["ArrowRight", "d", "D"] },
        { name: "jump", keys: ["Space"] },
      ]}
    >
      {/* "percentage" is PCFShadowMap. Bare `shadows` would select
          PCFSoftShadowMap, which three deprecated in 0.185. */}
      <Canvas shadows="percentage" camera={{ fov: 45 }}>
        <Sky sunPosition={[100, 20, 100]} />
        <ambientLight intensity={0.3 * Math.PI} />
        <pointLight
          castShadow
          intensity={0.8 * Math.PI}
          decay={0}
          position={[100, 100, 100]}
        />
        {/* Ground/Cube textures and the axe GLB all suspend while they load, so
            they need a boundary inside the Canvas to fall back to. */}
        <Suspense fallback={null}>
          <Physics gravity={[0, -30, 0]}>
            <Ground />
            <Player />
            <Cube position={[0, 0.5, -10]} />
            <Cubes />
          </Physics>
        </Suspense>
        <SketchController />
        <Strokes />
        <PointerLockControls />
      </Canvas>
    </KeyboardControls>
  );
}
