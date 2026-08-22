import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { create } from "zustand";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";

// Served from `public/dirt.jpg` — see the note in Axe.tsx.
const dirtImg = "/dirt.jpg";

type CubeCoords = [x: number, y: number, z: number];

const FACE_DIRS: CubeCoords[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

const dummy = new THREE.Object3D();

type CubeStore = {
  cubes: CubeCoords[];
  addCube: (x: number, y: number, z: number) => void;
};

// Exported so gesture-driven building (GestureBuilder) can queue cubes
// without going through a pointer event.
export const useCubeStore = create<CubeStore>((set) => ({
  cubes: [[0, 0.5, -10]],
  addCube: (x, y, z) =>
    set((state) => ({ cubes: [...state.cubes, [x, y, z]] })),
}));

export const Cubes = () => {
  const localCubes = useCubeStore((state) => state.cubes);
  const { data } = useGridPoints();
  const cubes = useMemo(() => {
    const seeded = occupiedPointCoords(data?.points);
    if (seeded.length === 0) return localCubes;
    const positions: CubeCoords[] = new Array(seeded.length + localCubes.length);
    for (let i = 0; i < seeded.length; i++) positions[i] = seeded[i].position;
    for (let i = 0; i < localCubes.length; i++) {
      positions[seeded.length + i] = localCubes[i];
    }
    return positions;
  }, [data?.points, localCubes]);

  return <InstancedCubes cubes={cubes} />;
};

function InstancedCubes({ cubes }: { cubes: CubeCoords[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cubesRef = useRef(cubes);
  cubesRef.current = cubes;

  const texture = useTexture(dirtImg);
  const addCube = useCubeStore((state) => state.addCube);
  const [hovered, setHovered] = useState<number | null>(null);

  const capRef = useRef(Math.max(cubes.length, 1));
  if (cubes.length > capRef.current) capRef.current = cubes.length;
  const capacity = capRef.current;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < cubes.length; i++) {
      dummy.position.set(cubes[i][0], cubes[i][1], cubes[i][2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = cubes.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cubes]);

  const onMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (e.instanceId == null) return;
    setHovered((current) =>
      current === e.instanceId ? current : e.instanceId!,
    );
  }, []);

  const onOut = useCallback(() => setHovered(null), []);

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const id = e.instanceId;
      if (id == null || e.faceIndex == null) return;
      const coords = cubesRef.current[id];
      if (!coords) return;
      const [dx, dy, dz] = FACE_DIRS[Math.floor(e.faceIndex / 2)] ?? FACE_DIRS[0];
      addCube(coords[0] + dx, coords[1] + dy, coords[2] + dz);
    },
    [addCube],
  );

  const hoverPos = hovered != null ? cubes[hovered] : undefined;

  if (cubes.length === 0) return null;

  return (
    <>
      <instancedMesh
        key={capacity}
        ref={meshRef}
        args={[undefined, undefined, capacity]}
        frustumCulled={false}
        castShadow
        receiveShadow
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
      >
        <boxGeometry />
        <meshStandardMaterial map={texture} />
      </instancedMesh>
      {hoverPos && (
        <mesh position={hoverPos} scale={1.02} raycast={() => {}}>
          <boxGeometry />
          <meshBasicMaterial
            color="hotpink"
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}
