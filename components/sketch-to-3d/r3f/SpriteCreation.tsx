"use client";

/**
 * Renders a generated sprite ("mode: sprite") as a 2.5D billboard.
 *
 * Three measured fixes, each load-bearing:
 *
 * 1. Trim the alpha bounding box. SDXL returns a fixed 832x1216 frame with
 *    the subject floating in transparent padding; mapped straight to a quad
 *    the creature hovers above the ground with invisible margins. The bbox
 *    threshold is alpha > 8, NOT > 0 — BiRefNet leaves a faint near-zero
 *    halo that a strict >0 test would include, undoing the trim.
 * 2. `alphaTest: 0.5` with `transparent: false`. Transparent materials
 *    depth-sort and flicker against each other and other creations;
 *    alphaTest writes depth normally and shadows still work.
 * 3. Yaw-only billboard, not drei's `<Billboard>`. A full lookAt tilts the
 *    card when the player looks up/down, so a standing creature reads as
 *    leaning backwards.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { DoubleSide } from "three";
import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { SpawnTransform } from "../core/types";
import { downscaleTexture } from "./Creations";

const TARGET_HEIGHT = 2;
const ALPHA_THRESHOLD = 8;
// One place owns "textures entering the scene are bounded" (see Creations.tsx).
// Applied to the CanvasTexture we produce below, not the source image, so the
// crop happens at full resolution and only the final on-screen texture pays
// the downscale cost.
const MAX_SPRITE_TEXTURE_SIZE = 512;

type SpriteCreationProps = {
  spriteUrl: string;
  spawn: SpawnTransform;
};

type TrimmedSprite = {
  texture: THREE.CanvasTexture;
  aspect: number; // width / height of the cropped region
};

/** Finds the bbox of pixels with alpha > ALPHA_THRESHOLD, or null if none. */
function findAlphaBBox(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const { data } = ctx.getImageData(0, 0, width, height);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

/** Trims the transparent padding off a loaded texture into a new CanvasTexture. */
function trimSprite(texture: THREE.Texture): TrimmedSprite | null {
  const image = texture.image as HTMLImageElement | ImageBitmap | undefined;
  if (!image || !image.width || !image.height) return null;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) return null;
  sourceCtx.drawImage(image, 0, 0);

  const bbox = findAlphaBBox(sourceCtx, image.width, image.height);
  // Degenerate (fully transparent) cutout — fall back to the untrimmed frame
  // rather than crashing on a zero-sized crop.
  const { minX, minY, maxX, maxY } = bbox ?? { minX: 0, minY: 0, maxX: image.width - 1, maxY: image.height - 1 };

  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  if (croppedWidth <= 0 || croppedHeight <= 0) return null;

  const croppedCanvas = document.createElement("canvas");
  croppedCanvas.width = croppedWidth;
  croppedCanvas.height = croppedHeight;
  const croppedCtx = croppedCanvas.getContext("2d");
  if (!croppedCtx) return null;
  croppedCtx.drawImage(
    sourceCanvas,
    minX,
    minY,
    croppedWidth,
    croppedHeight,
    0,
    0,
    croppedWidth,
    croppedHeight,
  );

  const canvasTexture = new THREE.CanvasTexture(croppedCanvas);
  canvasTexture.colorSpace = texture.colorSpace;
  downscaleTexture(canvasTexture, MAX_SPRITE_TEXTURE_SIZE);
  canvasTexture.needsUpdate = true;

  return { texture: canvasTexture, aspect: croppedWidth / croppedHeight };
}

export function SpriteCreation({ spriteUrl, spawn }: SpriteCreationProps) {
  const sourceTexture = useTexture(spriteUrl);
  const { camera } = useThree();
  const meshRef = useRef<THREE.Mesh>(null!);

  const trimmed = useMemo(() => trimSprite(sourceTexture), [sourceTexture]);

  // Dispose the CanvasTexture we created (not the drei-cached source
  // texture) when this creation unmounts or a new trim replaces it.
  useEffect(() => {
    return () => trimmed?.texture.dispose();
  }, [trimmed]);

  // rotation.y is set every frame below (yaw-only billboard) — spawn.rotationY
  // is intentionally unused for orientation here, unlike LoadedModel/Ghost.
  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const worldPos = mesh.getWorldPosition(new THREE.Vector3());
    mesh.rotation.y = Math.atan2(camera.position.x - worldPos.x, camera.position.z - worldPos.z);
  });

  const height = TARGET_HEIGHT;
  const width = TARGET_HEIGHT * (trimmed?.aspect ?? 1);
  const { position } = spawn;
  // Sit on the ground: offset up by half the plane's height relative to the
  // spawn position, rather than centring the quad on it.
  const meshPosition: [number, number, number] = [position[0], position[1] + height / 2, position[2]];

  const mapTexture = trimmed?.texture ?? sourceTexture;

  return (
    <mesh ref={meshRef} position={meshPosition}>
      <planeGeometry args={[width, height]} />
      {/* DoubleSide: a yaw billboard can still present its back during the
          frame its rotation is first applied, and a one-sided quad renders
          as nothing in that frame — see the note in Creations.tsx about the
          glTF -Z-forward vs planeGeometry +Z-front mismatch that caused
          exactly this bug once already. alphaTest (not transparent) so the
          quad writes depth normally and doesn't flicker-sort against other
          creations, while shadows still work. */}
      <meshBasicMaterial map={mapTexture} alphaTest={0.5} transparent={false} side={DoubleSide} />
    </mesh>
  );
}
