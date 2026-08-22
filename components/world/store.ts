import { create } from "zustand";
import { STAR_SPOTS } from "./houseData";

type TreasureState = {
  /** Ids of the stars picked up so far */
  found: string[];
  total: number;
  /** The most recent pickup, so the HUD can flash */
  lastFound: string | null;
  collect: (id: string) => void;
  restart: () => void;
};

export const useTreasureStore = create<TreasureState>((set, get) => ({
  found: [],
  total: STAR_SPOTS.length,
  lastFound: null,
  collect: (id) => {
    if (get().found.includes(id)) return;
    set((s) => ({ found: [...s.found, id], lastFound: id }));
  },
  restart: () => set({ found: [], lastFound: null }),
}));
