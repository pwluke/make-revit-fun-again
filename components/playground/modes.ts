import { HIGH_GROUND } from "@/components/world/floodStore";

export type ModeId =
  | "explore"
  | "explode"
  | "sketch"
  | "remix"
  | "treasure"
  | "lasertag"
  | "race";
export type FloorId = "all" | "roof" | "upper" | "ground";
export type ItemId = "chair" | "plant" | "lamp" | "sketch";
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

export const MODE_ORDER: ModeId[] = [
  "explore",
  "explode",
  "sketch",
  "remix",
  "treasure",
];

/**
 * Modes that sit in the rail but outside the five-step adventure. Kept out of
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
    next: "Pull the building apart",
    color: "#5f63df",
    activityTitle: "Explore",
    activitySubtitle: "Look around the model",
    creative: true,
  },
  explode: {
    pill: "Layer explorer",
    title: "How does the school fit together?",
    guideName: "Zig",
    guide:
      "Use the slider—or turn on the camera and move your hands—to pull the layers apart!",
    companion: "\u{1F916}",
    mission: "Look between the layers",
    next: "Draw your own big idea",
    color: "#2cae87",
    activityTitle: "Pull It Apart",
    activitySubtitle: "See how it is built",
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
    next: "Remix a room with your idea",
    color: "#f09b3d",
    activityTitle: "Sketch to 3D",
    activitySubtitle: "Draw your big idea",
    creative: true,
  },
  remix: {
    pill: "Room remix",
    title: "Make this space feel like you!",
    guideName: "Moxie",
    guide:
      "Paint the walls and tap furniture, plants, lights, or your saved sketch to add them.",
    companion: "\u{1F98A}",
    mission: "Design a happy room",
    next: "Finish with a treasure hunt",
    color: "#568dc9",
    activityTitle: "Remix a Room",
    activitySubtitle: "Make the space yours",
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

export const ITEM_EMOJI: Record<ItemId, string> = {
  chair: "\u{1FA91}",
  plant: "\u{1FAB4}",
  lamp: "\u{1F4A1}",
  sketch: "\u270F\uFE0F",
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

export const PAINT_COLORS = [
  { value: "#ff846f", label: "Coral" },
  { value: "#f6c951", label: "Yellow" },
  { value: "#66cbb1", label: "Mint" },
  { value: "#797de8", label: "Purple" },
] as const;

export const INVENTORY: { id: ItemId; label: string }[] = [
  { id: "chair", label: "Chair" },
  { id: "plant", label: "Plant" },
  { id: "lamp", label: "Lamp" },
  { id: "sketch", label: "My idea" },
];

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
  explode: number;
  spun: boolean;
  floor: FloorId;
  inkPicked: boolean;
  sketchDrawn: boolean;
  sketchSaved: boolean;
  paintedCount: number;
  placedItems: ItemId[];
  treasures: number[];
  /** Scan-bots tagged this Laser Tag round, and how many the player chose. */
  botsTagged: number;
  botTotal: number;
  /** Treasure Hunt: animal emblems found, powers ever switched on, and
   *  dinosaur fragments dug up — each against its own total. */
  animalsFound: number;
  animalsTotal: number;
  powersUsed: number;
  fossilsFound: number;
  fossilsTotal: number;
  /** Flood surface height, in world units. Drives the Race to the Top steps. */
  waterLevel: number;
};

export function getMission(mode: ModeId, progress: PlayProgress): MissionStep[] {
  if (mode === "explode") {
    return [
      {
        title: "Lift the roof",
        detail: "Move the slider or wave your hands",
        done: progress.explode >= 10,
      },
      {
        title: "Find the middle",
        detail: "Pull the layers farther apart",
        done: progress.explode >= 42,
      },
      {
        title: "See every layer",
        detail: "Open the building all the way",
        done: progress.explode >= 82,
      },
    ];
  }

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
        title: "Save it for remix",
        detail: "Tap \u201CSave my idea\u201D",
        done: progress.sketchSaved,
      },
    ];
  }

  if (mode === "remix") {
    return [
      {
        title: "Paint the walls",
        detail: "Choose a happy new color",
        done: progress.paintedCount > 0,
      },
      {
        title: "Add something",
        detail: "Pick an item from the inventory",
        done: progress.placedItems.length > 0,
      },
      {
        title: "Use your own idea",
        detail: "Place your Sketch to 3D creation",
        done: progress.placedItems.includes("sketch"),
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
    return [
      {
        title: "Find all the animals",
        detail: `${progress.animalsFound}/${progress.animalsTotal} emblems — walk into one to collect it`,
        done:
          progress.animalsTotal > 0 &&
          progress.animalsFound >= progress.animalsTotal,
      },
      {
        title: "Use every animal power",
        detail: `${progress.powersUsed}/${progress.animalsTotal} tried — press 1-4 to switch one on`,
        done:
          progress.animalsTotal > 0 &&
          progress.powersUsed >= progress.animalsTotal,
      },
      {
        title: "Rebuild the dinosaur",
        detail: `${progress.fossilsFound}/${progress.fossilsTotal} fragments — they hide on every floor`,
        done:
          progress.fossilsTotal > 0 &&
          progress.fossilsFound >= progress.fossilsTotal,
      },
    ];
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
