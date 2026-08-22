import { describe, expect, it } from "vitest";
import { STYLE_SUFFIX_MESH, STYLE_SUFFIX_SPRITE, buildPrompt } from "./prompt";

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
    expect(mesh.endsWith(STYLE_SUFFIX_MESH)).toBe(true);
    expect(sprite.endsWith(STYLE_SUFFIX_SPRITE)).toBe(true);
  });
});
