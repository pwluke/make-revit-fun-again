"use client";

/**
 * Renders the player's most recent finished creation as the item they are
 * holding, replacing the axe.
 *
 * "You drew a dragon, now you are carrying the dragon" needs no explanation and
 * no key binding, which is why it is keyed to the newest creation rather than to
 * a selection UI.
 *
 * Renders `fallback` when nothing has been generated yet — a prop rather than a
 * null return, because the caller must always produce exactly one child for
 * Player.tsx's walk-bob animation to address.
 */

import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import { DoubleSide } from "three";
import { useGLTF, useTexture } from "@react-three/drei";
import { useStore } from "zustand";
import { creationStore } from "../core/creationStore";
import { applyMaterialPass, normalizeScene } from "./Creations";

/**
 * Hand-sized. Creations are normalised to 2 units in the world; held at that
 * size a creation would fill the entire screen.
 */
const HELD_SIZE = 0.32;

/** Matches the axe's offset in Player.tsx, so the swap lands in the same place. */
const HELD_OFFSET: [number, number, number] = [0.3, -0.35, 0.5];

export function HeldCreation({ fallback }: { fallback: ReactNode }) {
  const creations = useStore(creationStore, (state) => state.creations);

  // Newest FINISHED creation. Scanning from the end means an in-flight
  // generation never blanks out the thing currently being held — you keep
  // carrying the last one until the new one is genuinely ready.
  const newest = useMemo(() => {
    for (let i = creations.length - 1; i >= 0; i--) {
      const candidate = creations[i];
      if (candidate.state.status === "ready") return candidate;
    }
    return null;
  }, [creations]);

  if (!newest || newest.state.status !== "ready") return <>{fallback}</>;
  const { result } = newest.state;

  return result.mode === "sprite" ? (
    <HeldSprite spriteUrl={result.spriteUrl} />
  ) : (
    <HeldModel glbUrl={result.glbUrl} />
  );
}

function HeldModel({ glbUrl }: { glbUrl: string }) {
  const gltf = useGLTF(glbUrl);

  // Same clone-then-treat pattern as Creations.tsx: useGLTF caches by URL, so
  // mutating the cached scene would corrupt the copy standing in the world.
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    normalizeScene(cloned, HELD_SIZE);
    applyMaterialPass(cloned);
    return cloned;
  }, [gltf]);

  useEffect(() => {
    return () => {
      scene.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          const standard = material as THREE.MeshStandardMaterial;
          standard.map?.dispose();
          standard.dispose();
        }
      });
    };
  }, [scene]);

  return (
    <group position={HELD_OFFSET}>
      {/* Turned to present its front-three-quarter to the camera rather than its
          back, which is what a straight mount gives (glTF faces -Z). */}
      <group rotation={[0, Math.PI * 0.85, 0]}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

/**
 * Sprite creations are billboards, not meshes — but Quick mode is the fastest
 * and therefore most-used path, so holding nothing after making one would look
 * like the feature is broken. Held as a small flat card, which is honest about
 * what a 2.5D creation actually is.
 */
function HeldSprite({ spriteUrl }: { spriteUrl: string }) {
  const texture = useTexture(spriteUrl);
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 1;

  return (
    <group position={HELD_OFFSET}>
      <mesh rotation={[0, Math.PI * 0.9, 0]}>
        <planeGeometry args={[HELD_SIZE * aspect, HELD_SIZE]} />
        {/* alphaTest rather than transparent, for the same depth-sorting reason
            as SpriteCreation. */}
        <meshBasicMaterial map={texture} alphaTest={0.5} transparent={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}
