import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
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

const useCubeStore = create<CubeStore>((set) => ({
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
      <NearbyColliders cubes={cubes} />
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

// Physics is culled to the player's immediate surroundings. The Rhino grid
// seeds thousands of cubes, and mounting a collider for every one of them cost
// ~1.2s of blocked main thread at load. Only blocks the player can actually
// walk into need to exist to Rapier — the rest are scenery.
const COLLIDER_RADIUS = 10; // blocks; ignore anything further out
const MAX_COLLIDERS = 512; // hard cap, so a dense grid can't blow the budget
const REBUILD_DISTANCE = 2; // player units of travel before reselecting

const coordKey = (coords: CubeCoords) =>
  `${coords[0]},${coords[1]},${coords[2]}`;

function NearbyColliders({ cubes }: { cubes: CubeCoords[] }) {
  const [nearby, setNearby] = useState<CubeCoords[]>([]);
  // Sentinel: infinitely far from anywhere, so the first frame always builds.
  const builtAt = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));

  const rebuild = useCallback(
    (origin: THREE.Vector3) => {
      const radiusSq = COLLIDER_RADIUS * COLLIDER_RADIUS;
      const inRange: { coords: CubeCoords; distanceSq: number }[] = [];
      for (const coords of cubes) {
        const dx = coords[0] - origin.x;
        const dy = coords[1] - origin.y;
        const dz = coords[2] - origin.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (distanceSq <= radiusSq) inRange.push({ coords, distanceSq });
      }
      // Nearest-first, so the cap trims the blocks least able to be reached
      // before the next rebuild.
      inRange.sort((a, b) => a.distanceSq - b.distanceSq);

      const seen = new Set<string>();
      const next: CubeCoords[] = [];
      for (const { coords } of inRange) {
        // `addCube` doesn't dedupe, so two faces can seed the same cell. One
        // collider per cell is both correct and required for unique keys.
        const key = coordKey(coords);
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(coords);
        if (next.length >= MAX_COLLIDERS) break;
      }
      setNearby(next);
      builtAt.current.copy(origin);
    },
    [cubes],
  );

  // A block placed at arm's length must become solid immediately, so a change
  // to the cube list forces a rebuild regardless of how far the player moved.
  useEffect(() => {
    builtAt.current.set(Infinity, Infinity, Infinity);
  }, [cubes]);

  useFrame(({ camera }) => {
    // Player.tsx copies the rigid body's translation onto the camera every
    // frame, so the camera *is* the player position — no cross-module ref.
    if (
      camera.position.distanceToSquared(builtAt.current) <
      REBUILD_DISTANCE * REBUILD_DISTANCE
    ) {
      return;
    }
    rebuild(camera.position);
  });

  if (nearby.length === 0) return null;

  return (
    <RigidBody type="fixed" colliders={false}>
      {/* Keyed by coordinate: crossing a rebuild boundary changes only the
          blocks at the edge of the shell, so React keeps the colliders in the
          middle mounted instead of tearing down all of them. */}
      {nearby.map((coords) => (
        <CuboidCollider
          key={coordKey(coords)}
          args={[0.5, 0.5, 0.5]}
          position={coords}
        />
      ))}
    </RigidBody>
  );
}
