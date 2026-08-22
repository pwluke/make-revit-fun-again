import * as THREE from "three";
import * as RAPIER from "@dimforge/rapier3d-compat";
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useKeyboardControls } from "@react-three/drei";
import {
  CapsuleCollider,
  RigidBody,
  useRapier,
  type RapierRigidBody,
} from "@react-three/rapier";
import Axe from "./Axe";
import { useGestureStore } from "../gesture/store";
import { hitBlockCenter } from "./GestureBuilder";
import { powerupState } from "../world/powerupStore";
import { useFloodStore } from "../world/floodStore";

type Controls = "forward" | "backward" | "left" | "right" | "jump";

type PlayerProps = {
  lerp?: typeof THREE.MathUtils.lerp;
};

const SPEED = 5;
// Jump impulse. Apex is v^2 / (2 * gravity) = 1.35m at v=9 under the
// scene's -30 gravity, so a single jump clears a one-block step — without
// it the stairs and roofs in the world are unreachable.
const JUMP_SPEED = 9;
/** Spawn drop height, shared by the initial <RigidBody position> and respawns. */
const SPAWN_HEIGHT = 10;
const direction = new THREE.Vector3();
const frontVector = new THREE.Vector3();
const sideVector = new THREE.Vector3();
const rotation = new THREE.Vector3();

// Gesture input tuning. Steering uses the same YXZ order as
// PointerLockControls so both inputs can share the camera.
const gestureEuler = new THREE.Euler(0, 0, 0, "YXZ");
// Head-look: the camera mirrors the head, amplified — and the mapping is
// STRICTLY BOUNDED. Turning the head past the sync range just parks the
// view at the edge; the camera can never keep spinning on its own.
const HEAD_SYNC_RANGE = 0.35; // rad of head yaw (~20 deg) mapped directly
const HEAD_YAW_GAIN = 3.5; // camera rad per head rad inside the sync range
const HEAD_PITCH_GAIN = 2.4;
const HEAD_MAX_PITCH = Math.PI / 2 - 0.25;

// Fist orbit: grab whatever the crosshair points at and drag the fist to
// swing the camera around it at a fixed distance.
const orbitRay = new THREE.Raycaster();
const orbitCenter = new THREE.Vector2(0, 0);
const orbitPos = new THREE.Vector3();
const ORBIT_YAW_SPEED = 4; // rad per unit of mirrored fist travel
const ORBIT_PITCH_SPEED = 3;
const ORBIT_EL_MIN = 0.05; // stay above the ground plane
const ORBIT_EL_MAX = 1.25;
const ORBIT_MIN_RADIUS = 2.5;
const ORBIT_MAX_TARGET_DIST = 40;
const ORBIT_FALLBACK_DIST = 8; // empty crosshair: orbit a point this far ahead

