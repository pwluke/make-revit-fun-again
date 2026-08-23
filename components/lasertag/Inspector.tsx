"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { PASTEL, UI, mix } from "@/lib/palette";
import { playerOrigin } from "@/components/minecraft/player-origin";
import { hasLineOfSight } from "./Bots";
import {
  NEIGHBOR_STEPS,
  cellKey,
  cellToWorld,
  spotBearing,
  type RoofPlan,
} from "./botArena";
import {
  BOSS_BOLT,
  playBossAlertSound,
  playBossDownSound,
  playHurtSound,
  playLaserSound,
  spawnBolt,
  spawnSparks,
} from "./laser-fx";
import {
  BOSS_ID,
  BOSS_MODIFIER,
  DIFFICULTIES,
  damagePlayer,
  laserTagState,
  publishLaserTag,
  type Difficulty,
} from "./laserTagStore";

/**
 * The final boss: The Inspector.
 *
 * He is deliberately not a scan-bot with bigger numbers. Bots are five
 * interchangeable objects walking the ground-floor cell set; he is one object
 * pacing the roof plateau, so he needs his own walk set, his own standing
 * height per cell, and his own model. What he *does* share is the hit
 * attribution (`userData.laserBotId`) and the tag bookkeeping, which is what
 * lets LaserTag's fire handler shoot him without knowing he exists.
 *
 * Like the bots he carries no rigid body — NearbyColliders only mounts voxel
 * colliders within 4 units of the player, so there is no roof under him to
 * stand on as far as physics is concerned. Walking the precomputed plateau
 * cells is what keeps him on the building.
 */

/**
 * How much bigger than life he is. At 1.8 he stands ~4.4 m — roughly two and a
 * half players, and four scan-bots. Big enough to be a silhouette on the
 * skyline from the far side of the apron, which is the whole point of putting
 * him up there.
 */
const BOSS_SCALE = 1.8;

/** Local-space eye height, before BOSS_SCALE. Muzzle and line of sight both
 *  start here, so his bolts come from his visor rather than his boots. */
const BOSS_EYE_LOCAL = 1.94;
const BOSS_EYE = BOSS_EYE_LOCAL * BOSS_SCALE;

/** He does not hurry. A slow pace is most of what makes him read as a boss. */
const PACE_SPEED = 0.9;
const TURN_RATE = 2.2;
const STRAIGHT_BIAS = 0.82;
const ARRIVE_EPSILON = 0.06;

/** Roof surfaces are near-flat but not exactly, so ease onto the new height
 *  rather than snapping between cells. */
const RISE_RATE = 4;

/** Same coarse, deliberate cadence as the bots' — a scene raycast is not cheap
 *  and this one is fired from further away, through more of the building. */
const LOS_INTERVAL = 0.3;
/** How far a miss lands from the player. Wider than a bot's: he is shooting
 *  down from the roof and near-misses need to be legible at that range. */
const MISS_SPREAD = 2.2;

/** Shots per burst, and the gap inside one. He fires in threes, which is the
 *  other half of why his fire reads apart from the scan-bots'. */
const BURST_SHOTS = 3;
const BURST_GAP = 0.14;

/** Seconds a hit flash lasts. */
const FLASH_TIME = 0.16;
/** How fast he collapses once tagged. Slower than a bot's pop — he is meant to
 *  take a moment going down. */
const FALL_SPEED = 0.9;

const BREATH_SPEED = 1.3;
const BREATH_HEIGHT = 0.05;

/**
 * Site colours. These sit outside `lib/palette` on purpose: hi-vis is a hazard
 * signal, and the pastel tokens exist precisely to avoid shouting. He is the
 * one thing in the scene allowed to shout.
 */
const HI_VIS = "#d8f43a";
const HARD_HAT = "#ff8a1f";
const REFLECTIVE = "#eef2f7";
const ANGRY = "#ff2f45";
/** Boots, gloves, belt, tool steel. */
const WORKWEAR = mix(PASTEL.indigo, UI.ink, 0.55);

const muzzle = new THREE.Vector3();
const aim = new THREE.Vector3();
const scratch = new THREE.Vector3();
const step = new THREE.Vector3();

