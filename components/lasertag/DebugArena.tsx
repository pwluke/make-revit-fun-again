"use client";

import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { UI } from "@/lib/palette";
import { CELL } from "./botArena";

/**
 * Dev scaffold: paints a flat tile on every walkable cell, so you can see the
 * arena the bots are actually confined to and tune CELL / the obstruction band
 * in botArena.ts against it.
 *
 * Flip this on, walk the model, and check whether the interior rooms are
 * reachable at this voxel resolution — the doorways may be sealed by the
 * voxelisation, in which case the arena is the apron, the courtyards and the
 * west corridor. Delete this file once the arena is settled.
 */
const SHOW_ARENA = false;

const MAX_TILES = 60000;
const dummy = new THREE.Object3D();

export function DebugArena({ cells }: { cells: [number, number][] }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const count = Math.min(cells.length, MAX_TILES);

  useLayoutEffect(() => {
    if (!SHOW_ARENA) return;
    const instanced = mesh.current;
    if (!instanced) return;
    for (let i = 0; i < count; i++) {
      const [ci, cj] = cells[i];
      dummy.position.set(ci * CELL, 0.02, cj * CELL);
      dummy.rotation.set(-Math.PI / 2, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.count = count;
    instanced.instanceMatrix.needsUpdate = true;
    instanced.computeBoundingSphere();
  }, [cells, count]);

  if (!SHOW_ARENA || count === 0) return null;

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, MAX_TILES]}
      frustumCulled={false}
      // Never let the overlay eat a shot.
      raycast={() => {}}
    >
      <planeGeometry args={[CELL * 0.85, CELL * 0.85]} />
      <meshBasicMaterial color={UI.mint} transparent opacity={0.35} />
    </instancedMesh>
  );
}
