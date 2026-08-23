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

type Butterfly = {
  center: Vec3;
  color: string;
  radius: number;
  speed: number;
  phase: number;
  scale: number;
};

const BARK_COLORS = ["#5b4639", "#66503d", "#473b35", "#735640"];
const LEAF_COLORS = ["#2d6a5a", "#3e806a", "#559879", "#72ad89", "#386b63"];
const MOSS_COLORS = ["#315f4c", "#42765a", "#578865", "#6b9c72", "#789f68"];
const MUSHROOM_COLORS = ["#ff7895", "#ffad5c", "#b889e8", "#65c7bd", "#f1cf63", "#df6fbc"];
const FAIRY_COLORS = ["#fff2a8", "#ffd1e6", "#b7f4e5", "#d7c5ff", "#ffd49b"];
const BUTTERFLY_COLORS = ["#ff85b5", "#70d9cf", "#f4ca58", "#b68ce6", "#ff956f", "#82b7ef"];

/** Keep architecture, the spawn lawn, and the main approach freely walkable. */
function isArchitecture(x: number, z: number, margin = 0) {
  return x > -15 - margin && x < 15 + margin && z > -36 - margin && z < 23 + margin;
}

function createForestLayout() {
  const random = seededRandom(0xfae171);
  const trunks: Transform[] = [];
  const canopies: Transform[] = [];
  const moss: Transform[] = [];
  const mushroomStems: Transform[] = [];
  const mushroomCaps: Transform[] = [];
  const fairyLights: Transform[] = [];

  for (let attempt = 0; attempt < 1000 && trunks.length < 78; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = 21 + Math.sqrt(random()) * 72;
    const x = Math.cos(angle) * radius;
    const z = -8 + Math.sin(angle) * radius;
    if (isArchitecture(x, z, 3)) continue;

    const height = 4.5 + random() * 7;
    const width = 0.42 + random() * 0.45;
    const yaw = random() * Math.PI * 2;
    trunks.push({
      position: [x, height / 2, z],
      rotation: [0, yaw, (random() - 0.5) * 0.1],
      scale: [width, height, width],
      color: BARK_COLORS[Math.floor(random() * BARK_COLORS.length)],
    });

    const crownColor = LEAF_COLORS[Math.floor(random() * LEAF_COLORS.length)];
    const crownSize = 2.3 + random() * 2.5;
    const crownCount = 3 + Math.floor(random() * 3);
    for (let crown = 0; crown < crownCount; crown++) {
      const crownAngle = yaw + (crown / crownCount) * Math.PI * 2;
      const spread = crown === 0 ? 0 : crownSize * (0.28 + random() * 0.2);
      const size = crownSize * (0.62 + random() * 0.38);
      canopies.push({
        position: [
          x + Math.cos(crownAngle) * spread,
          height - 0.4 + (random() - 0.35) * crownSize * 0.45,
          z + Math.sin(crownAngle) * spread,
        ],
        rotation: [random() * 0.25, yaw, random() * 0.2],
        scale: [size, size * (0.72 + random() * 0.3), size],
        color: crown === 0 ? crownColor : LEAF_COLORS[Math.floor(random() * LEAF_COLORS.length)],
      });
    }

    // Hanging lights cluster around tree crowns, like fireflies caught in the
    // branches. They are emissive meshes rather than dozens of expensive lights.
    const lightCount = 1 + Math.floor(random() * 3);
    for (let light = 0; light < lightCount; light++) {
      const lightAngle = random() * Math.PI * 2;
      const spread = 1 + random() * crownSize;
      fairyLights.push({
        position: [
          x + Math.cos(lightAngle) * spread,
          height - 1 + random() * crownSize * 1.3,
          z + Math.sin(lightAngle) * spread,
        ],
        rotation: [0, 0, 0],
        scale: [0.1 + random() * 0.1, 0.1 + random() * 0.1, 0.1 + random() * 0.1],
        color: FAIRY_COLORS[Math.floor(random() * FAIRY_COLORS.length)],
      });
    }
  }

  for (let attempt = 0; attempt < 1800 && moss.length < 230; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = 16 + Math.sqrt(random()) * 84;
    const x = Math.cos(angle) * radius;
    const z = -8 + Math.sin(angle) * radius;
    if (isArchitecture(x, z, 0.5)) continue;
    const size = 0.7 + random() * 2.5;
    moss.push({
      position: [x, 0.025, z],
      rotation: [-Math.PI / 2, 0, random() * Math.PI],
      scale: [size * (0.7 + random() * 0.7), size, 1],
      color: MOSS_COLORS[Math.floor(random() * MOSS_COLORS.length)],
    });
  }

  for (let attempt = 0; attempt < 1500 && mushroomCaps.length < 190; attempt++) {
    const angle = random() * Math.PI * 2;
    const radius = 18 + Math.sqrt(random()) * 78;
    const x = Math.cos(angle) * radius;
    const z = -8 + Math.sin(angle) * radius;
    if (isArchitecture(x, z, 1.5)) continue;
    const size = 0.18 + Math.pow(random(), 1.7) * 0.65;
    const height = size * (1.2 + random() * 1.5);
    mushroomStems.push({
      position: [x, height / 2, z],
      rotation: [0, random() * Math.PI, 0],
      scale: [size * 0.28, height, size * 0.28],
      color: "#f4e9cf",
    });
    mushroomCaps.push({
      position: [x, height, z],
      rotation: [0, random() * Math.PI, 0],
      scale: [size, size * 0.42, size],
      color: MUSHROOM_COLORS[Math.floor(random() * MUSHROOM_COLORS.length)],
    });
  }

  const butterflies: Butterfly[] = Array.from({ length: 30 }, (_, index) => ({
    center: [(random() - 0.5) * 68, 1.2 + random() * 4, -10 + (random() - 0.5) * 72],
    color: BUTTERFLY_COLORS[index % BUTTERFLY_COLORS.length],
    radius: 1.2 + random() * 3.2,
    speed: 0.25 + random() * 0.4,
    phase: random() * Math.PI * 2,
    scale: 0.18 + random() * 0.18,
  }));

  return {
    trunks,
    canopies,
    moss,
    mushroomStems,
    mushroomCaps,
    fairyLights,
    butterflies,
  };
}

