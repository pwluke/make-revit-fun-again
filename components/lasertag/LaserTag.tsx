"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useGestureStore } from "@/components/gesture/store";
import { pickPeerHit } from "@/components/multiplayer/core/hitbox";
import { peerById, peerList } from "@/components/multiplayer/core/peers";
import { publishShot, setSelfArmed } from "@/components/multiplayer/net";
import { floodState, useFloodStore } from "@/components/world/floodStore";
import { ALERT_RADIUS, Bots, spookBots } from "./Bots";
import { useBotArena } from "./botArena";
import { Inspector } from "./Inspector";
import { DebugArena } from "./DebugArena";
import { PeerCombat } from "./PeerCombat";
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
  landPeerHit,
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
/** Reused per shot for the wire payload, so a held trigger allocates nothing. */
const shotFrom: [number, number, number] = [0, 0, 0];
const shotTo: [number, number, number] = [0, 0, 0];

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
    /** One shot, wherever the trigger came from. */
    const fire = () => {
      if (laserTagState.finished) return;
      const now = performance.now() / 1000;
      if (now - lastShot.current < FIRE_COOLDOWN) return;
      lastShot.current = now;
      shoot();
    };

    const onPointerDown = (event: PointerEvent) => {
      // Listen on the document, not the canvas: drei's PointerLockControls locks
      // r3f's event target, and a locked element receives mouse events itself
      // rather than passing them to its descendants. Any held lock means the
      // scene owns the mouse. This also skips the first click, the one that
      // grabs the lock, which shouldn't fire a shot.
      if (!document.pointerLockElement) return;
      if (event.button !== 0) return;
      // A decided round stops taking shots — otherwise the win card's shot
      // count would keep climbing behind it. `fire` owns that check and the
      // cooldown, so the mouse and the gesture cannot drift apart.
      fire();
    };

    /** The shot itself, extracted so both triggers run the same code. */
    function shoot() {
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

      // Other players are tested separately from the scene, because their
      // avatars are instanced meshes a raycast cannot be trusted against — see
      // the header of core/hitbox.ts. Bounded by the distance to whatever
      // scenery the ray already found, so nobody is shot through a wall.
      const peerHit = pickPeerHit(
        camera.position,
        forward,
        MIN_REACH,
        hit ? hit.distance : MAX_RANGE,
        peerList(),
      );

      // Whoever is nearer wins the shot, so a player stepping into your line of
      // fire takes the hit meant for the bot behind them.
      const hitPeer =
        peerHit && (!hit || peerHit.distance < hit.distance) ? peerHit : null;

      if (hitPeer) {
        impact.copy(camera.position).addScaledVector(forward, hitPeer.distance);
      } else if (hit) {
        impact.copy(hit.point);
      } else {
        impact.copy(camera.position).addScaledVector(forward, MAX_RANGE);
      }
      spawnBolt(muzzle, impact);
      playLaserSound();

      const botId = hitPeer
        ? undefined
        : (hit?.object.userData.laserBotId as string | undefined);

      if (hitPeer) {
        // No face to work from — the hitbox is a plain box test — so scatter the
        // sparks back along the shot, which is where a body would throw them.
        surfaceNormal.copy(forward).negate();
        spawnSparks(impact, surfaceNormal, peerById(hitPeer.id)?.color ?? LASER_TINT);
      } else if (hit) {
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
      // Counted here rather than on the victim's acknowledgement, so the hit
      // counter answers the trigger immediately. The takedown itself is only
      // ever scored from that acknowledgement — see PeerCombat.
      if (hitPeer) landPeerHit();

      // Tell the room. Misses go out too: a bolt everyone can see is what makes
      // another player's fire something you can react to rather than a number
      // that appears on your HUD.
      shotFrom[0] = muzzle.x;
      shotFrom[1] = muzzle.y;
      shotFrom[2] = muzzle.z;
      shotTo[0] = impact.x;
      shotTo[1] = impact.y;
      shotTo[2] = impact.z;
      publishShot({ targetId: hitPeer?.id ?? "", from: shotFrom, to: shotTo });

      // A miss still spooks anything nearby — that is what makes bots flee
      // visibly even when one hit is enough to tag them.
      spookBots(impact, ALERT_RADIUS);
      publishLaserTag();
    }

    // The fist gesture is the trigger in Laser Tag. GestureTracker queues the
    // same action that breaks blocks elsewhere; Cube.tsx already ignores it
    // while a round is live, so the two never both fire.
    let raf = 0;
    const pollGesture = () => {
      raf = requestAnimationFrame(pollGesture);
      const gesture = useGestureStore.getState();
      if (gesture.status !== "on") return;
      if (gesture.consumeBreak()) fire();
    };
    raf = requestAnimationFrame(pollGesture);

    const onContextMenu = (event: MouseEvent) => {
      if (document.pointerLockElement) event.preventDefault();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      cancelAnimationFrame(raf);
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
  const setBossPresent = useLaserTagStore((s) => s.setBossPresent);
  const phase = useLaserTagStore((s) => s.phase);
  const config = useLaserTagStore((s) => s.config);
  const { roam, cells, spots, roof } = useBotArena(roundToken, config.botCount);
  const playing = phase !== "setup";
  /**
   * A round in progress, as opposed to one that is over but still showing its
   * end card. This — not `playing` — is when PvP applies: once you have won or
   * been scanned, you can neither be shot nor score, so nobody spends the
   * post-round card taking damage they cannot answer.
   */
  const live = phase === "hunting";

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

  /**
   * Tell the room whether this player is a target. Presence-backed, so the
   * SHOOTER's client can tell a player mid-round apart from one reading the
   * setup card or building in another mode — see the `armed` field in
   * instant.schema.ts.
   */
  useEffect(() => {
    setSelfArmed(live);
    return () => setSelfArmed(false);
  }, [live]);

  // A new round starts from dry land, however long the previous one ran.
  useEffect(() => {
    useFloodStore.getState().reset();
    clearLaserFx();
  }, [roundToken]);

  // The ten voxel layers land after mount, so the arena — and with it the bot
  // count — is empty for the first moment. Same reason Stars tracks its total.
  // Only while playing: a stale total from the last round would let the setup
  // card's win check fire before any bot exists.
  // The Inspector counts toward the total, so the round is not won until the
  // roof is clear too — the same check in publishLaserTag, no special case.
  useEffect(() => {
    setBossPresent(roof != null);
    if (playing) setTotal(spots.length + (roof ? 1 : 0));
  }, [playing, spots.length, roof, setTotal, setBossPresent]);

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
          {/* After <Bots/>, deliberately: r3f runs frame callbacks in
              subscription order, and the Inspector only fills in the HUD's
              nearest-target hint once Bots has left it empty. */}
          {roof ? (
            <Inspector
              roof={roof}
              returnFire={config.returnFire}
              difficulty={config.difficulty}
            />
          ) : null}
          <LaserRig />
          {/* Incoming fire from other players, and the acknowledgement that
              scores their tags. Mounted with the gun rather than with the scene
              because its presence is what tells net.ts anybody here is playing:
              with no round open, shot messages are dropped undecoded. */}
          <PeerCombat />
        </>
      ) : null}
      <LaserFx />
      <DebugArena cells={cells} />
    </>
  );
}
