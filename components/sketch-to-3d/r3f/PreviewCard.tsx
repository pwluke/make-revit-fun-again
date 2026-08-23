"use client";

/**
 * Shows fast mode's ControlNet bridge image in the world while the mesh is still
 * being built — the child's drawing, in colour, at ~2.3s instead of ~19s.
 *
 * Deliberately a FRAMED PHOTO, not a billboard creature. The bridge image has an
 * opaque studio-grey background, so there is no cutout to fake: pushed through
 * SpriteCreation's alpha trim it would render as a grey rectangle with a cat in
 * it, which reads as broken. A white border and a gentle bob make the same pixels
 * read as "a picture of the thing, while the thing is being made" — honest about
 * what it is, and it makes the swap to the real mesh feel like a reveal.
 *
 * Cutting the background out properly would mean a third API call (birefnet, as
 * the sprite path does) and would spend most of the latency this feature exists
 * to save.
 */

import { useRef } from "react";
import * as THREE from "three";
import { DoubleSide } from "three";
import { useTexture } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import type { SpawnTransform } from "../core/types";

const TARGET_HEIGHT = 1.6;
/** Border thickness as a fraction of the card's height. */
const FRAME_RATIO = 0.06;
const BOB_AMPLITUDE = 0.06;
const BOB_SPEED = 1.4;

type PreviewCardProps = {
  previewUrl: string;
  spawn: SpawnTransform;
};

export function PreviewCard({ previewUrl, spawn }: PreviewCardProps) {
  const texture = useTexture(previewUrl);
  const { camera } = useThree();
  const groupRef = useRef<THREE.Group>(null!);

  // The source is a portrait frame (SDXL returns 832x1216 here). Read the real
  // aspect off the loaded image rather than assuming, so a future image_size
  // change does not silently stretch the card.
  const image = texture.image as { width?: number; height?: number } | undefined;
  const aspect = image?.width && image?.height ? image.width / image.height : 0.68;

  const height = TARGET_HEIGHT;
  const width = TARGET_HEIGHT * aspect;
  const frame = TARGET_HEIGHT * FRAME_RATIO;

  const { position } = spawn;

  useFrame((state) => {
    const group = groupRef.current;
    if (!group) return;

    // Yaw-only billboard, matching SpriteCreation: a full lookAt tilts the card
    // when the player looks up or down, so it reads as leaning over.
    const worldPos = group.getWorldPosition(new THREE.Vector3());
    group.rotation.y = Math.atan2(
      camera.position.x - worldPos.x,
      camera.position.z - worldPos.z,
    );

    // A slow bob so it reads as "working", the same signal the Ghost gave.
    group.position.y =
      position[1] + height / 2 + Math.sin(state.clock.elapsedTime * BOB_SPEED) * BOB_AMPLITUDE;
  });

  return (
    <group ref={groupRef} position={[position[0], position[1] + height / 2, position[2]]}>
      {/* Backing plane, very slightly behind, forms the border. Rendered first so
          the photo always wins the depth test against it. */}
      <mesh position={[0, 0, -0.01]}>
        <planeGeometry args={[width + frame * 2, height + frame * 2]} />
        {/* Soft grey rather than white. This card shows two very different
            images over its life: the user's black-on-white line art from t=0,
            and fast mode's grey-background photo later. A white frame is
            invisible against the first; this reads as a mount against both. */}
        <meshBasicMaterial color="#e2ded6" side={DoubleSide} />
      </mesh>
      <mesh>
        <planeGeometry args={[width, height]} />
        {/* meshBasicMaterial: this is a photograph, so scene lighting should not
            dim it. DoubleSide for the same reason as SpriteCreation — a yaw
            billboard can present its back on the frame its rotation is first
            applied, and a one-sided quad renders as nothing that frame. */}
        <meshBasicMaterial map={texture} side={DoubleSide} toneMapped={false} />
      </mesh>
    </group>
  );
}
