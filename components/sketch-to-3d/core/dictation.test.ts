import { describe, expect, it } from "vitest";
import type { TranscriptResult } from "./dictation";
import { collectTranscript, friendlyDictationError, mergeTranscript } from "./dictation";

/** Builds one result in the shape the engine emits: indexed alternatives + isFinal. */
const result = (transcript: string, isFinal: boolean): TranscriptResult =>
  Object.assign([{ transcript }], { isFinal });

describe("collectTranscript", () => {
  it("separates settled text from the still-changing tail", () => {
    const results = [result("a red dragon", true), result(" with wi", false)];
    expect(collectTranscript(results)).toEqual({ final: "a red dragon", interim: "with wi" });
  });

  it("returns empty strings for an empty list", () => {
    expect(collectTranscript([])).toEqual({ final: "", interim: "" });
  });

  // Chrome emits a leading space on continuation segments, and that space is the
  // only word separator between them. Trimming per-segment instead of once at
  // the end welds them into "a reddragon".
  it("preserves the separator between concatenated segments", () => {
    const results = [result("a red", true), result(" dragon", true)];
    expect(collectTranscript(results).final).toBe("a red dragon");
  });

  // The engine re-sends every result on every event. Reading only the newest one
  // would drop earlier settled words the moment a second segment arrived.
  it("reads the whole list, not just the last entry", () => {
    const results = [result("one", true), result(" two", true), result(" three", true)];
    expect(collectTranscript(results).final).toBe("one two three");
  });

  // Defensive: an alternatives list can come back empty on a low-confidence
  // result. Indexing [0].transcript blindly would throw inside an event handler,
  // where the exception is invisible and kills the rest of the session.
  it("survives a result with no alternatives", () => {
    const empty = Object.assign([] as { transcript: string }[], { isFinal: true });
    expect(collectTranscript([empty])).toEqual({ final: "", interim: "" });
  });
});

describe("mergeTranscript", () => {
  // The whole point of appending: typing and talking have to compose, so that
  // typing "a red" then saying "dragon" gives one prompt rather than clobbering.
  it("appends to existing text with a single space", () => {
    expect(mergeTranscript("a red", "dragon with wings")).toBe("a red dragon with wings");
  });

  it("returns just the dictation when the field is empty", () => {
    expect(mergeTranscript("", "a dragon")).toBe("a dragon");
    expect(mergeTranscript("   ", "a dragon")).toBe("a dragon");
  });

  it("leaves the field untouched when nothing was said", () => {
    expect(mergeTranscript("a red", "")).toBe("a red");
    expect(mergeTranscript("a red", "   ")).toBe("a red");
  });

  it("never produces a double space at the join", () => {
    expect(mergeTranscript("a red  ", "  dragon")).toBe("a red dragon");
  });
});

describe("friendlyDictationError", () => {
  // "aborted" fires every time we call stop() ourselves — i.e. on every
  // successful dictation the user ends by tapping the mic. Surfacing it would
  // flash a red error on the happy path.
  it("stays silent for aborted", () => {
    expect(friendlyDictationError("aborted")).toBeNull();
  });

  it("explains a blocked microphone and points at typing", () => {
    const message = friendlyDictationError("not-allowed");
    expect(message).toContain("type");
  });

  it("falls back to a generic message for unknown codes", () => {
    expect(friendlyDictationError("something-new")).toBeTruthy();
  });
});
