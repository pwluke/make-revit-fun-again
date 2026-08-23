"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import {
  PICKUP_RADIUS,
  POWERUPS,
  POWERUP_SPOTS,
  RESPAWN_SECONDS,
  applyPowerup,
  powerupState,
  publishPowerups,
  type PowerupKind,
} from "./powerupStore";

const SPIN_SPEED = 2.2; // rad/s — livelier than the stars, it reads as "energy"
const BOB_HEIGHT = 0.14;
const BOB_SPEED = 2.6;

function extrude(shape: THREE.Shape) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 1,
  });
  geometry.center();
  return geometry;
}

function boltGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0.05, 0.45);
  shape.lineTo(-0.25, 0.05);
  shape.lineTo(-0.05, 0.05);
  shape.lineTo(-0.15, -0.45);
  shape.lineTo(0.25, -0.02);
  shape.lineTo(0.03, -0.02);
  shape.closePath();
  return extrude(shape);
}

/** Stacked chevrons — reads as "up, then up again". */
function chevronGeometry() {
  const shape = new THREE.Shape();
  const arm = (baseY: number) => {
    shape.moveTo(0, baseY + 0.22);
    shape.lineTo(-0.3, baseY - 0.04);
    shape.lineTo(-0.18, baseY - 0.12);
    shape.lineTo(0, baseY + 0.08);
    shape.lineTo(0.18, baseY - 0.12);
    shape.lineTo(0.3, baseY - 0.04);
    shape.closePath();
  };
  arm(0.12);
  arm(-0.2);
  return extrude(shape);
}

/**
 * One silhouette per kind. Colour alone isn't enough — you need to know whether
 * something across the lawn is worth running for, and the sludge trap in
 * particular has to be refusable on sight.
 */
function useGeometries(): Record<PowerupKind, THREE.BufferGeometry> {
  return useMemo(
    () => ({
      speed: boltGeometry(),
      doubleJump: chevronGeometry(),
      // Blocky, like the world's voxels but shrunk.
      tiny: new THREE.BoxGeometry(0.34, 0.34, 0.34),
      // A climbing hold to grab.
      monkey: new THREE.TorusGeometry(0.28, 0.1, 10, 20),
      // Pointing up, the way you'll travel.
      fly: new THREE.ConeGeometry(0.28, 0.6, 16),
      // Lumpen and dull — deliberately the least appealing thing on the lawn.
      slow: new THREE.IcosahedronGeometry(0.3, 0),
    }),
    [],
  );
}

/**
 * The powerups. Walking into one applies its effect for a few seconds and puts
 * that spot on a respawn cooldown. Only one effect runs at a time: a new pickup
 * replaces whatever was active, so there's a real choice in whether to grab one.
 *
 * Pickup is a proximity check against the camera — the same rule the stars use,
 * so it behaves identically for keyboard, mouse and gestures. Visibility and
 * cooldowns are driven imperatively from the frame loop; a pickup shouldn't
 * remount the set.
 */
export function Powerups() {
  const geometries = useGeometries();
  const groups = useRef<(THREE.Group | null)[]>([]);

  useFrame((state, delta) => {
    const time = state.clock.elapsedTime;

    // Effect timer.
    if (powerupState.remaining > 0) {
      powerupState.remaining = Math.max(0, powerupState.remaining - delta);
      if (powerupState.remaining === 0) applyPowerup(null);
    }

    // Respawn timers.
    for (const [id, left] of powerupState.cooldowns) {
      const next = left - delta;
      if (next <= 0) powerupState.cooldowns.delete(id);
      else powerupState.cooldowns.set(id, next);
    }

    POWERUP_SPOTS.forEach((spot, i) => {
      const group = groups.current[i];
      if (!group) return;

      const cooling = powerupState.cooldowns.has(spot.id);
      group.visible = !cooling;
      if (cooling) return;

      group.rotation.y += delta * SPIN_SPEED;
      group.position.y = spot.pos[1] + Math.sin(time * BOB_SPEED + i) * BOB_HEIGHT;

      if (state.camera.position.distanceTo(group.position) < PICKUP_RADIUS) {
        // Replaces whatever was running; re-grabbing the same kind just
        // refreshes its timer.
        applyPowerup(spot.kind);
        powerupState.cooldowns.set(spot.id, RESPAWN_SECONDS);
        group.visible = false;
      }
    });

    publishPowerups();
  });

  return (
    <>
      {POWERUP_SPOTS.map((spot, i) => {
        const def = POWERUPS[spot.kind];
        return (
          <group
            key={spot.id}
            ref={(el) => {
              groups.current[i] = el;
            }}
            position={spot.pos}
          >
            <mesh geometry={geometries[spot.kind]} castShadow>
              <meshStandardMaterial
                color={def.color}
                emissive={def.emissive}
                // The trap gets no glow: it should look inert next to the rest.
                emissiveIntensity={def.trap ? 0.15 : 0.8}
                roughness={def.trap ? 0.85 : 0.25}
                metalness={def.trap ? 0 : 0.3}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