type BossRuntime = {
  pos: THREE.Vector3;
  cell: [number, number];
  target: THREE.Vector3;
  heading: [number, number];
  yaw: number;
  /** Seconds until the next burst may start. */
  fireIn: number;
  /** Shots left in the burst being fired, and the gap until the next one. */
  burstLeft: number;
  burstIn: number;
  losIn: number;
  hasLos: boolean;
  /** Seconds of continuous sight, versus his reaction time. */
  sighted: number;
  /** True once the alert horn has sounded for this sighting. */
  alerted: boolean;
  /** Hits counted last frame, so a new one can flash without a subscription. */
  seenHits: number;
  flash: number;
  /** 1 while alive, easing to 0 as he goes down. */
  scale: number;
};

/** Next roof cell to pace to. Same straight-ahead bias as the bots — a uniform
 *  pick over four neighbours reads as jitter, not as patrolling. */
function nextStep(
  boss: BossRuntime,
  roof: Set<string>,
): [number, number] | null {
  const [ci, cj] = boss.cell;
  const options = NEIGHBOR_STEPS.filter(([di, dj]) =>
    roof.has(cellKey(ci + di, cj + dj)),
  );
  if (options.length === 0) return null;
  const straight = options.find(
    ([di, dj]) => di === boss.heading[0] && dj === boss.heading[1],
  );
  if (straight && Math.random() < STRAIGHT_BIAS) return straight;
  return options[Math.floor(Math.random() * options.length) % options.length];
}

