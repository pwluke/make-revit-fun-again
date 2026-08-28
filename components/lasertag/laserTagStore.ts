"use client";

import { create } from "zustand";

/** Bot counts offered on the setup card. */
export const BOT_COUNT_OPTIONS = [1, 3, 5] as const;
export const DEFAULT_BOT_COUNT = 3;

/** Hits needed to tag a bot. At 1 the flee state barely gets to show itself;
 *  raise it to 2 once the chase feels good. */
export const TAG_HITS = 1;

/**
 * The final boss. He is not one of the scan-bots: he spawns on the roof, has
 * his own id so hit attribution and the tag threshold can tell him apart, and
 * he counts toward the round total — so the hunt is not over until he is down.
 */
export const BOSS_ID = "the-inspector";
export const BOSS_NAME = "The Inspector";

/** Hits to put the Inspector down, against TAG_HITS for a scan-bot. High
 *  enough that the fight is a fight; low enough to stay a hackathon demo. */
export const BOSS_HITS = 12;

/**
 * How the Inspector differs from the scan-bots at the same difficulty. He is
 * a multiplier on the chosen preset rather than a fourth preset, so the setup
 * card's three choices still mean what they say.
 */
export const BOSS_MODIFIER = {
  /** Fires this much faster. */
  fireInterval: 0.55,
  damage: 1.75,
  accuracy: 1.25,
  /** Flat range instead of a multiplier: he is on the roof, and anything less
   *  than the whole arena would let the player stand off and plink him. */
  range: 70,
  /** Slower on the draw than a bot — the tell that gives you time to break
   *  line of sight when he first spots you. */
  reaction: 1.4,
} as const;

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
  /** Hits landed on the Inspector so far, out of BOSS_HITS. Published on its
   *  own so the boss bar can move without the pip row re-rendering. */
  bossHits: number;
  /** Whether this round has a Inspector at all — false until the voxels have
   *  streamed in far enough to find a roof. */
  bossPresent: boolean;
  /** Bumped every time the player is hit, so the HUD can flash without having
   *  to diff health itself. */
  hurtToken: number;
  /** Bumped by a new round. Bots re-derive their spawn seed from it, so a
   *  replay re-scatters instead of repeating the same spots. */
  roundToken: number;
  /** Shots this player has landed on other PLAYERS, bots excluded. */
  peerHits: number;
  /**
   * Other players this player has put down. Counted from their own
   * acknowledgement rather than from our hit detection, so this is the number
   * that is actually true on both machines — see the `tag` topic.
   */
  peerTags: number;
  /**
   * Other players currently in a live round. From presence, so it is peers who
   * can shoot back — not everyone in the world. Zero means this is effectively
   * a single-player hunt and the HUD says nothing about PvP.
   */
  armedPeers: number;
  /**
   * Avatar colour of the player who last hit you, so the HUD can say who it was
   * in the only terms this game has: nobody is named.
   *
   * Goes back to null UNDER_FIRE_MS after the last hit. The HUD renders it in
   * the present tense — "taking fire" — so a value that survived to the end of
   * the round would be a lie for most of it.
   */
  lastHitByColor: string | null;
  /** True when it was a player, not a bot, who took you to zero. Changes what
   *  the end card says, and it is the one detail people ask about. */
  downedByPeer: boolean;
  startRound: (config: RoundConfig) => void;
  /** Same settings, fresh bots. */
  playAgain: () => void;
  /** Back to the setup card to change settings. */
  backToSetup: () => void;
  setTotal: (total: number) => void;
  setBossPresent: (present: boolean) => void;
  setArmedPeers: (count: number) => void;
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
  bossHits: 0,
  bossPresent: false,
  hurtToken: 0,
  roundToken: 0,
  peerHits: 0,
  peerTags: 0,
  armedPeers: 0,
  lastHitByColor: null,
  downedByPeer: false,
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
      bossHits: 0,
      // Reset with the rest: a stale token would replay the damage flash on the
      // first frame of a fresh round.
      hurtToken: 0,
      peerHits: 0,
      peerTags: 0,
      lastHitByColor: null,
      downedByPeer: false,
      // `armedPeers` is deliberately NOT reset: it describes the room, not the
      // round, and <ArmedPeerWatch/> only refreshes it a couple of times a
      // second. Zeroing it here would blank the PvP line for the first moments
      // of every round even though the other players are still standing there.
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
      bossHits: 0,
      hurtToken: 0,
      peerHits: 0,
      peerTags: 0,
      lastHitByColor: null,
      downedByPeer: false,
    });
  },
  setTotal: (total) => {
    if (get().total === total) return;
    set({ total });
  },
  setBossPresent: (present) => {
    if (get().bossPresent === present) return;
    set({ bossPresent: present });
  },
  setArmedPeers: (count) => {
    if (get().armedPeers === count) return;
    set({ armedPeers: count });
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
  /** Shots landed on other players. Separate from `hitCount` so the PvP line
   *  and the bot stats line cannot be confused for each other. */
  peerHits: 0,
  /** Confirmed player takedowns — see the store field of the same name. */
  peerTags: 0,
  lastHitByColor: null as string | null,
  /**
   * When the last hit from another player landed, on `performance.now()`'s
   * clock. Paired with `lastHitByColor` to expire it — see UNDER_FIRE_MS.
   */
  lastHitAt: 0,
  downedByPeer: false,
};

