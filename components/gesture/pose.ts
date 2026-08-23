/**
 * Hand-pose classification, kept pure and separate from the tracker effect so
 * it can be reasoned about — and exercised — without a camera in the loop.
 *
 * Everything works in fractions of the palm size (wrist -> middle knuckle), so
 * the thresholds hold regardless of how near the hand is to the lens.
 */

export type Landmark = { x: number; y: number; z: number };
export type HandPose =
  | "palm"
  | "back"
  | "fist"
  | "thumb"
  | "pinch"
  | "purse"
  | "other";

/** Two-finger pinch hysteresis (fractions of palm size). The pinch must reopen
 *  past PINCH_OPEN before the next close can build again — one pinch, one block. */
export const PINCH_CLOSE = 0.3;
export const PINCH_OPEN = 0.45;
/** Full-hand pinch ("purse"): every fingertip this close to the thumb tip... */
export const PURSE_CLOSE = 0.55;
/** ...while the tips still reach this far from the wrist. A fist gathers the
 *  fingers too, but tucks them into the palm — this is what separates them. */
export const PURSE_MIN_REACH = 1.2;
/** Above this the hand counts as open, below it as a fist. */
export const OPEN_REACH = 1.55;
export const FIST_REACH = 1.1;
/** Flip if palm/back of hand are detected the wrong way around. */
export const PALM_SIGN = 1;

const FINGER_TIPS = [8, 12, 16, 20];
const THUMB_TIP = 4;

export const dist = (a: Landmark, b: Landmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Whether the palm (not the back of the hand) faces the camera, from the
 *  winding of wrist -> index base -> pinky base in image space. */
export function palmFacesCamera(lm: Landmark[], handedness: string) {
  const crossZ =
    (lm[5].x - lm[0].x) * (lm[17].y - lm[0].y) -
    (lm[5].y - lm[0].y) * (lm[17].x - lm[0].x);
  const palm = handedness === "Right" ? crossZ < 0 : crossZ > 0;
  return PALM_SIGN > 0 ? palm : !palm;
}

/** How far the fingertips sit from the wrist, in palm widths. */
export function tipReachOf(lm: Landmark[]) {
  const palm = dist(lm[0], lm[9]) || 1;
  return (
    FINGER_TIPS.reduce((sum, t) => sum + dist(lm[0], lm[t]) / palm, 0) /
    FINGER_TIPS.length
  );
}

/** Classify one hand into the coarse pose the control rules care about. */
export function classifyPose(
  canned: string,
  lm: Landmark[],
  handedness: string,
): HandPose {
  const palm = dist(lm[0], lm[9]) || 1;
  const middleExtended = dist(lm[0], lm[12]) / palm > 1.2;
  const tipReach = tipReachOf(lm);

  // Purse (full-hand pinch) is tested first, ahead of the canned categories:
  // with every fingertip gathered the hand reads as closed, so the classifier
  // tends to call it Closed_Fist — which is orbit. It would also satisfy the
  // two-finger pinch test below, since thumb and index are touching.
  const gathered = FINGER_TIPS.every(
    (t) => dist(lm[THUMB_TIP], lm[t]) / palm < PURSE_CLOSE,
  );
  if (gathered && tipReach > PURSE_MIN_REACH) return "purse";

  // Two-finger pinch: thumb meets index while the middle finger stays up —
  // a fist also curls the thumb near the index, hence the second check.
  if (middleExtended && dist(lm[THUMB_TIP], lm[8]) / palm < PINCH_OPEN) {
    return "pinch";
  }
  if (canned === "Closed_Fist") return "fist";
  if (canned === "Thumb_Up") return "thumb";
  if (canned === "Open_Palm") {
    return palmFacesCamera(lm, handedness) ? "palm" : "back";
  }
  // Fallbacks for poses the canned classifier drops mid-motion.
  if (tipReach > OPEN_REACH) {
    return palmFacesCamera(lm, handedness) ? "palm" : "back";
  }
  if (tipReach < FIST_REACH) return "fist";
  return "other";
}
