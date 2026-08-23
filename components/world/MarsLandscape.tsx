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

type Ufo = {
  center: Vec3;
  radius: number;
  speed: number;
  phase: number;
  scale: number;
  color: string;
};

type AstronautParts = {
  bodies: Transform[];
  helmets: Transform[];
  visors: Transform[];
  backpacks: Transform[];
  limbs: Transform[];
  boots: Transform[];
};

const ROCK_COLORS = ["#6f2e24", "#843726", "#9d472d", "#b65a35", "#c87345", "#59302b"];
const SUIT_COLORS = ["#f5eee4", "#e6ddd2", "#fff9ef", "#d9e4e5"];
const UFO_COLORS = ["#c6d2d0", "#e5b85c", "#b6c4d2", "#d98966", "#a8c7be"];
const STAR_COLORS = ["#fff7dc", "#ffd7ab", "#ffe8c5", "#dcecff", "#ffc48f"];

/** Keep the streamed building, house, spawn lawn, and main approach clear. */
function isArchitecture(x: number, z: number, margin = 0) {
  return x > -15 - margin && x < 15 + margin && z > -36 - margin && z < 23 + margin;
}

function rotateOffset(x: number, z: number, yaw: number): [number, number] {
  return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
}

function part(
  x: number,
  y: number,
  z: number,
  yaw: number,
  offset: Vec3,
  scale: Vec3,
  color: string,
): Transform {
  const [dx, dz] = rotateOffset(offset[0], offset[2], yaw);
  return {
    position: [x + dx, y + offset[1], z + dz],
    rotation: [0, yaw, 0],
    scale,
    color,
  };
}

function addAstronaut(parts: AstronautParts, x: number, z: number, yaw: number, size: number, color: string) {
  const ground = 0.08;
  parts.bodies.push(part(x, ground, z, yaw, [0, 1.35 * size, 0], [0.72 * size, 1.05 * size, 0.48 * size], color));
  parts.helmets.push(part(x, ground, z, yaw, [0, 2.22 * size, 0], [0.58 * size, 0.58 * size, 0.58 * size], color));
  parts.visors.push(part(x, ground, z, yaw, [0, 2.22 * size, -0.43 * size], [0.43 * size, 0.3 * size, 0.12 * size], "#4b2c2a"));
  parts.backpacks.push(part(x, ground, z, yaw, [0, 1.45 * size, 0.43 * size], [0.58 * size, 0.82 * size, 0.3 * size], "#c7c2bb"));

  for (const side of [-1, 1]) {
    parts.limbs.push(part(x, ground, z, yaw, [side * 0.46 * size, 1.35 * size, 0], [0.2 * size, 0.82 * size, 0.2 * size], color));
    parts.limbs.push(part(x, ground, z, yaw, [side * 0.25 * size, 0.54 * size, 0], [0.24 * size, 0.82 * size, 0.24 * size], color));
    parts.boots.push(part(x, ground, z, yaw, [side * 0.25 * size, 0.16 * size, -0.08 * size], [0.34 * size, 0.22 * size, 0.48 * size], "#bab6b1"));
  }
}

