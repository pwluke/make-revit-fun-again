import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { STAR_SPOTS, STAR_PICKUP_RADIUS } from "./houseData";
import { useTreasureStore } from "./store";

const SPIN_SPEED = 1.4; // rad/s
const BOB_HEIGHT = 0.18;
const BOB_SPEED = 2.2;
const POP_SPEED = 5; // how fast a collected star shrinks away

/** Flat five-pointed star, extruded — reads clearly from any angle. */
function useStarGeometry() {
  return useMemo(() => {
    const outer = 0.42;
    const inner = 0.17;
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      // Start at the top point so the star sits upright.
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 1,
    });
    geo.center();
    return geo;
  }, []);
}

/**
 * The treasure-hunt stars. Each one spins and bobs in place; walking within
 * arm's reach picks it up. Collection is proximity-based rather than a
 * click, so it works identically for keyboard, mouse and gestures.
 */
export function Stars() {
  const geometry = useStarGeometry();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const scales = useRef<number[]>(STAR_SPOTS.map(() => 1));
  const collect = useTreasureStore((s) => s.collect);

  useFrame((state, delta) => {
    const found = useTreasureStore.getState().found;
    const t = state.clock.elapsedTime;
    STAR_SPOTS.forEach((spot, i) => {
      const group = groups.current[i];
      if (!group) return;
      const isFound = found.includes(spot.id);

      if (isFound) {
        if (scales.current[i] <= 0) return;
        // Shrink out with a last spin instead of vanishing abruptly.
        scales.current[i] = Math.max(0, scales.current[i] - delta * POP_SPEED);
        group.scale.setScalar(scales.current[i]);
        group.rotation.y += delta * SPIN_SPEED * 4;
        if (scales.current[i] === 0) group.visible = false;
        return;
      }

      group.rotation.y += delta * SPIN_SPEED;
      group.position.y = spot.pos[1] + Math.sin(t * BOB_SPEED + i) * BOB_HEIGHT;

      if (state.camera.position.distanceTo(group.position) < STAR_PICKUP_RADIUS) {
        collect(spot.id);
      }
    });
  });

  return (
    <>
      {STAR_SPOTS.map((spot, i) => (
        <group
          key={spot.id}
          ref={(el) => {
            groups.current[i] = el;
          }}
          position={spot.pos}
        >
          <mesh geometry={geometry} castShadow>
            <meshStandardMaterial
              color="#ffc93c"
              emissive="#ff9500"
              emissiveIntensity={0.55}
              roughness={0.35}
              metalness={0.15}
            />
          </mesh>
          {/* A soft glow so stars stay findable in shadow or at distance. */}
          <pointLight color="#ffb700" intensity={3} distance={4} decay={2} />
        </group>
      ))}
    </>
  );
}
