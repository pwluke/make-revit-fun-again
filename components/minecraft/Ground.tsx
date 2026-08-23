import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import {
  CuboidCollider,
  RigidBody,
  type RigidBodyProps,
} from "@react-three/rapier";
import { useSceneTheme } from "../world/themeStore";

// Served from `public/grass.jpg` — see the note in Axe.tsx.
const grassImg = "/grass.jpg";

export function Ground(props: RigidBodyProps) {
  const theme = useSceneTheme();
  const texture = useTexture(grassImg);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(240, 240);
  return (
    <RigidBody {...props} type="fixed" colliders={false}>
      <mesh receiveShadow position={[0, 0, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1000, 1000]} />
        <meshStandardMaterial
          map={theme.groundTexture ? texture : null}
          color={theme.ground}
          roughness={theme.groundRoughness}
          metalness={theme.groundMetalness}
        />
      </mesh>
      <CuboidCollider args={[1000, 2, 1000]} position={[0, -2, 0]} />
    </RigidBody>
  );
}
