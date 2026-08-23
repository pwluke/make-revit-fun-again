"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useThemeStore } from "./themeStore";

type Vec3 = [number, number, number];

type ReefSpot = {
  position: Vec3;
  color: string;
  accent: string;
  kelpColor: string;
  kelpHeight: number;
  scale: number;
  rotation: number;
};

type FishSchoolData = {
  center: Vec3;
  color: string;
  count: number;
  radius: number;
  phase: number;
};

const CORAL_COLORS = ["#ff7895", "#ff9f68", "#c28cff", "#ef6f88", "#f4c95d"];
const FISH_COLORS = ["#63d9ef", "#ffd66b", "#ff8eb5", "#7ce0bb", "#ff9568"];
const KELP_COLORS = ["#238f8c", "#43b88c", "#528bb5", "#8f72bd", "#c59b42"];

/** Mulberry32 keeps the world varied while producing the same layout every load. */
function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createMarineLayout() {
  const random = seededRandom(0xc0a1);
  const reefs: ReefSpot[] = [];

  // Three irregular reef bands densely fill the visible world while the
  // innermost radius keeps the house footprint and circulation paths open.
  for (let band = 0; band < 3; band++) {
    for (let index = 0; index < 10; index++) {
      const angle = (index / 10) * Math.PI * 2 + band * 0.21 + (random() - 0.5) * 0.36;
      const minRadius = 15 + band * 15;
      const radius = minRadius + random() * 13;
      reefs.push({
        position: [Math.cos(angle) * radius, 0.12, -22 + Math.sin(angle) * radius],
        color: CORAL_COLORS[Math.floor(random() * CORAL_COLORS.length)],
        accent: CORAL_COLORS[Math.floor(random() * CORAL_COLORS.length)],
        kelpColor: KELP_COLORS[Math.floor(random() * KELP_COLORS.length)],
        kelpHeight: 1.4 + random() * 2.4,
        scale: 0.72 + random() * 0.72,
        rotation: random() * Math.PI * 2,
      });
    }
  }

  const schools: FishSchoolData[] = [1, 4, 7, 10, 13, 17, 21, 25, 28].map((reefIndex, index) => ({
    center: [reefs[reefIndex].position[0], 2.1 + random() * 4.8, reefs[reefIndex].position[2]],
    color: FISH_COLORS[Math.floor(random() * FISH_COLORS.length)],
    count: 5 + Math.floor(random() * 5),
    radius: 2.5 + random() * 2.3,
    phase: index * 1.73 + random(),
  }));

  return { reefs, schools };
}

const MARINE_LAYOUT = createMarineLayout();

