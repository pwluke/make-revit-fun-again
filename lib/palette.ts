/**
 * The playground's colour tokens, in a form the 3D scene can use.
 *
 * The UI half of these lives in `components/playground/playground.css` as CSS
 * custom properties, and three.js can't read those — so the values are
 * mirrored here. If a token changes in the stylesheet, change it here too.
 *
 * Nothing in this file imports three, so it stays usable from plain data
 * modules (houseData) as well as from components.
 */

/** Verbatim mirror of the `--*` colour tokens on `.playground`. */
export const UI = {
  ink: "#202347",
  inkSoft: "#6f7392",
  muted: "#9295aa",
  line: "#e3e4eb",
  paper: "#f8f8f5",
  white: "#ffffff",
  brand: "#5f63df",
  brandTint: "#eeeeff",
  coral: "#e85675",
  coralTint: "#fdebf0",
  amber: "#f09b3d",
  amberTint: "#fff2e2",
  mint: "#2cae87",
  mintTint: "#e5f7f1",
  sky: "#568dc9",
  skyTint: "#eaf2fb",
  gold: "#f3b939",
} as const;

/** `#rgb`/`#rrggbb` -> `[r, g, b]`, each 0-255. */
function parseHex(hex: string): [number, number, number] {
  const body = hex.replace("#", "");
  const full =
    body.length === 3
      ? body
          .split("")
          .map((c) => c + c)
          .join("")
      : body;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/**
 * Blend two tokens in plain sRGB, `amount` being how far to travel from `a`
 * to `b`. Deliberately not gamma-correct: it matches what the CSS `color-mix`
 * in a designer's head does, which is the point — every scene colour below is
 * provably on a line between two UI tokens rather than eyeballed.
 */
export function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const channel = (x: number, y: number) =>
    Math.round(x + (y - x) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

/**
 * The pastels. Each UI hue pulled two-thirds of the way toward its own tint —
 * the register the reference art sits in: unmistakably the brand hue, but with
 * the saturation of poured plaster rather than of a button.
 */
export const PASTEL = {
  /** Coral, softened. The warm half of every surface. */
  blush: mix(UI.coral, UI.coralTint, 0.62),
  /** Brand periwinkle, softened. The cool half. */
  lilac: mix(UI.brand, UI.brandTint, 0.66),
  /** Brand periwinkle, less softened — for shadow and shade. */
  periwinkle: mix(UI.brand, UI.brandTint, 0.42),
  /** Mint, softened. Reads as the sky's zenith. */
  mint: mix(UI.mint, UI.mintTint, 0.68),
  /** Sky blue, softened. Water and glass. */
  sky: mix(UI.sky, UI.skyTint, 0.55),
  /** Amber, softened. Timber and warm trim. */
  sand: mix(UI.amber, UI.amberTint, 0.62),
  /** The near-white the whole scene sits on. */
  chalk: mix(UI.brandTint, UI.paper, 0.5),
  /** Brand pulled toward ink: the one dark value, still on the brand hue. */
  indigo: mix(UI.brand, UI.ink, 0.45),
} as const;

/**
 * Scene roles. The renderer reads these, not the tokens above, so that
 * "what colour is the water" is answered in one place and every answer is
 * traceable back to a UI token.
 */
export const SCENE = {
  /** Sky dome, bottom to top. Mint zenith over a blush horizon, as in the art. */
  skyHorizon: mix(PASTEL.blush, UI.coralTint, 0.35),
  skyMid: mix(PASTEL.lilac, UI.brandTint, 0.45),
  skyZenith: PASTEL.mint,
  /** Distance haze. Must match `skyHorizon` or the ground meets a seam. */
  fog: mix(PASTEL.blush, UI.coralTint, 0.35),

  /** Sun. Warm, but only just — the art has no yellow in it. */
  keyLight: mix(UI.white, PASTEL.blush, 0.3),
  /** Sky fill from above. */
  fillSky: mix(PASTEL.mint, UI.white, 0.45),
  /** Bounce from below, off the pale floor. */
  fillGround: mix(PASTEL.lilac, UI.white, 0.35),
  /** Rim light from behind, opposite the sun. Cool, so shading reads two-tone. */
  rimLight: PASTEL.periwinkle,

  /** Ground plane, and the faint tile seam ruled across it. */
  ground: PASTEL.chalk,
  groundSeam: mix(PASTEL.chalk, PASTEL.periwinkle, 0.3),

  /** Water. */
  water: PASTEL.sky,

  /** Ambient-occlusion tint. Never black — the art has no black in it. */
  occlusion: PASTEL.indigo,

  /** Split tone: shade toward periwinkle, light toward blush. */
  gradeShadow: PASTEL.periwinkle,
  gradeHighlight: mix(PASTEL.blush, UI.white, 0.25),

  /** Placement highlight on a targeted block. */
  highlight: UI.coral,

  /** Collectible stars, and their glow. */
  star: UI.gold,
  starGlow: UI.amber,
} as const;

/**
 * Voxel ramp, low to high. Reference art stacks its massing in bands — warm
 * at the base climbing to cool at the top — and the block field is what reads
 * as massing here.
 */
export const VOXEL_RAMP = [
  PASTEL.blush,
  mix(PASTEL.blush, PASTEL.lilac, 0.5),
  PASTEL.lilac,
  PASTEL.periwinkle,
] as const;

/** Lowest and highest block Y the ramp is stretched across. */
export const VOXEL_RAMP_RANGE = { low: 0, high: 14 } as const;
