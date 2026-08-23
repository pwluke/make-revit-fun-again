import type { HouseMaterial } from "@/components/world/houseData";

type HdriPreset =
  | "apartment"
  | "city"
  | "dawn"
  | "forest"
  | "lobby"
  | "night"
  | "park"
  | "studio"
  | "sunset"
  | "warehouse";

export const LAYER_IDS = [
  "S-FNDN",
  "A-FLOR",
  "A-FLOR-OTLN",
  "A-WALL",
  "I-WALL",
  "A-COLS",
  "S-STRS",
  "A-CLNG",
  "A-ROOF",
  "A-GENM",
] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export type ThemeId = "clay" | "forest" | "aquatic" | "mars" | "circus";

export type ThemeEnv =
  | {
      kind: "sky";
      sunPosition: [number, number, number];
    }
  | {
      kind: "hdri";
      preset: HdriPreset;
      intensity: number;
      blur: number;
      dome: { top: string; mid: string; bottom: string };
    };

export type SceneTheme = {
  id: ThemeId;
  name: string;
  blurb: string;
  swatch: [string, string];
  layers: Record<LayerId, string>;
  house: Record<HouseMaterial, string>;
  playerBlock: string;
  edge: string;
  cubeRoughness: number;
  cubeMetalness: number;
  houseRoughness: number;
  housePanelRoughness: number;
  houseMetalness: number;
  ground: string;
  groundTexture: boolean;
  groundRoughness: number;
  groundMetalness: number;
  flood: string;
  pageBg: string;
  fog: { color: string; near: number; far: number } | null;
  env: ThemeEnv;
  ambient: { color: string; intensity: number };
  keyLight: {
    color: string;
    intensity: number;
    position: [number, number, number];
    /** The original scene uses an unattenuated point light. */
    point?: boolean;
  };
};

