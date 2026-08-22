"use client";

/**
 * OWNED BY the fal-bench agent — replace this file wholesale; do not extend it.
 *
 * Minimal stub: a plain textured plane. The real implementation needs three
 * measured fixes, recorded here so they aren't lost or re-discovered the hard way:
 *
 * 1. Trim the alpha bounding box. SDXL returns a fixed 832x1216 frame with the
 *    subject floating in transparent padding; mapped straight to a quad the
 *    creature hovers above the ground. Measure the alpha bbox at load and
 *    redraw cropped to a CanvasTexture. Threshold alpha > 8, NOT > 0 —
 *    BiRefNet leaves a faint near-zero halo.
 * 2. Use `alphaTest: 0.5` with `transparent: false`. NOT `transparent: true` —
 *    transparent materials depth-sort and flicker against each other;
 *    alphaTest writes depth normally and shadows work.
 * 3. Yaw-only billboard, not drei's `<Billboard>`: a full lookAt tilts the
 *    card when the player looks up/down so a standing creature reads as
 *    leaning back. Use `rotation.y = Math.atan2(cam.x - world.x, cam.z - world.z)`
 *    off `getWorldPosition`.
 *
 * None of the above is implemented here — this stub just renders a plane.
 */

import { useTexture } from "@react-three/drei";
import type { SpawnTransform } from "../core/types";

const PLANE_SIZE = 2;

type SpriteCreationProps = {
  spriteUrl: string;
  spawn: SpawnTransform;
};

export function SpriteCreation({ spriteUrl, spawn }: SpriteCreationProps) {
  const texture = useTexture(spriteUrl);
  const { position, rotationY } = spawn;

  return (
    <mesh position={position} rotation={[0, rotationY, 0]}>
      <planeGeometry args={[PLANE_SIZE, PLANE_SIZE]} />
      <meshBasicMaterial map={texture} transparent />
    </mesh>
  );
}
