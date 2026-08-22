import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { create } from "zustand";
import {
  useGridSourceStore,
  useOccupiedGridCubes,
} from "@/lib/use-grid-points";

// Served from `public/dirt.jpg` — see the note in Axe.tsx.
const dirtImg = "/dirt.jpg";

type CubeCoords = [x: number, y: number, z: number];

type RenderedCube = {
  position: CubeCoords;
  size: number;
  color?: [number, number, number];
};

// How far the player can reach to break or place, in world units. Also caps the
// per-frame raycast, so a block across the map can't be edited by aiming at it.
const REACH = 8;

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
// Pointer lock freezes the mouse, so every pick is from the screen centre —
// i.e. the crosshair the page draws over the canvas.
const CROSSHAIR = new THREE.Vector2(0, 0);

const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

type CubeStore = {
  added: CubeCoords[];
  /** Coordinate keys subtracted from the merged set — see `removeCube`. */
  removed: ReadonlySet<string>;
  addCube: (x: number, y: number, z: number) => void;
  removeCube: (x: number, y: number, z: number) => void;
  resetCubes: () => void;
};

const useCubeStore = create<CubeStore>((set) => ({
  added: [[0, 0.5, -10]],
  removed: new Set<string>(),
  addCube: (x, y, z) =>
    set((state) => {
      const key = keyOf(x, y, z);
      // Placing where something was broken un-breaks it, rather than stacking a
      // duplicate that the mask would immediately hide again.
      const removed = new Set(state.removed);
      removed.delete(key);
      const already = state.added.some((coords) => keyOf(...coords) === key);
      return {
        removed,
        added: already ? state.added : [...state.added, [x, y, z]],
      };
    }),
  removeCube: (x, y, z) =>
    set((state) => {
      const key = keyOf(x, y, z);
      return {
        added: state.added.filter((coords) => keyOf(...coords) !== key),
        // Seeded cubes arrive from a live InstantDB subscription, so they can't
        // be spliced out at the source. Deletion is recorded as a mask instead,
        // and the merge step subtracts it.
        removed: new Set(state.removed).add(key),
      };
    }),
  resetCubes: () =>
    set({ added: [[0, 0.5, -10]], removed: new Set<string>() }),
}));

export const Cubes = () => {
  const added = useCubeStore((state) => state.added);
  const removed = useCubeStore((state) => state.removed);
  const resetCubes = useCubeStore((state) => state.resetCubes);
  const source = useGridSourceStore((state) => state.source);
  const seeded = useOccupiedGridCubes();

  useEffect(() => {
    resetCubes();
  }, [source, resetCubes]);

  const cubes = useMemo(() => {
    const seen = new Set<string>();
    const out: RenderedCube[] = [];
    const push = (
      coords: CubeCoords,
      size: number,
      color?: [number, number, number],
    ) => {
      const key = keyOf(...coords);
      if (removed.has(key) || seen.has(key)) return;
      seen.add(key);
      out.push({ position: coords, size, color });
    };
    for (const cube of seeded) push(cube.position, cube.size, cube.color);
    for (const coords of added) push(coords, 1);
    return out;
  }, [seeded, added, removed]);

  return <InstancedCubes key={source} cubes={cubes} />;
};

