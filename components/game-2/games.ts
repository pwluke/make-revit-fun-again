// The four games, in render order. This array is the single source of truth for
// the landing page and the /play/[game] routes — add a game or swap its art
// here only.

export type Game = {
  /** URL segment and React key. */
  slug: string;
  /** Eyebrow copy — what kind of game this is, in two or three words. */
  kindLabel: string;
  title: string;
  tagline: string;
  /** Where the tile navigates. `/minecraft` is the one game that exists today. */
  href: string;
  /**
   * Runtime URL string, not a bundled import — same convention as
   * `components/minecraft/Axe.tsx`. A missing file is a 404 the tile falls back
   * from, rather than a build error, so the page ships before the art does.
   */
  image: string;
  imageAlt: string;
  /**
   * `object-position`, for sources whose aspect ratio is far from the tile's
   * 4:5 frame and whose subject is off-centre. Omit to crop from the centre.
   */
  focus?: string;
  /** Sampled from the reference image; drives the placeholder and the accents. */
  palette: { from: string; to: string; accent: string };
};

export const GAMES: Game[] = [
  {
    slug: "bimcraft",
    kindLabel: "Voxel Builder",
    title: "BIMCraft",
    tagline: "Break your model down to blocks, then build it back your way.",
    href: "/minecraft",
    image: "/bimcraft.jpg",
    imageAlt:
      "A voxel player standing in a lantern-lit swamp of glowing mushrooms and mangrove blocks",
    // 763x402 is wider than the 4:5 frame, but the player sits close enough to
    // centre that the default crop keeps them in shot.
    palette: { from: "#4E8F6B", to: "#12262B", accent: "#FFC46B" },
  },
  {
    slug: "sketch-to-3d",
    kindLabel: "Draw & Extrude",
    title: "Sketch To 3D",
    tagline: "Scribble a plan on the grid and watch it stand up in seconds.",
    href: "/play/sketch-to-3d",
    image: "/12-18.webp",
    imageAlt:
      "Coral-pink isometric towers and arches folding into an impossible staircase",
    palette: { from: "#F0685E", to: "#A8DCC8", accent: "#F2C33C" },
  },
  {
    slug: "treasure-hunt",
    kindLabel: "Model Scavenger",
    title: "Treasure Hunt",
    tagline: "Hunt clues room by room before the clock runs out on you.",
    href: "/play/treasure-hunt",
    image: "/18-65.jpg",
    imageAlt:
      "A pastel collage section through a small house opening onto a garden with chickens and an orange tree",
    palette: { from: "#F2EDE4", to: "#4E9AA0", accent: "#F0C9C4" },
  },
  {
    slug: "laser-tag-scan",
    kindLabel: "Point Cloud Arena",
    title: "Laser Tag Scan",
    tagline: "Tag rivals across a point cloud you reveal one sweep at a time.",
    href: "/play/laser-tag-scan",
    image: "/call-of-duty.jpg",
    imageAlt:
      "Soldiers advancing through a hazy valley as helicopters drop in behind them",
    palette: { from: "#B9C4AC", to: "#2F3A2A", accent: "#D6E3B4" },
  },
];

export function findGame(slug: string): Game | undefined {
  return GAMES.find((game) => game.slug === slug);
}
