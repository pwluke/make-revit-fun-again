"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { LASER_CORE } from "./LaserGun";

/**
 * Bolt and spark pools for the laser. Same shape as break-fx: module-level
 * arrays the frame loop owns, integrated into two instanced meshes, capacity
 * ring-trimmed so a held trigger can't grow them without bound. React never
 * re-renders for a shot.
 */

type Bolt = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
};

type Spark = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  life: number;
  maxLife: number;
};

const BOLT_CAPACITY = 24;
/** Short: the bolt is a muzzle flash with reach, not a projectile. */
const BOLT_LIFE = 0.09;
const BOLT_RADIUS = 0.02;

const SPARKS_PER_HIT = 8;
const SPARK_CAPACITY = 128;
const SPARK_GRAVITY = -14;
const SPARK_SPEED = 2.6;

const bolts: Bolt[] = [];
const sparks: Spark[] = [];

const dummy = new THREE.Object3D();
const tint = new THREE.Color();
const scratch = new THREE.Vector3();

/** Enemy fire. Warm, so incoming reads apart from your own violet at a glance. */
export const ENEMY_BOLT = "#ff7a59";

/** The Inspector's fire. Hotter and redder than a scan-bot's, so a bolt from
 *  the roof is recognisable as his before you have found where he is. */
export const BOSS_BOLT = "#ff2f45";

export function spawnBolt(
  from: THREE.Vector3,
  to: THREE.Vector3,
  color: string = LASER_CORE,
) {
  bolts.push({
    from: from.clone(),
    to: to.clone(),
    color: new THREE.Color(color),
    life: BOLT_LIFE,
    maxLife: BOLT_LIFE,
  });
  if (bolts.length > BOLT_CAPACITY) bolts.splice(0, bolts.length - BOLT_CAPACITY);
}

export function spawnSparks(
  point: THREE.Vector3,
  normal: THREE.Vector3,
  color: string,
) {
  for (let i = 0; i < SPARKS_PER_HIT; i++) {
    // Scatter off the surface: the normal plus jitter, so sparks fly outward
    // rather than into the wall.
    const velocity = new THREE.Vector3(
      normal.x + (Math.random() - 0.5) * 1.4,
      normal.y + (Math.random() - 0.5) * 1.4 + 0.4,
      normal.z + (Math.random() - 0.5) * 1.4,
    )
      .normalize()
      .multiplyScalar(SPARK_SPEED * (0.5 + Math.random()));
    sparks.push({
      position: point.clone().addScaledVector(normal, 0.02),
      velocity,
      color: new THREE.Color(color),
      life: 0.25 + Math.random() * 0.2,
      maxLife: 0.45,
    });
  }
  if (sparks.length > SPARK_CAPACITY) {
    sparks.splice(0, sparks.length - SPARK_CAPACITY);
  }
}

export function clearLaserFx() {
  bolts.length = 0;
  sparks.length = 0;
}

let audioCtx: AudioContext | null = null;

function getAudioContext() {
  const Context =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Context) return null;
  if (!audioCtx) audioCtx = new Context();
  if (audioCtx.state === "suspended") void audioCtx.resume();
  return audioCtx;
}

/** A short descending zap. */
export function playLaserSound() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1180, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.11);
  } catch {
    // Sound is garnish — a blocked autoplay policy shouldn't break the hunt.
  }
}

/** Taking a hit: a low, short thud. Distinct from your own zap. */
export function playHurtSound() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.16);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.21);
  } catch {
    // As above.
  }
}

/** Two rising blips: the tag confirm. */
export function playTagSound() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    [660, 990].forEach((frequency, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.075;
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.07, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.14);
    });
  } catch {
    // As above.
  }
}

/**
 * The Inspector noticing you: a short air-horn blare. Deliberately the ugliest
 * sound in the mode — it is the only warning you get that the roof has eyes.
 */
