"use client";

import { useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { armedPeerCount, peerById } from "@/components/multiplayer/core/peers";
import { PVP_DAMAGE } from "@/components/multiplayer/core/protocol";
import { publishTag, selfPeerId, setCombatListener } from "@/components/multiplayer/net";
import {
  RIVAL_BOLT,
  playHurtSound,
  playLaserSound,
  playTagSound,
  spawnBolt,
  spawnSparks,
} from "./laser-fx";
import {
  creditPeerTag,
  damageFromPeer,
  publishLaserTag,
  useLaserTagStore,
} from "./laserTagStore";

/**
 * The receiving half of player-versus-player fire: other people's bolts, the
 * damage they do to you, and the acknowledgement that scores their tag.
 *
 * WHY THE VICTIM DECIDES. A shot message says who the shooter THINKS it hit;
 * the hit is only real once the target's own client agrees and takes the damage.
 * That is not a trust decision, it is the same rule the rest of this feature
 * already runs on — each client simulates only its own capsule (see
 * RemotePlayers) — extended to health. It also makes the awkward cases fall out
 * for free: a player who has left, gone back to the setup card, or switched
 * modes simply never agrees, so nothing has to be undone.
 *
 * Mounted only while a round is live, which is what makes the listener's
 * presence the flag for "somebody here cares about shots". With no Laser Tag
 * mode open, net.ts drops shot messages without decoding them.
 */

/**
 * Beyond this, another player's shot is drawn but not heard. Every player fires
 * ~5 times a second; without a distance gate a busy room is a solid wall of
 * laser noise, and the one sound that matters — someone shooting near YOU —
 * would be the one you cannot pick out.
 */
const HEAR_RANGE = 28;

/** How often the armed-peer count is refreshed. It only drives whether the HUD
 *  shows a PvP line, so twice a second is more than responsive enough, and it
 *  keeps a React state write off the frame path. */
const PEER_POLL_SECONDS = 0.5;

/**
 * Module-level rather than a ref: there is one Laser Tag mode, this component is
 * a singleton within it, and the timer is throwaway state that nothing else
 * reads. Same reasoning as the FX pools in laser-fx.
 */
let pollTimer = PEER_POLL_SECONDS;

const from = new THREE.Vector3();
const to = new THREE.Vector3();
const awayFromShooter = new THREE.Vector3();

export function PeerCombat() {
  const camera = useThree((state) => state.camera);

  useEffect(
    () =>
      setCombatListener({
        onShot: (op, fromPeerId) => {
          const shooter = fromPeerId ? peerById(fromPeerId) : undefined;
          from.set(op.from[0], op.from[1], op.from[2]);
          to.set(op.to[0], op.to[1], op.to[2]);

          // Drawn in the shooter's own avatar colour, so a bolt tells you who
          // is firing before you have turned round to look.
          spawnBolt(from, to, shooter?.color ?? RIVAL_BOLT);
          if (from.distanceTo(camera.position) < HEAR_RANGE) playLaserSound();

          const self = selfPeerId();
          if (!self || op.targetId !== self) return;
          // A shot can arrive a beat after the round ended, or after backing out
          // to the setup card — presence takes a moment to say so. `damagePlayer`
          // already refuses once the round is decided; this makes the whole
          // window explicit rather than relying on that.
          if (useLaserTagStore.getState().phase !== "hunting") return;
          // No shooter to credit means presence has not caught up with them.
          // Taking the damage anyway would be a hit nobody scored, which reads
          // as health draining for no reason.
          if (!fromPeerId) return;

          // Sparks at the eye, the same cue the bots use for "that one hit you".
          awayFromShooter.subVectors(camera.position, from).normalize();
          spawnSparks(camera.position, awayFromShooter, shooter?.color ?? RIVAL_BOLT);
          const down = damageFromPeer(PVP_DAMAGE, shooter?.color ?? null);
          playHurtSound();
          // Tell the shooter it landed. This is what turns their guess into a
          // score, and the only place a takedown is ever confirmed.
          publishTag({ shooterId: fromPeerId, down });
          publishLaserTag();
        },

        onTag: (op) => {
          const self = selfPeerId();
          // Broadcast to the room, meaningful only to the credited shooter.
          if (!self || op.shooterId !== self) return;
          if (!op.down) return;
          creditPeerTag();
          playTagSound();
          publishLaserTag();
        },
      }),
    [camera],
  );

  // Reported as a count rather than a list because that is all the HUD needs,
  // and a list would mean a new array in React state twice a second forever.
  useFrame((_, delta) => {
    pollTimer += delta;
    if (pollTimer < PEER_POLL_SECONDS) return;
    pollTimer = 0;
    useLaserTagStore.getState().setArmedPeers(armedPeerCount());
  });

  return null;
}
