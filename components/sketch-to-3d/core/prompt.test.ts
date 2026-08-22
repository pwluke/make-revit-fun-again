import { describe, expect, it } from "vitest";
import {
  STYLE_SUFFIX_FAST,
  STYLE_SUFFIX_MESH,
  STYLE_SUFFIX_SPRITE,
  buildPrompt,
} from "./prompt";

describe("buildPrompt", () => {
  it("appends the mesh suffix in mesh mode", () => {
    expect(buildPrompt("a dragon", "mesh")).toBe(`a dragon, ${STYLE_SUFFIX_MESH}`);
  });

  it("appends the sprite suffix in sprite mode", () => {
    expect(buildPrompt("a dragon", "sprite")).toBe(`a dragon, ${STYLE_SUFFIX_SPRITE}`);
  });

  it("trims surrounding whitespace so the prompt never has a stray gap", () => {
    expect(buildPrompt("  a cat  ", "mesh")).toBe(`a cat, ${STYLE_SUFFIX_MESH}`);
  });

  // The API rejects an empty `prompt`, and a malformed one wastes a paid
  // generation — so empty input must still produce something valid.
  it("returns just the suffix for empty input, with no leading comma", () => {
    expect(buildPrompt("", "mesh")).toBe(STYLE_SUFFIX_MESH);
    expect(buildPrompt("   ", "sprite")).toBe(STYLE_SUFFIX_SPRITE);
  });

  // The two suffixes are the same string today only because the sprite variant is
  // untested against SDXL. This test documents that they are allowed to diverge —
  // it asserts each mode reads its OWN constant, so splitting them later cannot
  // silently leave one mode on the wrong string.
  it("reads each mode's own constant rather than a shared default", () => {
    const mesh = buildPrompt("x", "mesh");
    const sprite = buildPrompt("x", "sprite");
    const fast = buildPrompt("x", "fast");
    expect(mesh.endsWith(STYLE_SUFFIX_MESH)).toBe(true);
    expect(sprite.endsWith(STYLE_SUFFIX_SPRITE)).toBe(true);
    expect(fast.endsWith(STYLE_SUFFIX_FAST)).toBe(true);
  });

  it("appends the fast suffix in fast mode", () => {
    expect(buildPrompt("a dragon", "fast")).toBe(`a dragon, ${STYLE_SUFFIX_FAST}`);
  });

  // Fast mode's prompt steers the SDXL ControlNet bridge, NOT TRELLIS — TRELLIS
  // accepts no prompt at all. The bridge's job is to hand it tonal and depth cues
  // to reconstruct from, which is the opposite of the flat matte toy look the mesh
  // suffix asks for. If someone "unifies" these strings, that reconstruction gets
  // worse for reasons that will not be obvious, so pin them as distinct.
  it("does not share the mesh suffix with fast mode", () => {
    expect(STYLE_SUFFIX_FAST).not.toBe(STYLE_SUFFIX_MESH);
  });
});