export function playBossAlertSound() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    // Two detuned saws a semitone apart beat against each other, which is what
    // makes a horn sound like a horn rather than like a synth note.
    [138, 146].forEach((frequency) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.03);
      gain.gain.setValueAtTime(0.06, t + 0.34);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.52);
    });
  } catch {
    // As above — sound is garnish.
  }
}

/** The Inspector going down: a long descending groan under the tag blips. */
export function playBossDownSound() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.9);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 1.02);
  } catch {
    // As above.
  }
}

/** The two instanced pools, integrated in one frame loop. */
export function LaserFx() {
  const boltMesh = useRef<THREE.InstancedMesh>(null);
  const sparkMesh = useRef<THREE.InstancedMesh>(null);

  // Instance colour buffers only exist once setColorAt has run once, so seed
  // both meshes up front rather than on the first shot.
  useLayoutEffect(() => {
    tint.set(LASER_CORE);
    const spark = sparkMesh.current;
    if (spark) {
      for (let i = 0; i < SPARK_CAPACITY; i++) spark.setColorAt(i, tint);
      if (spark.instanceColor) spark.instanceColor.needsUpdate = true;
    }
    const bolt = boltMesh.current;
    if (bolt) {
      for (let i = 0; i < BOLT_CAPACITY; i++) bolt.setColorAt(i, tint);
      if (bolt.instanceColor) bolt.instanceColor.needsUpdate = true;
    }
  }, []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);

    const bolt = boltMesh.current;
    if (bolt) {
      let live = 0;
      for (const item of bolts) {
        item.life -= dt;
        if (item.life <= 0) continue;
        scratch.subVectors(item.to, item.from);
        const length = scratch.length() || 0.001;
        dummy.position.copy(item.from).addScaledVector(scratch, 0.5);
        // The cylinder's axis is +Y, so aim it then tip it forward.
        dummy.lookAt(item.to);
        dummy.rotateX(Math.PI / 2);
        // Fade by thinning rather than by opacity — one shared material.
        const fade = item.life / item.maxLife;
        dummy.scale.set(BOLT_RADIUS * fade, length, BOLT_RADIUS * fade);
        dummy.updateMatrix();
        bolt.setMatrixAt(live, dummy.matrix);
        bolt.setColorAt(live, item.color);
        live++;
      }
      // Compact in place, the same way BreakDebris does.
      let write = 0;
      for (const item of bolts) if (item.life > 0) bolts[write++] = item;
      bolts.length = write;
      bolt.count = live;
      bolt.instanceMatrix.needsUpdate = true;
      if (bolt.instanceColor) bolt.instanceColor.needsUpdate = true;
    }

    const spark = sparkMesh.current;
    if (spark) {
      let live = 0;
      for (const item of sparks) {
        item.life -= dt;
        if (item.life <= 0) continue;
        item.velocity.y += SPARK_GRAVITY * dt;
        item.position.addScaledVector(item.velocity, dt);
        const fade = Math.max(0, item.life / item.maxLife);
        dummy.position.copy(item.position);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(fade);
        dummy.updateMatrix();
        spark.setMatrixAt(live, dummy.matrix);
        spark.setColorAt(live, item.color);
        live++;
      }
      let write = 0;
      for (const item of sparks) if (item.life > 0) sparks[write++] = item;
      sparks.length = write;
      spark.count = live;
      spark.instanceMatrix.needsUpdate = true;
      if (spark.instanceColor) spark.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh
        ref={boltMesh}
        args={[undefined, undefined, BOLT_CAPACITY]}
        frustumCulled={false}
        raycast={() => {}}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
        {/* Unlit and bright: the cheap way past the 0.62 bloom threshold.
            Colour comes per-instance, so incoming fire reads warm. */}
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={sparkMesh}
        args={[undefined, undefined, SPARK_CAPACITY]}
        frustumCulled={false}
        raycast={() => {}}
      >
        <boxGeometry args={[0.03, 0.03, 0.03]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </>
  );
}
