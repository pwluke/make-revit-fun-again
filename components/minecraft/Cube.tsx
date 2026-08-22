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
import * as THREE from "three";
import { create } from "zustand";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";

// Served from `public/dirt.jpg` — see the note in Axe.tsx.
const dirtImg = "/dirt.jpg";

type CubeCoords = [x: number, y: number, z: number];

// How far the player can reach to break or place, in world units. Also caps the
// per-frame raycast, so a block across the map can't be edited by aiming at it.
const REACH = 8;

const dummy = new THREE.Object3D();
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
}));

export const Cubes = () => {
  const added = useCubeStore((state) => state.added);
  const removed = useCubeStore((state) => state.removed);
  const { data } = useGridPoints();

  const cubes = useMemo(() => {
    const seen = new Set<string>();
    const out: CubeCoords[] = [];
    const push = (coords: CubeCoords) => {
      const key = keyOf(...coords);
      if (removed.has(key) || seen.has(key)) return;
      seen.add(key);
      out.push(coords);
    };
    for (const point of occupiedPointCoords(data?.points)) push(point.position);
    for (const coords of added) push(coords);
    return out;
  }, [data?.points, added, removed]);

  return <InstancedCubes cubes={cubes} />;
};

function InstancedCubes({ cubes }: { cubes: CubeCoords[] }) {
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
    for (let i = 0; i < cubes.length; i++) {
      dummy.position.set(cubes[i][0], cubes[i][1], cubes[i][2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.count = cubes.length;
    mesh.instanceMatrix.needsUpdate = true;
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
      const coords = cubesRef.current[current.index];
      if (!coords) return;
      if (e.button === 0) {
        removeCube(...coords);
      } else if (e.button === 2) {
        // Instances are translation-only, so the local face normal is already
        // the world-space unit axis pointing out of the face that was hit.
        const { x, y, z } = current.normal;
        addCube(
          coords[0] + Math.round(x),
          coords[1] + Math.round(y),
          coords[2] + Math.round(z),
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
