import { HIGH_GROUND } from "@/components/world/floodStore";

export type ModeId =
  | "explore"
  | "sketch"
  | "treasure"
  | "lasertag"
  | "race";
export type FloorId = "all" | "roof" | "upper" | "ground";
export type ConnectionStatus = "live" | "syncing" | "offline";

export type ModeConfig = {
  pill: string;
  title: string;
  guideName: string;
  guide: string;
  companion: string;
  mission: string;
  next: string;
  color: string;
  activityTitle: string;
  activitySubtitle: string;
  /**
   * Whether the mode runs with the flood in creative mode — water frozen,
   * drowning off. This is the single source of truth for that toggle now: the
   * rail owns it, `PlaygroundProvider` pushes it into the flood store on every
   * mode change, and the 🛠 Creative button is hidden in the playground because
   * a child pressing it would be fighting the mode they picked.
   *
   * Every mode here is creative except `race`, which IS the flood game.
   */
  creative: boolean;
};

export const MODE_ORDER: ModeId[] = ["explore", "sketch", "treasure"];

/**
 * Modes that sit in the rail but outside the three-step adventure. Kept out of
 * MODE_ORDER on purpose — appending there would make `nextMode` stop wrapping
 * from treasure back to explore, which is what "Play the adventure again"
 * promises. Being absent leaves indexOf at -1, which lands harmlessly: the
 * announce tone drops a step and `nextMode` resolves to explore, exactly right
 * for a mode you step out of the sequence to play.
 */
export const EXTRA_MODES: ModeId[] = ["lasertag", "race"];

export const MODES: Record<ModeId, ModeConfig> = {
  explore: {
    pill: "Free explore",
    title: "The whole school is yours!",
    guideName: "Pip",
    guide: "Try spinning the model, then pick a floor to peek inside!",
    companion: "\u{1F477}\u{200D}\u2640\uFE0F",
    mission: "Meet your building",
    next: "Draw your own big idea",
    color: "#5f63df",
    activityTitle: "Explore",
    activitySubtitle: "Look around the model",
    creative: true,
  },
  sketch: {
    pill: "Sketch to 3D",
    title: "Draw right on the model!",
    guideName: "Doodle",
    guide:
      "Pick a color and use your finger, stylus, or mouse to draw your big idea.",
    companion: "\u{1F58D}\uFE0F",
    mission: "Make your mark",
    next: "Finish with a treasure hunt",
    color: "#f09b3d",
    activityTitle: "Sketch to 3D",
    activitySubtitle: "Draw your big idea",
    creative: true,
  },
  treasure: {
    pill: "Final adventure",
    title: "Find all three hidden treasures!",
    guideName: "Scout",
    guide:
      "Look high, low, and around the trees. Tap every question mark you discover!",
    companion: "\u{1F989}",
    mission: "The final treasure hunt",
    next: "Play the adventure again",
    color: "#e85675",
    activityTitle: "Treasure Hunt",
    activitySubtitle: "Find hidden surprises",
    creative: true,
  },
  lasertag: {
    pill: "Laser tag scan",
    title: "Scan-bots are loose in the school!",
    guideName: "Volt",
    guide:
      "Click the model to take aim, then click to fire. Sweep the courtyards—they wander!",
    companion: "\u{1F47E}",
    mission: "Tag every scan-bot",
    next: "Back to free explore",
    color: "#7b52d3",
    activityTitle: "Laser Tag Scan",
    activitySubtitle: "Tag wandering bots",
    creative: true,
  },
  race: {
    pill: "Race to the top",
    title: "The water is rising—get high!",
    guideName: "Splash",
    guide:
      "The flood is coming and it does not stop. Climb the stairs to the upper floor, then out to the roof terrace!",
    companion: "\u{1F30A}",
    mission: "Race to the top",
    next: "Back to free explore",
    color: "#2f9fd6",
    activityTitle: "Race to the Top",
    activitySubtitle: "Outclimb the flood",
    // The one mode with creative off — this IS the flood game.
    creative: false,
  },
};