function createMarsLayout() {
  const random = seededRandom(0xa4512076);
  const rocks: Transform[] = [];
  const mounds: Transform[] = [];
  const stars: Transform[] = [];
  const astronauts: AstronautParts = { bodies: [], helmets: [], visors: [], backpacks: [], limbs: [], boots: [] };

  // Hundreds of low-poly stones make the ground read as a rocky planet without
  // adding hundreds of meshes. Area-uniform sampling avoids a crowded centre.
  for (let attempt = 0; attempt < 2600 && rocks.length < 500; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = 16 + Math.sqrt(random()) * 108;
    const x = Math.cos(angle) * radius;
    const z = -8 + Math.sin(angle) * radius;
    if (isArchitecture(x, z, 0.8)) continue;
    const size = 0.12 + Math.pow(random(), 2.4) * 2.6;
    rocks.push({
      position: [x, size * 0.3, z],
      rotation: [random() * 0.6, random() * Math.PI * 2, random() * 0.45],
      scale: [size * (0.7 + random() * 0.9), size * (0.4 + random() * 0.5), size],
      color: ROCK_COLORS[Math.floor(random() * ROCK_COLORS.length)],
    });
  }

  // Broad half-buried forms break up the perfectly flat game plane like eroded
  // ridges and crater rims. They remain outside all playable architecture.
  for (let index = 0; index < 48; index++) {
    const angle = (index / 48) * Math.PI * 2 + (random() - 0.5) * 0.22;
    const radius = 34 + random() * 92;
    const width = 3.5 + random() * 8;
    mounds.push({
      position: [Math.cos(angle) * radius, -0.72, -8 + Math.sin(angle) * radius],
      rotation: [0, random() * Math.PI, 0],
      scale: [width, 1.1 + random() * 1.8, width * (0.35 + random() * 0.45)],
      color: ROCK_COLORS[1 + Math.floor(random() * (ROCK_COLORS.length - 1))],
    });
  }

  for (let attempt = 0; attempt < 500 && astronauts.bodies.length < 18; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = 22 + Math.sqrt(random()) * 67;
    const x = Math.cos(angle) * radius;
    const z = -8 + Math.sin(angle) * radius;
    if (isArchitecture(x, z, 3)) continue;
    const yaw = Math.atan2(-x, -8 - z) + (random() - 0.5) * 1.2;
    addAstronaut(
      astronauts,
      x,
      z,
      yaw,
      0.72 + random() * 0.35,
      SUIT_COLORS[Math.floor(random() * SUIT_COLORS.length)],
    );
  }

  // Unlit stars sit inside the atmosphere dome. A broad upper hemisphere makes
  // them surround the player instead of looking like a single flat backdrop.
  for (let index = 0; index < 520; index++) {
    const angle = random() * Math.PI * 2;
    const radius = 115 + random() * 32;
    const elevation = 0.08 + Math.pow(random(), 0.72) * 0.84;
    const horizontal = Math.cos(elevation) * radius;
    const size = 0.07 + Math.pow(random(), 3) * 0.24;
    stars.push({
      position: [Math.cos(angle) * horizontal, Math.sin(elevation) * radius, -8 + Math.sin(angle) * horizontal],
      rotation: [0, 0, 0],
      scale: [size, size, size],
      color: STAR_COLORS[Math.floor(random() * STAR_COLORS.length)],
    });
  }

  const ufos: Ufo[] = Array.from({ length: 10 }, (_, index) => ({
    center: [(random() - 0.5) * 55, 18 + random() * 25, -18 + (random() - 0.5) * 65],
    radius: 5 + random() * 14,
    speed: 0.035 + random() * 0.045,
    phase: (index / 10) * Math.PI * 2 + random(),
    scale: 0.7 + random() * 0.65,
    color: UFO_COLORS[index % UFO_COLORS.length],
  }));

  return { rocks, mounds, stars, astronauts, ufos };
}

const MARS = createMarsLayout();

function Instances({
  transforms,
  shape,
  emissive = false,
}: {
  transforms: Transform[];
  shape: "rock" | "mound" | "box" | "sphere" | "star";
  emissive?: boolean;
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
      castShadow={!emissive && shape !== "mound"}
      receiveShadow={!emissive}
      frustumCulled={shape !== "star"}
    >
      {shape === "rock" && <dodecahedronGeometry args={[1, 0]} />}
      {shape === "mound" && <sphereGeometry args={[1, 12, 6]} />}
      {shape === "box" && <boxGeometry args={[1, 1, 1]} />}
      {shape === "sphere" && <sphereGeometry args={[1, 10, 7]} />}
      {shape === "star" && <sphereGeometry args={[1, 5, 4]} />}
      {emissive ? (
        <meshBasicMaterial vertexColors toneMapped={false} fog={false} />
      ) : (
        <meshStandardMaterial vertexColors roughness={0.82} metalness={0.03} />
      )}
    </instancedMesh>
  );
}

