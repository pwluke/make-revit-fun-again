"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { db } from "@/lib/db";
import { useLaserTagStore } from "@/components/lasertag/laserTagStore";
import {
  getMission,
  MODE_ORDER,
  MODES,
  type ConnectionStatus,
  type FloorId,
  type ItemId,
  type ModeId,
} from "./modes";
import { playTone } from "./play-tone";

export type PlacedItem = {
  id: string;
  item: ItemId;
  left: string;
  top: string;
};

export type ToastCopy = {
  title: string;
  message: string;
};

type PlaygroundContextValue = {
  mode: ModeId;
  setMode: (mode: ModeId, announce?: boolean) => void;
  nextMode: ModeId;
  stars: number;
  sound: boolean;
  toggleSound: () => void;
  floor: FloorId;
  setFloor: (floor: FloorId) => void;
  explode: number;
  setExplode: (value: number) => void;
  spun: boolean;
  markSpun: () => void;
  ink: string;
  setInk: (ink: string) => void;
  inkPicked: boolean;
  sketchDrawn: boolean;
  markSketchDrawn: () => void;
  sketchSaved: boolean;
  saveSketch: () => void;
  clearSketch: () => void;
  sketchVersion: number;
  paintedColors: string[];
  paintColor: (color: string) => void;
  placedItems: PlacedItem[];
  placeItem: (item: ItemId) => void;
  treasures: number[];
  findTreasure: (id: number) => void;
  rewardedModes: ModeId[];
  toast: ToastCopy;
  toastVisible: boolean;
  showToast: (title: string, message: string) => void;
  tone: (frequency?: number, duration?: number) => void;
  resetView: () => void;
  fullscreen: boolean;
  toggleFullscreen: () => void;
  stageRef: RefObject<HTMLElement | null>;
  fov: number;
  zoomIn: () => void;
  zoomOut: () => void;
  sceneEpoch: number;
  connection: ConnectionStatus;
  connectionText: string;
  modelName: string;
};

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

export function usePlayground() {
  const value = useContext(PlaygroundContext);
  if (!value) {
    throw new Error("usePlayground must be used inside PlaygroundProvider");
  }
  return value;
}

import { useHeroStore } from "@/components/world/store";
import { ACTIVE_DINO, DINOS, useDinoStore } from "@/components/world/dinoStore";