export const THEMES: Record<ThemeId, SceneTheme> = {
  clay: {
    id: "clay",
    name: "Clay",
    blurb: "Warm pastel brick",
    swatch: ["#f4c7a1", "#e8a990"],
    layers: {
      "S-FNDN": "#e8d2b0",
      "A-FLOR": "#f8d3a3",
      "A-FLOR-OTLN": "#f3b8c2",
      "A-WALL": "#f4c7a1",
      "I-WALL": "#f5a99a",
      "A-COLS": "#eed49a",
      "S-STRS": "#f2b8a8",
      "A-CLNG": "#f6e3a8",
      "A-ROOF": "#e8a990",
      "A-GENM": "#f5c4c8",
    },
    house: {
      concrete: "#ece7dd",
      panel: "#454b58",
      wood: "#c08a4e",
      glass: "#8fc9e3",
      stone: "#a5a29b",
    },
    playerBlock: "#d9a07a",
    edge: "#2c2118",
    cubeRoughness: 0.55,
    cubeMetalness: 0.05,
    houseRoughness: 0.9,
    housePanelRoughness: 0.7,
    houseMetalness: 0,
    ground: "green",
    groundTexture: true,
    groundRoughness: 1,
    groundMetalness: 0,
    flood: "#2f7fb8",
    pageBg: "#bae6fd",
    fog: null,
    env: { kind: "sky", sunPosition: [100, 20, 100] },
    ambient: { color: "#ffffff", intensity: 0.3 * Math.PI },
    keyLight: {
      color: "#ffffff",
      intensity: 0.8 * Math.PI,
      position: [100, 100, 100],
      point: true,
    },
  },
  forest: {
    id: "forest",
    name: "Enchanted",
    blurb: "Mint canopy and lantern light",
    swatch: ["#7ee8e0", "#2d6a5a"],
    layers: {
      "S-FNDN": "#7aa8a0",
      "A-FLOR": "#c8ebe4",
      "A-FLOR-OTLN": "#b8d4e8",
      "A-WALL": "#e8f6f2",
      "I-WALL": "#9fd9c8",
      "A-COLS": "#f4fffb",
      "S-STRS": "#6eb8b0",
      "A-CLNG": "#d4c8e8",
      "A-ROOF": "#3d8a78",
      "A-GENM": "#7ee8e0",
    },
    house: {
      concrete: "#eef8f5",
      panel: "#3d6b62",
      wood: "#7eb8a8",
      glass: "#8fe8e0",
      stone: "#8aaa9e",
    },
    playerBlock: "#7ee8d0",
    edge: "#1a3330",
    cubeRoughness: 0.28,
    cubeMetalness: 0.08,
    houseRoughness: 0.35,
    housePanelRoughness: 0.25,
    houseMetalness: 0.08,
    ground: "#1a5c52",
    groundTexture: false,
    groundRoughness: 0.85,
    groundMetalness: 0,
    flood: "#2a8a7a",
    pageBg: "#5ec4b8",
    fog: { color: "#7ecfc4", near: 40, far: 180 },
    env: {
      kind: "hdri",
      preset: "forest",
      intensity: 0.7,
      blur: 0.35,
      dome: { top: "#c8fff2", mid: "#5ec4b8", bottom: "#1a4a44" },
    },
    ambient: { color: "#b8fff0", intensity: 0.45 * Math.PI },
    keyLight: {
      color: "#e8fff8",
      intensity: 0.9 * Math.PI,
      position: [40, 80, 20],
    },
  },
  aquatic: {
    id: "aquatic",
    name: "Coral",
    blurb: "Sunlit reef palace",
    swatch: ["#00b4d8", "#ff7f50"],
    layers: {
      "S-FNDN": "#1a4a6e",
      "A-FLOR": "#b8e8f4",
      "A-FLOR-OTLN": "#ff8a70",
      "A-WALL": "#f2f8fb",
      "I-WALL": "#5ec8d8",
      "A-COLS": "#ffffff",
      "S-STRS": "#e8c99a",
      "A-CLNG": "#d0eef8",
      "A-ROOF": "#ff7f50",
      "A-GENM": "#f9d423",
    },
    house: {
      concrete: "#f7fbff",
      panel: "#1a5a7a",
      wood: "#e8a070",
      glass: "#5ec8e8",
      stone: "#4a7a8a",
    },
    playerBlock: "#ff7f50",
    edge: "#0a2a3a",
    cubeRoughness: 0.22,
    cubeMetalness: 0.12,
    houseRoughness: 0.28,
    housePanelRoughness: 0.2,
    houseMetalness: 0.1,
    ground: "#3d9bb0",
    groundTexture: false,
    groundRoughness: 0.25,
    groundMetalness: 0.15,
    flood: "#1a9bc4",
    pageBg: "#0a4a6a",
    fog: { color: "#1a7aa0", near: 8, far: 90 },
    env: {
      kind: "hdri",
      preset: "warehouse",
      intensity: 0.4,
      blur: 0.55,
      dome: { top: "#87e8ff", mid: "#1a8cb8", bottom: "#0a3a5c" },
    },
    ambient: { color: "#4ac8e8", intensity: 0.5 * Math.PI },
    keyLight: {
      color: "#c8f0ff",
      intensity: 1.1 * Math.PI,
      position: [20, 100, 10],
    },
  },
  mars: {
    id: "mars",
    name: "Mars",
    blurb: "Marble hall on the red planet",
    swatch: ["#f4efe8", "#c44a28"],
    layers: {
      "S-FNDN": "#c45c32",
      "A-FLOR": "#f2ebe3",
      "A-FLOR-OTLN": "#d4784a",
      "A-WALL": "#f4efe8",
      "I-WALL": "#d4c4b0",
      "A-COLS": "#f7f4ef",
      "S-STRS": "#c48a4a",
      "A-CLNG": "#efe6d6",
      "A-ROOF": "#c44a28",
      "A-GENM": "#e8b84a",
    },
    house: {
      concrete: "#f6f1ea",
      panel: "#8a4a32",
      wood: "#c48a4a",
      glass: "#e8c8a0",
      stone: "#b87850",
    },
    playerBlock: "#e8b84a",
    edge: "#3a1810",
    cubeRoughness: 0.26,
    cubeMetalness: 0.1,
    houseRoughness: 0.32,
    housePanelRoughness: 0.22,
    houseMetalness: 0.08,
    ground: "#b85a32",
    groundTexture: false,
    groundRoughness: 0.95,
    groundMetalness: 0,
    flood: "#8a5a40",
    pageBg: "#c45c32",
    fog: { color: "#c46a3a", near: 30, far: 160 },
    env: {
      kind: "hdri",
      preset: "sunset",
      intensity: 0.85,
      blur: 0.25,
      dome: { top: "#ff8a4a", mid: "#d45a28", bottom: "#6a2818" },
    },
    ambient: { color: "#e8a070", intensity: 0.25 * Math.PI },
    keyLight: {
      color: "#ffc080",
      intensity: 1.2 * Math.PI,
      position: [80, 25, 40],
    },
  },
  circus: {
    id: "circus",
    name: "Circus",
    blurb: "Pastel tents and fairy lights",
    swatch: ["#f8d4dc", "#6bb3d4"],
    layers: {
      "S-FNDN": "#f5e6d0",
      "A-FLOR": "#f8d4dc",
      "A-FLOR-OTLN": "#e8c86a",
      "A-WALL": "#f7f0e6",
      "I-WALL": "#a8d4e8",
      "A-COLS": "#fff8f0",
      "S-STRS": "#d46a6a",
      "A-CLNG": "#f5c4d0",
      "A-ROOF": "#e85a5a",
      "A-GENM": "#f0d060",
    },
    house: {
      concrete: "#faf4ec",
      panel: "#d46a7a",
      wood: "#e8b84a",
      glass: "#b8d8f0",
      stone: "#e8d0b8",
    },
    playerBlock: "#e85a5a",
    edge: "#4a2830",
    cubeRoughness: 0.4,
    cubeMetalness: 0.06,
    houseRoughness: 0.45,
    housePanelRoughness: 0.35,
    houseMetalness: 0.04,
    ground: "#efe0d0",
    groundTexture: false,
    groundRoughness: 0.35,
    groundMetalness: 0.05,
    flood: "#6bb3d4",
    pageBg: "#f5d0d8",
    fog: { color: "#f0e0d4", near: 50, far: 200 },
    env: {
      kind: "hdri",
      preset: "dawn",
      intensity: 0.75,
      blur: 0.4,
      dome: { top: "#ffe8f0", mid: "#f0d0c0", bottom: "#e8c8b0" },
    },
    ambient: { color: "#ffe8e0", intensity: 0.4 * Math.PI },
    keyLight: {
      color: "#fff4d0",
      intensity: 1.0 * Math.PI,
      position: [60, 40, 80],
    },
  },
};

export const THEME_ORDER: ThemeId[] = [
  "clay",
  "forest",
  "aquatic",
  "mars",
  "circus",
];
