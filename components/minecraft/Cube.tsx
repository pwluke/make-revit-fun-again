import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import * as THREE from "three";
import { create } from "zustand";
import {
  neighborPosition,
  occupiedPointCoords,
  useGridPoints,
  type CubeCoords,
} from "@/lib/use-grid-points";
import { SCENE } from "@/lib/palette";
import { useGestureStore } from "../gesture/store";
import { BreakDebris, playBreakSound, spawnBreakDebris } from "./break-fx";
import { playerOrigin } from "./player-origin";
import { buildVoxelIndex, cellKey, pickVoxel } from "./voxel-pick";
import { THEMES, type LayerId } from "@/lib/themes";
import { useSceneTheme, useThemeStore } from "../world/themeStore";

// How far the player can reach to break or place, in world units. Also caps the
// per-frame raycast, so a block across the map can't be edited by aiming at it.
const REACH = 8;
/** Extra bricks removed with the one you aim at. */
const BREAK_NEIGHBORS = 10;

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

// Pointer lock freezes the mouse, so every pick is straight down the camera's
// facing — i.e. the crosshair the page draws over the canvas.
const viewDir = new THREE.Vector3();

const keyOf = (x: number, y: number, z: number) =>
  `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;

type CubeInstance = {
  position: CubeCoords;
  color: string;
};

type CubeStore = {
  added: CubeCoords[];
  /** Coordinate keys subtracted from the merged set — see `removeCube`. */
  removed: ReadonlySet<string>;
  addCube: (x: number, y: number, z: number) => void;
  removeCube: (x: number, y: number, z: number) => void;
  removeCubes: (positions: CubeCoords[]) => void;
};

// Exported so gesture-driven building (GestureBuilder) can queue cubes
// without going through a pointer event.
export const useCubeStore = create<CubeStore>((set) => ({
  added: [],
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
  removeCube: (x, y, z) => set((state) => maskRemoved(state, [[x, y, z]])),
  removeCubes: (positions) => set((state) => maskRemoved(state, positions)),
}));

function maskRemoved(state: CubeStore, positions: CubeCoords[]) {
  const removed = new Set(state.removed);
  const keys = new Set<string>();
  for (const coords of positions) {
    const key = keyOf(...coords);
    keys.add(key);
    // Seeded cubes arrive from the loaded point files, so they can't be
    // spliced out at the source. Deletion is recorded as a mask instead,
    // and the merge step subtracts it.
    removed.add(key);
  }
  return {
    added: state.added.filter((coords) => !keys.has(keyOf(...coords))),
    removed,
  };
}

/**
 * Drop cubes that are completely surrounded — they can never be seen, but they
 * are drawn, shadowed, raycast and collided against like any other.
 *
 * The model is a voxelised building, so most of its volume is interior: this is
 * the cheapest large win available, and it compounds with everything else
 * (fewer instances makes the crosshair raycast proportionally cheaper too).
 *
 * Errors here are one-sided by construction. A cell key that fails to match its
 * neighbour — floating point drift along the lattice, say — makes a cube look
 * *exposed*, so it is kept and drawn. The failure mode is a cube too many, not
 * a hole in the wall.
 */
function cullEnclosed(cubes: CubeInstance[], size: CubeCoords): CubeInstance[] {
  const [sx, sy, sz] = size;
  if (!sx || !sy || !sz) return cubes;

  const cellOf = (p: CubeCoords) =>
    [Math.round(p[0] / sx), Math.round(p[1] / sy), Math.round(p[2] / sz)] as const;

  const occupied = new Set<number>();
  for (const cube of cubes) occupied.add(cellKey(...cellOf(cube.position)));

  const visible: CubeInstance[] = [];
  for (const cube of cubes) {
    const [ix, iy, iz] = cellOf(cube.position);
    const enclosed =
      occupied.has(cellKey(ix + 1, iy, iz)) &&
      occupied.has(cellKey(ix - 1, iy, iz)) &&
      occupied.has(cellKey(ix, iy + 1, iz)) &&
      occupied.has(cellKey(ix, iy - 1, iz)) &&
      occupied.has(cellKey(ix, iy, iz + 1)) &&
      occupied.has(cellKey(ix, iy, iz - 1));
    if (!enclosed) visible.push(cube);
  }
  return visible;
}

function breakCluster(
  origin: CubeInstance,
  cubes: CubeInstance[],
  extra: number,
): CubeInstance[] {
  const scored: { cube: CubeInstance; distanceSq: number }[] = [];
  for (const cube of cubes) {
    const dx = cube.position[0] - origin.position[0];
    const dy = cube.position[1] - origin.position[1];
    const dz = cube.position[2] - origin.position[2];
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq === 0) continue;
    scored.push({ cube, distanceSq });
  }
  scored.sort((a, b) => a.distanceSq - b.distanceSq);
  return [origin, ...scored.slice(0, extra).map(({ cube }) => cube)];
}

export const Cubes = () => {
  const added = useCubeStore((state) => state.added);
  const removed = useCubeStore((state) => state.removed);
  const themeId = useThemeStore((state) => state.id);
  const theme = THEMES[themeId];
  const { data, blockSize } = useGridPoints();

  const cubes = useMemo(() => {
    const seen = new Set<string>();
    const out: CubeInstance[] = [];
    const push = (coords: CubeCoords, color: string) => {
      const key = keyOf(...coords);
      if (removed.has(key) || seen.has(key)) return;
      seen.add(key);
      out.push({ position: coords, color });
    };
    for (const point of occupiedPointCoords(data?.points)) {
      const themed = theme.layers[point.layer as LayerId] ?? point.color;
      push(point.position, themed);
    }
    for (const coords of added) push(coords, theme.playerBlock);
    // Recomputed whenever the world changes, so breaking a wall re-exposes the
    // cubes behind it on the same pass that removed the wall.
    return cullEnclosed(out, blockSize);
  }, [data?.points, added, removed, theme, blockSize]);

  return (
    <>
      <InstancedCubes cubes={cubes} size={blockSize} />
      <BreakDebris size={blockSize} />
    </>
  );
};

function InstancedCubes({
  cubes,
  size,
}: {
  cubes: CubeInstance[];
  size: CubeCoords;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const cubesRef = useRef(cubes);
  cubesRef.current = cubes;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const theme = useSceneTheme();
  const camera = useThree((state) => state.camera);
  const addCube = useCubeStore((state) => state.addCube);
  const removeCubes = useCubeStore((state) => state.removeCubes);
  const [hovered, setHovered] = useState<number | null>(null);

  // The instance buffer only ever grows; shrinking it would remount the mesh on
  // every break. `mesh.count` below is what actually hides removed instances.
  const capRef = useRef(Math.max(cubes.length, 1));
  if (cubes.length > capRef.current) capRef.current = cubes.length;
  const capacity = capRef.current;

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    for (let i = 0; i < cubes.length; i++) {
      dummy.position.set(...cubes[i].position);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, tint.set(cubes[i].color));
    }
    mesh.count = cubes.length;
    mesh.instanceMatrix.needsUpdate = true;
    // `setColorAt` creates the attribute on first use, so this can't be hoisted.
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // InstancedMesh.raycast rejects against the instance bounding sphere first,
    // so it has to be refreshed or newly-placed cubes become unpickable.
    mesh.computeBoundingSphere();
  }, [cubes]);

  // Cell -> instance lookup for crosshair picking, rebuilt with the world.
  const voxelIndex = useMemo(() => buildVoxelIndex(cubes, size), [cubes, size]);

  // The pointerdown handler needs the pick synchronously, and React state is a
  // frame behind, so the authoritative copy lives in a ref. `hovered` exists
  // only to drive the highlight render.
  // The normal is a plain axis vector, not a THREE.Vector3: the voxel walk knows
  // which face it crossed, and neighborPosition only reads x/y/z.
  const hit = useRef<{
    index: number;
    normal: { x: number; y: number; z: number };
  } | null>(null);

  const clearHit = useCallback(() => {
    hit.current = null;
    setHovered((current) => (current === null ? current : null));
  }, []);

  /**
   * Break the brick at an instance index, with its cluster, debris and sound.
   * Shared by the left click and the gesture so the two can't drift apart — and
   * so the gesture picks up anything added to the mouse path later.
   *
   * Takes the index into the authoritative cube array rather than a position
   * read back out of the instance matrix: that buffer is Float32, and these are
   * voxelised model coordinates rather than a tidy integer grid, so the round
   * trip shifts the low digits. keyOf's 4dp rounding would currently absorb
   * that, but relying on it would make deletion depend on a rounding choice
   * made elsewhere.
   */
  const breakAt = useCallback(
    (index: number) => {
      const target = cubesRef.current[index];
      if (!target) return;
      const cluster = breakCluster(target, cubesRef.current, BREAK_NEIGHBORS);
      removeCubes(cluster.map((cube) => cube.position));
      spawnBreakDebris(cluster, sizeRef.current);
      playBreakSound(cluster.length);
    },
    [removeCubes],
  );

  useFrame(() => {
    // Consumed up front, even when nothing is under the crosshair: a queued
    // break that missed should be dropped, not held until the player happens to
    // aim at a block later.
    const breakQueued = useGestureStore.getState().consumeBreak();
    const mesh = meshRef.current;
    if (!mesh || mesh.count === 0) return clearHit();

    // Marching the voxel grid is a couple of dozen map lookups regardless of
    // world size, so this can run every frame again — the throttle this
    // replaces existed only to make an O(instances) raycast affordable.
    camera.getWorldDirection(viewDir);
    const found = pickVoxel(voxelIndex, camera.position, viewDir, REACH);
    if (!found) return clearHit();
    hit.current = { index: found.instanceId, normal: found.normal };
    setHovered((current) =>
      current === found.instanceId ? current : found.instanceId,
    );

    if (breakQueued) breakAt(found.instanceId);
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
      const target = cubesRef.current[current.index];
      if (!target) return;
      if (e.button === 0) {
        breakAt(current.index);
      } else if (e.button === 2) {
        // Instances are translation-only, so the local face normal is already
        // the world-space unit axis pointing out of the face that was hit.
        addCube(
          ...neighborPosition(target.position, current.normal, sizeRef.current),
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
  }, [addCube, breakAt]);

  const hoverPos = hovered != null ? cubes[hovered]?.position : undefined;
  const half: CubeCoords = [size[0] / 2, size[1] / 2, size[2] / 2];

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
        <boxGeometry args={size} />
        {/* White base so per-instance layer colours come through as authored. */}
        <meshStandardMaterial
          roughness={theme.cubeRoughness}
          metalness={theme.cubeMetalness}
        />
      </instancedMesh>
      <NearbyColliders cubes={cubes} half={half} />
      {hoverPos && (
        <mesh position={hoverPos} scale={1.02} raycast={() => {}}>
          <boxGeometry args={size} />
          <meshBasicMaterial
            color={SCENE.highlight}
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
/** Horizontal reach around the capsule — a 10-unit sphere around the camera
 *  let a dense wall eat the whole budget, then stairs underfoot had no
 *  collider until one popped in around the body. */
const COLLIDER_RADIUS = 4;
const COLLIDER_HEIGHT = 3;
const MAX_COLLIDERS = 1024;
const REBUILD_DISTANCE = 1.2;

function NearbyColliders({
  cubes,
  half,
}: {
  cubes: CubeInstance[];
  half: CubeCoords;
}) {
  const [nearby, setNearby] = useState<CubeCoords[]>([]);
  // Sentinel: infinitely far from anywhere, so the first frame always builds.
  const builtAt = useRef(new THREE.Vector3(Infinity, Infinity, Infinity));

  const rebuild = useCallback(
    (origin: THREE.Vector3) => {
      const radiusSq = COLLIDER_RADIUS * COLLIDER_RADIUS;
      const inRange: { coords: CubeCoords; distanceSq: number }[] = [];
      for (const cube of cubes) {
        const coords = cube.position;
        const dx = coords[0] - origin.x;
        const dy = coords[1] - origin.y;
        const dz = coords[2] - origin.z;
        if (Math.abs(dy) > COLLIDER_HEIGHT) continue;
        const planarSq = dx * dx + dz * dz;
        if (planarSq > radiusSq) continue;
        inRange.push({ coords, distanceSq: planarSq + dy * dy });
      }
      // Nearest-first, so the cap trims the blocks least able to be reached
      // before the next rebuild.
      inRange.sort((a, b) => a.distanceSq - b.distanceSq);

      const next = inRange.slice(0, MAX_COLLIDERS).map(({ coords }) => coords);
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

  useFrame(() => {
    if (
      playerOrigin.distanceToSquared(builtAt.current) <
      REBUILD_DISTANCE * REBUILD_DISTANCE
    ) {
      return;
    }
    rebuild(playerOrigin);
  });

  if (nearby.length === 0) return null;

  return (
    <RigidBody type="fixed" colliders={false}>
      {/* Keyed by coordinate: crossing a rebuild boundary changes only the
          blocks at the edge of the shell, so React keeps the colliders in the
          middle mounted instead of tearing down all of them. */}
      {nearby.map((coords) => (
        <CuboidCollider
          key={keyOf(...coords)}
          args={half}
          position={coords}
          friction={0}
        />
      ))}
    </RigidBody>
  );
}
