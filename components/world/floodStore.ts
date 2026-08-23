"use client";

import { create } from "zustand";

/** Water starts below the grass so the first few seconds look normal. */
export const START_LEVEL = -1.5;
/** Metres per second. From START_LEVEL that's ~2min 40s to reach the roof. */
export const RISE_RATE = 0.08;
/** Stops just over the roof parapet: past this there is nowhere left to stand,
 *  so letting it climb further would only stretch out an unwinnable state. */
export const MAX_LEVEL = 11;
/** Seconds underwater before the run ends. */
export const BREATH_SECONDS = 8;
/** Breath comes back faster than it drains — a quick dip shouldn't doom a run. */
export const BREATH_RECOVERY = 2.5;

/** The authored high ground, used by the HUD to say where to run next.
 *  Heights are the walkable surface of each storey (see houseData.ts). */
export const HIGH_GROUND = [
  { level: 1, label: "the plinth around the house" },
  { level: 5, label: "the upper floor — take the indoor stairs" },
  { level: 9, label: "the roof terrace — up the outdoor stair" },
];

type FloodState = {
  /** Current water surface height, in world units. */
  level: number;
  /** Seconds survived this run. */
  elapsed: number;
  /** 1 = full lungs, 0 = drowned. */
  breath: number;
  submerged: boolean;
  drowned: boolean;
  /** Best survival time this session, in seconds. */
  best: number;
  /** Bumped on reset so the Player knows to teleport back to spawn. */
  respawnToken: number;
  /**
   * Creative mode: the water stops rising and drowning is disabled.
   *
   * The flood is a timer on the whole session — it reaches the roof and drowns
   * you regardless of what you were doing. That is the game, but it is at odds
   * with the other half of this app, where a child spends two minutes drawing
   * and waiting for a model to generate. Creative mode is for building; the
   * flood is for playing.
   */
  creative: boolean;
  setCreative: (creative: boolean) => void;
  drown: () => void;
  reset: () => void;
};

export const useFloodStore = create<FloodState>((set, get) => ({
  level: START_LEVEL,
  elapsed: 0,
  breath: 1,
  submerged: false,
  drowned: false,
  best: 0,
  respawnToken: 0,
  creative: false,
  setCreative: (creative) =>
    set((s) => ({
      creative,
      // Entering creative mode clears a drowning in progress — otherwise you
      // would switch it on to stop the water and still be dead, which reads as
      // the button not working.
      ...(creative ? { drowned: false, breath: 1, submerged: false } : null),
      // Leaving it restarts the clock rather than resuming a run that was
      // paused for an arbitrary length of time; `best` would be meaningless.
      ...(!creative && s.creative ? { elapsed: 0 } : null),
    })),
  drown: () => {
    // Creative mode disables drowning outright. Guarding here as well as at the
    // call site means nothing else can drown the player behind its back.
    if (get().drowned || get().creative) return;
    set((s) => ({ drowned: true, breath: 0, best: Math.max(s.best, s.elapsed) }));
  },
  reset: () =>
    set((s) => ({
      level: START_LEVEL,
      elapsed: 0,
      breath: 1,
      submerged: false,
      drowned: false,
      respawnToken: s.respawnToken + 1,
    })),
}));

/**
 * The simulation runs every frame, but pushing every frame into the store would
 * re-render the HUD 60 times a second to move a number by 0.001. The authoritative
 * values live here as plain mutable state; `publish` copies them into the store
 * only when something visibly changed.
 */
export const floodState = {
  level: START_LEVEL,
  elapsed: 0,
  breath: 1,
  submerged: false,
  /**
   * Freezes the rise and the breath timer while some other mode owns the world.
   * Opt-in and default-off: only components/lasertag writes it, so the flood
   * game and every other mode behave exactly as they did before it existed.
   */
  paused: false,
};

export function publishFlood() {
  const store = useFloodStore.getState();
  const levelChanged = Math.abs(store.level - floodState.level) >= 0.05;
  const elapsedChanged = Math.floor(store.elapsed) !== Math.floor(floodState.elapsed);
  const breathChanged = Math.abs(store.breath - floodState.breath) >= 0.02;
  const submergedChanged = store.submerged !== floodState.submerged;
  if (!levelChanged && !elapsedChanged && !breathChanged && !submergedChanged) return;
  useFloodStore.setState({
    level: floodState.level,
    elapsed: floodState.elapsed,
    breath: floodState.breath,
    submerged: floodState.submerged,
  });
}

/** Reset the mutable half in step with the store. */
export function resetFloodState() {
  floodState.level = START_LEVEL;
  floodState.elapsed = 0;
  floodState.breath = 1;
  floodState.submerged = false;
}

/** The lowest authored high ground still above the water, or null once the
 *  roof is under and there's nowhere left to climb. */
export function nextHighGround(level: number) {
  return HIGH_GROUND.find((ground) => ground.level > level) ?? null;
}
