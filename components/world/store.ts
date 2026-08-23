import { create } from "zustand";

/**
 * Ability-card hunt. Six cards float in the world (placed procedurally
 * over whatever model is streamed in — see emblemPlacement.ts); walking into
 * one collects it into the dock, where it can be toggled on and off.
 * Abilities stack. The ability ids are neutral — the THEMES table skins
 * them as superheroes or as cute animals, switchable in the HUD.
 */
export type AbilityId = "climb" | "tiny" | "fly" | "speed" | "scan" | "portal";
export type ThemeId = "heroes" | "animals";

export const ABILITY_ORDER: AbilityId[] = [
  "climb",
  "tiny",
  "fly",
  "speed",
  "scan",
  "portal",
];

/** Card frame colors, one per ability, shared by both themes. */
export const ABILITY_COLORS: Record<AbilityId, string> = {
  climb: "#ef4444",
  tiny: "#8b5cf6",
  fly: "#2563eb",
  speed: "#facc15",
  scan: "#ea580c",
  portal: "#059669",
};

export type AbilitySkin = { name: string; emoji: string; power: string };

export const THEMES: Record<ThemeId, Record<AbilityId, AbilitySkin>> = {
  heroes: {
    climb: { name: "Spider-Man", emoji: "🕷️", power: "Climb walls · G to web-zip" },
    tiny: { name: "Ant-Man", emoji: "🐜", power: "Shrink to ant size" },
    fly: { name: "Superman", emoji: "🦸", power: "Fly — move where you look" },
    speed: { name: "The Flash", emoji: "⚡", power: "Double speed · double-height jump" },
    scan: { name: "Iron Man", emoji: "🤖", power: "X-ray — see through the building" },
    portal: { name: "Dr. Strange", emoji: "🌀", power: "Portals between linked places" },
  },
  animals: {
    climb: { name: "Gecko", emoji: "🦎", power: "Climb walls · G to tongue-zip" },
    tiny: { name: "Mouse", emoji: "🐭", power: "Shrink to mouse size" },
    fly: { name: "Eagle", emoji: "🦅", power: "Fly — move where you look" },
    speed: { name: "Bunny", emoji: "🐰", power: "Double speed · double-height hops" },
    scan: { name: "Owl", emoji: "🦉", power: "Night eyes — see through the building" },
    portal: { name: "Fox", emoji: "🦊", power: "Fox dens with two exits" },
  },
};

type HeroState = {
  theme: ThemeId;
  /** Ability ids whose cards have been collected */
  found: AbilityId[];
  total: number;
  /** Abilities currently switched on (multiple can stack) */
  active: AbilityId[];
  /** Unlock animations waiting to play, oldest first */
  pendingUnlocks: AbilityId[];
  /** One-shot teleport request, consumed by the Player body owner */
  pendingTeleport: [number, number, number] | null;
  setTheme: (theme: ThemeId) => void;
  collect: (id: AbilityId) => void;
  shiftUnlock: () => void;
  toggle: (id: AbilityId) => void;
  isActive: (id: AbilityId) => boolean;
  requestTeleport: (pos: [number, number, number]) => void;
  consumeTeleport: () => [number, number, number] | null;
  restart: () => void;
};

export const useHeroStore = create<HeroState>((set, get) => ({
  theme: "heroes",
  found: [],
  total: ABILITY_ORDER.length,
  active: [],
  pendingUnlocks: [],
  pendingTeleport: null,
  setTheme: (theme) => set({ theme }),
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
  requestTeleport: (pos) => set({ pendingTeleport: pos }),
  consumeTeleport: () => {
    const pos = get().pendingTeleport;
    if (pos) set({ pendingTeleport: null });
    return pos;
  },
  restart: () =>
    set({
      found: [],
      active: [],
      pendingUnlocks: [],
      pendingTeleport: null,
    }),
}));

// Console debug hook, matching the project's __-prefixed convention:
// __hero.getState().collect("fly") etc.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__hero = useHeroStore;
}
