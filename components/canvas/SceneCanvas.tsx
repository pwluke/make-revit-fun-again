"use client";

import { Suspense, type ReactNode } from "react";
import { Canvas, type CanvasProps } from "@react-three/fiber";

type SceneCanvasProps = {
  children: ReactNode;
  fallback?: ReactNode;
} & Omit<CanvasProps, "children">;

/**
 * Shared r3f canvas for Rhino, Minecraft, and later scenes.
 * Scene-specific lights, physics, and controls stay in the children.
 */
export function SceneCanvas({
  children,
  fallback = null,
  shadows = "percentage",
  camera = { fov: 45, position: [32, 24, 32] },
  ...props
}: SceneCanvasProps) {
  return (
    <Canvas
      shadows={shadows}
      camera={camera}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      {...props}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </Canvas>
  );
}