export function Inspector({
  roof,
  returnFire,
  difficulty,
}: {
  roof: RoofPlan;
  returnFire: boolean;
  difficulty: Difficulty;
}) {
  const group = useRef<THREE.Group>(null);
  const visor = useRef<THREE.Mesh>(null);
  const scanner = useRef<THREE.Mesh>(null);
  const boss = useRef<BossRuntime | null>(null);

  /** Private raycaster, never the one from useThree — setting `far` on that
   *  would clamp r3f's own pointer events. Same trap Bots documents. */
  const sight = useMemo(() => new THREE.Raycaster(), []);

  // useLayoutEffect so he is placed before the first frame reads him. Keyed on
  // the roof, so a re-scatter (or the voxels finishing streaming) resets him.
  useLayoutEffect(() => {
    const [x, y, z] = roof.spawn.pos;
    boss.current = {
      pos: new THREE.Vector3(x, y, z),
      cell: [...roof.spawn.cell] as [number, number],
      target: new THREE.Vector3(x, y, z),
      heading: [1, 0],
      yaw: 0,
      fireIn: DIFFICULTIES[difficulty].fireInterval * BOSS_MODIFIER.fireInterval,
      burstLeft: 0,
      burstIn: 0,
      losIn: 0,
      hasLos: false,
      sighted: 0,
      alerted: false,
      seenHits: 0,
      flash: 0,
      scale: 1,
    };
    // He survives across rounds as the same React element, so undo the collapse
    // rather than respawning him flattened and invisible.
    const node = group.current;
    if (node) {
      node.visible = true;
      node.scale.setScalar(1);
      node.rotation.set(0, 0, 0);
    }
    return () => {
      boss.current = null;
    };
  }, [roof, difficulty]);

  // Tag every mesh so LaserTag's fire handler attributes hits to him. A
  // traverse rather than per-mesh props, so it survives edits to the model.
  useEffect(() => {
    group.current?.traverse((child) => {
      child.userData.laserBotId = BOSS_ID;
    });
  }, []);

  useFrame((state, delta) => {
    const node = group.current;
    const self = boss.current;
    if (!node || !self) return;
    const t = state.clock.elapsedTime;
    // Guard against a long frame (a tab restore) walking him off the roof.
    const dt = Math.min(delta, 0.05);
    const preset = DIFFICULTIES[difficulty];
    const scoring = !laserTagState.finished;

    if (laserTagState.tagged.has(BOSS_ID)) {
      if (self.scale <= 0) return;
      if (self.scale === 1) playBossDownSound();
      // He topples rather than popping: tips onto his face as he shrinks, so a
      // boss going down doesn't read like a collected star.
      self.scale = Math.max(0, self.scale - dt * FALL_SPEED);
      node.scale.setScalar(self.scale);
      node.rotation.x = (1 - self.scale) * (Math.PI / 2);
      if (self.scale === 0) node.visible = false;
      return;
    }

    // ---- taking a hit ----
    const hits = laserTagState.hits.get(BOSS_ID) ?? 0;
    if (hits > self.seenHits) {
      self.seenHits = hits;
      self.flash = FLASH_TIME;
      // Being shot at gets his attention even through a wall — otherwise you
      // could chip him down from cover with no answer at all.
      self.sighted = Math.max(self.sighted, preset.reaction * 0.5);
    }
    if (self.flash > 0) self.flash = Math.max(0, self.flash - dt);

    // ---- shooting back ----
    let aiming = false;
    if (returnFire && scoring) {
      self.fireIn = Math.max(0, self.fireIn - dt);
      self.losIn -= dt;
      const distance = playerOrigin.distanceTo(self.pos);

      if (self.losIn <= 0) {
        self.losIn = LOS_INTERVAL;
        muzzle.copy(self.pos).setY(self.pos.y + BOSS_EYE);
        self.hasLos =
          distance <= BOSS_MODIFIER.range && hasLineOfSight(muzzle, state, sight);
      }

      if (self.hasLos) {
        aiming = true;
        if (!self.alerted) {
          self.alerted = true;
          playBossAlertSound();
        }
        self.sighted += dt;
        // The burst, once started, finishes on its own clock — that is what
        // makes three bolts read as one volley rather than three shots.
        if (self.burstLeft > 0) {
          self.burstIn -= dt;
          if (self.burstIn <= 0) {
            fireAtPlayer(self, state, preset.accuracy, preset.damage);
            self.burstLeft -= 1;
            self.burstIn = BURST_GAP;
          }
        } else if (
          self.sighted >= preset.reaction * BOSS_MODIFIER.reaction &&
          self.fireIn <= 0
        ) {
          self.burstLeft = BURST_SHOTS;
          self.burstIn = 0;
          self.fireIn = preset.fireInterval * BOSS_MODIFIER.fireInterval;
        }
      } else {
        self.sighted = 0;
        self.burstLeft = 0;
        // Re-arm the horn, so losing him and being found again is audible.
        self.alerted = false;
      }
    }

    // ---- pacing the roof ----
    // He plants his feet to shoot. Standing still is the tell that he has you.
    if (!aiming) {
      step.subVectors(self.target, self.pos);
      step.y = 0;
      const remaining = step.length();
      if (remaining < ARRIVE_EPSILON) {
        const next = nextStep(self, roof.set);
        if (next) {
          self.heading = next;
          self.cell = [self.cell[0] + next[0], self.cell[1] + next[1]];
        } else {
          // Cornered on a narrow parapet — turn around rather than freeze.
          self.heading = [-self.heading[0], -self.heading[1]];
        }
        const key = cellKey(...self.cell);
        const [tx, tz] = cellToWorld(...self.cell);
        self.target.set(tx, roof.surface.get(key) ?? self.pos.y, tz);
      } else {
        step.multiplyScalar(Math.min(1, (PACE_SPEED * dt) / remaining));
        self.pos.add(step);
      }
    }
    // Height is eased independently of the walk, so a step up onto a slab
    // thickness is a stride rather than a jolt.
    self.pos.y = THREE.MathUtils.lerp(
      self.pos.y,
      self.target.y,
      Math.min(1, RISE_RATE * dt),
    );

    // Face the way he is going — or straight down at you, if he has you.
    const heading = aiming
      ? Math.atan2(playerOrigin.x - self.pos.x, playerOrigin.z - self.pos.z)
      : Math.atan2(self.heading[0], self.heading[1]);
    let turn = heading - self.yaw;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    self.yaw += turn * Math.min(1, TURN_RATE * dt);

    node.position.set(
      self.pos.x,
      self.pos.y + Math.sin(t * BREATH_SPEED) * BREATH_HEIGHT,
      self.pos.z,
    );
    node.rotation.y = self.yaw;
    // A hit rocks him back a touch — the only feedback that a shot from the
    // ground landed, at a range where sparks are a few pixels.
    node.rotation.x = -(self.flash / FLASH_TIME) * 0.12;

    // Visor and shoulder scanner burn hotter the moment he has you, and white
    // out for a frame when he is hit.
    const hot = self.flash > 0 ? 3.4 : aiming ? 2.4 : 0.9;
    const tint = self.flash > 0 ? REFLECTIVE : ANGRY;
    for (const mesh of [visor.current, scanner.current]) {
      if (!mesh) continue;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.color.set(tint);
      material.emissive.set(tint);
      material.emissiveIntensity = hot;
    }

    // Once the scan-bots are all down, Bots leaves the hint empty — fill it in
    // with him, so the last target is findable rather than a hunt around the
    // whole footprint for a silhouette.
    if (!laserTagState.nearestBearing) {
      scratch.copy(self.pos);
      laserTagState.nearestBearing = spotBearing(scratch.x, scratch.z);
      laserTagState.nearestDistance = playerOrigin.distanceTo(self.pos);
      publishLaserTag();
    }
  });

  return (
    <group ref={group} position={roof.spawn.pos}>
      {/* Inner group carries the size, so the outer one is free to own the
          topple animation without the two multiplying together. */}
      <group scale={BOSS_SCALE}>
        {/* ---- boots ---- */}
        {[-0.23, 0.23].map((x) => (
          <mesh key={`boot${x}`} position={[x, 0.08, 0.03]} castShadow>
            <boxGeometry args={[0.3, 0.16, 0.4]} />
            <meshStandardMaterial color={WORKWEAR} roughness={0.8} />
          </mesh>
        ))}
        {/* ---- legs ---- */}
        {[-0.23, 0.23].map((x) => (
          <mesh key={`leg${x}`} position={[x, 0.5, 0]} castShadow>
            <boxGeometry args={[0.28, 0.7, 0.3]} />
            <meshStandardMaterial color={PASTEL.indigo} roughness={0.75} />
          </mesh>
        ))}
        {/* Tool belt. */}
        <mesh position={[0, 0.9, 0]} castShadow>
          <boxGeometry args={[0.82, 0.14, 0.46]} />
          <meshStandardMaterial color={WORKWEAR} roughness={0.7} />
        </mesh>

        {/* ---- torso ---- */}
        <mesh position={[0, 1.28, 0]} castShadow>
          <boxGeometry args={[0.76, 0.7, 0.42]} />
          <meshStandardMaterial color={UI.inkSoft} roughness={0.7} />
        </mesh>
        {/* Hi-vis vest, worn over the shirt — hence very slightly larger. */}
        <mesh position={[0, 1.28, 0]} castShadow>
          <boxGeometry args={[0.84, 0.66, 0.5]} />
          <meshStandardMaterial
            color={HI_VIS}
            emissive={HI_VIS}
            emissiveIntensity={0.35}
            roughness={0.6}
          />
        </mesh>
        {/* The vest's front opening, so it reads as worn rather than painted
            on. Sits proud of the vest face to avoid z-fighting. */}
        <mesh position={[0, 1.28, 0.252]}>
          <boxGeometry args={[0.1, 0.66, 0.01]} />
          <meshStandardMaterial color={UI.inkSoft} roughness={0.7} />
        </mesh>
        {/* Two reflective bands. Emissive, so they catch the eye against the
            roofline from across the arena. */}
        {[1.42, 1.13].map((y) => (
          <mesh key={`band${y}`} position={[0, y, 0]}>
            <boxGeometry args={[0.86, 0.09, 0.52]} />
            <meshStandardMaterial
              color={REFLECTIVE}
              emissive={REFLECTIVE}
              emissiveIntensity={0.5}
              roughness={0.35}
            />
          </mesh>
        ))}

        {/* ---- arms ---- */}
        {[-0.55, 0.55].map((x) => (
          <mesh key={`arm${x}`} position={[x, 1.22, 0]} castShadow>
            <boxGeometry args={[0.24, 0.74, 0.32]} />
            <meshStandardMaterial color={UI.inkSoft} roughness={0.7} />
          </mesh>
        ))}
        {[-0.55, 0.55].map((x) => (
          <mesh key={`glove${x}`} position={[x, 0.76, 0.02]} castShadow>
            <boxGeometry args={[0.26, 0.22, 0.34]} />
            <meshStandardMaterial color={WORKWEAR} roughness={0.8} />
          </mesh>
        ))}
        {/* Crowbar in the off hand. Purely characterful — he never swings it,
            but a boss holding nothing reads as a mannequin. */}
        <mesh position={[-0.72, 0.52, 0.1]} rotation={[0.18, 0, 0.1]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.9, 8]} />
          <meshStandardMaterial color={WORKWEAR} metalness={0.6} roughness={0.4} />
        </mesh>

        {/* ---- head ---- */}
        <mesh position={[0, 1.68, 0]}>
          <boxGeometry args={[0.26, 0.14, 0.26]} />
          <meshStandardMaterial color={PASTEL.sand} roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.9, 0]} castShadow>
          <boxGeometry args={[0.44, 0.42, 0.38]} />
          <meshStandardMaterial color={PASTEL.sand} roughness={0.65} />
        </mesh>
        {/* Heavy brow over the eyes: the whole scowl, in one box. */}
        <mesh position={[0, 2.02, 0.185]}>
          <boxGeometry args={[0.46, 0.11, 0.06]} />
          <meshStandardMaterial color={WORKWEAR} roughness={0.8} />
        </mesh>
        {/* The eye bar. Red even at rest — an idle amber read as friendly, and
            he is the one thing here that should not. Doubles as the frame
            loop's channel for "I see you". */}
        <mesh ref={visor} position={[0, 1.93, 0.195]}>
          <boxGeometry args={[0.34, 0.08, 0.03]} />
          <meshStandardMaterial
            color={ANGRY}
            emissive={ANGRY}
            emissiveIntensity={0.9}
          />
        </mesh>
        {/* Beard. */}
        <mesh position={[0, 1.74, 0.03]}>
          <boxGeometry args={[0.36, 0.16, 0.37]} />
          <meshStandardMaterial color={WORKWEAR} roughness={0.9} />
        </mesh>

        {/* ---- hard hat ----
            The dome has to be wider than the brim is proud of it, or the two
            read as a top hat rather than as site PPE. */}
        <mesh position={[0, 2.14, 0.02]} castShadow>
          <cylinderGeometry args={[0.42, 0.42, 0.05, 20]} />
          <meshStandardMaterial color={HARD_HAT} roughness={0.45} />
        </mesh>
        <mesh position={[0, 2.22, 0]} castShadow>
          <cylinderGeometry args={[0.34, 0.38, 0.22, 20]} />
          <meshStandardMaterial color={HARD_HAT} roughness={0.45} />
        </mesh>
        {/* Crown cap, so the dome isn't a flat-topped drum. */}
        <mesh position={[0, 2.33, 0]} castShadow>
          <sphereGeometry args={[0.34, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={HARD_HAT} roughness={0.45} />
        </mesh>
        {/* Crown ridge, front to back — the detail that makes the cylinder
            read as a hard hat rather than as a bucket. */}
        <mesh position={[0, 2.42, 0]}>
          <boxGeometry args={[0.08, 0.07, 0.66]} />
          <meshStandardMaterial color={mix(HARD_HAT, UI.ink, 0.3)} />
        </mesh>

        {/* ---- shoulders ----
            Heavy pads sitting proud of the arms. This is most of what makes the
            silhouette read as hunched and top-heavy rather than as a tall doll. */}
        {[-0.5, 0.5].map((x) => (
          <mesh key={`pad${x}`} position={[x, 1.58, 0]} castShadow>
            <boxGeometry args={[0.4, 0.22, 0.44]} />
            <meshStandardMaterial color={WORKWEAR} roughness={0.75} />
          </mesh>
        ))}

        {/* ---- shoulder scanner: what he shoots with ----
            Mounted on top of the pad and angled down at the courtyard, not
            projecting forward at chest height where it read as a third arm. */}
        <mesh position={[0.52, 1.78, 0.04]} rotation={[0.28, 0, 0]} castShadow>
          <boxGeometry args={[0.14, 0.14, 0.44]} />
          <meshStandardMaterial color={WORKWEAR} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh ref={scanner} position={[0.52, 1.72, 0.24]}>
          <sphereGeometry args={[0.075, 14, 14]} />
          <meshStandardMaterial
            color={ANGRY}
            emissive={ANGRY}
            emissiveIntensity={0.9}
          />
        </mesh>
      </group>
    </group>
  );
}

/** One shot from the roof. Same contract as the bots' — a miss still draws a
 *  bolt, so incoming fire from above is visible before it connects. */
function fireAtPlayer(
  boss: BossRuntime,
  state: { camera: THREE.Camera },
  accuracy: number,
  damage: number,
) {
  muzzle.copy(boss.pos).setY(boss.pos.y + BOSS_EYE);
  const landed = Math.random() < Math.min(0.95, accuracy * BOSS_MODIFIER.accuracy);
  aim.copy(state.camera.position);
  if (!landed) {
    aim.x += (Math.random() - 0.5) * MISS_SPREAD * 2;
    aim.y += (Math.random() - 0.5) * MISS_SPREAD;
    aim.z += (Math.random() - 0.5) * MISS_SPREAD * 2;
  }
  spawnBolt(muzzle, aim, BOSS_BOLT);
  playLaserSound();

  if (!landed) return;
  scratch.subVectors(muzzle, aim).normalize();
  spawnSparks(aim, scratch, BOSS_BOLT);
  damagePlayer(Math.round(damage * BOSS_MODIFIER.damage));
  playHurtSound();
}
