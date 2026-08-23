"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { applyRemoteEdit } from "@/components/minecraft/Cube";
import { peerList } from "../core/peers";
import { connectWorldRoom } from "../net";

/**
 * Everyone else, drawn as two instanced meshes and nothing else.
 *
 * NO PHYSICS, DELIBERATELY. Remote players are visual only — they get no
 * collider and are mounted outside <Physics>. Each client simulates just its own
 * capsule, which is what keeps this whole feature free of the authority,
 * prediction and rollback machinery real netcode needs. You can walk through
 * another player; that is the trade, and for a sandbox it is the right one.
 *
 * NO REACT STATE. Peer positions arrive ~10x a second per player and are read
 * here straight out of the module-global Map in core/peers.ts, from inside
 * useFrame. This component renders exactly once. See net.ts for why.
 */

/**
 * Instance capacity. The buffer is allocated once at this size and `count` is
 * moved to match the live peer total, because resizing an InstancedMesh means
 * remounting it. Sixteen is far past what a booth demo will see; peers beyond it
 * are dropped rather than crashing the buffer.
 */
const MAX_PEERS = 16;

/**
 * Body proportions, matched to the local player's capsule (Player.tsx:
 * CAPSULE_NORMAL is [0.38 halfHeight, ~0.18 radius]) so an avatar is the same
 * size as the thing you are. Deliberately NOT square in plan — 0.40 wide by 0.28
 * deep — because a square body gives yaw nothing to show and every player would
 * look like they were facing you.
 */
const BODY = { width: 0.4, height: 1.1, depth: 0.28 } as const;
/** Nose block: small, forward, at head height. The other half of "which way are they looking". */
const NOSE = { size: 0.12, forward: 0.2, up: 0.34 } as const;

/**
 * How fast the drawn position catches up to the reported one, per second.
 * Applied as `1 - exp(-RATE * delta)` rather than a flat lerp factor so the
 * easing is frame-rate independent — a bare `lerp(a, b, 0.2)` moves twice as far
 * per second at 120fps as at 60.
 */
const SMOOTHING_RATE = 14;

const dummy = new THREE.Object3D();
const tint = new THREE.Color();

/** Shortest signed angular distance, so a peer turning past ±π eases the short way round. */
function shortestAngleTo(from: number, to: number): number {
  return ((to - from + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

export function RemotePlayers() {
  const bodyRef = useRef<THREE.InstancedMesh>(null);
  const noseRef = useRef<THREE.InstancedMesh>(null);

  // Joining is an effect, not render work: it opens a socket. The cleanup
  // leaves the room, so a navigation away removes this player from everyone
  // else's world immediately rather than on a presence timeout.
  useEffect(() => connectWorldRoom(applyRemoteEdit), []);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    const nose = noseRef.current;
    if (!body || !nose) return;

    // Clamped because a tab that was backgrounded resumes with a huge delta,
    // and `1 - exp(-14 * 3)` is indistinguishable from teleporting.
    const alpha = 1 - Math.exp(-SMOOTHING_RATE * Math.min(delta, 0.1));

    let count = 0;
    for (const peer of peerList()) {
      if (count >= MAX_PEERS) break;
      const drawn = peer.drawn;
      drawn.x += (peer.x - drawn.x) * alpha;
      drawn.y += (peer.y - drawn.y) * alpha;
      drawn.z += (peer.z - drawn.z) * alpha;
      drawn.yaw += shortestAngleTo(drawn.yaw, peer.yaw) * alpha;

      tint.set(peer.color);

      dummy.position.set(drawn.x, drawn.y, drawn.z);
      dummy.rotation.set(0, drawn.yaw, 0);
      dummy.updateMatrix();
      body.setMatrixAt(count, dummy.matrix);
      body.setColorAt(count, tint);

      // Camera yaw 0 looks down -Z (three.js convention), so the nose is offset
      // along -Z in the body's local frame and carried around by the same yaw.
      dummy.translateZ(-NOSE.forward);
      dummy.position.y += NOSE.up;
      dummy.updateMatrix();
      nose.setMatrixAt(count, dummy.matrix);
      nose.setColorAt(count, tint);

      count++;
    }

    for (const mesh of [body, nose]) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      // `setColorAt` creates the attribute on first use, so this cannot be hoisted.
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  });

  return (
    <>
      {/* frustumCulled off: the bounding volume is computed from the instance
          matrices at construction, when every instance is still at the origin,
          so culling would make avatars vanish as soon as they moved. */}
      <instancedMesh
        ref={bodyRef}
        args={[undefined, undefined, MAX_PEERS]}
        frustumCulled={false}
        castShadow
      >
        <boxGeometry args={[BODY.width, BODY.height, BODY.depth]} />
        {/* White base so the per-instance colour comes through as authored —
            same reason as the cube mesh in Cube.tsx. */}
        <meshStandardMaterial roughness={0.6} metalness={0} />
      </instancedMesh>
      <instancedMesh
        ref={noseRef}
        args={[undefined, undefined, MAX_PEERS]}
        frustumCulled={false}
      >
        <boxGeometry args={[NOSE.size, NOSE.size, NOSE.size]} />
        <meshStandardMaterial roughness={0.4} metalness={0} />
      </instancedMesh>
    </>
  );
}
