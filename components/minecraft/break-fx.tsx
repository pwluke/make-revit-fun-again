import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CubeCoords } from "@/lib/use-grid-points";

type Shard = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  axis: THREE.Vector3;
  angle: number;
  spin: number;
  color: THREE.Color;
  life: number;
  maxLife: number;
};

type BrokenCube = {
  position: CubeCoords;
  color: string;
};

const SHARDS_PER_BLOCK = 5;
const DEBRIS_CAPACITY = 256;
const GRAVITY = -22;
const dummy = new THREE.Object3D();
const tint = new THREE.Color();

const shards: Shard[] = [];

let audioCtx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;

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

function getNoise(ctx: AudioContext) {
  if (noiseBuffer) return noiseBuffer;
  const duration = 0.18;
  const samples = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, samples, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < samples; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / samples);
  }
  noiseBuffer = buffer;
  return buffer;
}

/** Crunchy rubble: filtered noise plus a few falling clacks. */
export function playBreakSound(count: number) {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const t = ctx.currentTime;
    const voices = Math.min(4, Math.max(2, Math.round(count / 4)));

    const noise = ctx.createBufferSource();
    noise.buffer = getNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(720, t);
    filter.frequency.exponentialRampToValueAtTime(240, t + 0.16);
    filter.Q.value = 0.9;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    noise.connect(filter).connect(noiseGain).connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.18);

    for (let i = 0; i < voices; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = t + i * 0.018;
      osc.type = i % 2 === 0 ? "square" : "triangle";
      osc.frequency.setValueAtTime(210 + Math.random() * 140, start);
      osc.frequency.exponentialRampToValueAtTime(90 + Math.random() * 40, start + 0.09);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.05, start + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.11);
    }
  } catch {
    // Sound is garnish — a blocked autoplay policy shouldn't break mining.
  }
}

export function spawnBreakDebris(cubes: BrokenCube[], size: CubeCoords) {
  const throwSpeed = 2.4;
  for (const cube of cubes) {
    for (let i = 0; i < SHARDS_PER_BLOCK; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 1.4 + 0.35,
        Math.random() * 2 - 1,
      );
      if (dir.lengthSq() < 0.0001) dir.set(0, 1, 0);
      dir.normalize().multiplyScalar(throwSpeed * (0.55 + Math.random() * 0.7));
      const life = 0.45 + Math.random() * 0.25;
      shards.push({
        position: new THREE.Vector3(
          cube.position[0] + (Math.random() - 0.5) * size[0],
          cube.position[1] + (Math.random() - 0.5) * size[1],
          cube.position[2] + (Math.random() - 0.5) * size[2],
        ),
        velocity: dir,
        axis: new THREE.Vector3(
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
          Math.random() * 2 - 1,
        ).normalize(),
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 14,
        color: new THREE.Color(cube.color),
        life,
        maxLife: life,
      });
    }
  }
  if (shards.length > DEBRIS_CAPACITY) {
    shards.splice(0, shards.length - DEBRIS_CAPACITY);
  }
}

export function BreakDebris({ size }: { size: CubeCoords }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const shardSize = useMemo<CubeCoords>(
    () => [size[0] * 0.32, size[1] * 0.32, size[2] * 0.32],
    [size],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (mesh) mesh.count = 0;
  }, []);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(delta, 0.05);
    let live = 0;
    for (let i = 0; i < shards.length; i++) {
      const shard = shards[i];
      shard.life -= dt;
      if (shard.life <= 0) continue;
      shard.velocity.y += GRAVITY * dt;
      shard.position.addScaledVector(shard.velocity, dt);
      shard.angle += shard.spin * dt;
      const fade = shard.life / shard.maxLife;
      dummy.position.copy(shard.position);
      dummy.scale.setScalar(0.45 + fade * 0.55);
      dummy.setRotationFromAxisAngle(shard.axis, shard.angle);
      dummy.updateMatrix();
      mesh.setMatrixAt(live, dummy.matrix);
      mesh.setColorAt(live, tint.copy(shard.color));
      live += 1;
    }
    if (live < shards.length) {
      let write = 0;
      for (const shard of shards) {
        if (shard.life > 0) shards[write++] = shard;
      }
      shards.length = write;
    }
    mesh.count = live;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, DEBRIS_CAPACITY]}
      frustumCulled={false}
      raycast={() => {}}
    >
      <boxGeometry args={shardSize} />
      <meshStandardMaterial roughness={0.7} />
    </instancedMesh>
  );
}
