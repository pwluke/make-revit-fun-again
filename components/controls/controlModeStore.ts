"use client";

import { create, useStore } from "zustand";
import { useGestureStore } from "@/components/gesture/store";
import { creationStore } from "@/components/sketch-to-3d/core/creationStore";
import { sketchStore } from "@/components/sketch3d/core/strokeStore";

/**
 * The four ways to drive the world, in one place.
 *
 * Two of them already owned a flag before this module existed —
 * `sketchStore.drawMode` (the `B` key) and `useGestureStore.active` (the Hands
 * button) — and the mode below is DERIVED from those rather than mirrored into
 * a field of its own. That is deliberate: a mirrored copy desyncs the instant
 * someone presses `B` or the camera window's ✕, and both of those bypass this
 * module entirely. Deriving means the buttons always show what the world is
 * actually doing, whichever entry point got it there.
 *
 * `mouseLook` is the one bit nothing else could supply: the difference between
 * "the mouse is looking around" and "the arrow keys are", which is the whole of
 * keyboard mode.
 */
export type ControlModeId = "pointerlock" | "keyboard" | "draw" | "hands";

export type ControlModeConfig = {
  id: ControlModeId;
  icon: string;
  /** Short enough for a toolbar chip on a phone. */
  label: string;
  /** One line, used for the button tooltip and the in-viewport hint. */
  help: string;
};

export const CONTROL_MODES: ControlModeConfig[] = [
  {
    id: "pointerlock",
    icon: "\u{1F5B1}️",
    label: "Mouse",
    help: "Click the model to grab the mouse · WASD to walk · Esc to let it go",
  },
  {
    id: "keyboard",
    icon: "⌨️",
    label: "Keys",
    help: "WASD to walk · arrow keys to look · the mouse stays yours",
  },
  {
    id: "draw",
    icon: "✏️",
    label: "Draw",
    help: "Hold the left mouse button to pull a ribbon through the air",
  },
  {
    id: "hands",
    icon: "\u{1F44B}",
    label: "Hands",
    help: "Turn your head to look, then use hand signs to walk, jump and build",
  },
];

export const CONTROL_MODE: Record<ControlModeId, ControlModeConfig> =
  Object.fromEntries(CONTROL_MODES.map((entry) => [entry.id, entry])) as Record<
    ControlModeId,
    ControlModeConfig
  >;

type ControlModeState = {
  /** Whether the mouse owns looking. False means the arrow keys do. */
  mouseLook: boolean;
  setMouseLook: (mouseLook: boolean) => void;
};

export const useControlModeStore = create<ControlModeState>((set) => ({
  mouseLook: true,
  setMouseLook: (mouseLook) => set({ mouseLook }),
}));

function derive(
  handsOn: boolean,
  drawMode: boolean,
  mouseLook: boolean,
): ControlModeId {
  // Hands and Draw each own an input the other two also want — the camera and
  // the left mouse button — so they win over the mouse/keys choice. Draw beats
  // `mouseLook` rather than requiring it: pressing `B` while in keyboard mode
  // should start drawing, not silently do nothing.
  if (handsOn) return "hands";
  if (drawMode) return "draw";
  return mouseLook ? "pointerlock" : "keyboard";
}

/** Subscribing read, for components. */
export function useControlMode(): ControlModeId {
  const handsOn = useGestureStore((state) => state.active);
  const drawMode = useStore(sketchStore, (state) => state.drawMode);
  const mouseLook = useControlModeStore((state) => state.mouseLook);
  return derive(handsOn, drawMode, mouseLook);
}

/** One-shot read, for frame loops and event handlers that must not subscribe. */
export function controlMode(): ControlModeId {
  return derive(
    useGestureStore.getState().active,
    sketchStore.getState().drawMode,
    useControlModeStore.getState().mouseLook,
  );
}

/**
 * Whether <PointerLockControls> belongs on screen. Draw needs the lock every
 * bit as much as mouse-look does: the camera IS the pen, and
 * `SketchController` refuses to start a stroke without a lock held
 * (components/sketch3d/r3f/SketchController.tsx).
 */
export function locksTheMouse(mode: ControlModeId): boolean {
  return mode === "pointerlock" || mode === "draw";
}

export function setControlMode(mode: ControlModeId): void {
  // Write the feature flags, never a copy of `mode` — see the note at the top.
  sketchStore.getState().setDrawMode(mode === "draw");
  useGestureStore.getState().setActive(mode === "hands");
  // Only the two modes that ARE the mouse/keys choice get to change it. Draw
  // and Hands borrow the input and hand it back, so stepping out of either
  // returns you to whichever of the two you were using before.
  if (mode === "pointerlock" || mode === "keyboard") {
    useControlModeStore.getState().setMouseLook(mode === "pointerlock");
  }

  // Grab (or release) the pointer here rather than from an effect beside
  // <PointerLockControls>: requestPointerLock needs user activation, and this
  // runs inside the click that chose the mode. Coming from Hands the controls
  // are not mounted yet, so this no-ops and the next click on the world takes
  // the lock — exactly the plain click-to-look path.
  creationStore.getState().bridge?.setInputEnabled(locksTheMouse(mode));
}
