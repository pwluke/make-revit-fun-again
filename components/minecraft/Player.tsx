import * as THREE from "three";
import * as RAPIER from "@dimforge/rapier3d-compat";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import Axe from "./Axe";

type Controls = "forward" | "backward" | "left" | "right" | "jump";

type PlayerProps = {
  lerp?: typeof THREE.MathUtils.lerp;
};

const SPEED = 5;
const direction = new THREE.Vector3();
const frontVector = new THREE.Vector3();
const sideVector = new THREE.Vector3();
const rotation = new THREE.Vector3();

export function Player({ lerp = THREE.MathUtils.lerp }: PlayerProps) {
  const axe = useRef<THREE.Group>(null!);
  const ref = useRef<RapierRigidBody>(null!);
  const rapier = useRapier();
  const [, get] = useKeyboardControls<Controls>();
  useFrame((state) => {
    // Both refs are declared `null!`, which lies to TypeScript — they are genuinely
    // null until rapier's WASM finishes initialising and the RigidBody mounts, and
    // useFrame starts running before that. Skipping those first frames is not
    // cosmetic: R3F's rAF callback has no try/catch and reschedules itself at the
    // END of the loop, so ONE throw here permanently kills the render loop. The
    // symptom is a scene frozen on its first frame with a visible cursor and no
    // camera rotation, which reads as "pointer lock is broken" and sends you
    // looking in entirely the wrong place.
    if (!ref.current || !axe.current) return;

    const { forward, backward, left, right, jump } = get();
    const velocity = ref.current.linvel();
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    // update camera
    state.camera.position.copy(ref.current.translation());
    // update axe
    axe.current.children[0].rotation.x = lerp(
      axe.current.children[0].rotation.x,
      Math.sin(+(speed > 1) * state.clock.elapsedTime * 10) / 6,
      0.1,
    );
    axe.current.rotation.copy(state.camera.rotation);
    axe.current.position
      .copy(state.camera.position)
      .add(state.camera.getWorldDirection(rotation).multiplyScalar(1));
    // movement
    frontVector.set(0, 0, +backward - +forward);
    sideVector.set(+left - +right, 0, 0);
    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(SPEED)
      .applyEuler(state.camera.rotation);
    ref.current.setLinvel(
      { x: direction.x, y: velocity.y, z: direction.z },
      true,
    );
    // jumping
    const world = rapier.world;
    const ray = world.castRay(
      new RAPIER.Ray(ref.current.translation(), { x: 0, y: -1, z: 0 }),
      10,
      true,
      undefined,
      undefined,
      undefined,
      ref.current,
    );
    const grounded = ray && ray.collider && Math.abs(ray.timeOfImpact) <= 1.75;
    if (jump && grounded) ref.current.setLinvel({ x: 0, y: 7.5, z: 0 }, true);
  });
  return (
    <>
      <RigidBody
        ref={ref}
        colliders={false}
        mass={1}
        type="dynamic"
        position={[0, 10, 0]}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider args={[0.75, 0.5]} />
      </RigidBody>
      <group
        ref={axe}
        onPointerMissed={(e) => (axe.current.children[0].rotation.x = -0.5)}
      >
        <Axe position={[0.3, -0.35, 0.5]} />
      </group>
    </>
  );
}
