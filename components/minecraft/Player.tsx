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
import { powerupState, usePowerupStore } from "../world/powerupStore";
import { useHeroStore } from "../world/store";
import { playFootstep, playWebZip } from "../world/sfx";
import { useFloodStore } from "../world/floodStore";
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

/** Metres of ground covered between footsteps. Tuned so a normal walk is
 *  roughly two steps a second; speed powers then quicken it for free. */
const STEP_DISTANCE = 1.9;
const SPEED = 5;
/** Speed ability card: double speed (its jump boost is applied inline). */
const SPEED_CARD_MULTIPLIER = 2;
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
/** Speed of a spider walking across a wall face. */
const WALL_WALK_SPEED = 4;
/** Constant pull into the face you are standing on, so you stay attached. */
const WALL_STICK = 6;
/** How far below your feet the face may be before you count as fallen off. */
const WALL_REPROBE = 1.2;
/** Look this far ahead for the next face, so the roll starts before the edge. */
const EDGE_LOOKAHEAD = 0.5;
/** Reach used to feel around a convex corner onto the face beyond it. */
const EDGE_WRAP = 0.9;
/** Mouse sensitivity while wall-walking, matching PointerLockControls. */
const WALL_LOOK_SENSITIVITY = 0.002;
const WALL_MAX_PITCH = Math.PI / 2 - 0.12;
/** Web-zip: click a surface further than the break reach to be pulled to it. */
const ZIP_SPEED = 16;
const ZIP_MAX_DIST = 60;
/** Web anchors must be at least a body-length away, so a click while
 *  pressed against a wall does not yank you into it. */
const WEB_MIN_DIST = 2;
const ZIP_ARRIVE = 1.4;
const ZIP_TIMEOUT = 3; // seconds, so a blocked pull always lets go
/** Flight: each double-tap of jump lifts the hover target by this much.
 *  The model's storeys sit ~3m apart, so one tap is about two floors. */
const FLY_STEP = 6;
/** How fast the body eases toward its hover target. */
const FLY_CLIMB_SPEED = 9;
/** Two jump presses inside this window count as a double-tap. */
const DOUBLE_TAP_MS = 320;
/** Seconds after a jump during which "grounded" is ignored, so the body still
 *  resting on the floor doesn't immediately refill the jump count. */
const JUMP_LOCKOUT = 0.2;
/** Standing eye height from the original [0.75, 0.5] capsule (its centre). */
const EYE_HEIGHT = 0.75 + 0.5;
/** Mouse mode drops the eye to a fraction of standing height. The capsule
 *  shrinking is not enough on its own: eyeLift below is written to hold the
 *  eye at EYE_HEIGHT whatever the capsule does, which cancelled the whole
 *  point of being small. */
const TINY_EYE_FACTOR = 0.4;
/** Wider than half a voxel so you cannot slip through a one-brick gap.
 *  Slide-along-wall still keeps stairs from swallowing the capsule. */
const VOXEL_RADIUS = TARGET_BLOCK_SIZE * 0.55;
const CAPSULE_NORMAL: [number, number] = [0.38, VOXEL_RADIUS];
const CAPSULE_TINY: [number, number] = [0.16, TARGET_BLOCK_SIZE * 0.38];
function eyeLift(shape: [number, number], small: boolean) {
  const target = small ? EYE_HEIGHT * TINY_EYE_FACTOR : EYE_HEIGHT;
  return target - (shape[0] + shape[1]);
}
const slideDir = new THREE.Vector3();
const SLIDE_PROBE_HEIGHTS = [0.15, -0.2];
const climbDir = new THREE.Vector3();
const wallNormal = new THREE.Vector3();
const wallRight = new THREE.Vector3();
// Scratch for building the camera basis on a wall.
const wUp = new THREE.Vector3();
const wRight = new THREE.Vector3();
const wBack = new THREE.Vector3();
const wRef = new THREE.Vector3();
const wMat = new THREE.Matrix4();
const wQuat = new THREE.Quaternion();
const wLocal = new THREE.Quaternion();
const wEuler = new THREE.Euler(0, 0, 0, "YXZ");
const wMove = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const rollFrom = new THREE.Vector3();
const rollTo = new THREE.Vector3();
const rollFwd = new THREE.Vector3();
const rollFlat = new THREE.Vector3();
const rollAxis = new THREE.Vector3();
const rollQuat = new THREE.Quaternion();
const webMid = new THREE.Vector3();
const webDir = new THREE.Vector3();
const zipVec = new THREE.Vector3();
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

