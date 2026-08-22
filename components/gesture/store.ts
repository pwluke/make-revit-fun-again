import { create } from "zustand";

export type GestureLabel =
  | "look"
  | "go"
  | "back"
  | "jump"
  | "build"
  | "orbit"
  | null;
export type GestureStatus = "off" | "starting" | "on" | "error";

type GestureState = {
  /** User pressed the Hands button */
  active: boolean;
  /** Camera / recognizer lifecycle */
  status: GestureStatus;
  /** A face is currently visible (drives head-look steering) */
  faceTracking: boolean;
  /** At least one hand is currently visible */
  handTracking: boolean;
  /** Gesture currently recognized (drives the legend highlight) */
  label: GestureLabel;
  /** Head rotation relative to the neutral pose, radians, smoothed.
   *  Positive yaw = head turned to the user's left; positive pitch = up. */
  headYaw: number;
  headPitch: number;
  /** Walk direction: 1 forward (palm), -1 backward (back of hand), 0 idle */
  move: number;
  /** Thumb-up currently held — lets an airborne player glide */
  jumpHeld: boolean;
  /** A fist is held: the camera orbits the grabbed target */
  orbiting: boolean;
  /** Accumulated fist travel while orbiting, consumed by the game loop */
  orbitDelta: { x: number; y: number };
  /** One-shot actions, queued by the tracker and consumed by the game loop */
  jumpQueued: boolean;
  buildQueued: boolean;
  setActive: (active: boolean) => void;
  setStatus: (status: GestureStatus) => void;
  setFrame: (frame: {
    faceTracking: boolean;
    handTracking: boolean;
    label: GestureLabel;
    headYaw: number;
    headPitch: number;
    move: number;
    jumpHeld: boolean;
    orbiting: boolean;
  }) => void;
  addOrbit: (dx: number, dy: number) => void;
  queueJump: () => void;
  queueBuild: () => void;
  consumeOrbit: () => { x: number; y: number };
  consumeJump: () => boolean;
  consumeBuild: () => boolean;
  reset: () => void;
};

export const useGestureStore = create<GestureState>((set, get) => ({
  active: false,
  status: "off",
  faceTracking: false,
  handTracking: false,
  label: null,
  headYaw: 0,
  headPitch: 0,
  move: 0,
  jumpHeld: false,
  orbiting: false,
  orbitDelta: { x: 0, y: 0 },
  jumpQueued: false,
  buildQueued: false,
  setActive: (active) => set({ active }),
  setStatus: (status) => set({ status }),
  setFrame: ({ faceTracking, handTracking, label, headYaw, headPitch, move, jumpHeld, orbiting }) =>
    set({ faceTracking, handTracking, label, headYaw, headPitch, move, jumpHeld, orbiting }),
  addOrbit: (dx, dy) =>
    set((s) => ({ orbitDelta: { x: s.orbitDelta.x + dx, y: s.orbitDelta.y + dy } })),
  queueJump: () => set({ jumpQueued: true }),
  queueBuild: () => set({ buildQueued: true }),
  consumeOrbit: () => {
    const delta = get().orbitDelta;
    if (delta.x !== 0 || delta.y !== 0) set({ orbitDelta: { x: 0, y: 0 } });
    return delta;
  },
  consumeJump: () => {
    const queued = get().jumpQueued;
    if (queued) set({ jumpQueued: false });
    return queued;
  },
  consumeBuild: () => {
    const queued = get().buildQueued;
    if (queued) set({ buildQueued: false });
    return queued;
  },
  reset: () =>
    set({
      status: "off",
      faceTracking: false,
      handTracking: false,
      label: null,
      headYaw: 0,
      headPitch: 0,
      move: 0,
      jumpHeld: false,
      orbiting: false,
      orbitDelta: { x: 0, y: 0 },
      jumpQueued: false,
      buildQueued: false,
    }),
}));
