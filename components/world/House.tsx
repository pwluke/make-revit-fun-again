import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import {
  HOUSE_BRICKS,
  HOUSE_COLORS,
  houseVoxels,
  type HouseMaterial,
} from "./houseData";

const dummy = new THREE.Object3D();

function VoxelBatch({
  positions,
  mat,
}: {
  positions: [number, number, number][];
  mat: HouseMaterial;
}) {
  const ref = useRef<THREE.InstancedMesh>(null!);
  useLayoutEffect(() => {
    positions.forEach((p, i) => {
      dummy.position.set(p[0], p[1], p[2]);
      dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [positions]);

  const transparent = mat === "glass";
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, positions.length]}
      castShadow={!transparent}
      receiveShadow
      // Voxels are placed edge to edge; a hair of inset keeps the seams
      // from z-fighting on shallow viewing angles.
      scale={0.999}
    >
      <boxGeometry />
      <meshStandardMaterial
        color={HOUSE_COLORS[mat]}
        transparent={transparent}
        opacity={transparent ? 0.42 : 1}
        roughness={transparent ? 0.1 : mat === "panel" ? 0.7 : 0.9}
        metalness={transparent ? 0.1 : 0}
      />
    </instancedMesh>
  );
}

/**
 * The explorable house. Rendered as voxels for the Minecraft look, but
 * collided as one cuboid per authored brick — a few dozen static colliders
 * instead of one per cube.
 */
export function House() {
  const voxels = useMemo(() => houseVoxels(), []);
  return (
    <>
      {(Object.keys(voxels) as HouseMaterial[])
        .filter((mat) => voxels[mat].length > 0)
        .map((mat) => (
          <VoxelBatch key={mat} mat={mat} positions={voxels[mat]} />
        ))}
      <RigidBody type="fixed" colliders={false}>
        {HOUSE_BRICKS.map((brick, i) => (
          <CuboidCollider
            key={i}
            args={[
              (brick.x1 + 1 - brick.x0) / 2,
              (brick.y1 + 1 - brick.y0) / 2,
              (brick.z1 + 1 - brick.z0) / 2,
            ]}
            position={[
              (brick.x0 + brick.x1 + 1) / 2,
              (brick.y0 + brick.y1 + 1) / 2,
              (brick.z0 + brick.z1 + 1) / 2,
            ]}
            friction={0}
          />
        ))}
      </RigidBody>
    </>
  );
}
