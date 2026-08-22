import { describe, expect, it } from "vitest";
import { STYLE_SUFFIX, buildPrompt } from "./prompt";

describe("buildPrompt", () => {
  it("appends the style suffix to what the user typed", () => {
    expect(buildPrompt("a dragon")).toBe(`a dragon, ${STYLE_SUFFIX}`);
  });

  it("trims surrounding whitespace so the prompt never has a stray gap", () => {
    expect(buildPrompt("  a cat  ")).toBe(`a cat, ${STYLE_SUFFIX}`);
  });

  // The API rejects an empty `prompt`, and a malformed one wastes a paid
  // generation — so empty input must still produce something valid.
  it("returns just the suffix for empty input, with no leading comma", () => {
    expect(buildPrompt("")).toBe(STYLE_SUFFIX);
    expect(buildPrompt("   ")).toBe(STYLE_SUFFIX);
  });
});