export function registerShot() {
  laserTagState.shots += 1;
}

/** Hits needed to tag this target. The boss is the only exception. */
export function hitsToTag(id: string) {
  return id === BOSS_ID ? BOSS_HITS : TAG_HITS;
}

/** Land one hit on a bot. Returns true when this hit is the one that tags it. */
export function landHit(id: string): boolean {
  laserTagState.hitCount += 1;
  if (laserTagState.tagged.has(id)) return false;
  const hits = (laserTagState.hits.get(id) ?? 0) + 1;
  laserTagState.hits.set(id, hits);
  if (hits < hitsToTag(id)) return false;
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

/**
 * Take a hit from another player. Same damage path as a bot's, plus who it came
 * from — a bot is a bot, but "the orange player got me" is the thing worth
 * knowing.
 *
 * Returns true if it was the hit that put you down, which is what the caller
 * sends back to the shooter as their confirmed tag.
 */
export function damageFromPeer(amount: number, color: string | null): boolean {
  const down = damagePlayer(amount);
  // Only on a hit that actually registered: a hit arriving after the round was
  // decided must not rewrite who ended it.
  if (laserTagState.finished && !down) return false;
  laserTagState.lastHitByColor = color;
  laserTagState.lastHitAt = performance.now();
  if (down) laserTagState.downedByPeer = true;
  return down;
}

/** One of your shots landed on another player. */
export function landPeerHit(): void {
  laserTagState.peerHits += 1;
}

/** Another player confirmed you put them down. */
export function creditPeerTag(): void {
  laserTagState.peerTags += 1;
}

/**
 * How long after a hit the HUD still says another player is shooting at you.
 *
 * The banner is written in the present tense, so it has to lapse: without this
 * one hit early on left it lit for the rest of the round. Long enough to bridge
 * the gap between shots in a real exchange of fire — PvP is ~5 shots a second
 * and a rival has to reacquire you — short enough that breaking away clears it.
 */
export const UNDER_FIRE_MS = 2000;

/** Whether a player's shot landed on you recently enough to still be news. */
function underFire(): boolean {
  if (!laserTagState.lastHitByColor) return false;
  return performance.now() - laserTagState.lastHitAt < UNDER_FIRE_MS;
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
  const bossHits = laserTagState.hits.get(BOSS_ID) ?? 0;
  // Expired here rather than on a timer because this already runs once a frame
  // from <Bots/>, and a timer would be a second clock to keep in step with the
  // round's own reset. The value only reaches React when it flips, like
  // everything else below.
  const lastHitByColor = underFire() ? laserTagState.lastHitByColor : null;
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
    store.bossHits !== bossHits ||
    store.hurtToken !== laserTagState.hurtCount ||
    store.peerHits !== laserTagState.peerHits ||
    store.peerTags !== laserTagState.peerTags ||
    store.lastHitByColor !== lastHitByColor ||
    store.downedByPeer !== laserTagState.downedByPeer;
  if (!changed) return;

  useLaserTagStore.setState({
    tagged: [...laserTagState.tagged],
    shots: laserTagState.shots,
    hits: laserTagState.hitCount,
    lastTagged: laserTagState.lastTagged,
    phase,
    hint,
    health: laserTagState.health,
    bossHits,
    hurtToken: laserTagState.hurtCount,
    peerHits: laserTagState.peerHits,
    peerTags: laserTagState.peerTags,
    lastHitByColor,
    downedByPeer: laserTagState.downedByPeer,
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
  laserTagState.peerHits = 0;
  laserTagState.peerTags = 0;
  laserTagState.lastHitByColor = null;
  laserTagState.lastHitAt = 0;
  laserTagState.downedByPeer = false;
}
