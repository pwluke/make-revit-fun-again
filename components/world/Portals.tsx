import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";
import { useHeroStore } from "./store";

const TRIGGER_RADIUS = 1.3;
const COOLDOWN_MS = 1500;

const camPos = new THREE.Vector3();
const portalPos = new THREE.Vector3();

type PortalPair = {
  id: string;
  color: string;
  a: [number, number, number];
  b: [number, number, number];
};

/**
 * Portal mode. Pairs are derived from whatever model is streamed into the
 * grid, and each one links two places with a real spatial relationship:
 * the model's west side to its east side (straight through the building),
 * and the ground to the top of its tallest column (the whole vertical
 * climb in one step). Walking into a ring asks the Player — which owns
 * the physics body — to move, via the store's teleport request.
 */
export function Portals() {
  const active = useHeroStore((s) => s.active.includes("portal"));
  const { data } = useGridPoints();
  const cooldownUntil = useRef(0);

  const pairs = useMemo<PortalPair[]>(() => {
    const points = occupiedPointCoords(data?.points);
    if (points.length === 0) return [];
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let top: [number, number, number] = points[0].position;
    for (const { position } of points) {
      const [x, y, z] = position;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      if (y > top[1]) top = position;
    }
    const cz = Math.round((minZ + maxZ) / 2);
    const cx = Math.round((minX + maxX) / 2);
    return [
      {
        id: "through",
        color: "#0ea5e9",
        a: [minX - 3, 2, cz],
        b: [maxX + 3, 2, cz],
      },
      {
        id: "up",
        color: "#059669",
        a: [cx, 2, maxZ + 3],
        b: [top[0], top[1] + 1.8, top[2]],
      },
    ];
  }, [data?.points]);

  useFrame((state) => {
    if (!active || pairs.length === 0) return;
    const now = performance.now();
    if (now < cooldownUntil.current) return;
    camPos.copy(state.camera.position);
    for (const pair of pairs) {
      for (const [here, there] of [
        [pair.a, pair.b],
        [pair.b, pair.a],
      ] as const) {
        portalPos.set(here[0], here[1], here[2]);
        if (camPos.distanceTo(portalPos) < TRIGGER_RADIUS) {
          useHeroStore.getState().requestTeleport([there[0], there[1] + 0.6, there[2]]);
          cooldownUntil.current = now + COOLDOWN_MS;
          return;
        }
      }
    }
  });

  if (!active || pairs.length === 0) return null;
  return (
    <>
      {pairs.flatMap((pair) =>
        [pair.a, pair.b].map((pos, i) => (
          <group key={`${pair.id}-${i}`} position={pos}>
            <mesh>
              <torusGeometry args={[0.9, 0.09, 12, 40]} />
              <meshStandardMaterial
                color={pair.color}
                emissive={pair.color}
                emissiveIntensity={0.8}
                roughness={0.3}
              />
            </mesh>
            <mesh>
              <circleGeometry args={[0.82, 32]} />
              <meshBasicMaterial
                color={pair.color}
                transparent
                opacity={0.25}
                side={THREE.DoubleSide}
              />
            </mesh>
            <pointLight color={pair.color} intensity={3} distance={5} decay={2} />
          </group>
        )),
      )}
    </>
  );
}
