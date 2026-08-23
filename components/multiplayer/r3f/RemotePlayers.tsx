"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { applyRemoteEdit } from "@/components/minecraft/Cube";
import { peerList } from "../core/peers";
import { connectWorldRoom } from "../net";

/**
 * Everyone else, drawn as a blocky seven-part figure with a walk cycle.
 *
 * NO PHYSICS, DELIBERATELY. Remote players get no collider and mount outside
 * <Physics>. Each client simulates only its own capsule, which is what keeps
 * this feature free of the authority, prediction and rollback machinery real
 * netcode needs. You can walk through another player; that is the trade.
 *
 * NO REACT STATE. Peer positions arrive ~10x a second per player and are read
 * here straight out of the module-global Map in core/peers.ts, from inside
 * useFrame. This component renders exactly once. See net.ts for why.
 *
 * ONE INSTANCED MESH PER BODY PART, not per player: seven draw calls total no
 * matter how many people are in the world, because every player's head is an
 * instance of the same mesh. Adding a player costs instances, not draw calls.
 */

/**
 * Instance capacity per part. The buffers are allocated once at this size and
 * `count` moves to match the live peer total, because resizing an InstancedMesh
 * means remounting it. Peers beyond this are dropped rather than overflowing.
 */
const MAX_PEERS = 16;

/**
 * The figure is built to the LOCAL player's real dimensions so an avatar is
 * exactly the size of the thing you are. From Player.tsx: EYE_HEIGHT is 1.25,
 * and CAPSULE_NORMAL puts the body centre 0.38 + ~0.183 = ~0.563 above the
 * feet. So relative to the position on the wire — which is the body centre —
 * the feet sit at -0.563 and the top of the head at +0.687, giving a 1.25 tall
 * figure whose eyes land at the other player's actual camera height.
 */
const FEET = -0.563;
const LEG = 0.45;
const TORSO = 0.48;
const HEAD = 0.32;

const HIP = FEET + LEG; // -0.113
const SHOULDER = HIP + TORSO; // 0.367

/** How far limbs swing at full walking speed, in radians. */
const MAX_SWING = 0.7;
/** Radians of stride phase per metre travelled. Tuned so the feet look planted. */
const STRIDE_PER_METRE = 3.4;
/** Speed at which the swing reaches MAX_SWING. Matches Player.tsx's SPEED of 5. */
const REFERENCE_SPEED = 5;
/** Easing on the measured speed, so a dropped packet doesn't stutter the legs. */
const SPEED_SMOOTHING = 8;

/**
 * How fast the drawn position catches up to the reported one, per second.
 * Applied as `1 - exp(-RATE * delta)` rather than a flat lerp factor so easing
 * is frame-rate independent — a bare `lerp(a, b, 0.2)` moves twice as far per
 * second at 120fps as at 60.
 */
const SMOOTHING_RATE = 14;

/**
 * Every part is a shade of the peer's one colour, so a player still reads as
 * "the orange one" at distance while the body still has readable parts up close.
 *
 * The tones are pulled apart deliberately. A first pass drew arms at the same
 * value as the torso and they vanished into its silhouette — the figure looked
 * like a slab with legs. Sleeves are now clearly darker than the shirt, and the
 * arms are set outboard by a hair so there is a seam as well as a tone change.
 */
type Shade = "skin" | "shirt" | "sleeve" | "trousers" | "visor";

const WHITE = new THREE.Color("#ffffff");

const SHADES: Record<Shade, (color: THREE.Color) => void> = {
  skin: (c) => c.lerp(WHITE, 0.38),
  shirt: () => {},
  sleeve: (c) => c.multiplyScalar(0.74),
  trousers: (c) => c.multiplyScalar(0.5),
  visor: (c) => c.multiplyScalar(0.22),
};

type Part = {
  /** Box dimensions. */
  size: [number, number, number];
  shade: Shade;
} & (
  | { /** Fixed offset from the body centre. */ offset: [number, number, number] }
  | {
      /** Point the limb rotates about — a shoulder or a hip. */
      pivot: [number, number, number];
      /** Which way this limb swings, so arms oppose legs on the same side. */
      swing: 1 | -1;
    }
);

/**
 * Front is -Z: yaw 0 means looking down -Z (three.js camera convention), and
 * Player.tsx derives the transmitted yaw from the camera's world direction to
 * match. So the visor sits at negative Z, on the front of the head.
 */
const RIG = {
  head: { size: [HEAD, HEAD, HEAD], offset: [0, SHOULDER + HEAD / 2, 0], shade: "skin" },
  // Thin dark band across the face. With a plain cube head, yaw is guesswork at
  // any distance; this is what makes "who is looking at me" readable.
  visor: { size: [0.22, 0.07, 0.02], offset: [0, SHOULDER + HEAD / 2 + 0.03, -HEAD / 2 - 0.01], shade: "visor" },
  torso: { size: [0.3, TORSO, 0.18], offset: [0, HIP + TORSO / 2, 0], shade: "shirt" },
  // x is 0.215, not 0.20: the torso's edge is at 0.15 and the arm's half-width
  // is 0.05, so this leaves a 0.015 gap. Flush arms read as one wide slab.
  armL: { size: [0.1, LEG, 0.1], pivot: [0.215, SHOULDER, 0], swing: 1, shade: "sleeve" },
  armR: { size: [0.1, LEG, 0.1], pivot: [-0.215, SHOULDER, 0], swing: -1, shade: "sleeve" },
  // Legs oppose the arm on the same side — that opposition is what reads as
  // walking rather than as marching.
  legL: { size: [0.12, LEG, 0.12], pivot: [0.075, HIP, 0], swing: -1, shade: "trousers" },
  legR: { size: [0.12, LEG, 0.12], pivot: [-0.075, HIP, 0], swing: 1, shade: "trousers" },
} satisfies Record<string, Part>;

