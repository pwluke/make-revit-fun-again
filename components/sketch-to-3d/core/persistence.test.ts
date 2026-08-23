import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearStoredCreations, loadCreations, saveCreations } from "./persistence";
import { GROUND_Y, MAX_SCALE } from "./transform";
import type { Creation } from "./types";

// jsdom is not configured for this project, so localStorage is stubbed directly.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
  removeItem: (key: string) => void store.delete(key),
});

const ready = (id: string, overrides: Partial<Creation> = {}): Creation => ({
  id,
  userText: "a cat",
  prompt: "a cat, cute toy figure",
  mode: "fast",
  spawn: { position: [1, 2, 3], rotationY: 0 },
  transform: { scale: 1, y: 2 },
  state: { status: "ready", result: { mode: "fast", glbUrl: "https://example.test/a.glb" } },
  ...overrides,
});

beforeEach(() => {
  store.clear();
});

describe("round trip", () => {
  it("restores a finished creation", () => {
    saveCreations([ready("a")]);
    const loaded = loadCreations();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("a");
    expect(loaded[0].state.status).toBe("ready");
  });

  it("returns nothing when there is nothing stored", () => {
    expect(loadCreations()).toEqual([]);
  });

  it("clears on request", () => {
    saveCreations([ready("a")]);
    clearStoredCreations();
    expect(loadCreations()).toEqual([]);
  });
});

describe("what is excluded", () => {
  // A generation cannot be resumed across a reload — the fal request is gone —
  // so a restored in-flight job would show a placeholder forever.
  it("does not save in-flight creations", () => {
    saveCreations([
      ready("done"),
      ready("busy", { state: { status: "generating", message: "…" } }),
      ready("failed", { state: { status: "error", message: "nope", retryable: true } }),
    ]);
    const loaded = loadCreations();
    expect(loaded.map((creation) => creation.id)).toEqual(["done"]);
  });

  // sketchUrl is an object URL, valid only for the document that created it.
  // Restoring one would point a texture at a dead blob.
  it("strips the object-URL sketch reference", () => {
    saveCreations([ready("a", { sketchUrl: "blob:http://localhost/abc-123" })]);
    expect(loadCreations()[0].sketchUrl).toBeUndefined();
  });
});

describe("resilience to a bad payload", () => {
  // localStorage is user-writable, and a malformed entry reaching the renderer
  // becomes a crash inside useFrame, which kills the render loop entirely.
  it("discards unparseable json", () => {
    store.set("sketch-to-3d:creations", "{not json");
    expect(loadCreations()).toEqual([]);
  });

  it("discards a payload from a different version", () => {
    store.set(
      "sketch-to-3d:creations",
      JSON.stringify({ version: 999, creations: [ready("a")] }),
    );
    expect(loadCreations()).toEqual([]);
  });

  it("drops entries with no asset url", () => {
    store.set(
      "sketch-to-3d:creations",
      JSON.stringify({
        version: 1,
        creations: [{ ...ready("a"), state: { status: "ready", result: { mode: "fast" } } }],
      }),
    );
    expect(loadCreations()).toEqual([]);
  });

  it("drops entries with a malformed spawn", () => {
    store.set(
      "sketch-to-3d:creations",
      JSON.stringify({ version: 1, creations: [{ ...ready("a"), spawn: { position: [1] } }] }),
    );
    expect(loadCreations()).toEqual([]);
  });

  // An edited payload must not be able to bury a creation or make it enormous.
  it("re-clamps the transform on load", () => {
    store.set(
      "sketch-to-3d:creations",
      JSON.stringify({
        version: 1,
        creations: [{ ...ready("a"), transform: { scale: 9999, y: -500 } }],
      }),
    );
    const [loaded] = loadCreations();
    expect(loaded.transform.scale).toBe(MAX_SCALE);
    expect(loaded.transform.y).toBe(GROUND_Y);
  });

  it("supplies a default transform when one is missing entirely", () => {
    const { transform: _omitted, ...withoutTransform } = ready("a");
    store.set(
      "sketch-to-3d:creations",
      JSON.stringify({ version: 1, creations: [withoutTransform] }),
    );
    expect(loadCreations()[0].transform).toBeDefined();
  });
});

describe("the cap", () => {
  it("keeps only the newest few, matching the in-memory limit", () => {
    const many = Array.from({ length: 20 }, (_, index) => ready(`c${index}`));
    saveCreations(many);
    const loaded = loadCreations();
    expect(loaded).toHaveLength(8);
    expect(loaded[loaded.length - 1].id).toBe("c19");
  });
});