/** Camera basis for standing on a face: `up` is the surface normal, and the
 *  other two axes are any stable tangents. three cameras look down -Z, so the
 *  matrix's third column is "back". */
function buildWallBasis(up: THREE.Vector3) {
  wUp.copy(up).normalize();
  // Any reference that is not parallel to the normal gives a stable tangent.
  wRef.set(0, 1, 0);
  if (Math.abs(wUp.dot(wRef)) > 0.95) wRef.set(0, 0, 1);
  wRight.copy(wRef).cross(wUp).normalize();
  wBack.copy(wRight).cross(wUp).normalize();
  wMat.makeBasis(wRight, wUp, wBack);
  wQuat.setFromRotationMatrix(wMat);
}

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
  // PointerLockControls, registered with makeDefault in App.
  const controls = useThree((state) => state.controls);
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
  const stepAccum = useRef(0);
  // Spider: the wall we are stuck to, and the web pull in flight.
  const onWall = useRef(false);
  const zipTarget = useRef<THREE.Vector3 | null>(null);
  const zipDeadline = useRef(0);
  const zipFace = useRef<THREE.Vector3 | null>(null);
  // Flight: the altitude the last double-tap asked for.
  const flyTarget = useRef<number | null>(null);
  const lastJumpTap = useRef(0);
  // Wall walking: the face we are standing on, and where we look on it.
  const wallUp = useRef<THREE.Vector3 | null>(null);
  const wallYaw = useRef(0);
  const wallPitch = useRef(0);
  const gravityOn = useRef(true);
  const webRef = useRef<THREE.Mesh>(null);

  // The one effect Player needs during render rather than in the frame loop:
  // the collider size is a prop, so shrinking means re-rendering.
  const powerupTiny = usePowerupStore((s) => s.tiny);
  // Ability cards are permanent and stackable; powerups are timed and
  // exclusive. Either source can switch an effect on, so every read below
  // takes the union rather than duplicating the physics for each.
  const heroTiny = useHeroStore((s) => s.active.includes("tiny"));
  const tiny = powerupTiny || heroTiny;

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
  // While wall-walking the camera is built from the wall's own frame, so
  // PointerLockControls (which assumes world Y-up) is switched off and its
  // mouse input handled here instead.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!wallUp.current || !document.pointerLockElement) return;
      wallYaw.current -= e.movementX * WALL_LOOK_SENSITIVITY;
      wallPitch.current = THREE.MathUtils.clamp(
        wallPitch.current - e.movementY * WALL_LOOK_SENSITIVITY,
        -WALL_MAX_PITCH,
        WALL_MAX_PITCH,
      );
    };
    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  // SPIDER web: clicking something FAR away pulls you to it. Near clicks are
  // left alone so breaking still works — the split is the break reach itself,
  // which is also how the player already reads "in range" vs "over there".
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!document.pointerLockElement) return;
      if (!useHeroStore.getState().active.includes("climb")) return;
      if (!ref.current) return;
      orbitRay.setFromCamera(orbitCenter, camera);
      const hit = orbitRay
        .intersectObjects(scene.children, true)
        .find((h) => {
          const mesh = h.object as THREE.Mesh;
          return h.distance > WEB_MIN_DIST && h.distance < ZIP_MAX_DIST && mesh.isMesh;
        });
      if (!hit) return;
      zipTarget.current = hit.point.clone();
      // Land standing on whatever face was clicked, the same as walking
      // into one — so a web shot across the atrium reorients you too.
      if (hit.face) {
        zipFace.current = hit.face.normal
          .clone()
          .transformDirection(hit.object.matrixWorld)
          .normalize();
      } else {
        zipFace.current = null;
      }
      zipDeadline.current = performance.now() / 1000 + ZIP_TIMEOUT;
      playWebZip();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [camera, scene]);

  /**
   * Adopt a new face as the floor. The view is carried across by the same
   * rotation that takes the old up-vector to the new one, so walking over a
   * cube rolls the camera — up the side you face the sky, on the top face
   * you are level again, down the far side you face the ground — instead of
   * cutting to a fresh orientation at every edge.
   */
  const reorient = (
    nx: number,
    ny: number,
    nz: number,
    cam: THREE.Camera,
  ) => {
    rollFrom.copy(wallUp.current ?? WORLD_UP);
    rollTo.set(nx, ny, nz).normalize();
    cam.getWorldDirection(rollFwd);
    // setFromUnitVectors is undefined for exact opposites; a half turn about
    // any perpendicular axis is the right answer there.
    if (rollFrom.dot(rollTo) < -0.9999) {
      rollAxis.set(1, 0, 0);
      if (Math.abs(rollFrom.x) > 0.9) rollAxis.set(0, 1, 0);
      rollAxis.cross(rollFrom).normalize();
      rollQuat.setFromAxisAngle(rollAxis, Math.PI);
    } else {
      rollQuat.setFromUnitVectors(rollFrom, rollTo);
    }
    rollFwd.applyQuaternion(rollQuat).normalize();

    const up = (wallUp.current ??= new THREE.Vector3());
    up.copy(rollTo);
    buildWallBasis(up);

    // Read the carried look direction back out as yaw and pitch on the new face.
    const vert = THREE.MathUtils.clamp(rollFwd.dot(up), -1, 1);
    rollFlat.copy(rollFwd).addScaledVector(up, -vert);
    if (rollFlat.lengthSq() < 1e-8) rollFlat.copy(wBack).negate();
    rollFlat.normalize();
    wallYaw.current = Math.atan2(-rollFlat.dot(wRight), -rollFlat.dot(wBack));
    wallPitch.current = THREE.MathUtils.clamp(
      Math.asin(vert),
      -WALL_MAX_PITCH,
      WALL_MAX_PITCH,
    );
  };

  /** Leaving the wall: level the camera on the world horizon, keeping the
   *  heading. PointerLockControls reads the camera's own quaternion on each
   *  mouse move, so handing it a level one is all the resync it needs. */
  const detachFromWall = (cam: THREE.Camera) => {
    if (!wallUp.current) return;
    cam.getWorldDirection(rollFwd);
    rollFwd.y = 0;
    if (rollFwd.lengthSq() < 1e-8) rollFwd.set(0, 0, -1);
    rollFwd.normalize();
    wEuler.set(0, Math.atan2(-rollFwd.x, -rollFwd.z), 0, "YXZ");
    cam.quaternion.setFromEuler(wEuler);
    wallUp.current = null;
  };

  useFrame((state, delta) => {
    // Rapier's wasm initialises asynchronously, so on a cold load this loop can
    // run a frame or two before <RigidBody> has created the body and populated
    // the ref — which threw "Cannot read properties of null (reading 'linvel')"
    // on every fresh page load. A warm client-side remount never hit it, since
    // Rapier is already up by then.
    if (!ref.current) return;
    const { forward, backward, left, right, jump, crouch } = get();
    // Effective abilities this frame: permanent cards OR the active powerup.
    const heroActive = useHeroStore.getState().active;
    const canClimb = powerupState.climb || heroActive.includes("climb");
    const canFly = powerupState.fly || heroActive.includes("fly");
    const isTiny = powerupState.tiny || heroActive.includes("tiny");
    const hasSpeedCard = heroActive.includes("speed");
    const speedMultiplier = Math.max(
      powerupState.speedMultiplier,
      hasSpeedCard ? SPEED_CARD_MULTIPLIER : 0,
    );
    // The speed card doubles jump HEIGHT, and height goes as v^2.
    const jumpMultiplier = hasSpeedCard ? Math.SQRT2 : 1;
    const maxJumps = Math.max(powerupState.maxJumps, hasSpeedCard ? 2 : 1);
    // Portal rings ask for a teleport; the body owner is the only place that
    // can actually move it.
    const velocity = ref.current.linvel();
    const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
    // Camera rides above the small capsule at the original eye height.
    const shape = tiny ? CAPSULE_TINY : CAPSULE_NORMAL;
    const body = ref.current.translation();
    playerOrigin.set(body.x, body.y, body.z);
    state.camera.position.set(body.x, body.y + eyeLift(shape, isTiny), body.z);
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
      // on every tick of the effect timer.
      .multiplyScalar(SPEED * speedMultiplier)
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
    const groundReach = isTiny ? 0.45 : 0.85;
    const grounded = ray && ray.collider && Math.abs(ray.timeOfImpact) <= groundReach;


    // FLY: gravity off, Space rises and Shift drops. Toggled on transition
    // rather than every frame so we don't fight Rapier's own bookkeeping.
    if (canFly !== flying.current) {
      flying.current = canFly;
      ref.current.setGravityScale(canFly ? 0 : 1, true);
    }
    // Standing on a wall replaces world gravity with the stick force below;
    // leaving the wall hands it straight back so you fall.
    const wantGravity = !wallUp.current && !flying.current;
    if (gravityOn.current !== wantGravity) {
      gravityOn.current = wantGravity;
      ref.current.setGravityScale(wantGravity ? 1 : 0, true);
    }

    // MONKEY: walking into a wall climbs it. The ray goes along the camera's
    // horizontal facing, so you climb whatever you're looking at and pressing
    // into — no separate "grab" input to explain.
    // SPIDER. Walking into a wall while the power is on flips you onto it:
    // that face becomes the floor, the sky is ahead, and you crawl across
    // the building like the animal does. Leaving the power drops you.
    if ((!canClimb || orbiting) && wallUp.current) detachFromWall(state.camera);

    if (canClimb && !orbiting && !wallUp.current) {
      // Not yet attached: pressing forward into a face grabs it.
      if (forward || gestureForward) {
        state.camera.getWorldDirection(climbDir);
        climbDir.y = 0;
        if (climbDir.lengthSq() > 0.0001) {
          climbDir.normalize();
          for (const offset of WALL_PROBE_HEIGHTS) {
            const hit = world.castRayAndGetNormal(
              new RAPIER.Ray(
                { x: body.x, y: body.y + offset, z: body.z },
                climbDir,
              ),
              WALL_REACH,
              true,
              undefined,
              undefined,
              undefined,
              ref.current,
            );
            if (hit && hit.collider) {
              reorient(hit.normal.x, hit.normal.y, hit.normal.z, state.camera);
              break;
            }
          }
        }
      }
    } else if (wallUp.current) {
      // Attached. Every frame, work out which face is under our feet — that
      // is what drives the camera roll, so an edge has to be found slightly
      // BEFORE we walk off it, not after.
      wUp.copy(wallUp.current);
      const step = wMove.lengthSq() > 0.01 ? EDGE_LOOKAHEAD : 0;
      const probeOrigin = {
        x: body.x + wMove.x * step,
        y: body.y + wMove.y * step,
        z: body.z + wMove.z * step,
      };
      const down = { x: -wUp.x, y: -wUp.y, z: -wUp.z };
      const cast = (origin: typeof probeOrigin, dir: typeof down, len: number) =>
        world.castRayAndGetNormal(
          new RAPIER.Ray(origin, dir),
          len,
          true,
          undefined,
          undefined,
          undefined,
          ref.current,
        );

      // 1. Still over the same kind of surface a step ahead: follow it. This
      //    also tracks gentle curvature without any special case.
      const below = cast(probeOrigin, down, WALL_REPROBE);
      if (below && below.collider) {
        const n = below.normal;
        if (wUp.dot(new THREE.Vector3(n.x, n.y, n.z)) < 0.999) {
          reorient(n.x, n.y, n.z, state.camera);
        }
      } else {
        // 2. Concave corner: a face rising in front of us. Walk onto it.
        const front = wMove.lengthSq() > 0.01
          ? cast(body, { x: wMove.x, y: wMove.y, z: wMove.z }, WALL_REPROBE)
          : null;
        if (front && front.collider) {
          reorient(front.normal.x, front.normal.y, front.normal.z, state.camera);
        } else {
          // 3. Convex corner: the surface ended. Step past the edge, then
          //    look BACK the way we came — that ray lands on the face we are
          //    wrapping onto, which is how you get from a wall to a roof.
          const past = {
            x: body.x + wMove.x * EDGE_WRAP - wUp.x * EDGE_WRAP,
            y: body.y + wMove.y * EDGE_WRAP - wUp.y * EDGE_WRAP,
            z: body.z + wMove.z * EDGE_WRAP - wUp.z * EDGE_WRAP,
          };
          const around = wMove.lengthSq() > 0.01
            ? cast(past, { x: -wMove.x, y: -wMove.y, z: -wMove.z }, EDGE_WRAP * 2)
            : null;
          if (around && around.collider) {
            reorient(around.normal.x, around.normal.y, around.normal.z, state.camera);
          } else {
            detachFromWall(state.camera);
          }
        }
      }
    }
    const climbing = wallUp.current !== null;
    onWall.current = climbing;

    // Drive the camera from the wall's frame while attached, and hand the
    // mouse back to PointerLockControls when not.
    const plc = controls as { enabled?: boolean } | null;
    if (climbing && wallUp.current) {
      if (plc && plc.enabled !== false) plc.enabled = false;
      buildWallBasis(wallUp.current);
      wEuler.set(wallPitch.current, wallYaw.current, 0, "YXZ");
      wLocal.setFromEuler(wEuler);
      state.camera.quaternion.copy(wQuat).multiply(wLocal);
      // Where "forward" points across the face, for movement and corner probing.
      wMove.set(0, 0, -1).applyQuaternion(state.camera.quaternion);
      wMove.addScaledVector(wallUp.current, -wMove.dot(wallUp.current));
      if (wMove.lengthSq() > 1e-6) wMove.normalize();
    } else if (plc && plc.enabled === false) {
      plc.enabled = true;
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

    // WEB ZIP owns the whole velocity while it runs, so it reads as being
    // pulled rather than as a walk that happens to drift.
    if (zipTarget.current) {
      const now = performance.now() / 1000;
      zipVec.set(
        zipTarget.current.x - body.x,
        zipTarget.current.y - body.y,
        zipTarget.current.z - body.z,
      );
      const dist = zipVec.length();
      // Draw the strand: a thin white cylinder from just below the eye to
      // the anchor, re-aimed every frame as the pull closes the gap.
      if (webRef.current) {
        webRef.current.visible = true;
        webMid
          .copy(state.camera.position)
          .addScaledVector(zipTarget.current, 1)
          .multiplyScalar(0.5);
        webRef.current.position.copy(webMid);
        webRef.current.scale.set(1, Math.max(dist, 0.01), 1);
        webDir.copy(zipTarget.current).sub(state.camera.position).normalize();
        webRef.current.quaternion.setFromUnitVectors(WORLD_UP, webDir);
      }
      if (!canClimb || orbiting || dist < ZIP_ARRIVE || now > zipDeadline.current) {
        // Arriving on a face you shot at lands you standing on it.
        if (dist < ZIP_ARRIVE && zipFace.current && canClimb) {
          reorient(
            zipFace.current.x,
            zipFace.current.y,
            zipFace.current.z,
            state.camera,
          );
        }
        zipTarget.current = null;
        zipFace.current = null;
        if (webRef.current) webRef.current.visible = false;
      } else {
        zipVec.normalize().multiplyScalar(ZIP_SPEED);
        ref.current.setLinvel({ x: zipVec.x, y: zipVec.y, z: zipVec.z }, true);
      }
    }

    if (!orbiting && !zipTarget.current) {
      let vx = direction.x;
      let vz = direction.z;
      let vertical = velocity.y;

      if (climbing && wallUp.current) {
        // On the face: WASD walks across it in the wall's own tangent
        // plane, and a steady pull into it keeps you attached. Velocity is
        // fully three-dimensional here, so there is no "vertical" to speak of.
        const goF = +(forward || gestureForward) - +(backward || gestureBack);
        const goR = +right - +left;
        wallRight.copy(wRight);
        wallRight.applyAxisAngle(wallUp.current, wallYaw.current);
        wMove.copy(wallRight).multiplyScalar(-goR);
        wMove.addScaledVector(
          wallRight.clone().cross(wallUp.current).normalize(),
          goF,
        );
        if (wMove.lengthSq() > 1e-6) wMove.normalize();
        wMove.multiplyScalar(WALL_WALK_SPEED);
        wMove.addScaledVector(wallUp.current, -WALL_STICK);
        ref.current.setLinvel({ x: wMove.x, y: wMove.y, z: wMove.z }, true);
        return;
      }
      if (flying.current) {
        if (flyTarget.current !== null) {
          // Ease toward the altitude the last double-tap asked for, then hold
          // it: flight is level cruising, not a climb you have to trim.
          const gap = flyTarget.current - body.y;
          vertical = THREE.MathUtils.clamp(
            gap * 4,
            -FLY_CLIMB_SPEED,
            FLY_CLIMB_SPEED,
          );
        } else {
          vertical = (+(jump || false) - +(crouch || false)) * FLY_SPEED;
        }
      }

      ref.current.setLinvel({ x: vx, y: vertical, z: vz }, true);
    }

    // JUMPING. Rising-edge triggered now that a second jump exists: holding
    // Space used to re-fire on every grounded frame, which would spend the
    // double jump instantly.
    const gestureJump = gesture.consumeJump();
    const wantJump = jump || gestureJump;
    const pressedJump = wantJump && !jumpWasDown.current;
    jumpWasDown.current = wantJump;

    // BUTTERFLY: two quick taps of jump lift you to a hover, and every
    // further double-tap adds another step of height. Switching the power
    // off clears the target, so gravity simply takes you back down.
    if (pressedJump && canFly) {
      const nowMs = state.clock.elapsedTime * 1000;
      if (nowMs - lastJumpTap.current < DOUBLE_TAP_MS) {
        flyTarget.current = (flyTarget.current ?? body.y) + FLY_STEP;
        lastJumpTap.current = 0;
      } else {
        lastJumpTap.current = nowMs;
      }
    }
    if (!canFly) flyTarget.current = null;

    // Ignore "grounded" briefly after a jump: the body is still touching the
    // floor on the next frame or two, which would otherwise refill the jumps.
    if (jumpLockout.current > 0) jumpLockout.current -= delta;
    if (grounded && jumpLockout.current <= 0) jumpsUsed.current = 0;

    // Footsteps are driven by distance covered rather than a timer: speed
    // powers quicken the cadence for free, and pushing into a wall stays
    // silent because the body isn't actually moving.
    const walkingBack = backward || gestureBack;
    const walkingFwd = forward || gestureForward;
    if (grounded && !flying.current && (walkingFwd || walkingBack || left || right)) {
      stepAccum.current += Math.hypot(velocity.x, velocity.z) * delta;
      if (stepAccum.current >= STEP_DISTANCE) {
        stepAccum.current = 0;
        playFootstep(walkingBack && !walkingFwd ? -1 : 1);
      }
    } else {
      // Land the next step promptly instead of part-way through a stride.
      stepAccum.current = STEP_DISTANCE * 0.7;
    }
    if (climbing || flying.current) jumpsUsed.current = 0;

    if (!orbiting && !flying.current && pressedJump && jumpsUsed.current < maxJumps) {
      jumpsUsed.current += 1;
      jumpLockout.current = JUMP_LOCKOUT;
      ref.current.setLinvel(
        { x: direction.x, y: JUMP_SPEED * jumpMultiplier, z: direction.z },
        true,
      );
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
      {/* Web strand. A unit-tall cylinder, scaled and aimed each frame. */}
      <mesh ref={webRef} visible={false} raycast={() => {}}>
        <cylinderGeometry args={[0.02, 0.02, 1, 5]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <group
        ref={axe}
        onPointerMissed={(e) => (axe.current.children[0].rotation.x = -0.5)}
      >
        <Axe position={[0.3, -0.35, 0.5]} />
      </group>
    </>
  );
}
