"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
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

type Shape = "box" | "sphere" | "cylinder" | "cone" | "torus";

type CircusParts = {
  carpets: Transform[];
  carpetPatterns: Transform[];
  hoops: Transform[];
  tentWalls: Transform[];
  tentRoofs: Transform[];
  tentPoles: Transform[];
  bodies: Transform[];
  heads: Transform[];
  limbs: Transform[];
  details: Transform[];
};

const REDS = ["#d85e68", "#e87878", "#c94d60", "#ef8b87"];
const BLUES = ["#6ba9c7", "#8bbbd0", "#568fac", "#a5cad9"];
const GOLDS = ["#e6bd58", "#f0d17a", "#d5a846"];
const CREAMS = ["#f8e6d1", "#f5d9c4", "#fff1dc"];
const ANIMAL_COLORS = ["#d8b58a", "#b87958", "#d6c7b2", "#9da8ad", "#c99463"];

/** Keep the streamed building, house, spawn lawn, and main approach clear. */
function isArchitecture(x: number, z: number, margin = 0) {
  return x > -15 - margin && x < 15 + margin && z > -36 - margin && z < 23 + margin;
}

function rotateOffset(x: number, z: number, yaw: number): [number, number] {
  return [x * Math.cos(yaw) + z * Math.sin(yaw), -x * Math.sin(yaw) + z * Math.cos(yaw)];
}

function part(
  x: number,
  z: number,
  yaw: number,
  offset: Vec3,
  scale: Vec3,
  color: string,
  rotation: Vec3 = [0, 0, 0],
): Transform {
  const [dx, dz] = rotateOffset(offset[0], offset[2], yaw);
  return {
    position: [x + dx, offset[1], z + dz],
    rotation: [rotation[0], yaw + rotation[1], rotation[2]],
    scale,
    color,
  };
}

function scatterPoint(random: () => number, minRadius = 19, maxRadius = 104) {
  const angle = random() * Math.PI * 2;
  const radius = minRadius + Math.sqrt(random()) * (maxRadius - minRadius);
  return [Math.cos(angle) * radius, -8 + Math.sin(angle) * radius] as const;
}

function addPerformer(parts: CircusParts, x: number, z: number, yaw: number, size: number, index: number) {
  const costume = index % 3 === 0 ? REDS[index % REDS.length] : BLUES[index % BLUES.length];
  const accent = GOLDS[index % GOLDS.length];
  parts.bodies.push(part(x, z, yaw, [0, 1.25 * size, 0], [0.52 * size, 0.9 * size, 0.38 * size], costume));
  parts.heads.push(part(x, z, yaw, [0, 2.02 * size, 0], [0.38 * size, 0.38 * size, 0.38 * size], "#d9a47f"));

  // Alternating raised arms and wide balancing poses make the crowd read as
  // active acrobats, jugglers, and ringmasters rather than static bystanders.
  const raised = index % 3 !== 1;
  for (const side of [-1, 1]) {
    parts.limbs.push(part(
      x,
      z,
      yaw,
      [side * 0.55 * size, (raised ? 1.75 : 1.25) * size, 0],
      [0.14 * size, 0.72 * size, 0.14 * size],
      costume,
      [0, 0, raised ? side * -0.72 : side * 1.1],
    ));
    parts.limbs.push(part(x, z, yaw, [side * 0.2 * size, 0.5 * size, 0], [0.17 * size, 0.78 * size, 0.17 * size], costume));
  }

  if (index % 3 === 0) {
    parts.details.push(part(x, z, yaw, [0, 2.46 * size, 0], [0.45 * size, 0.18 * size, 0.45 * size], accent));
    parts.details.push(part(x, z, yaw, [0, 2.7 * size, 0], [0.28 * size, 0.45 * size, 0.28 * size], costume));
  } else {
    // Three bright juggling balls above the raised hands.
    for (let ball = 0; ball < 3; ball++) {
      parts.heads.push(part(
        x,
        z,
        yaw,
        [(ball - 1) * 0.5 * size, (2.65 + (ball % 2) * 0.28) * size, 0],
        [0.13 * size, 0.13 * size, 0.13 * size],
        [REDS[ball], GOLDS[ball], BLUES[ball]][index % 3],
      ));
    }
  }
}

