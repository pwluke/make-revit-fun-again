"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PASTEL, SCENE, UI } from "@/lib/palette";
import { playerOrigin } from "@/components/minecraft/player-origin";
import {
  BOT_HEIGHT_OFFSET,
  CELL,
  NEIGHBOR_STEPS,
  cellKey,
  cellToWorld,
  spotBearing,
  type BotSpot,
} from "./botArena";
import {
  ENEMY_BOLT,
  playHurtSound,
  playLaserSound,
  spawnBolt,
  spawnSparks,
} from "./laser-fx";
import {
  DIFFICULTIES,
  damagePlayer,
  laserTagState,
  publishLaserTag,
  type Difficulty,
} from "./laserTagStore";

const WANDER_SPEED = 1.1; // m/s — "wandering", not patrolling with purpose
const FLEE_SPEED = 2.4;
const TURN_RATE = 6; // rad/s the yaw chases the heading
/** Chance of carrying straight on at a cell boundary. Without a bias toward
 *  the current heading a uniform pick reads as jitter, not movement. */
const STRAIGHT_BIAS = 0.7;
const FLEE_SECONDS = 2.6;
/** Player this close spooks a bot. */
const SPOOK_RADIUS = 4.5;
/** A shot landing this close to a bot spooks it too — which is what makes
 *  "flee when scanned" legible even when one hit is enough to tag. */
export const ALERT_RADIUS = 3.2;
const BOB_SPEED = 5.5;
const BOB_HEIGHT = 0.04;
/** How fast a tagged bot shrinks away. Matches the stars' pop. */
const POP_SPEED = 4;
/** Close enough to the target cell to pick the next one. */
const ARRIVE_EPSILON = 0.06;

/**
 * Site PPE. These sit more saturated than the PASTEL range on purpose: a hard
 * hat that reads as pastel reads as a hat-shaped blob, and the whole point is
 * that a bot looks like someone who wandered onto site. It also helps the game
 * — a yellow hat is the easiest thing to pick out down a corridor.
 */
const HARD_HAT = "#f7c22b";
const HARD_HAT_BRIM = "#e0ad1f";
const VEST = "#e9ee5c";
/** Reflective banding. Cool and near-white, so it reads against the yellow. */
const VEST_BAND = "#eef1f7";

/** Bot eye height above its body centre, for line-of-sight and muzzle origin. */
const BOT_EYE = 0.36;
/**
 * Seconds between line-of-sight checks. Deliberately coarse and staggered per
 * bot: the check raycasts the whole scene, and the voxel grid is a 373k-instance
 * mesh with no BVH, so one of these is not cheap. Cube.tsx already runs one such
 * raycast every frame — this adds a few per second, not a few per frame.
 */
const LOS_INTERVAL = 0.3;
/** How far a miss lands from the player. */
const MISS_SPREAD = 1.4;

type BotRuntime = {
  id: string;
  pos: THREE.Vector3;
  cell: [number, number];
  target: THREE.Vector3;
  /** Last step taken, for the straight-ahead bias. */
  heading: [number, number];
  yaw: number;
  /** Seconds of flee left. */
  fleeFor: number;
  scale: number;
  /** Seconds until this bot may shoot again. */
  fireIn: number;
  /** Seconds until its next line-of-sight check, staggered on spawn. */
  losIn: number;
  hasLos: boolean;
  /** Seconds of continuous sight, versus the difficulty's reaction time. */
  sighted: number;
};

/**
 * Module-scope runtime state, the same idiom as break-fx's shard pool: the
 * frame loop owns it and React never sees it, so five bots moving every frame
 * cost zero re-renders.
 */
const bots: BotRuntime[] = [];

/** Reused every frame — never allocate in the loop. */
const scratch = new THREE.Vector3();
const step = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const aim = new THREE.Vector3();
const toPlayer = new THREE.Vector3();

