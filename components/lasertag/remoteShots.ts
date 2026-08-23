"use client";

import * as THREE from "three";
import { playerOrigin } from "@/components/minecraft/player-origin";
import type { ShotOp } from "@/components/multiplayer/core/protocol";
import { playLaserSound, spawnBolt, spawnSparks } from "./laser-fx";
import { laserTagState } from "./laserTagStore";

/**
 * Somebody else's laser, drawn in this tab.
 *
 * The receiving half of the `shot` topic. Deliberately a plain function rather
 * than a component or a store: it feeds the same module-level pools in
 * laser-fx.tsx that the local gun and the bots feed, so a remote shot costs a
 * push into an array and React never learns it happened. This is the peer to
 * `applyRemoteEdit` in Cube.tsx, and it sits here rather than in
 * components/multiplayer for the same reason the bots do — the FX pools belong
 * to the mode, and the network layer stays free of renderer types.
 */

/**
 * Tint for a bolt from a peer whose presence has not arrived yet. Warm like the
 * bots' ENEMY_BOLT rather than violet like your own gun: an unattributed bolt is
 * still incoming fire, and mistaking it for your own for a frame is worse than
 * mistaking it for a bot's.
 */
export const UNKNOWN_PEER_BOLT = "#ff9f6b";

/**
 * Past this many world units a peer's shot is silent — still drawn, because a
 * bolt across the arena is exactly the thing worth seeing, just not worth
 * hearing. Comfortably beyond LaserTag's MAX_RANGE of 45, so a shot fired at
 * you is always audible.
 */
const AUDIBLE_RANGE = 60;

const from = new THREE.Vector3();
const to = new THREE.Vector3();
const normal = new THREE.Vector3();

export function applyRemoteShot(op: ShotOp, color: string | null): void {
  // Nothing to draw into unless this tab is in Laser Tag: <LaserFx/> mounts with
  // the mode, so the pools are unmounted everywhere else and a bolt pushed now
  // would sit at full life until the next round cleared it. The consequence is
  // worth stating plainly — both players have to be in the mode to see each
  // other's fire. Mounting the pools globally would make a stray bolt appear
  // mid-build in Minecraft mode, which is a worse trade.
  if (!laserTagState.active) return;

  from.set(op.from[0], op.from[1], op.from[2]);
  to.set(op.to[0], op.to[1], op.to[2]);

  const tint = color ?? UNKNOWN_PEER_BOLT;
  spawnBolt(from, to, tint);

  if (op.hit) {
    // No normal on the wire: the shooter's surface normal is a hit-test detail
    // that costs three more numbers per shot and buys almost nothing here.
    // Scattering back along the bolt is what Bots.tsx already does for a hit on
    // the player, and at eight particles for a quarter of a second the
    // difference is invisible.
    normal.subVectors(from, to).normalize();
    // Sparks in the shooter's colour too, not the surface's: the whole point of
    // this feature is reading who is shooting where, and the scorch mark is a
    // longer-lived clue than the bolt itself.
    spawnSparks(to, normal, tint);
  }

  // Measured to the muzzle, not the impact: the sound is a gun going off, and
  // it goes off where the shooter is standing.
  const distance = playerOrigin.distanceTo(from);
  if (distance >= AUDIBLE_RANGE) return;
  // Linear falloff, squared. Inverse-square is the physical answer and sounds
  // wrong here — it makes anything past a few metres inaudible while leaving a
  // point-blank shot louder than your own gun.
  const falloff = 1 - distance / AUDIBLE_RANGE;
  playLaserSound(falloff * falloff);
}
