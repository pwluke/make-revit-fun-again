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
 * Combines what the user typed with the house style for the mode being generated.
 *
 * Empty input still yields a usable prompt rather than a leading comma — the API requires
 * a non-empty `prompt`, and a malformed one wastes a paid generation.
 */
export function buildPrompt(userText: string, mode: CreationMode): string {
  const suffix = mode === "sprite" ? STYLE_SUFFIX_SPRITE : STYLE_SUFFIX_MESH;
  const trimmed = userText.trim();
  return trimmed.length > 0 ? `${trimmed}, ${suffix}` : suffix;
}
