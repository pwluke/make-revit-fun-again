"use client";

/**
 * Draws a single horizontal line on the ground where the invisible drawing plane
 * meets it, so you can tell where a stroke will land in space.
 *
 * The plane is 4m ahead and invisible, which makes depth genuinely hard to judge
 * — strokes look like they float somewhere ambiguous. One line is deliberately
 * all this shows: a grid or a translucent quad would occlude the very drawing
 * it is meant to help you place.
 *
 * While a stroke is in progress it tracks the FROZEN plane rather than the live
 * camera, so it stops moving the instant you press. That is not a detail — it is
 * what makes the "the plane froze where you pressed" rule visible rather than
 * something you have to be told.
 */

import { useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "zustand";
import { freezePlane, planeGroundLine } from "../core/projection";
import { PALETTE, sketchStore } from "../core/strokeStore";
import type { CameraPose } from "../core/types";

const LINE_LENGTH = 9;
const LINE_WIDTH = 0.07;
/** Lifted off the ground so it does not z-fight with it. */
const GROUND_OFFSET = 0.02;

const forward = new THREE.Vector3();

export function GroundGuide() {
  const camera = useThree((state) => state.camera);
  const drawMode = useStore(sketchStore, (state) => state.drawMode);
  const colorIndex = useStore(sketchStore, (state) => state.colorIndex);
  const meshRef = useRef<THREE.Mesh>(null!);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh) return;

    if (!drawMode) {
      mesh.visible = false;
      return;
    }

    // An in-progress stroke owns a frozen plane; otherwise preview where the
    // plane WOULD freeze if the player pressed right now.
    const active = sketchStore.getState().active;
    const plane =
      active?.plane ??
      freezePlane({
        position: camera.position.toArray() as [number, number, number],
        forward: camera.getWorldDirection(forward).toArray() as [number, number, number],
      } satisfies CameraPose);

    const line = planeGroundLine(plane);
    // Null means the plane is parallel to the ground — looking near-straight up
    // or down. There is no line to draw, so show nothing rather than something
    // arbitrary.
    if (!line) {
      mesh.visible = false;
      return;
    }

    mesh.visible = true;
    mesh.position.set(line.point[0], line.point[1] + GROUND_OFFSET, line.point[2]);
    // The box's long axis is X, so yaw it onto the line's direction.
    mesh.rotation.y = Math.atan2(line.direction[0], line.direction[2]) + Math.PI / 2;
  });

  return (
    <mesh ref={meshRef} visible={false}>
      <boxGeometry args={[LINE_LENGTH, 0.01, LINE_WIDTH]} />
      {/* Tinted with the active colour so it doubles as a reminder of what you
          are about to draw with. Unlit and semi-transparent so it reads as a
          guide rather than as a thing in the world. */}
      <meshBasicMaterial
        color={PALETTE[colorIndex]}
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </mesh>
  );
}