function addAnimal(parts: CircusParts, x: number, z: number, yaw: number, size: number, index: number) {
  const kind = index % 3;
  const color = ANIMAL_COLORS[index % ANIMAL_COLORS.length];
  if (kind === 0) {
    // Elephant: broad body, big head, ears, trunk, tusks, and four sturdy legs.
    parts.bodies.push(part(x, z, yaw, [0, 1.25 * size, 0], [1.35 * size, 0.82 * size, 0.72 * size], color));
    parts.heads.push(part(x, z, yaw, [0, 1.45 * size, -1.05 * size], [0.72 * size, 0.7 * size, 0.65 * size], color));
    for (const side of [-1, 1]) {
      parts.details.push(part(x, z, yaw, [side * 0.67 * size, 1.48 * size, -0.93 * size], [0.48 * size, 0.62 * size, 0.12 * size], "#c7a8a4"));
      parts.details.push(part(x, z, yaw, [side * 0.27 * size, 1.18 * size, -1.68 * size], [0.07 * size, 0.52 * size, 0.07 * size], CREAMS[0], [0.32, 0, side * 0.15]));
    }
    parts.limbs.push(part(x, z, yaw, [0, 0.8 * size, -1.63 * size], [0.16 * size, 0.95 * size, 0.16 * size], color, [0.42, 0, 0]));
  } else if (kind === 1) {
    // Horse: long torso and neck with a bright circus saddle blanket.
    parts.bodies.push(part(x, z, yaw, [0, 1.2 * size, 0], [1.3 * size, 0.58 * size, 0.55 * size], color));
    parts.heads.push(part(x, z, yaw, [0, 1.72 * size, -1.05 * size], [0.46 * size, 0.62 * size, 0.4 * size], color));
    parts.limbs.push(part(x, z, yaw, [0, 1.48 * size, -0.74 * size], [0.32 * size, 0.9 * size, 0.32 * size], color, [-0.45, 0, 0]));
    parts.details.push(part(x, z, yaw, [0, 1.7 * size, 0.05 * size], [0.75 * size, 0.14 * size, 0.62 * size], REDS[index % REDS.length]));
    parts.details.push(part(x, z, yaw, [0, 1.82 * size, 0.05 * size], [0.42 * size, 0.16 * size, 0.44 * size], GOLDS[index % GOLDS.length]));
  } else {
    // Lion: compact golden body with a large dark mane and long tail.
    parts.bodies.push(part(x, z, yaw, [0, 0.9 * size, 0], [1.05 * size, 0.52 * size, 0.5 * size], color));
    parts.heads.push(part(x, z, yaw, [0, 1.1 * size, -0.9 * size], [0.68 * size, 0.68 * size, 0.32 * size], "#8e5d3e"));
    parts.heads.push(part(x, z, yaw, [0, 1.12 * size, -1.12 * size], [0.4 * size, 0.4 * size, 0.4 * size], color));
    parts.details.push(part(x, z, yaw, [0, 1.02 * size, 1.28 * size], [0.09 * size, 1.15 * size, 0.09 * size], "#8e5d3e", [Math.PI / 2, 0, 0]));
  }

  // Shared four-leg silhouette.
  for (const side of [-1, 1]) {
    for (const front of [-1, 1]) {
      parts.limbs.push(part(x, z, yaw, [side * 0.48 * size, 0.42 * size, front * 0.66 * size], [0.18 * size, 0.82 * size, 0.18 * size], color));
    }
  }
}

