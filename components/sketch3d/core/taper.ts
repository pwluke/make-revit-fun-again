/** Ring: core. Pure TypeScript — no three, no React. */

/** Metres/second at or below which the stroke is at full width. */
export const SLOW_SPEED = 1;
/** Metres/second at or above which the stroke is at its thinnest. */
export const FAST_SPEED = 12;
export const MAX_WIDTH_SCALE = 1;
export const MIN_WIDTH_SCALE = 0.35;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Fast strokes thin out, slow strokes go thick.
 * Expected to be tuned live — keep it a pure function of two numbers.
 */
export function widthAt(baseWidth: number, speed: number): number {
  const t = clamp((speed - SLOW_SPEED) / (FAST_SPEED - SLOW_SPEED), 0, 1);
  return baseWidth * (MAX_WIDTH_SCALE + (MIN_WIDTH_SCALE - MAX_WIDTH_SCALE) * t);
}
