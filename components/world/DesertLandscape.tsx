"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { seededRandom } from "./starPlacement";
import { useThemeStore } from "./themeStore";

type Vec3 = [number, number, number];

type Transform = {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  color: string;
};

type Bird = {
  center: Vec3;
  radius: number;
  speed: number;
  phase: number;
  height: number;
  scale: number;
};

const CACTUS_COLORS = ["#687b58", "#788765", "#596d4d", "#879173"];
const ROCK_COLORS = ["#c98268", "#d99a7c", "#b8705f", "#e3ad88", "#aa6759"];
const SAND_COLORS = ["#dca47e", "#e8b890", "#cc8f70", "#efc49d"];

/** Keep the house, streamed building, spawn lawn, and their circulation clear. */
function isArchitecture(x: number, z: number, margin = 0) {
  return x > -14 - margin && x < 14 + margin && z > -35 - margin && z < 22 + margin;
}

function rotateOffset(x: number, z: number, yaw: number): [number, number] {
  return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
}

function createDesertLayout() {
  const random = seededRandom(0xba5e1a);
  const trunks: Transform[] = [];
  const armPosts: Transform[] = [];
  const armLinks: Transform[] = [];
  const rocks: Transform[] = [];
  const dunes: Transform[] = [];
  const mesas: Transform[] = [];

  // Area-uniform sampling fills a wide belt rather than bunching everything at
  // the horizon. The fixed seed makes the "random" world stable between loads.
  for (let attempt = 0; attempt < 900 && trunks.length < 92; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = 19 + Math.sqrt(random()) * 78;
    const x = Math.cos(angle) * radius;
    const z = -8 + Math.sin(angle) * radius;
    if (isArchitecture(x, z, 3)) continue;

    const height = 2.2 + random() * 5.2;
    const width = 0.25 + random() * 0.25;
    const yaw = random() * Math.PI * 2;
    const color = CACTUS_COLORS[Math.floor(random() * CACTUS_COLORS.length)];
    trunks.push({
      position: [x, height / 2, z],
      rotation: [0, yaw, 0],
      scale: [width, height, width],
      color,
    });

    const armCount = random() < 0.2 ? 0 : random() < 0.68 ? 1 : 2;
    for (let arm = 0; arm < armCount; arm++) {
      const side = arm === 0 ? (random() < 0.5 ? -1 : 1) : armPosts.length % 2 ? -1 : 1;
      const reach = 0.6 + random() * 0.65;
      const rise = 0.7 + random() * 1.65;
      const shoulder = height * (0.35 + random() * 0.32);
      const [dx, dz] = rotateOffset(side * reach, 0, yaw);
      const [lx, lz] = rotateOffset(side * reach * 0.5, 0, yaw);
      armPosts.push({
        position: [x + dx, shoulder + rise / 2, z + dz],
        rotation: [0, yaw, 0],
        scale: [width * 0.72, rise, width * 0.72],
        color,
      });
      armLinks.push({
        position: [x + lx, shoulder, z + lz],
        rotation: [0, yaw, Math.PI / 2],
        scale: [width * 0.72, reach, width * 0.72],
        color,
      });
    }
  }

  for (let attempt = 0; attempt < 1400 && rocks.length < 280; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = 15 + Math.sqrt(random()) * 92;
    const x = Math.cos(angle) * radius;
    const z = -8 + Math.sin(angle) * radius;
    if (isArchitecture(x, z, 0.5)) continue;
    const size = 0.18 + Math.pow(random(), 2.2) * 1.8;
    rocks.push({
      position: [x, size * 0.28, z],
      rotation: [random() * 0.35, random() * Math.PI * 2, random() * 0.25],
      scale: [size * (0.8 + random() * 0.8), size * (0.45 + random() * 0.45), size],
      color: ROCK_COLORS[Math.floor(random() * ROCK_COLORS.length)],
    });
  }

  // Broad, shallow forms turn the flat game plane into a layered desert. They
  // stay outside the playable centre and do not carry colliders.
  for (let index = 0; index < 34; index++) {
    const angle = (index / 34) * Math.PI * 2 + (random() - 0.5) * 0.3;
    const radius = 38 + random() * 70;
    const width = 5 + random() * 9;
    dunes.push({
      position: [Math.cos(angle) * radius, -0.45, -8 + Math.sin(angle) * radius],
      rotation: [0, random() * Math.PI, 0],
      scale: [width, 0.8 + random() * 0.75, width * (0.45 + random() * 0.25)],
      color: SAND_COLORS[Math.floor(random() * SAND_COLORS.length)],
    });
  }

  for (let index = 0; index < 18; index++) {
    const angle = (index / 18) * Math.PI * 2 + random() * 0.18;
    const radius = 105 + random() * 42;
    const height = 7 + random() * 14;
    const width = 4 + random() * 8;
    mesas.push({
      position: [Math.cos(angle) * radius, height / 2 - 0.3, -8 + Math.sin(angle) * radius],
      rotation: [0, random() * Math.PI, 0],
      scale: [width, height, width * (0.55 + random() * 0.45)],
      color: ROCK_COLORS[Math.floor(random() * ROCK_COLORS.length)],
    });
  }

  const birds: Bird[] = Array.from({ length: 18 }, (_, index) => ({
    center: [(random() - 0.5) * 60, 0, -18 + (random() - 0.5) * 65],
    radius: 5 + random() * 15,
    speed: 0.08 + random() * 0.08,
    phase: (index / 18) * Math.PI * 2 + random(),
    height: 11 + random() * 15,
    scale: 0.45 + random() * 0.45,
  }));

  return { trunks, armPosts, armLinks, rocks, dunes, mesas, birds };
}

