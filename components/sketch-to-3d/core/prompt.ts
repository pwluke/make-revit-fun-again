/**
 * The single highest-leverage tuning knob in the feature.
 *
 * The model is given a line drawing plus this text. Style comes from here and from
 * the viewer's `flatShading` — NOT from any geometry parameter. A verified run on
 * 2026-08-22 turned a crude stick-figure cat into a charming toy using this exact
 * suffix, so change it deliberately and re-test rather than tweaking blind.
 */
export const STYLE_SUFFIX =
  "simple cute toy figure, smooth rounded forms, soft matte colors, clean silhouette";

/**
 * Combines what the user typed with the house style.
 *
 * Empty input still yields a usable prompt rather than a leading comma — the API
 * requires a non-empty `prompt`, and a malformed one wastes a paid generation.
 */
export function buildPrompt(userText: string): string {
  const trimmed = userText.trim();
  return trimmed.length > 0 ? `${trimmed}, ${STYLE_SUFFIX}` : STYLE_SUFFIX;
}