/** Nudge every bot within `radius` of a world point into its flee state. */
export function spookBots(point: THREE.Vector3, radius: number) {
  const radiusSq = radius * radius;
  for (const bot of bots) {
    if (bot.scale <= 0) continue;
    if (bot.pos.distanceToSquared(point) > radiusSq) continue;
    bot.fleeFor = FLEE_SECONDS;
  }
}

/** World position of a live bot, for FX. Null once it has been tagged. */
export function botPosition(id: string): THREE.Vector3 | null {
  const bot = bots.find((candidate) => candidate.id === id);
  return bot && bot.scale > 0 ? bot.pos : null;
}

/**
 * Pick the next cell to walk to. Prefers carrying straight on; when fleeing,
 * prefers whichever neighbour opens up the most distance from the player.
 * Returns null when boxed in, which the caller treats as "turn around".
 */
function nextStep(
  bot: BotRuntime,
  roam: Set<string>,
  fleeing: boolean,
  random: () => number,
): [number, number] | null {
  const [ci, cj] = bot.cell;
  const options = NEIGHBOR_STEPS.filter(([di, dj]) =>
    roam.has(cellKey(ci + di, cj + dj)),
  );
  if (options.length === 0) return null;

  if (fleeing) {
    let best: [number, number] | null = null;
    let bestDistance = -Infinity;
    for (const [di, dj] of options) {
      const [x, z] = cellToWorld(ci + di, cj + dj);
      const distance =
        (x - playerOrigin.x) * (x - playerOrigin.x) +
        (z - playerOrigin.z) * (z - playerOrigin.z);
      if (distance > bestDistance) {
        bestDistance = distance;
        best = [di, dj];
      }
    }
    return best;
  }

  const straight = options.find(
    ([di, dj]) => di === bot.heading[0] && dj === bot.heading[1],
  );
  if (straight && random() < STRAIGHT_BIAS) return straight;
  return options[Math.floor(random() * options.length) % options.length];
}

/**
 * The scan-bots.
 *
 * Individual groups rather than one instanced mesh: each needs its own userData
 * for hit attribution, its own yaw and its own pop animation, and five objects
 * is nowhere near the count where instancing pays for that complexity.
 *
 * No rigid body, deliberately. NearbyColliders only mounts voxel colliders
 * within 4 units of the player, so a bot across the courtyard would have no
 * floor beneath it and no walls beside it — it would fall through the building.
 * Walking the precomputed cell set makes wall penetration impossible by
 * construction instead. The cost is that the player can walk through a bot,
 * which is arguably the better failure: nothing can box you in.
 */
