import { create } from "zustand";
import { STAR_SPOTS } from "./houseData";

/** What finding a given star unlocks. Passive abilities are always on;
 *  toggles get a hotkey and a HUD button. */
export type StarAbility = {
  emoji: string;
  title: string;
  blurb: string;
  kind: "passive" | "toggle";
  hotkey?: "t" | "x";
};

export const STAR_ABILITIES: Partial<Record<string, StarAbility>> = {
  lawn: {
    emoji: "🐇",
    title: "Bunny Speed",
    blurb: "Run one-and-a-half times as fast",
    kind: "passive",
  },
  living: {
    emoji: "🐸",
    title: "Frog Jump",
    blurb: "Jump once more in mid-air",
    kind: "passive",
  },
  upstairs: {
    emoji: "🐭",
    title: "Mouse Mode",
    blurb: "Shrink to mouse size and see the house like one",
    kind: "toggle",
    hotkey: "t",
  },
  balcony: {
    emoji: "🦋",
    title: "Butterfly Glide",
    blurb: "Hold jump while falling to drift down",
    kind: "passive",
  },
  roof: {
    emoji: "👀",
    title: "X-Ray Eyes",
    blurb: "See through the walls to the spaces behind them",
    kind: "toggle",
    hotkey: "x",
  },
};

type TreasureState = {
  /** Ids of the stars picked up so far */
  found: string[];
  total: number;
  /** The most recent pickup, so the HUD can flash */
  lastFound: string | null;
  /** Toggleable ability states (only effective once their star is found) */
  tinyOn: boolean;
  xrayOn: boolean;
  collect: (id: string) => void;
  hasAbility: (id: string) => boolean;
  toggleTiny: () => void;
  toggleXray: () => void;
  restart: () => void;
};

export const useTreasureStore = create<TreasureState>((set, get) => ({
  found: [],
  total: STAR_SPOTS.length,
  lastFound: null,
  tinyOn: false,
  xrayOn: false,
  collect: (id) => {
    if (get().found.includes(id)) return;
    set((s) => ({ found: [...s.found, id], lastFound: id }));
  },
  hasAbility: (id) => get().found.includes(id),
  toggleTiny: () => {
    if (get().found.includes("upstairs")) set((s) => ({ tinyOn: !s.tinyOn }));
  },
  toggleXray: () => {
    if (get().found.includes("roof")) set((s) => ({ xrayOn: !s.xrayOn }));
  },
  restart: () =>
    set({ found: [], lastFound: null, tinyOn: false, xrayOn: false }),
}));
