import { describe, expect, it, vi } from "vitest";
import { generateFastMock, generateMock, generateSpriteMock } from "./mockGenerator";
import type { Progress } from "./types";

/** Collects every progress event a generator emits, in order. */
async function runAndCollect(generate: typeof generateFastMock) {
  const events: Progress[] = [];
  const result = await generate(new Blob(), "a cat", (p) => events.push(p));
  return { events, result };
}

describe("generateFastMock", () => {
  it("emits a previewUrl partway through, before the result is ready", async () => {
    const { events, result } = await runAndCollect(generateFastMock);

    const withPreview = events.filter(
      (e) => e.phase === "generating" && e.previewUrl !== undefined,
    );
    expect(withPreview.length).toBeGreaterThan(0);
    expect(result.mode).toBe("fast");
  });

  // The whole point of the preview is that it arrives EARLY. If it only appeared
  // on the last event the feature would be pointless, and this test is the thing
  // standing between that and a silent regression.
  it("emits the preview before the final progress event", async () => {
    const { events } = await runAndCollect(generateFastMock);
    const firstPreviewIndex = events.findIndex(
      (e) => e.phase === "generating" && e.previewUrl !== undefined,
    );
    expect(firstPreviewIndex).toBeGreaterThanOrEqual(0);
    expect(firstPreviewIndex).toBeLessThan(events.length);
  });

  it("returns a walkable GLB, like the real fast pipeline", async () => {
    const { result } = await runAndCollect(generateFastMock);
    expect(result).toEqual({ mode: "fast", glbUrl: expect.any(String) });
  });
});

describe("the other mocks", () => {
  // previewUrl is optional precisely because only fast mode has a meaningful
  // intermediate artifact. If these started emitting one, the scene would show a
  // framed photo for a pipeline that never produced a picture.
  it("mesh mode never emits a previewUrl", async () => {
    const { events, result } = await runAndCollect(generateMock);
    expect(events.every((e) => e.phase !== "generating" || e.previewUrl === undefined)).toBe(true);
    expect(result.mode).toBe("mesh");
  });

  it("sprite mode never emits a previewUrl", async () => {
    const { events, result } = await runAndCollect(generateSpriteMock);
    expect(events.every((e) => e.phase !== "generating" || e.previewUrl === undefined)).toBe(true);
    expect(result.mode).toBe("sprite");
  });
});
