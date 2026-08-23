"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useStore } from "zustand";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import { creationStore } from "../core/creationStore";
import type { Creation } from "../core/types";
import { PreviewCard } from "./PreviewCard";
import { SpriteCreation } from "./SpriteCreation";
import { useR3FSceneBridge } from "./useR3FSceneBridge";

// Any texture image wider or taller than this gets redrawn onto a smaller
// canvas before it touches the GPU. A measured generation ships a 12 MB PNG;
// with up to MAX_CREATIONS of those live this is the single biggest
// performance win available, and it costs nothing visually at this scale.
const MAX_TEXTURE_SIZE = 1024;

// Generated models arrive microscopic or enormous depending on the source
// sketch. Normalise every one to roughly this size so it reads sensibly next
// to the 1-unit voxel cubes.
const TARGET_SIZE = 2;

export function downscaleTexture(texture: THREE.Texture, maxSize: number): void {
  const image = texture.image as HTMLImageElement | ImageBitmap | undefined;
  if (!image || !image.width || !image.height) return;
  const longest = Math.max(image.width, image.height);
  if (longest <= maxSize) return;

  const scale = maxSize / longest;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  texture.image = canvas;
  texture.needsUpdate = true;
}

/** Recentres and rescales a cloned glTF scene so it reads at a consistent size. */
function normalizeScene(scene: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const largestDimension = Math.max(size.x, size.y, size.z);
  if (largestDimension > 0) {
    const scale = TARGET_SIZE / largestDimension;
    scene.scale.setScalar(scale);
  }

  // Recompute the box post-scale and recentre on X/Z, sit on the ground on Y.
  const scaledBox = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  scaledBox.getCenter(center);
  scene.position.x -= center.x;
  scene.position.z -= center.z;
  scene.position.y -= scaledBox.min.y;
}

// `scene.clone(true)` (see LoadedModel below) deep-clones the node hierarchy,
// but three's Mesh.copy() assigns `material` and `geometry` BY REFERENCE — so
// without the clone()s below, mutating flatShading/texture here would mutate
// the object cached by useGLTF for that URL, corrupting every other user of
// it (mock mode reuses /axe.glb, which the player's own held axe also loads).
// Materials and textures are therefore made per-instance here; geometry is
// deliberately left shared with the drei cache. That split is also what
// makes the disposal in LoadedModel's cleanup effect safe: it only ever
// frees the per-instance material/texture clones, never the shared geometry.
function applyMaterialPass(scene: THREE.Group): void {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const isArray = Array.isArray(child.material);
    const materials = isArray ? (child.material as THREE.Material[]) : [child.material as THREE.Material];
    const cloned = materials.map((material) => {
      const materialClone = material.clone();
      if (!("flatShading" in materialClone)) return materialClone;
      const standardMaterial = materialClone as THREE.MeshStandardMaterial;
      standardMaterial.flatShading = true;
      /**
       * Force non-metal. TRELLIS emits a material with `roughnessFactor: 1` and
       * NO `metallicFactor`, and the glTF spec defaults that to 1.0 — fully
       * metallic. A metal surface with no environment map reflects nothing, so it
       * renders as a BLACK SILHOUETTE and its baseColorTexture is ignored
       * completely. Verified by dumping the GLB's material JSON.
       *
       * These are stylized toy figures; none of them is ever metal. Setting it
       * here rather than per-pipeline means any future generator that omits the
       * factor is covered too.
       */
      standardMaterial.metalness = 0;
      standardMaterial.needsUpdate = true;
      if (standardMaterial.map) {
        // Texture.clone() shares the underlying `.image` reference, but we
        // reassign `.image` on the clone (downscaleTexture), so the original
        // cached texture's image is left untouched.
        standardMaterial.map = standardMaterial.map.clone();
        downscaleTexture(standardMaterial.map, MAX_TEXTURE_SIZE);
        standardMaterial.map.needsUpdate = true;
      }
      return standardMaterial;
    });
    child.material = isArray ? cloned : cloned[0];
  });
}

/** Per-instance resources created by applyMaterialPass, freed on unmount. */
function disposeMaterialPass(scene: THREE.Group): void {
  scene.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      const standardMaterial = material as THREE.MeshStandardMaterial;
      // Geometry is intentionally NOT disposed here — it is still owned by
      // drei's useGLTF cache and other creations spawned from the same URL
      // may still be using it.
      standardMaterial.map?.dispose();
      standardMaterial.dispose();
    }
  });
}