export function PlaygroundProvider({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const [mode, setModeState] = useState<ModeId>("explore");
  const [stars, setStars] = useState(128);
  const [sound, setSound] = useState(true);
  const [floor, setFloorState] = useState<FloorId>("all");
  const [explode, setExplodeState] = useState(0);
  const [spun, setSpun] = useState(false);
  const [ink, setInkState] = useState("#f05d72");
  const [inkPicked, setInkPicked] = useState(false);
  const [sketchDrawn, setSketchDrawn] = useState(false);
  const [sketchSaved, setSketchSaved] = useState(false);
  const [sketchVersion, setSketchVersion] = useState(0);
  const [paintedColors, setPaintedColors] = useState<string[]>([]);
  const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
  const [treasures, setTreasures] = useState<number[]>([]);
  const treasuresRef = useRef<number[]>([]);
  const [rewardedModes, setRewardedModes] = useState<ModeId[]>([]);
  const rewardedRef = useRef<ModeId[]>([]);
  const [toast, setToast] = useState<ToastCopy>({
    title: "Great job!",
    message: "You found something new.",
  });
  const [toastVisible, setToastVisible] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fov, setFov] = useState(45);
  const [sceneEpoch, setSceneEpoch] = useState(0);
  /**
   * Read straight from the Laser Tag store rather than mirrored into context:
   * the mission effect below is the only consumer, and putting it on the
   * context value would re-render the whole playground on every tag.
   */
  const botsTagged = useLaserTagStore((s) => s.tagged.length);
  const botTotal = useLaserTagStore((s) => s.total);

  const { isLoading, error } = db.useQuery({ points: {} });
  const connection: ConnectionStatus = error
    ? "offline"
    : isLoading
      ? "syncing"
      : "live";
  const connectionText = error
    ? "Model stream offline"
    : isLoading
      ? "Receiving model update\u2026"
      : "Live model connected";
  const modelName = "Riverside School";

  const tone = useCallback(
    (frequency?: number, duration?: number) => {
      playTone(sound, frequency, duration);
    },
    [sound],
  );

  const showToast = useCallback((title: string, message: string) => {
    setToast({ title, message });
    setToastVisible(true);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToastVisible(false);
    }, 2600);
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(toastTimer.current);
  }, []);

  const setMode = useCallback(
    (next: ModeId, announce = false) => {
      if (!MODES[next]) return;
      setModeState(next);
      if (announce) {
        const config = MODES[next];
        const index = MODE_ORDER.indexOf(next);
        showToast(config.pill, `${config.guideName} is ready to help!`);
        tone(430 + index * 55);
      }
    },
    [showToast, tone],
  );

  const setFloor = useCallback(
    (next: FloorId) => {
      setFloorState(next);
      tone(490);
    },
    [tone],
  );

  const setExplode = useCallback((value: number) => {
    setExplodeState(Math.min(100, Math.max(0, value)));
  }, []);

  const markSpun = useCallback(() => {
    setSpun(true);
  }, []);

  const setInk = useCallback(
    (next: string) => {
      setInkState(next);
      setInkPicked(true);
      tone(600);
    },
    [tone],
  );

  const markSketchDrawn = useCallback(() => {
    setSketchDrawn(true);
  }, []);

  const saveSketch = useCallback(() => {
    if (!sketchDrawn) {
      showToast(
        "Draw something first",
        "Make a mark on the model, then save your idea.",
      );
      return;
    }
    setSketchSaved(true);
    showToast("Idea saved!", "Your sketch is waiting in the Remix inventory.");
    tone(720, 0.13);
  }, [showToast, sketchDrawn, tone]);

  const clearSketch = useCallback(() => {
    setSketchDrawn(false);
    setSketchSaved(false);
    setSketchVersion((version) => version + 1);
  }, []);

  const paintColor = useCallback(
    (color: string) => {
      setPaintedColors((colors) =>
        colors.includes(color) ? colors : [...colors, color],
      );
      tone(560);
    },
    [tone],
  );

  const placeItem = useCallback(
    (item: ItemId) => {
      if (item === "sketch" && !sketchSaved) {
        showToast(
          "Save a sketch first",
          "Visit Sketch to 3D, draw an idea, and save it.",
        );
        return;
      }

      setPlacedItems((items) => [
        ...items,
        {
          id: `${item}-${items.length}-${Date.now()}`,
          item,
          left: `${22 + ((items.length * 17) % 56)}%`,
          top: `${30 + ((items.length * 13) % 38)}%`,
        },
      ]);
      const label =
        item === "chair"
          ? "Chair"
          : item === "plant"
            ? "Plant"
            : item === "lamp"
              ? "Lamp"
              : "My idea";
      showToast(`${label} added!`, "Your room is becoming one of a kind.");
      tone(660);
    },
    [showToast, sketchSaved, tone],
  );

  const findTreasure = useCallback(
    (id: number) => {
      if (treasuresRef.current.includes(id)) return;
      const next = [...treasuresRef.current, id];
      treasuresRef.current = next;
      setTreasures(next);
      setStars((count) => count + 5);
      showToast("Treasure found!", "You found a bonus 5-star surprise.");
      tone(820, 0.12);
    },
    [showToast, tone],
  );

  const toggleSound = useCallback(() => {
    setSound((enabled) => {
      const next = !enabled;
      if (next) playTone(true);
      return next;
    });
  }, []);

  const resetView = useCallback(() => {
    setFloorState("all");
    setExplodeState(0);
    setFov(45);
    setSceneEpoch((epoch) => epoch + 1);
    showToast("Ready to explore", "The model is back to its starting view.");
  }, [showToast]);

  const toggleFullscreen = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await stage.requestFullscreen();
      }
    } catch {
      showToast(
        "Fullscreen unavailable",
        "Your browser did not allow fullscreen mode.",
      );
    }
  }, [showToast]);

  useEffect(() => {
    const onChange = () => {
      setFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Treasure Hunt progress. Read here as well as in MissionPanel so the
  // reward effect below sees the same numbers the panel shows — otherwise a
  // mission could read "complete" and never pay out.
  const animalsFound = useHeroStore((s) => s.found.length);
  const animalsTotal = useHeroStore((s) => s.total);
  const powersUsed = useHeroStore((s) => s.everUsed.length);
  const fossilsFound = useDinoStore((s) => s.found.length);
  const fossilsTotal = DINOS[ACTIVE_DINO].parts.length;

  const zoomIn = useCallback(() => {
    setFov((current) => Math.max(28, current - 6));
  }, []);

  const zoomOut = useCallback(() => {
    setFov((current) => Math.min(75, current + 6));
  }, []);

  useEffect(() => {
    const steps = getMission(mode, {
      explode,
      spun,
      floor,
      inkPicked,
      sketchDrawn,
      sketchSaved,
      paintedCount: paintedColors.length,
      placedItems: placedItems.map((item) => item.item),
      treasures,
      botsTagged,
      botTotal,
      animalsFound,
      animalsTotal,
      powersUsed,
      fossilsFound,
      fossilsTotal,
    });
    const finished = steps.every((step) => step.done);
    if (!finished || rewardedRef.current.includes(mode)) return;

    rewardedRef.current = [...rewardedRef.current, mode];
    setRewardedModes(rewardedRef.current);
    setStars((count) => count + 15);
    showToast("Mission complete!", "You earned 15 stars.");
    tone(760, 0.16);
  }, [
    animalsFound,
    animalsTotal,
    botTotal,
    botsTagged,
    explode,
    floor,
    fossilsFound,
    fossilsTotal,
    inkPicked,
    mode,
    paintedColors.length,
    placedItems,
    powersUsed,
    showToast,
    sketchDrawn,
    sketchSaved,
    spun,
    tone,
    treasures,
  ]);

  const nextMode = MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length];

  const value = useMemo<PlaygroundContextValue>(
    () => ({
      mode,
      setMode,
      nextMode,
      stars,
      sound,
      toggleSound,
      floor,
      setFloor,
      explode,
      setExplode,
      spun,
      markSpun,
      ink,
      setInk,
      inkPicked,
      sketchDrawn,
      markSketchDrawn,
      sketchSaved,
      saveSketch,
      clearSketch,
      sketchVersion,
      paintedColors,
      paintColor,
      placedItems,
      placeItem,
      treasures,
      findTreasure,
      rewardedModes,
      toast,
      toastVisible,
      showToast,
      tone,
      resetView,
      fullscreen,
      toggleFullscreen,
      stageRef,
      fov,
      zoomIn,
      zoomOut,
      sceneEpoch,
      connection,
      connectionText,
      modelName,
    }),
    [
      clearSketch,
      connection,
      connectionText,
      explode,
      findTreasure,
      floor,
      fov,
      fullscreen,
      ink,
      inkPicked,
      markSketchDrawn,
      markSpun,
      mode,
      modelName,
      nextMode,
      paintColor,
      paintedColors,
      placeItem,
      placedItems,
      resetView,
      rewardedModes,
      saveSketch,
      sceneEpoch,
      setExplode,
      setFloor,
      setInk,
      setMode,
      showToast,
      sketchDrawn,
      sketchSaved,
      sketchVersion,
      sound,
      spun,
      stars,
      toast,
      toastVisible,
      toggleFullscreen,
      toggleSound,
      tone,
      treasures,
      zoomIn,
      zoomOut,
    ],
  );

  return (
    <PlaygroundContext.Provider value={value}>
      {children}
    </PlaygroundContext.Provider>
  );
}
