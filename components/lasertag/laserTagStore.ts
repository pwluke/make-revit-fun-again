"use client";

import { create } from "zustand";

/** Bot counts offered on the setup card. */
export const BOT_COUNT_OPTIONS = [1, 3, 5] as const;
export const DEFAULT_BOT_COUNT = 3;

/** Hits needed to tag a bot. At 1 the flee state barely gets to show itself;
 *  raise it to 2 once the chase feels good. */
export const TAG_HITS = 1;

export type Difficulty = "beginner" | "intermediate" | "expert";

export type DifficultyDef = {
  label: string;
  blurb: string;
  /** Seconds between a bot's shots. */
  fireInterval: number;
  /** Chance a shot that had line of sight actually connects. */
  accuracy: number;
  /** How far a bot will take a shot from, in world units. */
  range: number;
  /** Health taken per hit, out of MAX_HEALTH. */
  damage: number;
  /** Seconds a bot waits after acquiring you before its first shot — the
   *  window you get to shoot first. */
  reaction: number;
};

/**
 * Three presets rather than sliders: each one moves fire rate, accuracy, range
 * and damage together, because tuning them independently is a designer's job,
 * not a player's.
 */
export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  beginner: {
    label: "Beginner",
    blurb: "Slow, wide shots. Plenty of time to duck.",
    fireInterval: 2.6,
    accuracy: 0.25,
    range: 16,
    damage: 8,
    reaction: 1.1,
  },
  intermediate: {
    label: "Intermediate",
    blurb: "Steadier aim, and they lead you a little.",
    fireInterval: 1.6,
    accuracy: 0.45,
    range: 24,
    damage: 12,
    reaction: 0.7,
  },
  expert: {
    label: "Expert",
    blurb: "Fast, accurate, and they shoot from across the hall.",
    fireInterval: 0.9,
    accuracy: 0.7,
    range: 34,
    damage: 16,
    reaction: 0.35,
  },
};

export const MAX_HEALTH = 100;

export type LaserTagPhase = "setup" | "hunting" | "won" | "lost";

export type RoundConfig = {
  botCount: number;
  returnFire: boolean;
  difficulty: Difficulty;
};

export const DEFAULT_CONFIG: RoundConfig = {
  botCount: DEFAULT_BOT_COUNT,
  returnFire: false,
  difficulty: "beginner",
};

type LaserTagStore = {
  /** "setup" until the player has chosen their options and pressed start. */
  phase: LaserTagPhase;
  config: RoundConfig;
  /** Ids tagged this round. An array, not a Set, because the HUD renders it. */
  tagged: string[];
  /** Bots actually spawned. Starts at 0 — the ten voxel layers have to land
   *  before the arena can be walked, so there is a window with no bots. */
  total: number;
  shots: number;
  hits: number;
  /** Most recent tag, so the HUD can flash a pip. */
  lastTagged: string | null;
  /** Bearing + distance to the nearest live bot, e.g. "north-east, 14 m". */
  hint: string | null;
  health: number;
  /** Bumped every time the player is hit, so the HUD can flash without having
   *  to diff health itself. */
  hurtToken: number;
  /** Bumped by a new round. Bots re-derive their spawn seed from it, so a
   *  replay re-scatters instead of repeating the same spots. */
  roundToken: number;
  startRound: (config: RoundConfig) => void;
  /** Same settings, fresh bots. */
  playAgain: () => void;
  /** Back to the setup card to change settings. */
  backToSetup: () => void;
  setTotal: (total: number) => void;
};

export const useLaserTagStore = create<LaserTagStore>((set, get) => ({
  phase: "setup",
  config: DEFAULT_CONFIG,
  tagged: [],
  total: 0,
  shots: 0,
  hits: 0,
  lastTagged: null,
  hint: null,
  health: MAX_HEALTH,
  hurtToken: 0,
  roundToken: 0,
  startRound: (config) => {
    resetLaserTag();
    set((s) => ({
      config,
      phase: "hunting",
      tagged: [],
      total: 0,
      shots: 0,
      hits: 0,
      lastTagged: null,
      hint: null,
      health: MAX_HEALTH,
      // Reset with the rest: a stale token would replay the damage flash on the
      // first frame of a fresh round.
      hurtToken: 0,
      roundToken: s.roundToken + 1,
    }));
  },
  playAgain: () => get().startRound(get().config),
  backToSetup: () => {
    resetLaserTag();
    set({
      phase: "setup",
      tagged: [],
      shots: 0,
      hits: 0,
      health: MAX_HEALTH,
      hurtToken: 0,
    });
  },
  setTotal: (total) => {
    if (get().total === total) return;
    set({ total });
  },
}));

