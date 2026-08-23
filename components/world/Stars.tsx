import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { SCENE } from "@/lib/palette";
import { STAR_PICKUP_RADIUS } from "./houseData";
import { useStarSpots } from "./starPlacement";
import { useTreasureStore } from "./treasureStore";

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
  const spots = useStarSpots();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const scales = useRef<number[]>([]);
  const collect = useTreasureStore((s) => s.collect);
  const setTotal = useTreasureStore((s) => s.setTotal);

  // The procedural spots only exist once the grid query resolves, so the list
  // grows after mount; keep the scoreboard's denominator in step with it.
  useEffect(() => setTotal(spots.length), [spots.length, setTotal]);

  useFrame((state, delta) => {
    const found = useTreasureStore.getState().found;
    const t = state.clock.elapsedTime;
    spots.forEach((spot, i) => {
      if (scales.current[i] === undefined) scales.current[i] = 1;
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
      {spots.map((spot, i) => (
        <group
          key={spot.id}
          ref={(el) => {
            groups.current[i] = el;
          }}
          position={spot.pos}
        >
          {/* No castShadow: the shadow map is cached and only re-rendered
              when the world changes, so a bobbing caster would drag a stale
              shadow behind it. The emissive glow is what makes these read. */}
          <mesh geometry={geometry}>
            {/* The interface's own gold. Emissive is pushed harder than it was
                because the stars are now the only thing in the frame bright
                enough to trip the bloom threshold — which is what makes them
                findable in a scene with no dark left in it. */}
            <meshStandardMaterial
              color={SCENE.star}
              emissive={SCENE.starGlow}
              emissiveIntensity={0.9}
              roughness={0.35}
              metalness={0.15}
            />
          </mesh>
          {/* A soft glow so stars stay findable in shadow or at distance.
              Opt-out for stars in open daylight — see StarSpot.glow. */}
          {spot.glow !== false ? (
            <pointLight
              color={SCENE.starGlow}
              intensity={3}
              distance={4}
              decay={2}
            />
          ) : null}
        </group>
      ))}
    </>
  );
}
