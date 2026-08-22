"use client";

import { Bounds, OrbitControls } from "@react-three/drei";
import { RhinoMeshes, type StreamedMesh } from "./RhinoMeshes";

export function RhinoScene({ meshes }: { meshes: StreamedMesh[] }) {
  return (
    <>
      <color attach="background" args={["#111314"]} />
      <hemisphereLight args={["#f4f4f5", "#3f3f46", 0.7]} />
      <directionalLight
        castShadow
        position={[40, 80, 30]}
        intensity={1.35}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <gridHelper args={[400, 40, "#3f3f46", "#27272a"]} />
      {meshes.length > 0 ? (
        <Bounds fit clip observe margin={1.4}>
          <RhinoMeshes meshes={meshes} />
        </Bounds>
      ) : null}
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
    </>
  );
}