function InstancedCubes({ cubes }: { cubes: RenderedCube[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cubesRef = useRef(cubes);
  cubesRef.current = cubes;

  const camera = useThree((state) => state.camera);
  const texture = useTexture(dirtImg);
  const addCube = useCubeStore((state) => state.addCube);
  const removeCube = useCubeStore((state) => state.removeCube);
  const [hovered, setHovered] = useState<number | null>(null);

  // The instance buffer only ever grows; shrinking it would remount the mesh on
  // every break. `mesh.count` below is what actually hides removed instances.
  const capRef = useRef(Math.max(cubes.length, 1));
  if (cubes.length > capRef.current) capRef.current = cubes.length;
  const capacity = capRef.current;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    dummy.scale.set(1, 1, 1);
    for (let i = 0; i < cubes.length; i++) {
      const { position, size, color } = cubes[i];
      dummy.position.set(position[0], position[1], position[2]);
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      tint.setRGB(color?.[0] ?? 1, color?.[1] ?? 1, color?.[2] ?? 1);
      mesh.setColorAt(i, tint);
    }
    mesh.count = cubes.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // InstancedMesh.raycast rejects against the instance bounding sphere first,
    // so it has to be refreshed or newly-placed cubes become unpickable.
    mesh.computeBoundingSphere();
  }, [cubes]);

  // Private raycaster: setting `far` on the one from useThree would silently
  // clamp r3f's own pointer-event system too.
  const picker = useMemo(() => {
    const raycaster = new THREE.Raycaster();
    raycaster.far = REACH;
    return raycaster;
  }, []);

  // The pointerdown handler needs the pick synchronously, and React state is a
  // frame behind, so the authoritative copy lives in a ref. `hovered` exists
  // only to drive the highlight render.
  const hit = useRef<{ index: number; normal: THREE.Vector3 } | null>(null);

  const clearHit = useCallback(() => {
    hit.current = null;
    setHovered((current) => (current === null ? current : null));
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || mesh.count === 0) return clearHit();
    picker.setFromCamera(CROSSHAIR, camera);
    const [first] = picker.intersectObject(mesh, false);
    if (!first || first.instanceId == null || !first.face) return clearHit();
    hit.current = { index: first.instanceId, normal: first.face.normal };
    setHovered((current) =>
      current === first.instanceId ? current : first.instanceId!,
    );
  });

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      // Listen on the document, not the canvas: drei's PointerLockControls
      // locks r3f's event target — the wrapper div above the canvas — and a
      // locked element receives mouse events itself rather than passing them
      // down to its descendants. Any held lock means the scene owns the mouse.
      // This also skips the first click, the one that grabs the lock, which
      // shouldn't edit the world.
      if (!document.pointerLockElement) return;
      const current = hit.current;
      if (!current) return;
      const cube = cubesRef.current[current.index];
      if (!cube) return;
      const [cx, cy, cz] = cube.position;
      if (e.button === 0) {
        removeCube(cx, cy, cz);
      } else if (e.button === 2) {
        // Scale is uniform, so the local face normal is still the world-space
        // unit axis. Step by this cube's edge so a size-2 voxel places flush.
        const { x, y, z } = current.normal;
        const step = cube.size;
        addCube(
          cx + Math.round(x) * step,
          cy + Math.round(y) * step,
          cz + Math.round(z) * step,
        );
      }
    };
    // Only while the scene holds the mouse — otherwise this would swallow the
    // context menu for the ordinary page chrome around the canvas.
    const onContextMenu = (e: MouseEvent) => {
      if (document.pointerLockElement) e.preventDefault();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [addCube, removeCube]);

  const hoverCube = hovered != null ? cubes[hovered] : undefined;

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
      >
        <boxGeometry />
        <meshStandardMaterial map={texture} />
      </instancedMesh>
      <NearbyColliders cubes={cubes} />
      {hoverCube && (
        <mesh
          position={hoverCube.position}
          scale={hoverCube.size * 1.02}
          raycast={() => {}}
        >
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

function NearbyColliders({ cubes }: { cubes: RenderedCube[] }) {
  const [nearby, setNearby] = useState<RenderedCube[]>([]);
  // Sentinel: infinitely far from anywhere, so the first frame always builds.
  const builtAt = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));

  const rebuild = useCallback(
    (origin: THREE.Vector3) => {
      const radiusSq = COLLIDER_RADIUS * COLLIDER_RADIUS;
      const inRange: { cube: RenderedCube; distanceSq: number }[] = [];
      for (const cube of cubes) {
        const [x, y, z] = cube.position;
        const dx = x - origin.x;
        const dy = y - origin.y;
        const dz = z - origin.z;
        const distanceSq = dx * dx + dy * dy + dz * dz;
        if (distanceSq <= radiusSq) inRange.push({ cube, distanceSq });
      }
      // Nearest-first, so the cap trims the blocks least able to be reached
      // before the next rebuild.
      inRange.sort((a, b) => a.distanceSq - b.distanceSq);

      const next = inRange.slice(0, MAX_COLLIDERS).map(({ cube }) => cube);
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
      {nearby.map((cube) => {
        const half = cube.size / 2;
        return (
          <CuboidCollider
            key={keyOf(...cube.position)}
            args={[half, half, half]}
            position={cube.position}
          />
        );
      })}
    </RigidBody>
  );
}
