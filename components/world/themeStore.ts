import { create } from "zustand";
import { THEMES, type SceneTheme, type ThemeId } from "@/lib/themes";

type ThemeState = {
  id: ThemeId;
  setTheme: (id: ThemeId) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  id: "clay",
  setTheme: (id) => set({ id }),
}));

export function useSceneTheme(): SceneTheme {
  const id = useThemeStore((state) => state.id);
  return THEMES[id];
}
