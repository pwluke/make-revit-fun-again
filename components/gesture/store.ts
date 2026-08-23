import { create } from "zustand";

export type GestureLabel =
  | "look"
  | "go"
  | "back"
  | "jump"
  | "build"
  | "break"
  | "hammer"
  | "leap"
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
  /** Thumb-up is being held — the butterfly hovers on this. */
  jumpHeld: boolean;
  /** Walking hand + thumb-up together: a jump that carries you forward. */
  leapQueued: boolean;
  /** One-shot actions, queued by the tracker and consumed by the game loop */
  jumpQueued: boolean;
  buildQueued: boolean;
  breakQueued: boolean;
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
  }) => void;
  queueLeap: () => void;
  queueJump: () => void;
  queueBuild: () => void;
  queueBreak: () => void;
  consumeLeap: () => boolean;
  consumeJump: () => boolean;
  consumeBuild: () => boolean;
  consumeBreak: () => boolean;
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
  leapQueued: false,
  jumpQueued: false,
  buildQueued: false,
  breakQueued: false,
  setActive: (active) => set({ active }),
  setStatus: (status) => set({ status }),
  setFrame: ({ faceTracking, handTracking, label, headYaw, headPitch, move, jumpHeld }) =>
    set({ faceTracking, handTracking, label, headYaw, headPitch, move, jumpHeld }),
  queueLeap: () => set({ leapQueued: true }),
  queueJump: () => set({ jumpQueued: true }),
  queueBuild: () => set({ buildQueued: true }),
  queueBreak: () => set({ breakQueued: true }),
  consumeLeap: () => {
    const queued = get().leapQueued;
    if (queued) set({ leapQueued: false });
    return queued;
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
  consumeBreak: () => {
    const queued = get().breakQueued;
    if (queued) set({ breakQueued: false });
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
      leapQueued: false,
      jumpQueued: false,
      buildQueued: false,
      breakQueued: false,
    }),
}));