type PartName = keyof typeof RIG;
const PART_NAMES = Object.keys(RIG) as PartName[];

// Scratch, reused every frame for every part of every peer. Allocating matrices
// in a 60fps loop is exactly the garbage that shows up as periodic hitching.
const rootMatrix = new THREE.Matrix4();
const localMatrix = new THREE.Matrix4();
const swingMatrix = new THREE.Matrix4();
const outMatrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const yawAxis = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
const baseColor = new THREE.Color();
const partColor = new THREE.Color();

/** Shortest signed angular distance, so a peer turning past ±π eases the short way round. */
function shortestAngleTo(from: number, to: number): number {
  return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

export function RemotePlayers() {
  // One ref per part, held in a single object so the frame loop can iterate.
  const meshes = useRef<Partial<Record<PartName, THREE.InstancedMesh | null>>>({});

  // Joining is an effect, not render work: it opens a socket. The cleanup leaves
  // the room, so navigating away removes this player from everyone else's world
  // immediately rather than on a presence timeout.
  useEffect(() => connectWorldRoom(applyRemoteEdit), []);

  useFrame((_, delta) => {
    const parts = meshes.current;
    if (PART_NAMES.some((name) => !parts[name])) return;

    // Clamped because a backgrounded tab resumes with a huge delta, and
    // `1 - exp(-14 * 3)` is indistinguishable from teleporting.
    const step = Math.min(delta, 0.1);
    const alpha = 1 - Math.exp(-SMOOTHING_RATE * step);

    let count = 0;
    for (const peer of peerList()) {
      if (count >= MAX_PEERS) break;
      const { drawn, gait } = peer;

      const fromX = drawn.x;
      const fromZ = drawn.z;
      drawn.x += (peer.x - drawn.x) * alpha;
      drawn.y += (peer.y - drawn.y) * alpha;
      drawn.z += (peer.z - drawn.z) * alpha;
      drawn.yaw += shortestAngleTo(drawn.yaw, peer.yaw) * alpha;

      // Speed is measured from the DRAWN position, not the reported one: the
      // drawn value is what the viewer actually sees move, so the feet stay in
      // step with the body even while interpolation is catching up.
      const travelled = Math.hypot(drawn.x - fromX, drawn.z - fromZ);
      const measured = step > 0 ? travelled / step : 0;
      gait.speed += (measured - gait.speed) * (1 - Math.exp(-SPEED_SMOOTHING * step));
      gait.phase += gait.speed * STRIDE_PER_METRE * step;

      // Amplitude scales with speed, so a standing player's limbs hang still
      // rather than idling through a walk cycle on the spot.
      const swing =
        Math.sin(gait.phase) *
        MAX_SWING *
        Math.min(gait.speed / REFERENCE_SPEED, 1);

      position.set(drawn.x, drawn.y, drawn.z);
      quaternion.setFromAxisAngle(yawAxis, drawn.yaw);
      rootMatrix.compose(position, quaternion, ONE);

      baseColor.set(peer.color);

      for (const name of PART_NAMES) {
        const part: Part = RIG[name];
        if ("offset" in part) {
          localMatrix.makeTranslation(...part.offset);
        } else {
          // Limbs rotate about the shoulder or hip, not their own centre — a
          // box rotated about its middle scissors through the torso instead of
          // swinging from it. Translate to the pivot, rotate, then drop half the
          // limb's length so it hangs below.
          localMatrix.makeTranslation(...part.pivot);
          swingMatrix.makeRotationX(swing * part.swing);
          localMatrix.multiply(swingMatrix);
          swingMatrix.makeTranslation(0, -part.size[1] / 2, 0);
          localMatrix.multiply(swingMatrix);
        }
        outMatrix.multiplyMatrices(rootMatrix, localMatrix);

        partColor.copy(baseColor);
        SHADES[part.shade](partColor);

        const mesh = parts[name]!;
        mesh.setMatrixAt(count, outMatrix);
        mesh.setColorAt(count, partColor);
      }
      count++;
    }

    for (const name of PART_NAMES) {
      const mesh = parts[name]!;
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      // `setColorAt` creates the attribute on first use, so this cannot be hoisted.
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      {PART_NAMES.map((name) => {
        const part: Part = RIG[name];
        return (
          <instancedMesh
            key={name}
            ref={(mesh) => {
              meshes.current[name] = mesh;
            }}
            args={[undefined, undefined, MAX_PEERS]}
            // The bounding volume is computed at construction, when every
            // instance is still at the origin, so culling would make avatars
            // vanish the moment they moved.
            frustumCulled={false}
            castShadow
          >
            <boxGeometry args={part.size} />
            {/* White base so the per-instance colour comes through as authored —
                same reason as the cube mesh in Cube.tsx. */}
            <meshStandardMaterial roughness={0.65} metalness={0} />
          </instancedMesh>
        );
      })}
    </>
  );
}
