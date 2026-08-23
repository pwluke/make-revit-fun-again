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
import { useGestureStore } from "@/components/gesture/store";
import { sketchStore } from "@/components/sketch3d/core/strokeStore";
import { creationStore } from "@/components/sketch-to-3d/core/creationStore";
import { SANDBOX_TOOLS, useSketchTools } from "@/components/world/sketchTools";
import { useFloodStore } from "@/components/world/floodStore";
import {
  getMission,
  MODE_ORDER,
  MODES,
  type ConnectionStatus,
  type FloorId,
  type ModeId,
} from "./modes";
import { playTone } from "./play-tone";

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
  const [spun, setSpun] = useState(false);
  const [ink, setInkState] = useState("#f05d72");
  const [inkPicked, setInkPicked] = useState(false);
  const [sketchDrawn, setSketchDrawn] = useState(false);
  const [sketchSaved, setSketchSaved] = useState(false);
  const [sketchVersion, setSketchVersion] = useState(0);
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
  /** Same reasoning as the Laser Tag counts: only the mission effect reads it,
   *  and it changes as the water climbs. */
  const waterLevel = useFloodStore((s) => s.level);

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

  /**
   * Entering an activity. Activities do not overlap, so this is the single
   * place that says what that means: every input sub-mode from the previous
   * activity is torn down, then this one is configured.
   *
   * Without it a mode inherits whatever the last one left running — drawing
   * still armed during the treasure hunt, the gesture camera still holding the
   * mouse in laser tag, a half-resized creation floating over the model. The
   * teardown is unconditional rather than "only when leaving mode X": the rule
   * is cheaper to hold in your head, and each call is already a no-op when that
   * sub-mode is not active.
   *
   * An effect rather than a branch inside setMode, so it also covers the
   * initial mount — `mode` starts at "explore" and setMode has not run.
   */
  useEffect(() => {
    const sketching = mode === "sketch";

    sketchStore.getState().setDrawMode(false);
    useGestureStore.getState().setActive(false);
    creationStore.getState().select(null);
    // Also on the way IN to laser tag, which is what makes the setup card
    // appear rather than dropping the player into a stale finished round.
    useLaserTagStore.getState().backToSetup();

    // Sketch-to-3D — E, B, editing a creation, and the 2D crayon surface — is
    // available in its own mode and nowhere else. Crayon is the surface the
    // mode opens on, preserving the "pick a crayon → draw → save" mission; the
    // player switches to Draw or Look from the control bar.
    useSketchTools.getState().configure({
      enabled: sketching,
      crayonAvailable: sketching,
      crayon: sketching,
    });
  }, [mode]);

  // Restore the permissive defaults when the playground unmounts. These are
  // module-level stores, so without this a client-side navigation from / to
  // /minecraft would carry this page's restrictions onto the sandbox, silently
  // killing E and B on a page that has no mode rail to turn them back on.
  useEffect(() => () => useSketchTools.getState().configure(SANDBOX_TOOLS), []);

  const setFloor = useCallback(
    (next: FloorId) => {
      setFloorState(next);
      tone(490);
    },
    [tone],
  );

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
    showToast("Idea saved!", "Your sketch is part of the model now.");
    tone(720, 0.13);
  }, [showToast, sketchDrawn, tone]);

  const clearSketch = useCallback(() => {
    setSketchDrawn(false);
    setSketchSaved(false);
    setSketchVersion((version) => version + 1);
  }, []);

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

  /**
   * The rail owns creative mode. Every activity is a place to build and look
   * around, so the flood is frozen in all of them — except Race to the Top,
   * which is the flood game itself. That is why the 🛠 Creative button is
   * hidden inside the playground (see `ThemeHud`'s `creativeToggle`): with the
   * mode driving the toggle, pressing it would only fight the card the child
   * just picked, and it would be re-overwritten by this effect anyway.
   *
   * Depending on the boolean rather than `mode` is deliberate: moving between
   * two creative modes must not restart anything.
   */
  const creative = MODES[mode].creative;
  useEffect(() => {
    const flood = useFloodStore.getState();
    flood.setCreative(creative);
    // Entering the race starts a fresh run: water back to its starting level
    // and — via `respawnToken` — the player back on the grass. Without this the
    // race would begin wherever the frozen water happened to be left, which for
    // a child who explored for a while is already over their head.
    if (!creative) flood.reset();
  }, [creative]);

  useEffect(() => {
    const steps = getMission(mode, {
      spun,
      floor,
      inkPicked,
      sketchDrawn,
      sketchSaved,
      treasures,
      botsTagged,
      botTotal,
      animalsFound,
      animalsTotal,
      powersUsed,
      fossilsFound,
      fossilsTotal,
      waterLevel,
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
    floor,
    fossilsFound,
    fossilsTotal,
    inkPicked,
    mode,
    powersUsed,
    showToast,
    sketchDrawn,
    sketchSaved,
    spun,
    tone,
    treasures,
    waterLevel,
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
      resetView,
      rewardedModes,
      saveSketch,
      sceneEpoch,
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