export function Bots({
  spots,
  roam,
  returnFire,
  difficulty,
}: {
  spots: BotSpot[];
  /** Cells the bots may walk: inside the building. */
  roam: Set<string>;
  returnFire: boolean;
  difficulty: Difficulty;
}) {
  const groups = useRef<(THREE.Group | null)[]>([]);
  const visors = useRef<(THREE.Mesh | null)[]>([]);
  const random = useRef(Math.random);

  /** Private raycaster for line of sight — never the one from useThree, which
   *  would clamp r3f's own pointer-event system. */
  const sight = useMemo(() => new THREE.Raycaster(), []);

  // Rebuild the runtime list whenever the round re-scatters. useLayoutEffect so
  // it is populated before the first frame reads it.
  useLayoutEffect(() => {
    bots.length = 0;
    spots.forEach((spot, index) => {
      const [x, , z] = spot.pos;
      bots.push({
        id: spot.id,
        pos: new THREE.Vector3(x, BOT_HEIGHT_OFFSET, z),
        cell: [...spot.cell] as [number, number],
        target: new THREE.Vector3(x, BOT_HEIGHT_OFFSET, z),
        heading: [1, 0],
        yaw: 0,
        fleeFor: 0,
        scale: 1,
        // Stagger the first shot and the first sight check, so a round doesn't
        // open with every bot firing on the same frame.
        fireIn: DIFFICULTIES[difficulty].fireInterval * (0.4 + index * 0.2),
        losIn: index * (LOS_INTERVAL / Math.max(1, spots.length)),
        hasLos: false,
        sighted: 0,
      });
    });
    // Bot ids repeat across rounds, so React reuses the same groups — and one
    // left shrunk and hidden by the pop animation would respawn invisible.
    // Undo it here rather than every frame.
    for (const group of groups.current) {
      if (!group) continue;
      group.visible = true;
      group.scale.setScalar(1);
    }
    // The pool is module-scope, so drop it on the way out rather than leaving
    // last round's bots visible to spookBots/botPosition during setup.
    return () => {
      bots.length = 0;
    };
  }, [spots, difficulty]);

  // Tag every mesh with its bot id. A traverse rather than per-mesh props, so
  // the tagging survives edits to the body geometry below.
  useEffect(() => {
    spots.forEach((spot, i) => {
      const group = groups.current[i];
      if (!group) return;
      group.traverse((child) => {
        child.userData.laserBotId = spot.id;
      });
    });
  }, [spots]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    // Guard against a long frame (a tab restore) teleporting bots through walls.
    const dt = Math.min(delta, 0.05);
    const preset = DIFFICULTIES[difficulty];
    const scoring = !laserTagState.finished;
    let nearestDistance = Infinity;
    let nearestBot: BotRuntime | null = null;

    bots.forEach((bot, i) => {
      const group = groups.current[i];
      if (!group) return;
      const tagged = laserTagState.tagged.has(bot.id);

      if (tagged) {
        if (bot.scale <= 0) return;
        // Shrink out with a last spin, the same read as a collected star.
        bot.scale = Math.max(0, bot.scale - dt * POP_SPEED);
        group.scale.setScalar(bot.scale);
        group.rotation.y += dt * 10;
        if (bot.scale === 0) group.visible = false;
        return;
      }

      if (bot.fleeFor > 0) bot.fleeFor = Math.max(0, bot.fleeFor - dt);
      if (playerOrigin.distanceToSquared(bot.pos) < SPOOK_RADIUS * SPOOK_RADIUS) {
        bot.fleeFor = FLEE_SECONDS;
      }
      const fleeing = bot.fleeFor > 0;

      // ---- shooting back ----
      let aiming = false;
      if (returnFire && scoring) {
        bot.fireIn = Math.max(0, bot.fireIn - dt);
        bot.losIn -= dt;
        const distance = playerOrigin.distanceTo(bot.pos);

        if (bot.losIn <= 0) {
          bot.losIn = LOS_INTERVAL;
          muzzle.copy(bot.pos).setY(bot.pos.y + BOT_EYE);
          bot.hasLos =
            distance <= preset.range && hasLineOfSight(muzzle, state, sight);
        }
        if (bot.hasLos) {
          bot.sighted += dt;
          aiming = true;
          if (bot.sighted >= preset.reaction && bot.fireIn <= 0) {
            fireAtPlayer(bot, state, preset.accuracy, preset.damage);
            bot.fireIn = preset.fireInterval;
          }
        } else {
          bot.sighted = 0;
        }
      }

      // Walk toward the target cell centre. A bot lining up a shot holds still,
      // which is also the tell that it has seen you.
      if (!aiming) {
        step.subVectors(bot.target, bot.pos);
        step.y = 0;
        const remaining = step.length();
        if (remaining < ARRIVE_EPSILON) {
          const next = nextStep(bot, roam, fleeing, random.current);
          if (next) {
            bot.heading = next;
            bot.cell = [bot.cell[0] + next[0], bot.cell[1] + next[1]];
          } else {
            // Boxed in — turn around rather than freeze.
            bot.heading = [-bot.heading[0], -bot.heading[1]];
          }
          const [tx, tz] = cellToWorld(bot.cell[0], bot.cell[1]);
          bot.target.set(tx, BOT_HEIGHT_OFFSET, tz);
        } else {
          const speed = (fleeing ? FLEE_SPEED : WANDER_SPEED) * dt;
          step.multiplyScalar(Math.min(1, speed / remaining));
          bot.pos.add(step);
        }
      }

      // Face the way it is going — or face you, if it is taking aim.
      const heading = aiming
        ? Math.atan2(playerOrigin.x - bot.pos.x, playerOrigin.z - bot.pos.z)
        : Math.atan2(bot.heading[0], bot.heading[1]);
      let turn = heading - bot.yaw;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      bot.yaw += turn * Math.min(1, TURN_RATE * dt);

      group.position.set(
        bot.pos.x,
        bot.pos.y + Math.sin(t * BOB_SPEED + i) * BOB_HEIGHT,
        bot.pos.z,
      );
      group.rotation.y = bot.yaw;

      // Visor turns warm the moment a bot has you in its sights.
      const visor = visors.current[i];
      if (visor) {
        const material = visor.material as THREE.MeshStandardMaterial;
        material.color.set(aiming ? ENEMY_BOLT : UI.coral);
        material.emissive.set(aiming ? ENEMY_BOLT : UI.coral);
        material.emissiveIntensity = aiming ? 1.6 : 0.5;
      }

      const distance = playerOrigin.distanceTo(bot.pos);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestBot = bot;
      }
    });

    // One publish per frame, and it only reaches React when the rounded hint or
    // a counter actually changes.
    if (nearestBot) {
      const bot = nearestBot as BotRuntime;
      scratch.copy(bot.pos);
      laserTagState.nearestBearing = spotBearing(scratch.x, scratch.z);
      laserTagState.nearestDistance = nearestDistance;
    } else {
      laserTagState.nearestBearing = "";
      laserTagState.nearestDistance = 0;
    }
    publishLaserTag();
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
          <mesh castShadow>
            <boxGeometry args={[0.34, 0.46, 0.26]} />
            <meshStandardMaterial color={PASTEL.sky} roughness={0.5} />
          </mesh>
          {/* Hi-vis vest over the torso, with the classic banding. Each layer
              is a shade larger than the one under it rather than coplanar with
              it, so nothing z-fights at distance. */}
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[0.375, 0.3, 0.295]} />
            <meshStandardMaterial color={VEST} roughness={0.55} />
          </mesh>
          <mesh position={[0, 0.0, 0]}>
            <boxGeometry args={[0.385, 0.05, 0.305]} />
            <meshStandardMaterial color={VEST_BAND} roughness={0.3} metalness={0.2} />
          </mesh>
          <mesh position={[-0.1, 0.05, 0.151]}>
            <boxGeometry args={[0.055, 0.3, 0.006]} />
            <meshStandardMaterial color={VEST_BAND} roughness={0.3} metalness={0.2} />
          </mesh>
          <mesh position={[0.1, 0.05, 0.151]}>
            <boxGeometry args={[0.055, 0.3, 0.006]} />
            <meshStandardMaterial color={VEST_BAND} roughness={0.3} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.36, 0]} castShadow>
            <sphereGeometry args={[0.15, 16, 16]} />
            <meshStandardMaterial color={PASTEL.lilac} roughness={0.45} />
          </mesh>
          {/* Hard hat. Brim at 0.445 clears the visor at 0.38 — the visor is
              the "I can see you" tell and must stay readable — and the dome is
              squashed to 0.72 so its crown stops below the antenna tip at 0.61,
              which is the bloom marker that makes a bot findable at range.
              Both of those are why the hat is not simply a bigger sphere. */}
          <mesh position={[0, 0.445, 0]} castShadow>
            <cylinderGeometry args={[0.205, 0.205, 0.022, 20]} />
            <meshStandardMaterial color={HARD_HAT_BRIM} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0.44, 0]} scale={[1, 0.72, 1]} castShadow>
            <sphereGeometry args={[0.16, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color={HARD_HAT} roughness={0.35} />
          </mesh>
          {/* Visor — the one warm accent, so a bot reads as a face-on target,
              and the frame loop's channel for "I can see you". */}
          <mesh
            ref={(el) => {
              visors.current[i] = el;
            }}
            position={[0, 0.38, 0.15]}
          >
            <boxGeometry args={[0.2, 0.06, 0.02]} />
            <meshStandardMaterial
              color={UI.coral}
              emissive={UI.coral}
              emissiveIntensity={0.5}
            />
          </mesh>
          <mesh position={[0, 0.52, 0]}>
            <cylinderGeometry args={[0.015, 0.015, 0.16, 6]} />
            <meshStandardMaterial color={PASTEL.periwinkle} />
          </mesh>
          {/* Antenna tip. Pushed past PostFX's 0.62 bloom threshold on purpose:
              it is the only thing that makes a bot findable across the arena. */}
          <mesh position={[0, 0.61, 0]}>
            <sphereGeometry args={[0.035, 12, 12]} />
            <meshStandardMaterial
              color={SCENE.star}
              emissive={SCENE.starGlow}
              emissiveIntensity={1.2}
            />
          </mesh>
          <mesh position={[-0.1, -0.4, 0]} castShadow>
            <boxGeometry args={[0.1, 0.1, 0.16]} />
            <meshStandardMaterial color={PASTEL.indigo} />
          </mesh>
          <mesh position={[0.1, -0.4, 0]} castShadow>
            <boxGeometry args={[0.1, 0.1, 0.16]} />
            <meshStandardMaterial color={PASTEL.indigo} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/**
 * Can something at `from` see the player? A ray to the camera, blocked by
 * anything that isn't another bot. Walls stop bots shooting through the school,
 * the same way they stop the player — and for the same reason it has to be a
 * scene raycast rather than a rapier one: colliders only exist within 4 units
 * of the player.
 *
 * Exported for the Inspector, who does the same check from the roof.
 */
export function hasLineOfSight(
  from: THREE.Vector3,
  state: { scene: THREE.Scene; camera: THREE.Camera },
  sight: THREE.Raycaster,
) {
  toPlayer.subVectors(state.camera.position, from);
  const distance = toPlayer.length();
  if (distance < 0.001) return true;
  toPlayer.divideScalar(distance);

  sight.set(from, toPlayer);
  sight.far = distance;
  const blocking = sight
    .intersectObjects(state.scene.children, true)
    // Bots don't block each other's view — otherwise a huddle would go blind,
    // and the player would be able to hide behind one.
    .find((hit) => hit.object.userData.laserBotId == null);
  return !blocking || blocking.distance >= distance - 0.05;
}

/** Take a shot. Accuracy decides whether it lands; a miss still draws a bolt,
 *  so near-misses are visible and the player knows to move. */
function fireAtPlayer(
  bot: BotRuntime,
  state: { camera: THREE.Camera },
  accuracy: number,
  damage: number,
) {
  muzzle.copy(bot.pos).setY(bot.pos.y + BOT_EYE);
  const landed = Math.random() < accuracy;
  aim.copy(state.camera.position);
  if (!landed) {
    aim.x += (Math.random() - 0.5) * MISS_SPREAD * 2;
    aim.y += (Math.random() - 0.5) * MISS_SPREAD;
    aim.z += (Math.random() - 0.5) * MISS_SPREAD * 2;
  }
  spawnBolt(muzzle, aim, ENEMY_BOLT);
  playLaserSound();

  if (!landed) return;
  // Sparks at the camera read as "that hit you" without a screen-space effect.
  scratch.subVectors(muzzle, aim).normalize();
  spawnSparks(aim, scratch, ENEMY_BOLT);
  damagePlayer(damage);
  playHurtSound();
}

/** Exported for the debug overlay, which draws the same cell pitch. */
export const BOT_CELL = CELL;
