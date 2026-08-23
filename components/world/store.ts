import { create } from "zustand";

/**
 * Animal-power hunt. Four emblems hide in the building (placed
 * procedurally over whatever model is streamed in — see
 * emblemPlacement.ts); walking into one permanently unlocks a way of
 * moving, toggled from the numbered slots in the HUD. Powers stack, and
 * an owned power can be used as often as the player likes.
 */
export type AbilityId = "climb" | "tiny" | "fly" | "speed";

export const ABILITY_ORDER: AbilityId[] = ["climb", "tiny", "fly", "speed"];

/** Emblem colours, one per power. */
export const ABILITY_COLORS: Record<AbilityId, string> = {
  climb: "#ef4444",
  tiny: "#8b5cf6",
  fly: "#f59e0b",
  speed: "#22c55e",
};

export type Ability = { name: string; power: string };

export const ABILITIES: Record<AbilityId, Ability> = {
  climb: {
    name: "Spider",
    power: "Walk into a wall to climb it · click far away to swing over",
  },
  tiny: { name: "Mouse", power: "Shrink small enough to fit through gaps" },
  fly: { name: "Butterfly", power: "Double-tap Space to rise, again to go higher" },
  speed: { name: "Bunny", power: "Twice as fast, and twice as high" },
};

type HeroState = {
  /** Ability ids whose emblems have been collected */
  found: AbilityId[];
  total: number;
  /** Powers currently switched on (multiple can stack) */
  active: AbilityId[];
  /** Unlock animations waiting to play, oldest first */
  pendingUnlocks: AbilityId[];
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
  collect: (id) => {
    if (get().found.includes(id)) return;
    set((s) => ({
      found: [...s.found, id],
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
    }));
  },
  isActive: (id) => get().active.includes(id),
  restart: () => set({ found: [], active: [], pendingUnlocks: [] }),
}));

// Console debug hook, matching the project's __-prefixed convention:
// __hero.getState().collect("fly") etc.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__hero = useHeroStore;
}