function Coral({ position, color, scale }: { position: Vec3; color: string; scale: number }) {
  const branches = [
    { position: [0, 0.65, 0] as Vec3, scale: [0.23, 1.3, 0.23] as Vec3, rotation: 0 },
    { position: [-0.35, 0.62, 0] as Vec3, scale: [0.18, 0.82, 0.18] as Vec3, rotation: 0.58 },
    { position: [0.34, 0.78, 0.04] as Vec3, scale: [0.17, 1.02, 0.17] as Vec3, rotation: -0.52 },
    { position: [-0.52, 1.05, 0] as Vec3, scale: [0.14, 0.55, 0.14] as Vec3, rotation: -0.44 },
    { position: [0.5, 1.22, 0.04] as Vec3, scale: [0.13, 0.5, 0.13] as Vec3, rotation: 0.46 },
  ];

  return (
    <group position={position} scale={scale}>
      <mesh receiveShadow position-y={0.08} scale={[0.9, 0.16, 0.7]}>
        <sphereGeometry args={[0.75, 12, 8]} />
        <meshStandardMaterial color="#d9c7a4" roughness={0.95} />
      </mesh>
      {branches.map((branch, index) => (
        <mesh
          key={index}
          castShadow
          position={branch.position}
          rotation-z={branch.rotation}
          scale={branch.scale}
        >
          <cylinderGeometry args={[0.72, 1, 1, 7]} />
          <meshStandardMaterial color={color} roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function ReefPatch({ position, color, accent, kelpColor, kelpHeight, scale, rotation }: ReefSpot) {
  return (
    <group position={position} rotation-y={rotation} scale={scale}>
      <Coral position={[0, 0, 0]} color={color} scale={0.9} />
      <Coral position={[1.05, 0, -0.5]} color={accent} scale={0.48} />
      <Coral position={[-0.9, 0, -0.65]} color={accent} scale={0.36} />
      {([-1.1, -0.55, 0.8] as const).map((x, index) => (
        <mesh
          key={x}
          receiveShadow
          position={[x, 0.16 + index * 0.04, 0.5 - index * 0.35]}
          scale={[0.42 + index * 0.09, 0.22 + index * 0.04, 0.36]}
        >
          <dodecahedronGeometry args={[1, 0]} />
          <meshStandardMaterial color={index === 1 ? "#7aa9a8" : "#86b8b2"} roughness={0.96} />
        </mesh>
      ))}
      {([-1.15, -0.85, -0.45, -0.1, 0.35, 0.72, 1.08] as const).map((x, index) => (
        <mesh
          key={x}
          castShadow
          position={[x, (kelpHeight * (0.62 + (index % 3) * 0.18)) / 2, 0.62 + (index % 2) * 0.28]}
          rotation-z={(index - 3) * 0.055}
          scale={[0.045 + (index % 2) * 0.012, kelpHeight * (0.62 + (index % 3) * 0.18), 0.045]}
        >
          <cylinderGeometry args={[0.45, 1, 1, 6]} />
          <meshStandardMaterial color={kelpColor} roughness={0.76} />
        </mesh>
      ))}
    </group>
  );
}

function Fish({ color, scale = 1 }: { color: string; scale?: number }) {
  return (
    <group scale={scale}>
      <mesh castShadow scale={[0.48, 0.25, 0.2]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color={color} roughness={0.45} />
      </mesh>
      <mesh castShadow position-x={-0.57} rotation-z={-Math.PI / 2} scale={[0.22, 0.3, 0.09]}>
        <coneGeometry args={[1, 1, 3]} />
        <meshStandardMaterial color={color} roughness={0.5} />
      </mesh>
      <mesh position={[0.34, 0.08, 0.18]}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshBasicMaterial color="#17233e" />
      </mesh>
      <mesh position={[0.34, 0.08, -0.18]}>
        <sphereGeometry args={[0.035, 8, 6]} />
        <meshBasicMaterial color="#17233e" />
      </mesh>
    </group>
  );
}

function FishSchool({ center, color, count, radius, phase }: FishSchoolData) {
  const refs = useRef<(THREE.Group | null)[]>([]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    refs.current.forEach((fish, index) => {
      if (!fish) return;
      const lane = index - (count - 1) / 2;
      const angle = t * (0.28 + index * 0.012) + index * 0.72 + phase;
      fish.position.set(
        center[0] + Math.cos(angle) * (radius + lane * 0.12),
        center[1] + lane * 0.24 + Math.sin(t * 1.35 + index) * 0.18,
        center[2] + Math.sin(angle) * (radius * 0.55),
      );
      fish.rotation.y = -angle;
      fish.rotation.z = Math.sin(t * 1.7 + index) * 0.06;
    });
  });

  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <group
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
        >
          <Fish color={color} scale={0.65 + (index % 3) * 0.08} />
        </group>
      ))}
    </>
  );
}

function Turtle({ center, phase = 0, scale = 0.8 }: { center: Vec3; phase?: number; scale?: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime + phase;
    ref.current.position.set(
      center[0] + Math.sin(t * 0.24) * 2.4,
      center[1] + Math.sin(t * 0.8) * 0.18,
      center[2] + Math.cos(t * 0.24) * 1.2,
    );
    ref.current.rotation.y = Math.cos(t * 0.24) > 0 ? 0 : Math.PI;
    ref.current.rotation.z = Math.sin(t * 0.8) * 0.04;
  });

  return (
    <group ref={ref} scale={scale}>
      <mesh castShadow scale={[0.85, 0.3, 0.65]}>
        <sphereGeometry args={[1, 16, 10]} />
        <meshStandardMaterial color="#4fa889" roughness={0.75} />
      </mesh>
      <mesh castShadow position-x={0.92} scale={[0.38, 0.28, 0.3]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#83c89f" roughness={0.8} />
      </mesh>
      {([[0.35, 0, 0.68], [0.35, 0, -0.68], [-0.45, 0, 0.62], [-0.45, 0, -0.62]] as Vec3[]).map(
        (position, index) => (
          <mesh key={index} castShadow position={position} rotation-y={index % 2 ? -0.35 : 0.35} scale={[0.5, 0.08, 0.22]}>
            <sphereGeometry args={[1, 10, 6]} />
            <meshStandardMaterial color="#74bf98" roughness={0.8} />
          </mesh>
        ),
      )}
    </group>
  );
}

function MantaRay({ center, phase = 0, scale = 0.9 }: { center: Vec3; phase?: number; scale?: number }) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * 0.16 + phase;
    ref.current.position.set(
      center[0] + Math.cos(t) * 4.5,
      center[1] + Math.sin(t * 2.2) * 0.35,
      center[2] + Math.sin(t) * 2.4,
    );
    ref.current.rotation.y = -t;
    ref.current.rotation.z = Math.sin(t * 2.2) * 0.05;
  });

  return (
    <group ref={ref} scale={scale}>
      <mesh castShadow rotation-z={Math.PI / 4} scale={[0.9, 0.13, 0.9]}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#315f83" roughness={0.48} />
      </mesh>
      <mesh castShadow position-x={-1.15} rotation-z={-Math.PI / 2} scale={[0.12, 1.1, 0.12]}>
        <coneGeometry args={[1, 1, 8]} />
        <meshStandardMaterial color="#315f83" roughness={0.5} />
      </mesh>
      <mesh position={[0.48, 0.05, 0.24]} scale={[0.06, 0.035, 0.035]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#10263a" />
      </mesh>
      <mesh position={[0.48, 0.05, -0.24]} scale={[0.06, 0.035, 0.035]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color="#10263a" />
      </mesh>
    </group>
  );
}

function Crab({ position }: { position: Vec3 }) {
  return (
    <group position={position} scale={0.72}>
      <mesh castShadow position-y={0.28} scale={[0.65, 0.25, 0.45]}>
        <sphereGeometry args={[1, 12, 8]} />
        <meshStandardMaterial color="#ef665d" roughness={0.7} />
      </mesh>
      {([-1, 1] as const).flatMap((side) =>
        [-0.28, 0, 0.28].map((z, index) => (
          <mesh key={`${side}-${index}`} castShadow position={[side * 0.65, 0.18, z]} rotation-z={side * 0.85} scale={[0.08, 0.5, 0.08]}>
            <cylinderGeometry args={[1, 1, 1, 6]} />
            <meshStandardMaterial color="#ef665d" roughness={0.75} />
          </mesh>
        )),
      )}
      {([-1, 1] as const).map((side) => (
        <mesh key={side} castShadow position={[side * 0.92, 0.55, 0]} rotation-z={side * -0.5} scale={[0.22, 0.28, 0.16]}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshStandardMaterial color="#ff806f" roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Jellyfish({ position, phase = 0, color = "#b991ff" }: { position: Vec3; phase?: number; color?: string }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime + phase;
    ref.current.position.y = position[1] + Math.sin(t * 0.9) * 0.35;
    ref.current.rotation.y = t * 0.18;
  });

  return (
    <group ref={ref} position={position} scale={0.72}>
      <mesh scale={[0.8, 0.55, 0.8]}>
        <sphereGeometry args={[1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} transparent opacity={0.78} roughness={0.25} side={THREE.DoubleSide} />
      </mesh>
      {([-0.45, -0.15, 0.15, 0.45] as const).map((x, index) => (
        <mesh key={x} position={[x, -0.72 - (index % 2) * 0.18, 0]} scale={[0.045, 0.75, 0.045]}>
          <cylinderGeometry args={[1, 1, 1, 6]} />
          <meshStandardMaterial color="#d7c1ff" emissive="#7656a8" emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

function Starfish({ position, color }: { position: Vec3; color: string }) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? 0.55 : 0.22;
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 1 });
  }, []);

  return (
    <mesh geometry={geometry} position={position} rotation={[-Math.PI / 2, 0, 0.35]} castShadow>
      <meshStandardMaterial color={color} roughness={0.8} />
    </mesh>
  );
}

/** A dense, seeded reef world shown only in the Coral world theme. */
export function MarineGarden() {
  const isCoralTheme = useThemeStore((state) => state.id === "aquatic");

  if (!isCoralTheme) return null;

  const { reefs, schools } = MARINE_LAYOUT;

  return (
    <group>
      {reefs.map((reef, index) => <ReefPatch key={index} {...reef} />)}
      {schools.map((school, index) => <FishSchool key={index} {...school} />)}
      {[3, 14, 23].map((reefIndex, index) => (
        <Turtle
          key={reefIndex}
          center={[reefs[reefIndex].position[0], 1.6 + index * 0.65, reefs[reefIndex].position[2]]}
          phase={index * 3.7}
          scale={0.72 + index * 0.08}
        />
      ))}
      {[7, 19, 27].map((reefIndex, index) => (
        <MantaRay
          key={reefIndex}
          center={[reefs[reefIndex].position[0], 4.2 + index * 0.85, reefs[reefIndex].position[2]]}
          phase={index * 2.25}
          scale={0.78 + index * 0.1}
        />
      ))}
      {[0, 5, 8, 12, 16, 20, 24, 29].map((reefIndex, index) => (
        <Crab
          key={reefIndex}
          position={[
            reefs[reefIndex].position[0] + (index % 2 ? -1.35 : 1.35),
            0.08,
            reefs[reefIndex].position[2] + (index % 3 - 1) * 0.7,
          ]}
        />
      ))}
      {[2, 6, 11, 15, 18, 22, 26].map((reefIndex, index) => (
        <Jellyfish
          key={reefIndex}
          position={[reefs[reefIndex].position[0], 3.4 + (index % 3) * 1.2, reefs[reefIndex].position[2]]}
          phase={index * 1.45}
          color={index % 2 ? "#ff9fc8" : "#b991ff"}
        />
      ))}
      {[4, 9, 13, 17, 21, 25, 28].map((reefIndex, index) => (
        <Starfish
          key={reefIndex}
          position={[
            reefs[reefIndex].position[0] + (index % 2 ? -0.9 : 1.1),
            0.12,
            reefs[reefIndex].position[2] + (index % 3 - 1) * 0.8,
          ]}
          color={index % 2 ? "#ffd06a" : "#ff8b68"}
        />
      ))}
    </group>
  );
}