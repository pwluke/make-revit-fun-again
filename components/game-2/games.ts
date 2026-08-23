// The four game modes, in render order: ascending start age, which is also the
// difficulty ramp (playful stacking -> spatial puzzle -> design studio -> city).
// This array is the single source of truth for the landing page and the
// /play/[tier] routes — rename a bracket or swap a game name here only.

export type AgeTier = {
  /** URL segment and React key. */
  slug: string;
  /** Eyebrow copy — the audience this mode is built for. */
  ageLabel: string;
  title: string;
  tagline: string;
  /** Where the tile navigates. `/minecraft` is the one mode that exists today. */
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

export const AGE_TIERS: AgeTier[] = [
  {
    slug: "ages-6-12",
    ageLabel: "Ages 6–12",
    title: "Cloud Harbour",
    tagline: "Snap bright little houses into towers that float above the sea.",
    href: "/minecraft",
    image: "/6-12.png",
    imageAlt:
      "A candy-coloured island of stacked houses on stilts, floating in a bright blue sky",
    // 1672x941 is far wider than the 4:5 frame, and the island sits right of
    // centre — a centre crop would slice the stacked tower off.
    focus: "64% 50%",
    palette: { from: "#7FDCE8", to: "#E8615A", accent: "#F5C860" },
  },
  {
    slug: "ages-12-18",
    ageLabel: "Ages 12–18",
    title: "Impossible Halls",
    tagline: "Twist stairs and arches until a route appears where none should.",
    href: "/play/ages-12-18",
    image: "/12-18.webp",
    imageAlt:
      "Coral-pink isometric towers and arches folding into an impossible staircase",
    palette: { from: "#F0685E", to: "#A8DCC8", accent: "#F2C33C" },
  },
  {
    slug: "ages-18-65",
    ageLabel: "Ages 18–65",
    title: "Courtyard Studio",
    tagline: "Cut a section through your own house and furnish every room.",
    href: "/play/ages-18-65",
    image: "/18-65.jpg",
    imageAlt:
      "A pastel collage section through a small house opening onto a garden with chickens and an orange tree",
    palette: { from: "#F2EDE4", to: "#4E9AA0", accent: "#F0C9C4" },
  },
  {
    slug: "ages-65-plus",
    ageLabel: "Ages 65+",
    title: "Sandstone Empire",
    tagline: "Grow a warm-stone city of domes, towers and shaded streets.",
    href: "/play/ages-65-plus",
    // The literal "+" is a valid path character; next/image percent-encodes it
    // into its own `url` query param, so it round-trips.
    image: "/65+.jpg",
    imageAlt:
      "A sunlit historical city of sandstone domes and towers under a hazy sky",
    palette: { from: "#D9A96A", to: "#A8BFCC", accent: "#7A5230" },
  },
];

export function findTier(slug: string): AgeTier | undefined {
  return AGE_TIERS.find((tier) => tier.slug === slug);
}
