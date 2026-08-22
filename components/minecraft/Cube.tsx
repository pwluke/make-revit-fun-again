import { useCallback, useMemo, useRef, useState } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import {
  RigidBody,
  type RapierRigidBody,
  type RigidBodyProps,
} from "@react-three/rapier";
import { create } from "zustand";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";

// Served from `public/dirt.jpg` — see the note in Axe.tsx.
const dirtImg = "/dirt.jpg";

// This is a naive implementation and wouldn't allow for more than a few thousand boxes.
// In order to make this scale this has to be one instanced mesh, then it could easily be
// hundreds of thousands.

type CubeCoords = [x: number, y: number, z: number];

type CubeStore = {
  cubes: CubeCoords[];
  addCube: (x: number, y: number, z: number) => void;
};

const useCubeStore = create<CubeStore>((set) => ({
  cubes: [],
  addCube: (x, y, z) =>
    set((state) => ({ cubes: [...state.cubes, [x, y, z]] })),
}));

export const Cubes = () => {
  const localCubes = useCubeStore((state) => state.cubes);
  const { data } = useGridPoints();
  const seeded = useMemo(
    () => occupiedPointCoords(data?.points),
    [data?.points],
  );

  return (
    <>
      {seeded.map(({ id, position }) => (
        <Cube key={id} position={position} />
      ))}
      {localCubes.map((coords, index) => (
        <Cube key={`local-${index}`} position={coords} />
      ))}
    </>
  );
};

export function Cube(props: RigidBodyProps) {
  const ref = useRef<RapierRigidBody>(null!);
  const [hover, set] = useState<number | null>(null);
  const addCube = useCubeStore((state) => state.addCube);
  const texture = useTexture(dirtImg);
  const onMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    set(Math.floor(e.faceIndex! / 2));
  }, []);
  const onOut = useCallback(() => set(null), []);
  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const { x, y, z } = ref.current.translation();
    const dir: CubeCoords[] = [
      [x + 1, y, z],
      [x - 1, y, z],
      [x, y + 1, z],
      [x, y - 1, z],
      [x, y, z + 1],
      [x, y, z - 1],
    ];
    addCube(...dir[Math.floor(e.faceIndex! / 2)]);
  }, []);
  return (
    <RigidBody {...props} type="fixed" colliders="cuboid" ref={ref}>
      <mesh
        receiveShadow
        castShadow
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
      >
        {[...Array(6)].map((_, index) => (
          <meshStandardMaterial
            attach={`material-${index}`}
            key={index}
            map={texture}
            color={hover === index ? "hotpink" : "white"}
          />
        ))}
        <boxGeometry />
      </mesh>
    </RigidBody>
  );
}
