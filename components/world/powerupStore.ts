"use client";

import { create } from "zustand";

/** How much faster the boost makes you. Player SPEED is 5, so this is 9.5m/s. */
export const BOOST_MULTIPLIER = 1.9;
/** Seconds of boost per pickup. Long enough to cross the lawn, short enough
 *  that it's a dash rather than a new baseline. */
export const BOOST_SECONDS = 8;
/** Seconds before a taken powerup comes back. Unlike the stars these respawn:
 *  they're a repeatable tool, not a collectible to tick off. */
export const RESPAWN_SECONDS = 20;
/** How close you have to get. Matches the stars' pickup radius. */
export const PICKUP_RADIUS = 1.9;

export type BoostSpot = { id: string; pos: [number, number, number] };

/**
 * Placed by hand along the house's vertical route, and deliberately kept clear
 * of STAR_SPOTS so a single walk-through doesn't hoover up both. Heights match
 * the storey surfaces in houseData.ts: lawn 0, ground floor 1, balcony 5, roof 9.
 */
export const BOOST_SPOTS: BoostSpot[] = [
  { id: "lawn-east", pos: [6, 1.2, -10] },
  { id: "lawn-west", pos: [-8, 1.2, -12] },
  { id: "hallway", pos: [-6, 1.8, -24] },
  { id: "balcony", pos: [2, 5.8, -23] },
  { id: "roof", pos: [-6, 9.8, -24] },
];

type PowerupState = {
  /** Seconds of boost left, for the HUD. */
  remaining: number;
  active: boolean;
  /** Ids currently picked up and waiting to respawn. */
  taken: string[];
};

export const usePowerupStore = create<PowerupState>(() => ({
  remaining: 0,
  active: false,
  taken: [],
}));

/**
 * The authoritative state, mutated every frame by Powerups and read directly by
 * Player. Kept out of the store for the same reason as the flood: a value that
 * changes every frame shouldn't re-render React every frame. `publish` copies it
 * over only when something visible changes.
 */
export const powerupState = {
  remaining: 0,
  /** What Player multiplies its walk speed by. 1 when no boost is running. */
  multiplier: 1,
  /** id -> seconds until it comes back. */
  cooldowns: new Map<string, number>(),
};

export function publishPowerups() {
  const store = usePowerupStore.getState();
  const active = powerupState.remaining > 0;
  const taken = [...powerupState.cooldowns.keys()];
  const remainingChanged = Math.abs(store.remaining - powerupState.remaining) >= 0.1;
  const activeChanged = store.active !== active;
  const takenChanged =
    store.taken.length !== taken.length ||
    taken.some((id) => !store.taken.includes(id));
  if (!remainingChanged && !activeChanged && !takenChanged) return;
  usePowerupStore.setState({ remaining: powerupState.remaining, active, taken });
}

export function resetPowerups() {
  powerupState.remaining = 0;
  powerupState.multiplier = 1;
  powerupState.cooldowns.clear();
  usePowerupStore.setState({ remaining: 0, active: false, taken: [] });
}
