export type ModeId = "explore" | "explode" | "sketch" | "remix" | "treasure";
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
};

export const MODE_ORDER: ModeId[] = [
  "explore",
  "explode",
  "sketch",
  "remix",
  "treasure",
];

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