type LoadedModelProps = {
  creation: Creation;
  glbUrl: string;
};

function LoadedModel({ creation, glbUrl }: LoadedModelProps) {
  const gltf = useGLTF(glbUrl);
  // useGLTF caches by URL — mutating the cached scene would leak the
  // normalise/material pass across every user of that URL (same class of bug
  // the linter flags in components/minecraft/Ground.tsx).
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    normalizeScene(cloned);
    applyMaterialPass(cloned);
    return cloned;
  }, [gltf]);

  // <primitive> opts out of R3F's automatic disposal, and each creation is
  // ~26 MB of GPU resources — with MAX_CREATIONS live, evicted creations
  // must free their own material/texture clones on unmount or that memory
  // never comes back. Geometry is skipped: see the comment on
  // disposeMaterialPass, it's still owned by the drei cache.
  useEffect(() => {
    return () => disposeMaterialPass(scene);
  }, [scene]);

  const { position, rotationY } = creation.spawn;

  return (
    <RigidBody type="fixed" colliders={false} position={position} rotation={[0, rotationY, 0]}>
      <primitive object={scene} />
    </RigidBody>
  );
}

type GhostProps = {
  creation: Creation;
};

/**
 * Placeholder shown while a creation is uploading/generating. Generation takes
 * ~130 seconds measured, so this is what makes the wait tolerable — it gives
 * the kid something of theirs to look at immediately while they walk around.
 */
function Ghost({ creation }: GhostProps) {
  const { position, rotationY } = creation.spawn;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <GhostMesh />
    </group>
  );
}

function GhostMesh() {
  const materialRef = useRef<THREE.MeshStandardMaterial>(null!);

  useFrame((state) => {
    if (!materialRef.current) return;
    materialRef.current.opacity = 0.35 + Math.sin(state.clock.elapsedTime * 2) * 0.15;
  });

  return (
    <mesh position={[0, 0.75, 0]}>
      <boxGeometry args={[1.5, 1.5, 1.5]} />
      <meshStandardMaterial ref={materialRef} color="#8ecae6" transparent opacity={0.5} />
    </mesh>
  );
}

function CreationEntry({ creation }: { creation: Creation }) {
  if (creation.state.status === "ready") {
    const { result } = creation.state;
    if (result.mode === "sprite") {
      return (
        <Suspense fallback={null}>
          <SpriteCreation spriteUrl={result.spriteUrl} spawn={creation.spawn} />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={null}>
        <LoadedModel creation={creation} glbUrl={result.glbUrl} />
      </Suspense>
    );
  }
  // Fast mode hands us its bridge image partway through, so the child sees their
  // own drawing in colour at ~2.3s rather than a placeholder box for ~19s. The
  // Ghost remains the fallback for every other mode and for the window before the
  // bridge lands.
  if (creation.state.status === "generating" && creation.state.previewUrl) {
    return (
      <Suspense fallback={<Ghost creation={creation} />}>
        <PreviewCard previewUrl={creation.state.previewUrl} spawn={creation.spawn} />
      </Suspense>
    );
  }
  if (creation.state.status === "uploading" || creation.state.status === "generating") {
    return <Ghost creation={creation} />;
  }
  // "error" — render nothing.
  return null;
}

/** Rendered inside <Canvas> and inside <Physics>. Registers the scene bridge. */
export function Creations() {
  const bridge = useR3FSceneBridge();
  const creations = useStore(creationStore, (s) => s.creations);

  // `bridge` has a stable identity across renders (see useR3FSceneBridge),
  // so this effect body still runs exactly once — but honestly, per the
  // linter. Do NOT drop `bridge` from the deps or suppress the rule: doing
  // so is what previously let a stale, null-controls bridge get registered
  // permanently (setInputEnabled was a silent no-op).
  useEffect(() => {
    creationStore.getState().registerBridge(bridge);
    return () => creationStore.getState().registerBridge(null);
  }, [bridge]);

  return (
    <>
      {creations.map((creation) => (
        <CreationEntry key={creation.id} creation={creation} />
      ))}
    </>
  );
}
