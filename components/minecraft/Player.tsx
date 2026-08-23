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
import { HeldItem } from "./HeldItem";
import { useGestureStore } from "../gesture/store";
import { hitBlockCenter } from "./GestureBuilder";
import { powerupState, usePowerupStore } from "../world/powerupStore";
import { useFloodStore } from "../world/floodStore";
import { laserTagState } from "../lasertag/laserTagStore";
import { playerOrigin } from "./player-origin";
import { TARGET_BLOCK_SIZE } from "@/lib/use-grid-points";

type Controls =
  | "forward"
  | "backward"
  | "left"
  | "right"
  | "jump"
  | "crouch";

type PlayerProps = {
  lerp?: typeof THREE.MathUtils.lerp;
};

const SPEED = 5;
// Jump impulse. Apex is v^2 / (2 * gravity) = 1.35m at v=9 under the
// scene's -30 gravity, so a single jump clears a one-block step — without
// it the stairs and roofs in the world are unreachable.
const JUMP_SPEED = 9;
/** In front of the recentered JSON grid (z ≈ ±9, ~23 tall) so spawn looks
 *  at the facade instead of dropping through a floor. */
const SPAWN_POSITION: [number, number, number] = [0, 8, 16];
/** Vertical speed under the fly powerup, up or down. */
const FLY_SPEED = 6;
/** Climb rate under the monkey powerup. Slower than a jump, so scaling the
 *  house still feels like work. */
const CLIMB_SPEED = 3.5;
/** How far ahead to look for a climbable wall — just past the capsule radius. */
const WALL_REACH = TARGET_BLOCK_SIZE * 0.7;
/** Heights above the body centre to probe for a wall, covering head to shin. */
const WALL_PROBE_HEIGHTS = [0.2, 0, -0.25, -0.5];
/** Fraction of walk speed pushed into the wall while climbing. */
const CLIMB_WALL_PUSH = 0.25;
/** Seconds after a jump during which "grounded" is ignored, so the body still
 *  resting on the floor doesn't immediately refill the jump count. */
const JUMP_LOCKOUT = 0.2;
/** Standing eye height from the original [0.75, 0.5] capsule (its centre). */
const EYE_HEIGHT = 0.75 + 0.5;
/** Wider than half a voxel so you cannot slip through a one-brick gap.
 *  Slide-along-wall still keeps stairs from swallowing the capsule. */