export function Player({ lerp = THREE.MathUtils.lerp }: PlayerProps) {
  const axe = useRef<THREE.Group>(null!);
  const ref = useRef<RapierRigidBody>(null!);
  const rapier = useRapier();
  const [, get] = useKeyboardControls<Controls>();
  // Base yaw the bounded head-look offset is applied on top of.
  const headBase = useRef(0);
  const headWasTracked = useRef(false);
  // Fist-orbit state.
  const { scene, camera } = useThree();
  const orbitWas = useRef(false);
  const orbitTarget = useRef(new THREE.Vector3());
  const orbitRadius = useRef(0);
  const orbitAz = useRef(0);
  const orbitEl = useRef(0);

  // Restarting the flood drops the player back at spawn. The body is owned
  // here, so the flood store just bumps a token rather than reaching into it.
  const respawnToken = useFloodStore((s) => s.respawnToken);
  useEffect(() => {
    // Token 0 is the initial mount, where <RigidBody position> already applies.
    if (respawnToken === 0 || !ref.current) return;
    ref.current.setTranslation({ x: 0, y: SPAWN_HEIGHT, z: 0 }, true);
    ref.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, [respawnToken]);
  // SceneCanvas is shared with the Rhino viewer, so its camera is authored for
  // an orbit view — positioned at [32, 24, 32] looking at the origin, which
  // bakes in a ~30° downward pitch. The frame loop below only ever writes camera
  // *position* (rotation is PointerLockControls' and the gesture paths' job), so
  // that tilt survives into first person and aims the spawn view at the player's
  // feet: anything at eye height sits at or above the top of the frame until the
  // mouse moves. Level it once on mount; the controls take over from there.
  useEffect(() => {
    camera.rotation.set(0, 0, 0);
  }, [camera]);
  useFrame((state) => {
    const { forward, backward, left, right, jump } = get();
    const velocity = ref.current.linvel();
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    // update camera
    state.camera.position.copy(ref.current.translation());
    // gesture input (merged with mouse + keyboard)
    const gesture = useGestureStore.getState();
    const gestureOn = gesture.status === "on";
    const orbiting = gestureOn && gesture.orbiting;
    if (orbiting) {
      if (!orbitWas.current) {
        // Fist just closed: lock the target under the crosshair. A cube
        // orbits around its center, the ground around the hit point, an
        // empty crosshair around a point straight ahead.
        orbitRay.setFromCamera(orbitCenter, state.camera);
        const hit = orbitRay
          .intersectObjects(scene.children, true)
          .find((h) => {
            const mesh = h.object as THREE.Mesh;
            return (
              h.distance > 1.6 &&
              h.distance < ORBIT_MAX_TARGET_DIST &&
              mesh.isMesh &&
              (mesh.geometry.type === "BoxGeometry" || mesh.geometry.type === "PlaneGeometry")
            );
          });
        if (hit && (hit.object as THREE.Mesh).geometry.type === "BoxGeometry") {
          hitBlockCenter(hit, orbitTarget.current);
        } else if (hit) {
          orbitTarget.current.copy(hit.point);
        } else {
          state.camera.getWorldDirection(orbitPos);
          orbitTarget.current.copy(state.camera.position).addScaledVector(orbitPos, ORBIT_FALLBACK_DIST);
        }
        orbitPos.copy(state.camera.position).sub(orbitTarget.current);
        orbitRadius.current = Math.max(orbitPos.length(), ORBIT_MIN_RADIUS);
        orbitAz.current = Math.atan2(orbitPos.x, orbitPos.z);
        orbitEl.current = THREE.MathUtils.clamp(
          Math.asin(orbitPos.y / orbitRadius.current),
          ORBIT_EL_MIN,
          ORBIT_EL_MAX,
        );
      }
      // Dragging the fist swings the camera around the target on a sphere
      // of fixed radius — like walking around a model on a table.
      const drag = gesture.consumeOrbit();
      orbitAz.current += drag.x * ORBIT_YAW_SPEED;
      orbitEl.current = THREE.MathUtils.clamp(
        orbitEl.current - drag.y * ORBIT_PITCH_SPEED,
        ORBIT_EL_MIN,
        ORBIT_EL_MAX,
      );
      orbitPos
        .set(
          Math.sin(orbitAz.current) * Math.cos(orbitEl.current),
          Math.sin(orbitEl.current),
          Math.cos(orbitAz.current) * Math.cos(orbitEl.current),
        )
        .multiplyScalar(orbitRadius.current)
        .add(orbitTarget.current);
      if (orbitPos.y < 1.2) orbitPos.y = 1.2;
      ref.current.setTranslation(orbitPos, true);
      ref.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      state.camera.position.copy(orbitPos);
      state.camera.lookAt(orbitTarget.current);
      // Head-look re-adopts the view when the fist opens.
      headWasTracked.current = false;
    } else if (gestureOn && gesture.faceTracking) {
      const yawOffset =
        THREE.MathUtils.clamp(gesture.headYaw, -HEAD_SYNC_RANGE, HEAD_SYNC_RANGE) * HEAD_YAW_GAIN;
      if (!headWasTracked.current) {
        // Face just (re)acquired: adopt the current camera yaw so head
        // steering takes over without a snap.
        gestureEuler.setFromQuaternion(state.camera.quaternion);
        headBase.current = gestureEuler.y - yawOffset;
      }
      gestureEuler.set(
        THREE.MathUtils.clamp(
          gesture.headPitch * HEAD_PITCH_GAIN,
          -HEAD_MAX_PITCH,
          HEAD_MAX_PITCH,
        ),
        headBase.current + yawOffset,
        0,
      );
      state.camera.quaternion.setFromEuler(gestureEuler);
      headWasTracked.current = true;
    } else {
      headWasTracked.current = false;
    }
    orbitWas.current = orbiting;
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
    // movement — palm walks forward, back of the hand walks backward
    const gestureForward = gestureOn && gesture.move > 0;
    const gestureBack = gestureOn && gesture.move < 0;
    frontVector.set(0, 0, +(backward || gestureBack) - +(forward || gestureForward));
    sideVector.set(+left - +right, 0, 0);
    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      // Read straight off the mutable powerup state rather than subscribing:
      // this runs every frame, and a store subscription would re-render Player
      // on every tick of the boost timer.
      .multiplyScalar(SPEED * powerupState.multiplier)
      .applyEuler(state.camera.rotation);
    if (!orbiting)
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
    const gestureJump = gesture.consumeJump();
    if (!orbiting && (jump || gestureJump) && grounded)
      ref.current.setLinvel({ x: 0, y: JUMP_SPEED, z: 0 }, true);
  });
  return (
    <>
      <RigidBody
        ref={ref}
        colliders={false}
        mass={1}
        type="dynamic"
        position={[0, SPAWN_HEIGHT, 0]}
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