const FOREST = createForestLayout();

function Instances({
  transforms,
  shape,
  emissive = false,
}: {
  transforms: Transform[];
  shape: "trunk" | "canopy" | "moss" | "stem" | "cap" | "light";
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
      castShadow={shape === "trunk" || shape === "canopy"}
      receiveShadow={!emissive}
    >
      {(shape === "trunk" || shape === "stem") && <cylinderGeometry args={[1, 1, 1, 7]} />}
      {shape === "canopy" && <icosahedronGeometry args={[1, 1]} />}
      {shape === "moss" && <circleGeometry args={[1, 10]} />}
      {shape === "cap" && <sphereGeometry args={[1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />}
      {shape === "light" && <sphereGeometry args={[1, 7, 5]} />}
      {emissive ? (
        <meshBasicMaterial vertexColors toneMapped={false} />
      ) : (
        <meshStandardMaterial vertexColors roughness={shape === "cap" ? 0.55 : 0.92} metalness={0} />
      )}
    </instancedMesh>
  );
}

function Butterflies({ butterflies }: { butterflies: Butterfly[] }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const color = useMemo(() => new THREE.Color(), []);
  const wing = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([0, 0, 0, 1, 0.12, 0, 0.45, 0, -0.55], 3),
    );
    geometry.computeVertexNormals();
    return geometry;
  }, []);

  useLayoutEffect(() => () => wing.dispose(), [wing]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    butterflies.forEach((butterfly, index) => {
      color.set(butterfly.color);
      mesh.setColorAt(index * 2, color);
      mesh.setColorAt(index * 2 + 1, color);
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [butterflies, color]);

  useFrame(({ clock }) => {
    const mesh = ref.current;
    if (!mesh) return;
    const time = clock.elapsedTime;
    butterflies.forEach((butterfly, index) => {
      const angle = butterfly.phase + time * butterfly.speed;
      const x = butterfly.center[0] + Math.cos(angle) * butterfly.radius;
      const z = butterfly.center[2] + Math.sin(angle * 1.3) * butterfly.radius;
      const y = butterfly.center[1] + Math.sin(time * 1.7 + butterfly.phase) * 0.65;
      const flap = Math.sin(time * 8 + butterfly.phase * 4) * 0.65;
      for (let side = 0; side < 2; side++) {
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, -angle, side === 0 ? flap : -flap);
        dummy.scale.set(
          side === 0 ? butterfly.scale : -butterfly.scale,
          butterfly.scale,
          butterfly.scale,
        );
        dummy.updateMatrix();
        mesh.setMatrixAt(index * 2 + side, dummy.matrix);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={ref}
      args={[wing, undefined, butterflies.length * 2]}
      frustumCulled={false}
    >
      <meshStandardMaterial vertexColors roughness={0.65} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

/** A dense seeded garden shown exclusively in the Enchanted theme. */
export function EnchantedForest() {
  const isEnchanted = useThemeStore((state) => state.id === "forest");
  if (!isEnchanted) return null;

  return (
    <group>
      <Instances transforms={FOREST.moss} shape="moss" />
      <Instances transforms={FOREST.trunks} shape="trunk" />
      <Instances transforms={FOREST.canopies} shape="canopy" />
      <Instances transforms={FOREST.mushroomStems} shape="stem" />
      <Instances transforms={FOREST.mushroomCaps} shape="cap" />
      <Instances transforms={FOREST.fairyLights} shape="light" emissive />
      <Butterflies butterflies={FOREST.butterflies} />
    </group>
  );
}