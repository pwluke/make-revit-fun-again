import type { CreationMode } from "./types";

/**
 * The highest-leverage tuning knob in the feature.
 *
 * VALIDATED against a bare-prompt control (n=1, identical sketch, `face_count: 40000`,
 * `enable_pbr: false`, only the prompt differed). The suffix does real work: output went
 * from a detailed character illustration — cream belly, red neckerchief, fur markings,
 * glossy highlights — to a flat matte single-tone toy figure. Triangle count was identical
 * and file size differed by 0.3 MB, so **file metrics are useless here; compare renders.**
 *
 * n=1 is weaker evidence than we would like, and `seed` comes back `null` so we cannot
 * rule out a reroll. But the observed difference lies along all four axes the suffix
 * actually names — *soft matte colors* → matte, *smooth rounded forms* → simplified,
 * *clean silhouette* → fiddly markings dropped. A reroll varies in random directions,
 * not the specified ones.
 *
 * KNOWN COST, decide deliberately: the bare-prompt version is arguably the *more charming
 * single object*. The suffix buys set coherence — eight creations that look like they
 * belong together — at the price of individual personality. Right for a booth filling up
 * with drawings; a real loss for one hero object in front of a judge.
 */
export const STYLE_SUFFIX_MESH =
  "simple cute toy figure, smooth rounded forms, soft matte colors, clean silhouette";

/**
 * Sprite mode never reaches Hunyuan — this string steers SDXL instead, which is a
 * different model with different prompt sensitivities.
 *
 * ⚠️ UNTESTED. It is currently a copy of the mesh suffix so behaviour starts predictable,
 * NOT because a shared string has been shown to work for both. Assume it needs separate
 * tuning; validating it is its own experiment (~$0.06 through the SDXL stage alone).
 */
export const STYLE_SUFFIX_SPRITE = STYLE_SUFFIX_MESH;

/**
 * Fast mode's prompt never reaches TRELLIS — **TRELLIS takes no prompt at all**. This
 * string steers only the SDXL ControlNet bridge that turns the line art into something
 * TRELLIS can read, so it is aimed at an image model, not a 3D one.
 *
 * VALIDATED, and it is the only suffix in this file that is. This exact string produced
 * the bridge image in the 2026-08-22 spike (scripts/bench-trellis.mjs): the cat kept its
 * pose, scarf, whiskers, paw pads and expression, and gained colour and shading. That
 * result is the whole reason fast mode was judged viable.
 *
 * Note it asks for *photorealistic product photo* rather than the toy-figure language the
 * mesh suffix uses. That is deliberate — the bridge's job is to give TRELLIS the tonal
 * and depth cues it needs to reconstruct geometry, and a flat matte toy render withholds
 * exactly those cues. Style the SOURCE for reconstruction here, not the final look.
 */
export const STYLE_SUFFIX_FAST =
  "photorealistic product photo, plain background, soft studio lighting";

/**
 * Combines what the user typed with the house style for the mode being generated.
 *
 * Empty input still yields a usable prompt rather than a leading comma — the API requires
 * a non-empty `prompt`, and a malformed one wastes a paid generation.
 */
const SUFFIX_BY_MODE: Record<CreationMode, string> = {
  sprite: STYLE_SUFFIX_SPRITE,
  mesh: STYLE_SUFFIX_MESH,
  fast: STYLE_SUFFIX_FAST,
};

export function buildPrompt(userText: string, mode: CreationMode): string {
  // A Record keyed on CreationMode rather than a ternary chain: adding a fourth
  // mode is then a compile error here until its suffix is chosen deliberately,
  // instead of silently inheriting the mesh one.
  const suffix = SUFFIX_BY_MODE[mode];
  const trimmed = userText.trim();
  return trimmed.length > 0 ? `${trimmed}, ${suffix}` : suffix;
}
