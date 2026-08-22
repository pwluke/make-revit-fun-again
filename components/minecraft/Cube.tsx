import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { create } from "zustand";

type CubeCoords = [x: number, y: number, z: number];

type Point = {
  x: number;
  y: number;
  z: number;
};

type PointSet = {
  url: string;
  color: string;
};

const POINT_SCALE = 1 / 50;

// Add future point files and their colors here. Each set is fetched in parallel
// and rendered with its own InstancedMesh.
const POINT_SETS: PointSet[] = [
  { url: "/points1.json", color: "#66CC99" },
];

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

const useCubeStore = create<CubeStore>((set) => ({
  cubes: [[0, 0.5, -10]],
  addCube: (x, y, z) =>
    set((state) => ({ cubes: [...state.cubes, [x, y, z]] })),
}));

export const Cubes = () => {
  const localCubes = useCubeStore((state) => state.cubes);

  return (
    <>
      {POINT_SETS.map((pointSet) => (
        <PointSetCubes key={pointSet.url} pointSet={pointSet} />
      ))}
      <InstancedCubes cubes={localCubes} color="#66CC99" />
    </>
  );
};

function PointSetCubes({ pointSet }: { pointSet: PointSet }) {
  const [cubes, setCubes] = useState<CubeCoords[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPoints() {
      try {
        const response = await fetch(pointSet.url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(
            `Failed to load ${pointSet.url}: ${response.status} ${response.statusText}`,
          );
        }

        const points: unknown = await response.json();
        if (!Array.isArray(points)) {
          throw new Error(`${pointSet.url} must contain an array of points`);
        }

        const positions: CubeCoords[] = [];
        for (const point of points) {
          if (!isPoint(point)) continue;
          positions.push([
            point.x * POINT_SCALE,
            point.y * POINT_SCALE,
            point.z * POINT_SCALE,
          ]);
        }
        setCubes(positions);
      } catch (error) {
        if (!controller.signal.aborted) console.error(error);
      }
    }

    void loadPoints();
    return () => controller.abort();
  }, [pointSet.url]);

  return <InstancedCubes cubes={cubes} color={pointSet.color} />;
}

function isPoint(value: unknown): value is Point {
  if (typeof value !== "object" || value === null) return false;
  const point = value as Partial<Point>;
  return (
    typeof point.x === "number" &&
    Number.isFinite(point.x) &&
    typeof point.y === "number" &&
    Number.isFinite(point.y) &&
    typeof point.z === "number" &&
    Number.isFinite(point.z)
  );
}

function InstancedCubes({
  cubes,
  color,
}: {
  cubes: CubeCoords[];
  color: string;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const addCube = useCubeStore((state) => state.addCube);
  const [hovered, setHovered] = useState<number | null>(null);

  const capacity = Math.max(cubes.length, 1);

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
      const coords = cubes[id];
      if (!coords) return;
      const [dx, dy, dz] = FACE_DIRS[Math.floor(e.faceIndex / 2)] ?? FACE_DIRS[0];
      addCube(coords[0] + dx, coords[1] + dy, coords[2] + dz);
    },
    [addCube, cubes],
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
        <meshStandardMaterial color={color} />
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
