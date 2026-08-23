import { create } from "zustand";

/**
 * Animal-power hunt. Four emblems hide in the building (placed
 * procedurally over whatever model is streamed in — see
 * emblemPlacement.ts); walking into one permanently unlocks a way of
 * moving AND switches it straight on. From then on the numbered slots in
 * the HUD toggle it. Powers stack, and an owned power can be used as often
 * as the player likes.
 */
export type AbilityId = "speed" | "tiny" | "fly" | "climb";

export const ABILITY_ORDER: AbilityId[] = ["speed", "tiny", "fly", "climb"];

/** Emblem colours, one per power. */
export const ABILITY_COLORS: Record<AbilityId, string> = {
  speed: "#22c55e",
  tiny: "#8b5cf6",
  fly: "#f59e0b",
  climb: "#ef4444",
};

export type Ability = {
  name: string;
  emoji: string;
  /** Long form, for the unlock card and the slot tooltip. */
  power: string;
  /** Short form, shown under the panel while the power is switched on.
   *  Written as controls, not prose — this is a reminder, not a lesson. */
  tip: string;
};

export const ABILITIES: Record<AbilityId, Ability> = {
  speed: {
    name: "Bunny",
    emoji: "🐰",
    power: "Twice as fast, and twice as high",
    tip: "Speed ×2 · Jump ×2",
  },
  tiny: {
    name: "Mouse",
    emoji: "🐭",
    power: "Shrink to fit through gaps",
    tip: "Mouse-sized · fits through gaps",
  },
  fly: {
    name: "Butterfly",
    emoji: "🦋",
    power: "Double-tap Space to rise, again to go higher",
    tip: "Space ×2 = fly up · again = higher",
  },
  climb: {
    name: "Spider",
    emoji: "🕷️",
    power: "Walk into a wall to climb it · click far away to swing over",
    tip: "Walk at a wall = climb it · Click = web",
  },
};

type HeroState = {
  /** Ability ids whose emblems have been collected */
  found: AbilityId[];
  total: number;
  /** Powers currently switched on (multiple can stack) */
  active: AbilityId[];
  /** Unlock animations waiting to play, oldest first */
  pendingUnlocks: AbilityId[];
  /** Every power that has been switched on at least once. Separate from
   *  `active`, which only says what is on right now — the mission asks
   *  whether each has been TRIED. */
  everUsed: AbilityId[];
  collect: (id: AbilityId) => void;
  shiftUnlock: () => void;
  toggle: (id: AbilityId) => void;
  isActive: (id: AbilityId) => boolean;
  restart: () => void;
};

export const useHeroStore = create<HeroState>((set, get) => ({
  found: [],
  total: ABILITY_ORDER.length,
  active: [],
  pendingUnlocks: [],
  everUsed: [],
  collect: (id) => {
    if (get().found.includes(id)) return;
    // Switched on the instant you pick it up: the power is the reward, so
    // making the player find the slot and click it first buries the payoff.
    // It stays on until they turn it off.
    set((s) => ({
      found: [...s.found, id],
      // Auto-activating on pickup counts as trying it.
      active: s.active.includes(id) ? s.active : [...s.active, id],
      everUsed: s.everUsed.includes(id) ? s.everUsed : [...s.everUsed, id],
      pendingUnlocks: [...s.pendingUnlocks, id],
    }));
  },
  shiftUnlock: () => set((s) => ({ pendingUnlocks: s.pendingUnlocks.slice(1) })),
  toggle: (id) => {
    if (!get().found.includes(id)) return;
    set((s) => ({
      active: s.active.includes(id)
        ? s.active.filter((a) => a !== id)
        : [...s.active, id],
      everUsed: s.everUsed.includes(id) ? s.everUsed : [...s.everUsed, id],
    }));
  },
  isActive: (id) => get().active.includes(id),
  restart: () =>
    set({ found: [], active: [], pendingUnlocks: [], everUsed: [] }),
}));

// Console debug hook, matching the project's __-prefixed convention:
// __hero.getState().collect("fly") etc.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__hero = useHeroStore;
}