function UfoFleet({ ufos }: { ufos: Ufo[] }) {
  const hulls = useRef<THREE.InstancedMesh>(null);
  const domes = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);

  useLayoutEffect(() => {
    ufos.forEach((ufo, index) => {
      hulls.current?.setColorAt(index, color.set(ufo.color));
      domes.current?.setColorAt(index, color.set(index % 2 ? "#79d9d2" : "#e6c4ff"));
      rings.current?.setColorAt(index, color.set("#594a50"));
      for (let light = 0; light < 6; light++) {
        lights.current?.setColorAt(index * 6 + light, color.set(light % 2 ? "#ffb85c" : "#7cf4e8"));
      }
    });
    for (const mesh of [hulls.current, domes.current, rings.current, lights.current]) {
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [color, ufos]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    ufos.forEach((ufo, index) => {
      const angle = ufo.phase + time * ufo.speed;
      const x = ufo.center[0] + Math.cos(angle) * ufo.radius;
      const y = ufo.center[1] + Math.sin(time * 0.5 + ufo.phase) * 1.3;
      const z = ufo.center[2] + Math.sin(angle) * ufo.radius;
      const yaw = -angle + Math.PI / 2;

      dummy.position.set(x, y, z);
      dummy.rotation.set(0.08 * Math.sin(time + ufo.phase), yaw, 0.06 * Math.cos(time * 0.8 + ufo.phase));
      dummy.scale.set(3.2 * ufo.scale, 0.42 * ufo.scale, 3.2 * ufo.scale);
      dummy.updateMatrix();
      hulls.current?.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, y + 0.42 * ufo.scale, z);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1.25 * ufo.scale, 0.7 * ufo.scale, 1.25 * ufo.scale);
      dummy.updateMatrix();
      domes.current?.setMatrixAt(index, dummy.matrix);

      dummy.position.set(x, y - 0.05 * ufo.scale, z);
      dummy.rotation.set(Math.PI / 2, yaw, 0);
      dummy.scale.setScalar(ufo.scale);
      dummy.updateMatrix();
      rings.current?.setMatrixAt(index, dummy.matrix);

      for (let light = 0; light < 6; light++) {
        const lightAngle = yaw + (light / 6) * Math.PI * 2;
        dummy.position.set(
          x + Math.cos(lightAngle) * 2.35 * ufo.scale,
          y - 0.28 * ufo.scale,
          z + Math.sin(lightAngle) * 2.35 * ufo.scale,
        );
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar((0.13 + Math.sin(time * 4 + light) * 0.025) * ufo.scale);
        dummy.updateMatrix();
        lights.current?.setMatrixAt(index * 6 + light, dummy.matrix);
      }
    });
    for (const mesh of [hulls.current, domes.current, rings.current, lights.current]) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={hulls} args={[undefined, undefined, ufos.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 8]} />
        <meshStandardMaterial vertexColors roughness={0.28} metalness={0.7} />
      </instancedMesh>
      <instancedMesh ref={domes} args={[undefined, undefined, ufos.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial vertexColors roughness={0.18} metalness={0.25} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, ufos.length]} frustumCulled={false}>
        <torusGeometry args={[2.25, 0.12, 6, 18]} />
        <meshStandardMaterial vertexColors roughness={0.3} metalness={0.8} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, ufos.length * 6]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial vertexColors toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Moon() {
  const craters = useMemo(() => {
    const random = seededRandom(0xc4a7e2);
    return Array.from({ length: 14 }, () => {
      const theta = random() * Math.PI * 2;
      const phi = 0.35 + random() * 1.9;
      const radius = 11.85;
      return {
        position: [Math.sin(phi) * Math.cos(theta) * radius, Math.cos(phi) * radius, Math.sin(phi) * Math.sin(theta) * radius] as Vec3,
        scale: 0.45 + random() * 1.15,
      };
    });
  }, []);

  return (
    <group position={[-82, 67, -112]} rotation={[0.2, 0, -0.15]}>
      <mesh>
        <sphereGeometry args={[12, 28, 18]} />
        <meshBasicMaterial color="#e6c6aa" fog={false} />
      </mesh>
      {craters.map((crater, index) => (
        <mesh key={index} position={crater.position} scale={crater.scale}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color={index % 3 ? "#ad806f" : "#c5957d"} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Dense seeded space scenery shown exclusively in the Mars color scheme. */
export function MarsLandscape() {
  const isMars = useThemeStore((state) => state.id === "mars");
  if (!isMars) return null;

  return (
    <group>
      <Instances transforms={MARS.mounds} shape="mound" />
      <Instances transforms={MARS.rocks} shape="rock" />
      <Instances transforms={MARS.astronauts.backpacks} shape="box" />
      <Instances transforms={MARS.astronauts.bodies} shape="box" />
      <Instances transforms={MARS.astronauts.limbs} shape="box" />
      <Instances transforms={MARS.astronauts.boots} shape="box" />
      <Instances transforms={MARS.astronauts.helmets} shape="sphere" />
      <Instances transforms={MARS.astronauts.visors} shape="sphere" />
      <Instances transforms={MARS.stars} shape="star" emissive />
      <UfoFleet ufos={MARS.ufos} />
      <Moon />
    </group>
  );
}