/**
 * The authoritative state, written from the frame loop and the fire handlers and
 * read by both. Kept out of the store for the same reason `powerupState` is:
 * values that change every frame shouldn't re-render React every frame.
 * `publishLaserTag` copies across only what the HUD shows, only when it changes.
 */
export const laserTagState = {
  /**
   * True only while <LaserTag/> is mounted. This is the single flag the guards
   * in Cube.tsx and Player.tsx read, so with the mode unmounted they are
   * constant-false branches and those files behave exactly as before.
   */
  active: false,
  tagged: new Set<string>(),
  /** bot id -> hits landed so far, for TAG_HITS > 1. */
  hits: new Map<string, number>(),
  shots: 0,
  hitCount: 0,
  lastTagged: null as string | null,
  nearestBearing: "",
  nearestDistance: 0,
  health: MAX_HEALTH,
  hurtCount: 0,
  /** Set once the round is decided, so the frame loop stops scoring. */
  finished: false,
};

export function registerShot() {
  laserTagState.shots += 1;
}

/** Land one hit on a bot. Returns true when this hit is the one that tags it. */
export function landHit(id: string): boolean {
  laserTagState.hitCount += 1;
  if (laserTagState.tagged.has(id)) return false;
  const hits = (laserTagState.hits.get(id) ?? 0) + 1;
  laserTagState.hits.set(id, hits);
  if (hits < TAG_HITS) return false;
  laserTagState.tagged.add(id);
  laserTagState.lastTagged = id;
  return true;
}

/** Take damage. Returns true if this hit finished the player off. */
export function damagePlayer(amount: number): boolean {
  if (laserTagState.finished) return false;
  laserTagState.health = Math.max(0, laserTagState.health - amount);
  laserTagState.hurtCount += 1;
  return laserTagState.health <= 0;
}

function hintText() {
  if (!laserTagState.nearestBearing) return null;
  return `${laserTagState.nearestBearing}, ${Math.round(laserTagState.nearestDistance)} m`;
}

export function publishLaserTag() {
  const store = useLaserTagStore.getState();
  // Nothing to publish before the round starts, and nothing after it ends —
  // a decided round shouldn't flicker back to "hunting".
  if (store.phase === "setup") return;

  const hint = hintText();
  let phase = store.phase;
  if (!laserTagState.finished) {
    if (laserTagState.health <= 0) {
      phase = "lost";
      laserTagState.finished = true;
    } else if (store.total > 0 && laserTagState.tagged.size >= store.total) {
      phase = "won";
      laserTagState.finished = true;
    }
  }

  const changed =
    store.tagged.length !== laserTagState.tagged.size ||
    store.shots !== laserTagState.shots ||
    store.hits !== laserTagState.hitCount ||
    store.lastTagged !== laserTagState.lastTagged ||
    store.phase !== phase ||
    store.hint !== hint ||
    store.health !== laserTagState.health ||
    store.hurtToken !== laserTagState.hurtCount;
  if (!changed) return;

  useLaserTagStore.setState({
    tagged: [...laserTagState.tagged],
    shots: laserTagState.shots,
    hits: laserTagState.hitCount,
    lastTagged: laserTagState.lastTagged,
    phase,
    hint,
    health: laserTagState.health,
    hurtToken: laserTagState.hurtCount,
  });
}

/** Clear the round. Does not touch `active` — that belongs to <LaserTag/>'s
 *  mount effect, which is the only writer. */
export function resetLaserTag() {
  laserTagState.tagged.clear();
  laserTagState.hits.clear();
  laserTagState.shots = 0;
  laserTagState.hitCount = 0;
  laserTagState.lastTagged = null;
  laserTagState.nearestBearing = "";
  laserTagState.nearestDistance = 0;
  laserTagState.health = MAX_HEALTH;
  laserTagState.hurtCount = 0;
  laserTagState.finished = false;
}
