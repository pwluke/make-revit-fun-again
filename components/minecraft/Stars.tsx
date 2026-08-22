"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { create } from "zustand";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";

const STAR_COUNT = 12;
/** Fixed seed: placement must survive re-renders and live InstantDB pushes,
 *  otherwise a star could teleport away as the player reaches for it. */
const SEED = 0x5741b2;
/** Kept off the spawn point so the first few aren't collected by falling on them. */
const MIN_RADIUS = 8;
const MAX_RADIUS = 34;
/** The player capsule is half-height 0.75 + radius 0.5, so the body centre —
 *  and the camera pinned to it — rides 1.25 above the floor. Sitting stars just
 *  under that puts them at chest height.
 *
 *  They deliberately float rather than resting on the terrain: a jump apexes at
 *  v²/2g = 7.5²/60 = 0.94 units, which is *less* than one block, so the player
 *  can't climb a cube. Anything placed on top of one would be scenery. */
const STAR_HEIGHT = 1.2;
/** Generous enough to grab by brushing past, tight enough to need aiming for. */
const COLLECT_RADIUS = 1.1;
/** A column with terrain this low would swallow a star standing in it. */
const BLOCKED_BELOW = 3;

type StarPlacement = {
  id: string;
  position: [x: number, y: number, z: number];
  /** Desyncs the spin and bob so the set doesn't pulse in lockstep. */
  phase: number;
};

type ScoreStore = {
  score: number;
  total: number;
  collected: ReadonlySet<string>;
  collect: (id: string) => void;
  setTotal: (total: number) => void;
  reset: () => void;
};

export const useScoreStore = create<ScoreStore>((set) => ({
  score: 0,
  total: 0,
  collected: new Set<string>(),
  collect: (id) =>
    set((state) => {
      // The collect check runs every frame, so the same star arrives repeatedly
      // until React unmounts it. Without this guard it would score each time.
      if (state.collected.has(id)) return state;
      return {
        score: state.score + 1,
        collected: new Set(state.collected).add(id),
      };
    }),
  setTotal: (total) => set({ total }),
  reset: () => set({ score: 0, collected: new Set<string>() }),
}));

/** mulberry32 — small deterministic PRNG, enough for scattering a dozen props. */
function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scatters stars on the walkable plane around spawn, skipping any grid column
 * with terrain in it. Not uniform-random: sampling an annulus in polar
 * coordinates keeps them off the player's head at spawn and inside the area
 * worth exploring, and the occupancy check keeps them out of solid rock.
 */
function placeStars(
  points: ReturnType<typeof occupiedPointCoords>,
): StarPlacement[] {
  const blocked = new Set<string>();
  for (const { position } of points) {
    const [x, y, z] = position;
    if (y < BLOCKED_BELOW) blocked.add(`${Math.round(x)},${Math.round(z)}`);
  }

  const random = seededRandom(SEED);
  const placements: StarPlacement[] = [];
  const taken = new Set<string>();

  // Bounded: a fully built-up neighbourhood would otherwise spin forever.
  for (let attempt = 0; attempt < 400 && placements.length < STAR_COUNT; attempt++) {
    const angle = random() * Math.PI * 2;
    // sqrt keeps the sample area-uniform instead of bunching toward the centre.
    const radius =
      MIN_RADIUS + Math.sqrt(random()) * (MAX_RADIUS - MIN_RADIUS);
    const x = Math.round(Math.cos(angle) * radius);
    const z = Math.round(Math.sin(angle) * radius);
    const key = `${x},${z}`;
    if (blocked.has(key) || taken.has(key)) continue;
    taken.add(key);
    placements.push({
      id: key,
      position: [x, STAR_HEIGHT, z],
      phase: random() * Math.PI * 2,
    });
  }

  return placements;
}

function makeStarGeometry() {
  const shape = new THREE.Shape();
  const spikes = 5;
  const outer = 0.4;
  const inner = 0.17;
  for (let i = 0; i < spikes * 2; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    bevelSegments: 1,
  });
  // Extrusion runs 0..depth on Z; centring puts the pivot in the middle so the
  // star spins about itself rather than orbiting its own back face.
  geometry.center();
  return geometry;
}

// One geometry shared by every star — they differ only by transform.
const STAR_GEOMETRY = makeStarGeometry();

export function Stars() {
  const { data } = useGridPoints();
  const collected = useScoreStore((state) => state.collected);
  const collect = useScoreStore((state) => state.collect);
  const setTotal = useScoreStore((state) => state.setTotal);

  const stars = useMemo(
    () => placeStars(occupiedPointCoords(data?.points)),
    [data?.points],
  );
  const remaining = useMemo(
    () => stars.filter((star) => !collected.has(star.id)),
    [stars, collected],
  );

  useEffect(() => setTotal(stars.length), [stars.length, setTotal]);

  const groups = useRef(new Map<string, THREE.Group>());

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    for (const star of remaining) {
      const group = groups.current.get(star.id);
      if (!group) continue;
      group.rotation.y = time * 1.6 + star.phase;
      group.position.y = star.position[1] + Math.sin(time * 2 + star.phase) * 0.12;
      // Player.tsx pins the camera to the rigid body every frame, so the camera
      // position is the player position.
      if (
        state.camera.position.distanceToSquared(group.position) <
        COLLECT_RADIUS * COLLECT_RADIUS
      ) {
        collect(star.id);
      }
    }
  });

  return (
    <>
      {remaining.map((star) => (
        <group
          key={star.id}
          position={star.position}
          ref={(group) => {
            if (group) groups.current.set(star.id, group);
            else groups.current.delete(star.id);
          }}
        >
          <mesh geometry={STAR_GEOMETRY} castShadow>
            {/* Emissive rather than a light source: a dozen point lights would
                each cost a full shadow pass and blow past the light limit. */}
            <meshStandardMaterial
              color="#fcd34d"
              emissive="#f59e0b"
              emissiveIntensity={0.7}
              metalness={0.35}
              roughness={0.3}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** DOM overlay — lives outside the canvas, so it renders as ordinary markup. */
export function ScoreHud() {
  const score = useScoreStore((state) => state.score);
  const total = useScoreStore((state) => state.total);

  return (
    <div className="pointer-events-none absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/45 px-4 py-1.5 text-sm font-semibold text-amber-200 backdrop-blur-sm">
      ★ {score}
      {total > 0 ? ` / ${total}` : ""}
    </div>
  );
}
