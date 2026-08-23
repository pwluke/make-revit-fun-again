import { create } from "zustand";
import { THEMES, type SceneTheme, type ThemeId } from "@/lib/themes";

type ThemeState = {
  id: ThemeId;
  setTheme: (id: ThemeId) => void;
  /**
   * Performance mode: drop everything that costs frames but adds no gameplay.
   *
   * The post chain is seven passes (N8AO, bloom, tone mapping, vignette, colour
   * grade, noise, SMAA) and the themed environments load an HDRI. On a booth
   * laptop driving four creation modes and a voxel building, that is the
   * difference between playable and not. Colours still come from the active
   * theme — this turns off the expensive rendering, not the palette.
   */
  fast: boolean;
  setFast: (fast: boolean) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  id: "clay",
  setTheme: (id) => set({ id }),
  // Off by default: the fancy version is the one worth showing first.
  fast: false,
  setFast: (fast) => set({ fast }),
}));

/** Subscribe to just the performance flag, without re-rendering on theme changes. */
export function useFastMode(): boolean {
  return useThemeStore((state) => state.fast);
}

export function useSceneTheme(): SceneTheme {
  const id = useThemeStore((state) => state.id);
  return THEMES[id];
}
