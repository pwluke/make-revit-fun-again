"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  BOOST_MULTIPLIER,
  BOOST_SECONDS,
  BOOST_SPOTS,
  PICKUP_RADIUS,
  RESPAWN_SECONDS,
  powerupState,
  publishPowerups,
} from "./powerupStore";

const SPIN_SPEED = 2.2; // rad/s — livelier than the stars, it reads as "energy"
const BOB_HEIGHT = 0.14;
const BOB_SPEED = 2.6;

/** A lightning bolt, extruded — a different silhouette from the star so the two
 *  pickups can't be confused at a glance. */
function useBoltGeometry() {
  return useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0.05, 0.45);
    shape.lineTo(-0.25, 0.05);
    shape.lineTo(-0.05, 0.05);
    shape.lineTo(-0.15, -0.45);
    shape.lineTo(0.25, -0.02);
    shape.lineTo(0.03, -0.02);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 0.1,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.025,
      bevelSegments: 1,
    });
    geometry.center();
    return geometry;
  }, []);
}

/**
 * Speed powerups. Walking into one boosts your run speed for a few seconds;
 * they respawn on a cooldown, so they're a repeatable tool rather than a
 * collectible. Pickup is a proximity check against the camera — the same rule
 * the stars use, so it works for keyboard, mouse and gestures alike.
 *
 * Visibility and cooldowns are driven imperatively from the frame loop rather
 * than through React state: a pickup shouldn't remount the whole set.
 */
export function Powerups() {
  const geometry = useBoltGeometry();
  const groups = useRef<(THREE.Group | null)[]>([]);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;

    // Boost timer.
    if (powerupState.remaining > 0) {
      powerupState.remaining = Math.max(0, powerupState.remaining - delta);
    }
    powerupState.multiplier = powerupState.remaining > 0 ? BOOST_MULTIPLIER : 1;

    // Respawn timers.
    for (const [id, left] of powerupState.cooldowns) {
      const next = left - delta;
      if (next <= 0) powerupState.cooldowns.delete(id);
      else powerupState.cooldowns.set(id, next);
    }

    BOOST_SPOTS.forEach((spot, i) => {
      const group = groups.current[i];
      if (!group) return;

      const cooling = powerupState.cooldowns.has(spot.id);
      group.visible = !cooling;
      if (cooling) return;

      group.rotation.y += delta * SPIN_SPEED;
      group.position.y = spot.pos[1] + Math.sin(time * BOB_SPEED + i) * BOB_HEIGHT;

      if (state.camera.position.distanceTo(group.position) < PICKUP_RADIUS) {
        // Picking up while boosted refreshes the timer rather than stacking the
        // multiplier — otherwise a cluster of pickups would make you unplayably fast.
        powerupState.remaining = BOOST_SECONDS;
        powerupState.cooldowns.set(spot.id, RESPAWN_SECONDS);
        group.visible = false;
      }
    });

    publishPowerups();
  });

  return (
    <>
      {BOOST_SPOTS.map((spot, i) => (
        <group
          key={spot.id}
          ref={(el) => {
            groups.current[i] = el;
          }}
          position={spot.pos}
        >
          <mesh geometry={geometry} castShadow>
            <meshStandardMaterial
              color="#67e8f9"
              emissive="#06b6d4"
              emissiveIntensity={0.8}
              roughness={0.25}
              metalness={0.3}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}