export const FLOORS: { id: FloorId; label: string }[] = [
  { id: "all", label: "Whole model" },
  { id: "roof", label: "Roof" },
  { id: "upper", label: "Upper floor" },
  { id: "ground", label: "Ground" },
];

export const INK_COLORS = [
  { value: "#f05d72", label: "Red pencil" },
  { value: "#5362d9", label: "Blue pencil" },
  { value: "#1d9779", label: "Green pencil" },
] as const;

export const TREASURES = [
  { id: 1, className: "marker-one", label: "Find treasure near the roof" },
  { id: 2, className: "marker-two", label: "Find treasure near the entrance" },
  { id: 3, className: "marker-three", label: "Find treasure by the trees" },
] as const;

export type MissionStep = {
  title: string;
  detail: string;
  done: boolean;
};

export type PlayProgress = {
  spun: boolean;
  floor: FloorId;
  inkPicked: boolean;
  sketchDrawn: boolean;
  sketchSaved: boolean;
  treasures: number[];
  /** Scan-bots tagged this Laser Tag round, and how many the player chose. */
  botsTagged: number;
  botTotal: number;
  /** Flood surface height, in world units. Drives the Race to the Top steps. */
  waterLevel: number;
};

export function getMission(mode: ModeId, progress: PlayProgress): MissionStep[] {
  if (mode === "sketch") {
    return [
      {
        title: "Pick a crayon",
        detail: "Choose a drawing color",
        done: progress.inkPicked,
      },
      {
        title: "Draw your idea",
        detail: "Use touch, stylus, or mouse",
        done: progress.sketchDrawn,
      },
      {
        title: "Save your idea",
        detail: "Tap \u201CSave my idea\u201D",
        done: progress.sketchSaved,
      },
    ];
  }

  if (mode === "lasertag") {
    return [
      {
        title: "Grab the scanner",
        detail: "Click the model to look around",
        done: progress.spun,
      },
      {
        title: "Tag your first bot",
        detail: "Line up the crosshair and click",
        done: progress.botsTagged >= 1,
      },
      {
        // The count is the player's choice on the setup card, so the step has
        // to read off it rather than assuming a full five.
        title:
          progress.botTotal === 1 ? "Tag the bot" : `Tag all ${progress.botTotal}`,
        detail: "Sweep the whole building",
        done: progress.botTotal > 0 && progress.botsTagged >= progress.botTotal,
      },
    ];
  }

  if (mode === "race") {
    /**
     * Read off the water, not the player. The flood only climbs while you are
     * alive — drowning freezes it and a restart drops it back to the start — so
     * "the water reached the roof" and "you outclimbed it to the roof" are the
     * same fact, and the steps un-tick on a death without any extra bookkeeping.
     * Thresholds come from HIGH_GROUND so they cannot drift from the floors the
     * flood HUD points the player at.
     */
    const [plinth, upper, roof] = HIGH_GROUND;
    return [
      {
        title: "Beat it to the plinth",
        detail: "Get off the grass before the water does",
        done: progress.waterLevel >= plinth.level,
      },
      {
        title: "Climb to the upper floor",
        detail: "Take the indoor stairs",
        done: progress.waterLevel >= upper.level,
      },
      {
        title: "Make the roof terrace",
        detail: "Up the outdoor stair—that is the top",
        done: progress.waterLevel >= roof.level,
      },
    ];
  }

  if (mode === "treasure") {
    return [1, 2, 3].map((number) => ({
      title: `Find treasure ${number}`,
      detail: "Tap a hidden question mark",
      done: progress.treasures.includes(number),
    }));
  }

  return [
    { title: "Say hello!", detail: "Open the live school model", done: true },
    {
      title: "Spin it around",
      detail: "Drag anywhere on the model",
      done: progress.spun,
    },
    {
      title: "Peek inside",
      detail: "Choose a floor below",
      done: progress.floor !== "all",
    },
  ];
}
