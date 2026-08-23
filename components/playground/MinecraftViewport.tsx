"use client";

import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { SceneCanvas } from "@/components/canvas/SceneCanvas";
import {
  MinecraftControls,
  MinecraftScene,
} from "@/components/minecraft/App";

function CameraFov({ fov }: { fov: number }) {
  const camera = useThree((state) => state.camera);

  useLayoutEffect(() => {
    if (!("fov" in camera)) return;
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }, [camera, fov]);

  return null;
}

export function MinecraftViewport({
  fov,
  sceneEpoch,
  onPlay,
}: {
  fov: number;
  sceneEpoch: number;
  onPlay: () => void;
}) {
  return (
    <div className="scene-canvas-wrap" onPointerDown={onPlay}>
      <MinecraftControls>
        <SceneCanvas
          key={sceneEpoch}
          camera={{ fov, position: [0, 10, 0] }}
        >
          <CameraFov fov={fov} />
          <MinecraftScene />
        </SceneCanvas>
      </MinecraftControls>
    </div>
  );
}
