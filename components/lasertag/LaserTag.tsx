"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { floodState, useFloodStore } from "@/components/world/floodStore";
import { ALERT_RADIUS, Bots, spookBots } from "./Bots";
import { useBotArena } from "./botArena";
import { DebugArena } from "./DebugArena";
import { LASER_TINT, LaserGun, MUZZLE_OFFSET } from "./LaserGun";
import {
  LaserFx,
  clearLaserFx,
  playLaserSound,
  playTagSound,
  spawnBolt,
  spawnSparks,
} from "./laser-fx";
import {
  landHit,
  laserTagState,
  publishLaserTag,
  registerShot,
  useLaserTagStore,
} from "./laserTagStore";

/** How far in front of the camera the gun rides. Matches the axe. */
const GUN_DISTANCE = 1;
/**
 * Anything closer than this is the gun in your own hand. Same value and same
 * reason as GestureBuilder's MIN_REACH — a held model floats ~1m out, and a
 * pick that starts at zero hits it every time.
 */
const MIN_REACH = 1.6;
const MAX_RANGE = 45;
/** ~5 shots a second held down. */
const FIRE_COOLDOWN = 0.18;
const RECOIL_KICK = -0.35;
const RECOIL_RECOVER = 0.18;

/** Pointer lock freezes the mouse, so every shot is from the screen centre —
 *  i.e. the crosshair the page draws over the canvas. */
const CROSSHAIR = new THREE.Vector2(0, 0);

const forward = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const impact = new THREE.Vector3();
const surfaceNormal = new THREE.Vector3();

