"use client";

import { create } from "zustand";

/** Seconds before a taken powerup comes back. They're repeatable tools, not
 *  collectibles to tick off. */
export const RESPAWN_SECONDS = 20;
/** How close you have to get. Matches the stars' pickup radius. */
export const PICKUP_RADIUS = 1.9;

export type PowerupKind =
  | "speed"
  | "doubleJump"
  | "tiny"
  | "monkey"
  | "fly"
  | "slow";

export type PowerupDef = {
  label: string;
  /** Shown in the HUD chip — cheaper and clearer than authoring six icons. */
  icon: string;
  blurb: string;
  seconds: number;
  color: string;
  emissive: string;
  /** Slow is the odd one out: a trap, not a prize. The HUD colours it as a
   *  warning so it doesn't read as a reward you failed to notice. */
  trap?: boolean;
};

export const POWERUPS: Record<PowerupKind, PowerupDef> = {
  speed: {
    label: "Speed",
    icon: "⚡",
    blurb: "Run 1.9× faster",
    seconds: 8,
    color: "#67e8f9",
    emissive: "#06b6d4",
  },
  doubleJump: {
    label: "Double jump",
    icon: "⏫",
    blurb: "One extra jump in mid-air",
    seconds: 15,
    color: "#bef264",
    emissive: "#65a30d",
  },
  tiny: {
    label: "Tiny",
    icon: "🐜",
    blurb: "Shrink — fit through gaps",
    seconds: 12,
    color: "#d8b4fe",
    emissive: "#7c3aed",
  },
  monkey: {
    label: "Monkey",
    icon: "🐒",
    blurb: "Climb walls you walk into",
    seconds: 12,
    color: "#fdba74",
    emissive: "#ea580c",
  },
  fly: {
    label: "Fly",
    icon: "🕊️",
    blurb: "Space to rise, Shift to drop",
    seconds: 10,
    color: "#bae6fd",
    emissive: "#0284c7",
  },
  slow: {
    label: "Sludge",
    icon: "🐌",
    blurb: "Slowed to 0.45× — bad luck",
    seconds: 6,
    color: "#94a3b8",
    emissive: "#475569",
    trap: true,
  },
};

export const SPEED_MULTIPLIER = 1.9;
export const SLOW_MULTIPLIER = 0.45;

export type PowerupSpot = {
  id: string;
  kind: PowerupKind;
  pos: [number, number, number];
};

/**
 * Placed by hand and kept clear of STAR_SPOTS so a single walk-through doesn't
 * hoover up both. Heights match the storey surfaces in houseData.ts: lawn 0,
 * ground floor 1, balcony 5, roof 9.
 *
 * Placement is part of the design rather than decoration: monkey sits at the
 * foot of a wall, fly out in the open where there's headroom, and the two traps
 * sit on the open lawn lines you'd naturally sprint along.
 */
export const POWERUP_SPOTS: PowerupSpot[] = [
  { id: "lawn-east", kind: "speed", pos: [6, 1.2, -10] },
  { id: "roof", kind: "speed", pos: [-6, 9.8, -24] },
  { id: "lawn-west", kind: "doubleJump", pos: [-8, 1.2, -12] },
  { id: "balcony", kind: "doubleJump", pos: [2, 5.8, -23] },
  { id: "hallway", kind: "tiny", pos: [-6, 1.8, -24] },
  { id: "wallfoot", kind: "monkey", pos: [9, 1.2, -24] },
  { id: "openfield", kind: "fly", pos: [12, 1.2, -18] },
  { id: "lawn-trap", kind: "slow", pos: [3, 1.2, -16] },
  { id: "west-trap", kind: "slow", pos: [-11, 1.2, -20] },
];

type PowerupStore = {
  kind: PowerupKind | null;
  remaining: number;
  /** Ids currently picked up and waiting to respawn. */
  taken: string[];
  /** Mirrored into the store because Player needs it during *render* — it swaps
   *  the collider size — unlike the other effects, read in the frame loop. */
  tiny: boolean;
};

export const usePowerupStore = create<PowerupStore>(() => ({
  kind: null,
  remaining: 0,
  taken: [],
  tiny: false,
}));

/**
 * The authoritative state, mutated every frame by Powerups and read directly by
 * Player. Kept out of the store because a value that changes every frame
 * shouldn't re-render React every frame; `publish` copies across only what the
 * HUD shows.
 *
 * Only one powerup runs at a time — a new pickup replaces the active one — so
 * this is a single kind plus its derived effects rather than a set of timers.
 */
export const powerupState = {
  kind: null as PowerupKind | null,
  remaining: 0,
  /** What Player multiplies walk speed by. */
  speedMultiplier: 1,
  /** Jumps allowed before touching the ground again. */
  maxJumps: 1,
  tiny: false,
  climb: false,
  fly: false,
  /** id -> seconds until it comes back. */
  cooldowns: new Map<string, number>(),
};

/** Recompute the derived effects. Kept in one place so a newly added kind can't
 *  half-apply itself — every effect is set on every transition, including back
 *  to the defaults when it expires. */
export function applyPowerup(kind: PowerupKind | null) {
  powerupState.kind = kind;
  powerupState.remaining = kind ? POWERUPS[kind].seconds : 0;
  powerupState.speedMultiplier =
    kind === "speed" ? SPEED_MULTIPLIER : kind === "slow" ? SLOW_MULTIPLIER : 1;
  powerupState.maxJumps = kind === "doubleJump" ? 2 : 1;
  powerupState.tiny = kind === "tiny";
  powerupState.climb = kind === "monkey";
  powerupState.fly = kind === "fly";
}

export function publishPowerups() {
  const store = usePowerupStore.getState();
  const taken = [...powerupState.cooldowns.keys()];
  const changed =
    store.kind !== powerupState.kind ||
    store.tiny !== powerupState.tiny ||
    Math.abs(store.remaining - powerupState.remaining) >= 0.1 ||
    store.taken.length !== taken.length ||
    taken.some((id) => !store.taken.includes(id));
  if (!changed) return;
  usePowerupStore.setState({
    kind: powerupState.kind,
    remaining: powerupState.remaining,
    tiny: powerupState.tiny,
    taken,
  });
}

export function resetPowerups() {
  applyPowerup(null);
  powerupState.cooldowns.clear();
  usePowerupStore.setState({ kind: null, remaining: 0, taken: [], tiny: false });
}
