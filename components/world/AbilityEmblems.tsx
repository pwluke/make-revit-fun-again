import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { EMBLEM_PICKUP_RADIUS, useAbilityEmblemSpots } from "./emblemPlacement";
import { EMBLEMS, EMBLEM_UNIT, emblemShapes } from "./emblems";
import { ABILITY_COLORS, useHeroStore, type AbilityId } from "./store";

const SPIN_SPEED = 1.1; // rad/s
const BOB_HEIGHT = 0.13;
const BOB_SPEED = 2;
const POP_SPEED = 4; // how fast a collected emblem shrinks away
/** World size of an emblem's long side. */
const EMBLEM_SIZE = 1.15;
/** Extrusion depth, in the emblem's own 0..100 authoring units. */
const DEPTH = 9;

function buildGeometry(prims: ReturnType<typeof emblemShapes> extends never ? never : Parameters<typeof emblemShapes>[0], accent: boolean) {
  const shapes = emblemShapes(prims, accent);
  if (shapes.length === 0) return null;
  const parts = shapes.map(
    (shape) =>
      new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false }),
  );
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts);
  if (parts.length > 1) for (const part of parts) part.dispose();
  if (!merged) return null;
  merged.center();
  merged.scale(EMBLEM_UNIT * EMBLEM_SIZE, EMBLEM_UNIT * EMBLEM_SIZE, EMBLEM_UNIT * EMBLEM_SIZE);
  return merged;
}

/**
 * The hidden ability emblems: the power's own symbol, extruded and spinning
 * in the building. Walking within reach collects it — the HUD unlock
 * animation and the slot row take over from there. Proximity-based, so
 * keyboard, mouse and gesture players all collect the same way.
 */
export function AbilityEmblems() {
  const spots = useAbilityEmblemSpots();
  const collect = useHeroStore((s) => s.collect);
  const groups = useRef<Map<AbilityId, THREE.Group | null>>(new Map());
  const scales = useRef<Map<AbilityId, number>>(new Map());

  const geometries = useMemo(
    () =>
      new Map(
        (Object.keys(EMBLEMS) as AbilityId[]).map((id) => [
          id,
          {
            main: buildGeometry(EMBLEMS[id], false),
            accent: buildGeometry(EMBLEMS[id], true),
          },
        ]),
      ),
    [],
  );
  useEffect(
    () => () =>
      geometries.forEach(({ main, accent }) => {
        main?.dispose();
        accent?.dispose();
      }),
    [geometries],
  );

  useFrame((state, delta) => {
    const found = useHeroStore.getState().found;
    const t = state.clock.elapsedTime;
    spots.forEach((spot, i) => {
      const group = groups.current.get(spot.id);
      if (!group) return;
      if (found.includes(spot.id)) {
        const s = scales.current.get(spot.id) ?? 1;
        if (s <= 0) return;
        // Collected: a fast spin while shrinking away — the HUD animation
        // picks it up from here.
        const next = Math.max(0, s - delta * POP_SPEED);
        scales.current.set(spot.id, next);
        group.scale.setScalar(next);
        group.rotation.y += delta * SPIN_SPEED * 6;
        if (next === 0) group.visible = false;
        return;
      }
      group.rotation.y += delta * SPIN_SPEED;
      group.position.y = spot.pos[1] + Math.sin(t * BOB_SPEED + i) * BOB_HEIGHT;
      if (state.camera.position.distanceTo(group.position) < EMBLEM_PICKUP_RADIUS) {
        collect(spot.id);
      }
    });
  });

  return (
    <>
      {spots.map((spot) => {
        const color = ABILITY_COLORS[spot.id];
        const geo = geometries.get(spot.id);
        if (!geo?.main) return null;
        return (
          <group
            key={spot.id}
            ref={(el) => {
              groups.current.set(spot.id, el);
            }}
            position={spot.pos}
          >
            <mesh geometry={geo.main} castShadow>
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.45}
                roughness={0.35}
                metalness={0.1}
              />
            </mesh>
            {geo.accent ? (
              // Nudged forward so the accent reads against the main body
              // instead of z-fighting with it.
              <mesh geometry={geo.accent} position={[0, 0, 0.01]}>
                <meshStandardMaterial color="#1e293b" roughness={0.5} />
              </mesh>
            ) : null}
            {/* Soft glow so emblems stay findable indoors and in shadow. */}
            <pointLight color={color} intensity={2} distance={3.5} decay={2} />
          </group>
        );
      })}
    </>
  );
}