const DESERT = createDesertLayout();

function Instances({
  transforms,
  shape,
  roughness = 0.9,
}: {
  transforms: Transform[];
  shape: "cylinder" | "rock" | "dune" | "mesa";
  roughness?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    transforms.forEach((item, index) => {
      dummy.position.set(...item.position);
      dummy.rotation.set(...item.rotation);
      dummy.scale.set(...item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.set(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [color, dummy, transforms]);

  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, transforms.length]}
      castShadow={shape !== "dune" && shape !== "mesa"}
      receiveShadow
    >
      {shape === "cylinder" && <cylinderGeometry args={[1, 1, 1, 7]} />}
      {shape === "rock" && <icosahedronGeometry args={[1, 0]} />}
      {shape === "dune" && <sphereGeometry args={[1, 12, 6]} />}
      {shape === "mesa" && <cylinderGeometry args={[0.72, 1, 1, 7]} />}
      <meshStandardMaterial vertexColors roughness={roughness} metalness={0} />
    </instancedMesh>
  );
}

function BirdFlock({ birds }: { birds: Bird[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const wing = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0.08, 0.08, 0.28, 0, -0.18], 3),
    );
    geometry.computeVertexNormals();
    return geometry;
  }, []);

  useLayoutEffect(() => () => wing.dispose(), [wing]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const time = clock.elapsedTime;
    birds.forEach((bird, index) => {
      const angle = bird.phase + time * bird.speed;
      const x = bird.center[0] + Math.cos(angle) * bird.radius;
      const z = bird.center[2] + Math.sin(angle) * bird.radius;
      const y = bird.height + Math.sin(time * 0.7 + bird.phase) * 0.7;
      const flap = Math.sin(time * 4.8 + bird.phase * 3) * 0.42;
      for (let side = 0; side < 2; side++) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, -angle, side === 0 ? flap : -flap);
        dummy.scale.set(side === 0 ? bird.scale : -bird.scale, bird.scale, bird.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(index * 2 + side, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[wing, undefined, birds.length * 2]} frustumCulled={false}>
      <meshStandardMaterial
        color="#6d554b"
        roughness={0.9}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

/** Dense, warm desert scenery inspired by the supplied courtyard image. */
export function DesertLandscape() {
  const isClay = useThemeStore((state) => state.id === "clay");
  if (!isClay) return null;

  return (
    <group>
      <Instances transforms={DESERT.dunes} shape="dune" roughness={1} />
      <Instances transforms={DESERT.mesas} shape="mesa" roughness={0.98} />
      <Instances transforms={DESERT.rocks} shape="rock" roughness={0.94} />
      <Instances transforms={DESERT.trunks} shape="cylinder" roughness={0.86} />
      <Instances transforms={DESERT.armPosts} shape="cylinder" roughness={0.86} />
      <Instances transforms={DESERT.armLinks} shape="cylinder" roughness={0.86} />
      <BirdFlock birds={DESERT.birds} />
    </group>
  );
}