function createCircusLayout(): CircusParts {
  const random = seededRandom(0xc1ac057);
  const parts: CircusParts = {
    carpets: [], carpetPatterns: [], hoops: [], tentWalls: [], tentRoofs: [], tentPoles: [],
    bodies: [], heads: [], limbs: [], details: [],
  };

  for (let attempt = 0; attempt < 800 && parts.carpets.length < 58; attempt++) {
    const [x, z] = scatterPoint(random, 17, 92);
    if (isArchitecture(x, z, 1.5)) continue;
    const yaw = random() * Math.PI * 2;
    const width = 1.4 + random() * 1.8;
    const length = 2 + random() * 2.5;
    parts.carpets.push(part(x, z, yaw, [0, 0.045, 0], [width, 0.07, length], CREAMS[Math.floor(random() * CREAMS.length)]));
    for (let stripe = -1; stripe <= 1; stripe++) {
      parts.carpetPatterns.push(part(x, z, yaw, [stripe * width * 0.24, 0.09, 0], [width * 0.13, 0.025, length * 0.88], stripe === 0 ? GOLDS[1] : REDS[(stripe + 2) % REDS.length]));
    }
  }

  for (let attempt = 0; attempt < 1000 && parts.hoops.length < 82; attempt++) {
    const [x, z] = scatterPoint(random, 18, 105);
    if (isArchitecture(x, z, 2)) continue;
    const size = 0.55 + random() * 0.75;
    const standing = random() > 0.28;
    parts.hoops.push({
      position: [x, standing ? size + 0.08 : 0.09, z],
      rotation: standing ? [0, random() * Math.PI * 2, 0] : [Math.PI / 2, 0, random() * Math.PI],
      scale: [size, size, size],
      color: random() < 0.5 ? REDS[Math.floor(random() * REDS.length)] : GOLDS[Math.floor(random() * GOLDS.length)],
    });
  }

  let animals = 0;
  for (let attempt = 0; attempt < 500 && animals < 30; attempt++) {
    const [x, z] = scatterPoint(random, 23, 100);
    if (isArchitecture(x, z, 4)) continue;
    addAnimal(parts, x, z, random() * Math.PI * 2, 0.65 + random() * 0.4, animals++);
  }

  let performers = 0;
  for (let attempt = 0; attempt < 600 && performers < 44; attempt++) {
    const [x, z] = scatterPoint(random, 18, 96);
    if (isArchitecture(x, z, 2.5)) continue;
    addPerformer(parts, x, z, random() * Math.PI * 2, 0.72 + random() * 0.32, performers++);
  }

  // Large striped tents punctuate the random field and make distant silhouettes
  // immediately read as a circus landscape.
  for (let attempt = 0, tents = 0; attempt < 180 && tents < 11; attempt++) {
    const [x, z] = scatterPoint(random, 37, 102);
    if (isArchitecture(x, z, 8)) continue;
    const size = 2.2 + random() * 1.8;
    const color = tents % 2 ? REDS[tents % REDS.length] : BLUES[tents % BLUES.length];
    parts.tentWalls.push(part(x, z, 0, [0, size * 0.62, 0], [size, size * 1.15, size], CREAMS[tents % CREAMS.length]));
    parts.tentRoofs.push(part(x, z, 0, [0, size * 1.65, 0], [size * 1.18, size * 1.25, size * 1.18], color));
    parts.tentPoles.push(part(x, z, 0, [0, size * 2.5, 0], [0.06, size * 1.8, 0.06], GOLDS[tents % GOLDS.length]));
    tents++;
  }

  return parts;
}

const CIRCUS = createCircusLayout();

function Instances({ transforms, shape }: { transforms: Transform[]; shape: Shape }) {
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
    <instancedMesh ref={ref} args={[undefined, undefined, transforms.length]} castShadow receiveShadow>
      {shape === "box" && <boxGeometry args={[1, 1, 1]} />}
      {shape === "sphere" && <sphereGeometry args={[1, 10, 7]} />}
      {shape === "cylinder" && <cylinderGeometry args={[1, 1, 1, 9]} />}
      {shape === "cone" && <coneGeometry args={[1, 1, 12]} />}
      {shape === "torus" && <torusGeometry args={[1, 0.075, 6, 18]} />}
      <meshStandardMaterial vertexColors roughness={shape === "torus" ? 0.4 : 0.76} metalness={shape === "torus" ? 0.12 : 0} />
    </instancedMesh>
  );
}

/** Dense seeded circus scenery shown exclusively in the Circus color scheme. */
export function CircusLandscape() {
  const isCircus = useThemeStore((state) => state.id === "circus");
  if (!isCircus) return null;

  return (
    <group>
      <Instances transforms={CIRCUS.carpets} shape="box" />
      <Instances transforms={CIRCUS.carpetPatterns} shape="box" />
      <Instances transforms={CIRCUS.hoops} shape="torus" />
      <Instances transforms={CIRCUS.tentWalls} shape="cylinder" />
      <Instances transforms={CIRCUS.tentRoofs} shape="cone" />
      <Instances transforms={CIRCUS.tentPoles} shape="cylinder" />
      <Instances transforms={CIRCUS.bodies} shape="sphere" />
      <Instances transforms={CIRCUS.heads} shape="sphere" />
      <Instances transforms={CIRCUS.limbs} shape="cylinder" />
      <Instances transforms={CIRCUS.details} shape="box" />
    </group>
  );
}