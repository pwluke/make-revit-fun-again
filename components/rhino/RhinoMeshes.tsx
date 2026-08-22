"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { InstaQLEntity } from "@instantdb/react";
import type { AppSchema } from "@/instant.schema";
import { geometryFromMesh, readableMeshColor } from "@/lib/mesh-buffers";

export type StreamedMesh = InstaQLEntity<AppSchema, "meshes">;

function StreamedMeshObject({ mesh }: { mesh: StreamedMesh }) {
  const geometry = useMemo(
    () => geometryFromMesh(mesh),
    [mesh.verticesB64, mesh.normalsB64, mesh.facesB64, mesh.updatedAt],
  );

  useEffect(() => {
    return () => {
      geometry?.dispose();
    };
  }, [geometry]);

  const color = readableMeshColor(mesh.color);

  if (!geometry || mesh.visible === false) return null;

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={color}
          roughness={0.55}
          metalness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>
      <lineSegments>
        <edgesGeometry args={[geometry]} />
        <lineBasicMaterial color="#111827" transparent opacity={0.35} />
      </lineSegments>
    </group>
  );
}

export function RhinoMeshes({ meshes }: { meshes: StreamedMesh[] }) {
  return (
    <>
      {meshes.map((mesh) => (
        <StreamedMeshObject key={mesh.id} mesh={mesh} />
      ))}
    </>
  );
}
