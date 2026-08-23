"use client";

import { useLayoutEffect, type ReactNode } from "react";
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
  children,
}: {
  fov: number;
  sceneEpoch: number;
  onPlay: () => void;
  /** Per-mode scene add-on. Deliberately not part of `key` — mounting one
   *  should reconcile inside the live canvas, not reload the model. */
  children?: ReactNode;
}) {
  return (
    <div className="scene-canvas-wrap" onPointerDown={onPlay}>
      <MinecraftControls>
        <SceneCanvas
          key={sceneEpoch}
          camera={{ fov, position: [0, 10, 0] }}
        >
          <CameraFov fov={fov} />
          <MinecraftScene>{children}</MinecraftScene>
        </SceneCanvas>
      </MinecraftControls>
    </div>
  );
}