const VOXEL_RADIUS = TARGET_BLOCK_SIZE * 0.55;
const CAPSULE_NORMAL: [number, number] = [0.38, VOXEL_RADIUS];
const CAPSULE_TINY: [number, number] = [0.16, TARGET_BLOCK_SIZE * 0.38];
function eyeLift(shape: [number, number]) {
  return EYE_HEIGHT - (shape[0] + shape[1]);
}
const slideDir = new THREE.Vector3();
const SLIDE_PROBE_HEIGHTS = [0.15, -0.2];
const climbDir = new THREE.Vector3();
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
  // Powerup state that has to persist across frames.
  const jumpsUsed = useRef(0);
  const jumpWasDown = useRef(false);
  const jumpLockout = useRef(0);
  const flying = useRef(false);

  // The one effect Player needs during render rather than in the frame loop:
  // the collider size is a prop, so shrinking means re-rendering.
  const tiny = usePowerupStore((s) => s.tiny);

  // Restarting the flood drops the player back at spawn. The body is owned
  // here, so the flood store just bumps a token rather than reaching into it.
  const respawnToken = useFloodStore((s) => s.respawnToken);
  useEffect(() => {
    // Token 0 is the initial mount, where <RigidBody position> already applies.
    if (respawnToken === 0 || !ref.current) return;
    ref.current.setTranslation(
      { x: SPAWN_POSITION[0], y: SPAWN_POSITION[1], z: SPAWN_POSITION[2] },
      true,
    );
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
  useFrame((state, delta) => {
    // Rapier's wasm initialises asynchronously, so on a cold load this loop can
    // run a frame or two before <RigidBody> has created the body and populated
    // the ref — which threw "Cannot read properties of null (reading 'linvel')"
    // on every fresh page load. A warm client-side remount never hit it, since
    // Rapier is already up by then.
    if (!ref.current) return;
    const { forward, backward, left, right, jump, crouch } = get();
    const velocity = ref.current.linvel();
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    // Camera rides above the small capsule at the original eye height.
    const shape = tiny ? CAPSULE_TINY : CAPSULE_NORMAL;
    const body = ref.current.translation();
    playerOrigin.set(body.x, body.y, body.z);
    state.camera.position.set(body.x, body.y + eyeLift(shape), body.z);
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
    // update axe — hidden while Laser Tag holds the world, so the diamond axe
    // doesn't float alongside the laser gun.
    axe.current.visible = !laserTagState.active;
    // children[0] is whatever HeldItem rendered — the axe, or the player's
    // newest creation. It is momentarily ABSENT while a creation's GLB
    // downloads and Suspense swaps the subtree, and an unguarded read throws
    // inside the frame loop, which kills the loop outright rather than dropping
    // a frame.
    const held = axe.current?.children[0];
    if (held) {
      held.rotation.x = lerp(
        held.rotation.x,
        Math.sin(+(speed > 1) * state.clock.elapsedTime * 10) / 6,
        0.1,
      );
    }
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
      // on every tick of the effect timer.
      .multiplyScalar(SPEED * powerupState.speedMultiplier)
      .applyEuler(state.camera.rotation);

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
    // Tiny shrinks the capsule, so the distance to the floor shrinks with it.
    const groundReach = powerupState.tiny ? 0.45 : 0.85;
    const grounded = ray && ray.collider && Math.abs(ray.timeOfImpact) <= groundReach;

    // FLY: gravity off, Space rises and Shift drops. Toggled on transition
    // rather than every frame so we don't fight Rapier's own bookkeeping.
    if (powerupState.fly !== flying.current) {
      flying.current = powerupState.fly;
      ref.current.setGravityScale(powerupState.fly ? 0 : 1, true);
    }

    // MONKEY: walking into a wall climbs it. The ray goes along the camera's
    // horizontal facing, so you climb whatever you're looking at and pressing
    // into — no separate "grab" input to explain.
    let climbing = false;
    if (powerupState.climb && !orbiting && (forward || gestureForward)) {
      state.camera.getWorldDirection(climbDir);
      climbDir.y = 0;
      if (climbDir.lengthSq() > 0.0001) {
        climbDir.normalize();
        const origin = ref.current.translation();
        // Probe at several heights, not just the body centre: a centre-only ray
        // sails over a one-block ledge — the very thing that stops you walking —
        // so the climb would refuse to start on exactly the obstacles it exists
        // to solve. Any hit counts as a wall.
        climbing = WALL_PROBE_HEIGHTS.some((offset) => {
          const hit = world.castRay(
            new RAPIER.Ray(
              { x: origin.x, y: origin.y + offset, z: origin.z },
              climbDir,
            ),
            WALL_REACH,
            true,
            undefined,
            undefined,
            undefined,
            ref.current,
          );
          return !!(hit && hit.collider);
        });
      }
    }

    if (!orbiting && !climbing && !flying.current && (direction.x || direction.z)) {
      // setLinvel every frame would otherwise keep driving the capsule into a
      // stair riser or voxel corner after the solver already pushed it out.
      slideDir.set(direction.x, 0, direction.z);
      if (slideDir.lengthSq() > 1e-6) {
        slideDir.normalize();
        const reach = shape[1] + 0.1;
        for (const offset of SLIDE_PROBE_HEIGHTS) {
          const wall = world.castRayAndGetNormal(
            new RAPIER.Ray(
              { x: body.x, y: body.y + offset, z: body.z },
              slideDir,
            ),
            reach,
            true,
            undefined,
            undefined,
            undefined,
            ref.current,
          );
          if (!wall) continue;
          const nx = wall.normal.x;
          const nz = wall.normal.z;
          const into = direction.x * nx + direction.z * nz;
          if (into < 0) {
            direction.x -= nx * into;
            direction.z -= nz * into;
          }
        }
      }
    }

    if (!orbiting) {
      const vertical = flying.current
        ? (+(jump || false) - +(crouch || false)) * FLY_SPEED
        : climbing
          ? CLIMB_SPEED
          : velocity.y;
      // Climbing eases off the horizontal push: driving the capsule at full
      // speed into the wall makes contact friction fight the upward slide, which
      // dragged the measured climb down to ~0.7m/s against the 3.5 asked for.
      // Enough push to stay attached, not enough to stick.
      const grip = climbing ? CLIMB_WALL_PUSH : 1;
      ref.current.setLinvel(
        { x: direction.x * grip, y: vertical, z: direction.z * grip },
        true,
      );
    }

    // JUMPING. Rising-edge triggered now that a second jump exists: holding
    // Space used to re-fire on every grounded frame, which would spend the
    // double jump instantly.
    const gestureJump = gesture.consumeJump();
    const wantJump = jump || gestureJump;
    const pressedJump = wantJump && !jumpWasDown.current;
    jumpWasDown.current = wantJump;

    // Ignore "grounded" briefly after a jump: the body is still touching the
    // floor on the next frame or two, which would otherwise refill the jumps.
    if (jumpLockout.current > 0) jumpLockout.current -= delta;
    if (grounded && jumpLockout.current <= 0) jumpsUsed.current = 0;
    if (climbing || flying.current) jumpsUsed.current = 0;

    if (!orbiting && !flying.current && pressedJump && jumpsUsed.current < powerupState.maxJumps) {
      jumpsUsed.current += 1;
      jumpLockout.current = JUMP_LOCKOUT;
      ref.current.setLinvel({ x: direction.x, y: JUMP_SPEED, z: direction.z }, true);
    }
  });
  return (
    <>
      <RigidBody
        ref={ref}
        colliders={false}
        mass={1}
        type="dynamic"
        position={SPAWN_POSITION}
        enabledRotations={[false, false, false]}
      >
        <CapsuleCollider
          args={tiny ? CAPSULE_TINY : CAPSULE_NORMAL}
          friction={0}
          restitution={0}
        />
      </RigidBody>
      <group
        ref={axe}
        onPointerMissed={() => {
          // Same guard as the frame loop: the held item swaps between the axe
          // and a generated model, and a generated model suspends while it
          // downloads, so a child is not guaranteed to exist.
          const held = axe.current?.children[0];
          if (held) held.rotation.x = -0.5;
        }}
      >
        <HeldItem />
      </group>
    </>
  );
}
