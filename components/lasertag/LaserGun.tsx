"use client";

import type { ThreeElements } from "@react-three/fiber";
import { PASTEL } from "@/lib/palette";

/** Violet, deliberately none of the five existing mode colours. */
export const LASER_CORE = "#c58cff";
export const LASER_TINT = "#7b52d3";

/** Where the barrel tip sits relative to the camera, so a bolt starts at the
 *  muzzle rather than the eye. Mirrors the axe's hold offset. */
export const MUZZLE_OFFSET: [number, number, number] = [0.32, -0.3, 0.45];

/**
 * The held laser gun. Pure visuals, exactly like Axe.tsx — the hit logic lives
 * in LaserTag.tsx, because what you shoot is a property of the world, not of
 * the model in your hand.
 *
 * Built from primitives rather than a GLTF: public/ ships only axe.glb, and a
 * flat-shaded pastel gun assembled from four boxes reads perfectly well at the
 * scale it occupies on screen.
 *
 * Every mesh sets `raycast={() => {}}` so the gun can never be shot. That is
 * belt-and-braces with LaserTag's MIN_REACH, which already skips anything
 * closer than 1.6 — the same trick, and the same reason, as GestureBuilder.
 */
export function LaserGun(props: ThreeElements["group"]) {
  return (
    <group {...props}>
      {/* Held pose, fixed. The parent group is what tracks the camera. */}
      <group rotation={[0, Math.PI / 14, -0.08]} scale={1}>
        <mesh raycast={() => {}} castShadow>
          <boxGeometry args={[0.1, 0.11, 0.34]} />
          <meshStandardMaterial color={PASTEL.chalk} roughness={0.4} />
        </mesh>
        <mesh position={[0, -0.1, -0.08]} rotation={[-0.25, 0, 0]} raycast={() => {}}>
          <boxGeometry args={[0.07, 0.14, 0.08]} />
          <meshStandardMaterial color={PASTEL.indigo} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.01, 0.2]} rotation={[Math.PI / 2, 0, 0]} raycast={() => {}}>
          <cylinderGeometry args={[0.028, 0.028, 0.22, 12]} />
          <meshStandardMaterial color={PASTEL.periwinkle} roughness={0.35} />
        </mesh>
        {/* Muzzle ring. Emissive past PostFX's 0.62 bloom threshold, so the
            gun glows at the tip — the cheapest possible "this is a laser". */}
        <mesh position={[0, 0.01, 0.31]} rotation={[Math.PI / 2, 0, 0]} raycast={() => {}}>
          <torusGeometry args={[0.045, 0.012, 8, 16]} />
          <meshStandardMaterial
            color={LASER_TINT}
            emissive={LASER_CORE}
            emissiveIntensity={2.2}
          />
        </mesh>
        {/* Sight rib, so the silhouette isn't a plain box. */}
        <mesh position={[0, 0.07, 0.02]} raycast={() => {}}>
          <boxGeometry args={[0.03, 0.03, 0.16]} />
          <meshStandardMaterial color={PASTEL.sky} roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}