/** The gun, glued to the camera, plus the fire handler. */
function LaserRig() {
  const rig = useRef<THREE.Group>(null);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const lastShot = useRef(0);
  const recoil = useRef(0);

  /**
   * A private raycaster. Setting `far` on the one from useThree would silently
   * clamp r3f's own pointer-event system too — the trap Cube.tsx documents.
   */
  const picker = useMemo(() => {
    const raycaster = new THREE.Raycaster();
    raycaster.far = MAX_RANGE;
    return raycaster;
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      // Listen on the document, not the canvas: drei's PointerLockControls locks
      // r3f's event target, and a locked element receives mouse events itself
      // rather than passing them to its descendants. Any held lock means the
      // scene owns the mouse. This also skips the first click, the one that
      // grabs the lock, which shouldn't fire a shot.
      if (!document.pointerLockElement) return;
      if (event.button !== 0) return;
      // A decided round stops taking shots — otherwise the win card's shot
      // count would keep climbing behind it.
      if (laserTagState.finished) return;
      const now = performance.now() / 1000;
      if (now - lastShot.current < FIRE_COOLDOWN) return;
      lastShot.current = now;

      registerShot();
      recoil.current = RECOIL_KICK;

      camera.getWorldDirection(forward);
      // Start the bolt at the barrel, not the eye, or it reads as a laser
      // fired out of your forehead.
      muzzle
        .set(MUZZLE_OFFSET[0], MUZZLE_OFFSET[1], MUZZLE_OFFSET[2])
        .applyQuaternion(camera.quaternion)
        .add(camera.position);

      picker.setFromCamera(CROSSHAIR, camera);
      // Whole scene, not just the bots: this is what buys occlusion for free.
      // Walls and massing stop a shot, so you have to get an angle rather than
      // shooting through the building. Rapier can't help here — its colliders
      // only exist within 4 units of the player.
      const hit = picker
        .intersectObjects(scene.children, true)
        .find(
          (candidate) =>
            candidate.distance > MIN_REACH &&
            (candidate.object as THREE.Mesh).isMesh,
        );

      if (hit) {
        impact.copy(hit.point);
      } else {
        impact.copy(camera.position).addScaledVector(forward, MAX_RANGE);
      }
      spawnBolt(muzzle, impact);
      playLaserSound();

      const botId = hit?.object.userData.laserBotId as string | undefined;
      if (hit) {
        if (hit.face) {
          // Face normals are in the hit object's local space, and a bot's group
          // is yawed — so take it to world space rather than using it raw. It
          // already points back toward the shooter, so no flip.
          surfaceNormal
            .copy(hit.face.normal)
            .transformDirection(hit.object.matrixWorld);
        } else {
          surfaceNormal.copy(forward).negate();
        }
        spawnSparks(impact, surfaceNormal, botId ? LASER_TINT : "#f4c7a1");
      }

      if (botId && landHit(botId)) playTagSound();
      // A miss still spooks anything nearby — that is what makes bots flee
      // visibly even when one hit is enough to tag them.
      spookBots(impact, ALERT_RADIUS);
      publishLaserTag();
    };

    const onContextMenu = (event: MouseEvent) => {
      if (document.pointerLockElement) event.preventDefault();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [camera, picker, scene]);

  useFrame((state, delta) => {
    const group = rig.current;
    if (!group) return;
    const pivot = group.children[0];
    if (pivot) {
      // Ease the recoil kick back to rest.
      recoil.current = THREE.MathUtils.lerp(
        recoil.current,
        0,
        Math.min(1, delta / RECOIL_RECOVER),
      );
      pivot.rotation.x = recoil.current;
    }
    group.rotation.copy(state.camera.rotation);
    group.position
      .copy(state.camera.position)
      .add(state.camera.getWorldDirection(forward).multiplyScalar(GUN_DISTANCE));
  });

  return (
    <group ref={rig}>
      {/* Child 0 is the recoil pivot, matching Player's axe rig convention. */}
      <group>
        <LaserGun position={MUZZLE_OFFSET} />
      </group>
    </group>
  );
}

/**
 * Laser Tag Scan. Mounted into MinecraftScene's add-on slot only while the mode
 * is selected, so the arena, the player and the physics world are all the ones
 * the other modes already use — this adds five bots, a gun and two FX pools.
 */
export function LaserTag() {
  const roundToken = useLaserTagStore((s) => s.roundToken);
  const setTotal = useLaserTagStore((s) => s.setTotal);
  const phase = useLaserTagStore((s) => s.phase);
  const config = useLaserTagStore((s) => s.config);
  const { roam, cells, spots } = useBotArena(roundToken, config.botCount);
  const playing = phase !== "setup";

  // Claim the shared world for the duration. `active` gates the voxel-breaking
  // in Cube.tsx and the axe in Player.tsx; pausing the flood keeps the water
  // from swallowing the bots and intercepting shots mid-round.
  useLayoutEffect(() => {
    laserTagState.active = true;
    floodState.paused = true;
    // Entering the mode always asks for the options again, rather than dropping
    // you into whatever the last round was set to.
    useLaserTagStore.getState().backToSetup();
    clearLaserFx();
    return () => {
      laserTagState.active = false;
      floodState.paused = false;
      clearLaserFx();
    };
  }, []);

  // A new round starts from dry land, however long the previous one ran.
  useEffect(() => {
    useFloodStore.getState().reset();
    clearLaserFx();
  }, [roundToken]);

  // The ten voxel layers land after mount, so the arena — and with it the bot
  // count — is empty for the first moment. Same reason Stars tracks its total.
  // Only while playing: a stale total from the last round would let the setup
  // card's win check fire before any bot exists.
  useEffect(() => {
    if (playing) setTotal(spots.length);
  }, [playing, spots.length, setTotal]);

  return (
    <>
      {/* Nothing but the arena exists during setup — no bots to shoot at you
          while you are still reading the options, and no gun in frame. */}
      {playing ? (
        <>
          <Bots
            spots={spots}
            roam={roam}
            returnFire={config.returnFire}
            difficulty={config.difficulty}
          />
          <LaserRig />
        </>
      ) : null}
      <LaserFx />
      <DebugArena cells={cells} />
    </>
  );
}
