"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  BREATH_RECOVERY,
  BREATH_SECONDS,
  MAX_LEVEL,
  RISE_RATE,
  floodState,
  publishFlood,
  resetFloodState,
  useFloodStore,
} from "./floodStore";
import { useSceneTheme } from "./themeStore";

/** Wide enough to reach the horizon on the 1000x1000 ground plane. */
const SURFACE_SIZE = 1000;
/** Gentle swell, so the surface reads as water rather than a flat blue lid. */
const SWELL_HEIGHT = 0.05;
const SWELL_SPEED = 0.7;

/**
 * The rising flood. Water is visual only — no collider — so the player can walk
 * and swim through it; the pressure comes from the breath timer, not from
 * physics. The whole simulation is one useFrame: raise the surface, work out
 * whether the camera (the player's eye) is under it, drain or refill breath.
 */
export function Flood() {
  const theme = useSceneTheme();
  const surface = useRef<THREE.Mesh>(null);
  const drown = useFloodStore((s) => s.drown);
  const respawnToken = useFloodStore((s) => s.respawnToken);

  // A reset bumps the token; bring the mutable half back in step with it.
  useEffect(() => {
    resetFloodState();
  }, [respawnToken]);

  useFrame((state, delta) => {
    const { drowned, creative } = useFloodStore.getState();

    // Creative mode freezes the water where it is rather than draining it: a
    // sudden drop would strand anything the player built at the old level, and
    // "stop the rise" is what was actually asked for. The surface, the breath
    // meter and the submerged tint all keep working from the frozen level.
    // `paused` is the same freeze, written by Laser Tag so a round doesn't
    // drown you while you hunt.
    if (!drowned && !creative && !floodState.paused) {
      floodState.elapsed += delta;
      floodState.level = Math.min(
        MAX_LEVEL,
        floodState.level + delta * RISE_RATE,
      );
    }

    if (surface.current) {
      surface.current.position.y =
        floodState.level +
        Math.sin(state.clock.elapsedTime * SWELL_SPEED) * SWELL_HEIGHT;
    }

    // The camera sits at the player's eye, so this is "head underwater" rather
    // than "feet wet" — wading through the shallows is fine.
    const submerged = state.camera.position.y < floodState.level;
    floodState.submerged = submerged;

    if (creative) {
      // Breath stays full so the meter does not sit at zero and the screen does
      // not tint as though you were about to drown. Swimming under a frozen
      // flood is a legitimate way to get around in creative mode.
      floodState.breath = 1;
    } else if (!drowned && !floodState.paused) {
      floodState.breath = THREE.MathUtils.clamp(
        submerged
          ? floodState.breath - delta / BREATH_SECONDS
          : floodState.breath + (delta / BREATH_SECONDS) * BREATH_RECOVERY,
        0,
        1,
      );
      if (floodState.breath <= 0) drown();
    }

    publishFlood();
  });

  return (
    <mesh ref={surface} rotation-x={-Math.PI / 2} renderOrder={1}>
      <planeGeometry args={[SURFACE_SIZE, SURFACE_SIZE]} />
      {/* DoubleSide so the surface still reads from below, and depthWrite off
          so it doesn't punch a hole in what's behind it when seen underwater.
          Glassier and paler than open water would be — this is the pool in the
          reference art, and the sun's glint off it is most of what sells it. */}
      {/* Opacity down from 0.5: at eye level the surface fills the lower half
          of the frame, so every point of it tints a large share of the view. */}
      <meshStandardMaterial
        color={theme.flood}
        transparent
        opacity={0.38}
        depthWrite={false}
        side={THREE.DoubleSide}
        roughness={0.08}
        metalness={0.25}
      />
    </mesh>
  );
}
