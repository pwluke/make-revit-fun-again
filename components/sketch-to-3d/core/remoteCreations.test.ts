import { describe, expect, it } from "vitest";
import { assetUrlOf, fromRow, toRow, type CreationRow } from "./remoteCreations";
import { GROUND_Y, MAX_SCALE } from "./transform";
import type { Creation } from "./types";

const meshCreation: Creation = {
  id: "abc",
  userText: "a cat",
  prompt: "a cat, cute toy figure",
  mode: "fast",
  spawn: { position: [1, 2, 3], rotationY: 0.5 },
  transform: { scale: 1.5, y: 2 },
  state: { status: "ready", result: { mode: "fast", glbUrl: "https://fal.test/a.glb" } },
};

const spriteCreation: Creation = {
  ...meshCreation,
  id: "def",
  mode: "sprite",
  state: { status: "ready", result: { mode: "sprite", spriteUrl: "https://fal.test/a.png" } },
};

describe("assetUrlOf", () => {
  it("reads the glb url for a mesh", () => {
    expect(assetUrlOf(meshCreation)).toBe("https://fal.test/a.glb");
  });

  it("reads the sprite url for a sprite", () => {
    expect(assetUrlOf(spriteCreation)).toBe("https://fal.test/a.png");
  });

  it("returns null while still generating", () => {
    expect(
      assetUrlOf({ ...meshCreation, state: { status: "generating", message: "…" } }),
    ).toBeNull();
  });
});

describe("toRow", () => {
  it("flattens a creation into the stored shape", () => {
    const row = toRow(meshCreation, "device-1", 1000)!;
    expect(row.creationId).toBe("abc");
    expect(row.mode).toBe("fast");
    expect(row.assetUrl).toBe("https://fal.test/a.glb");
    expect(row.deviceId).toBe("device-1");
    expect(row.createdAt).toBe(1000);
  });

  // Nothing worth publishing: another machine cannot resume someone else's job.
  it("refuses anything not finished", () => {
    expect(toRow({ ...meshCreation, state: { status: "uploading" } }, "d", 0)).toBeNull();
    expect(
      toRow(
        { ...meshCreation, state: { status: "error", message: "x", retryable: true } },
        "d",
        0,
      ),
    ).toBeNull();
  });
});

describe("round trip", () => {
  it("survives mesh encode then decode", () => {
    const restored = fromRow(toRow(meshCreation, "d", 0))!;
    expect(restored.id).toBe(meshCreation.id);
    expect(restored.mode).toBe("fast");
    expect(restored.spawn).toEqual(meshCreation.spawn);
    expect(restored.transform).toEqual(meshCreation.transform);
    expect(restored.state).toEqual(meshCreation.state);
  });

  it("survives sprite encode then decode", () => {
    const restored = fromRow(toRow(spriteCreation, "d", 0))!;
    expect(restored.state).toEqual(spriteCreation.state);
  });
});

describe("fromRow rejects untrusted rubbish", () => {
  // The table is world-writable by design (instant.perms.ts), so every field is
  // untrusted. A malformed row reaching the renderer throws inside useFrame,
  // which kills the render loop rather than dropping one creation.
  const base = toRow(meshCreation, "d", 0)!;

  it("rejects a non-object", () => {
    expect(fromRow(null)).toBeNull();
    expect(fromRow("nope")).toBeNull();
  });

  it("rejects a missing asset url", () => {
    expect(fromRow({ ...base, assetUrl: "" })).toBeNull();
  });

  it("rejects an unknown mode", () => {
    expect(fromRow({ ...base, mode: "hologram" })).toBeNull();
  });

  it("rejects a malformed spawn", () => {
    expect(fromRow({ ...base, spawn: "{not json" })).toBeNull();
    expect(fromRow({ ...base, spawn: JSON.stringify({ position: [1, 2] }) })).toBeNull();
  });

  it("rejects a spawn containing NaN", () => {
    // JSON.stringify turns NaN into null, which is the realistic corrupt case.
    expect(fromRow({ ...base, spawn: '{"position":[1,null,3]}' })).toBeNull();
  });

  it("defaults a missing rotationY rather than rejecting", () => {
    const restored = fromRow({ ...base, spawn: '{"position":[1,2,3]}' })!;
    expect(restored.spawn.rotationY).toBe(0);
  });
});

describe("fromRow repairs a recoverable transform", () => {
  const base = toRow(meshCreation, "d", 0)!;

  it("clamps an absurd scale instead of dropping the creation", () => {
    const restored = fromRow({ ...base, transform: '{"scale":9999,"y":5}' })!;
    expect(restored.transform.scale).toBe(MAX_SCALE);
  });

  it("lifts a creation that would otherwise be underground", () => {
    const restored = fromRow({ ...base, transform: '{"scale":1,"y":-99}' })!;
    expect(restored.transform.y).toBe(GROUND_Y);
  });

  it("falls back to the default when the transform is missing or unparseable", () => {
    const withoutTransform: CreationRow = { ...base, transform: undefined };
    expect(fromRow(withoutTransform)!.transform).toBeDefined();
    expect(fromRow({ ...base, transform: "{{{" })!.transform).toBeDefined();
  });
});
