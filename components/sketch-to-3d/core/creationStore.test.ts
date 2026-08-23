import { describe, expect, it } from "vitest";
import { MAX_CREATIONS, createCreationStore } from "./creationStore";
import type { SpawnTransform } from "./types";

const spawn: SpawnTransform = { position: [0, 1, -4], rotationY: 0 };

function start(store: ReturnType<typeof createCreationStore>, id: string) {
  store.getState().startCreation({ id, userText: "a cat", prompt: "a cat, ...", mode: "mesh", spawn });
}

describe("creationStore", () => {
  it("walks a creation from uploading through generating to ready", () => {
    const store = createCreationStore();
    start(store, "c1");
    expect(store.getState().creations[0].state.status).toBe("uploading");

    store.getState().updateJob("c1", { status: "generating", message: "IN_QUEUE" });
    expect(store.getState().creations[0].state).toEqual({
      status: "generating",
      message: "IN_QUEUE",
    });

    store.getState().updateJob("c1", {
      status: "ready",
      result: { mode: "mesh", glbUrl: "https://x/m.glb" },
    });
    const final = store.getState().creations[0].state;
    expect(final.status).toBe("ready");
    if (final.status === "ready") expect(final.result).toEqual({ mode: "mesh", glbUrl: "https://x/m.glb" });
  });

  it("stores mode and preserves it across an updateJob transition", () => {
    const store = createCreationStore();
    store.getState().startCreation({
      id: "c1",
      userText: "a cat",
      prompt: "a cat, ...",
      mode: "sprite",
      spawn,
    });

    expect(store.getState().creations[0].mode).toBe("sprite");

    store.getState().updateJob("c1", {
      status: "ready",
      result: { mode: "sprite", spriteUrl: "/cutout-cat.png" },
    });
    expect(store.getState().creations[0].mode).toBe("sprite");
  });

  it("round-trips a sprite result through updateJob", () => {
    const store = createCreationStore();
    start(store, "c1");

    store.getState().updateJob("c1", {
      status: "ready",
      result: { mode: "sprite", spriteUrl: "/cutout-cat.png" },
    });

    const final = store.getState().creations[0].state;
    expect(final.status).toBe("ready");
    if (final.status === "ready") expect(final.result.mode).toBe("sprite");
  });

  it("records a retryable error without dropping the creation", () => {
    const store = createCreationStore();
    start(store, "c1");
    store.getState().updateJob("c1", {
      status: "error",
      message: "network",
      retryable: true,
    });

    expect(store.getState().creations).toHaveLength(1);
    expect(store.getState().creations[0].state).toEqual({
      status: "error",
      message: "network",
      retryable: true,
    });
  });

  // Guards the GPU-memory valve: each creation is ~26 MB before texture downscaling.
  it("evicts the oldest creation once the cap is exceeded", () => {
    const store = createCreationStore();
    for (let i = 0; i < MAX_CREATIONS + 3; i++) start(store, `c${i}`);

    const { creations } = store.getState();
    expect(creations).toHaveLength(MAX_CREATIONS);
    expect(creations[0].id).toBe("c3");
    expect(creations.at(-1)!.id).toBe(`c${MAX_CREATIONS + 2}`);
  });

  it("keeps updates scoped to the addressed creation", () => {
    const store = createCreationStore();
    start(store, "c1");
    start(store, "c2");
    store.getState().updateJob("c2", { status: "generating", message: "x" });

    expect(store.getState().creations[0].state.status).toBe("uploading");
    expect(store.getState().creations[1].state.status).toBe("generating");
  });

  it("holds a registered bridge and lets it be cleared on unmount", () => {
    const store = createCreationStore();
    const bridge = {
      getSpawnTransform: () => spawn,
      onModelReady: () => {},
      setInputEnabled: () => {},
    };

    store.getState().registerBridge(bridge);
    expect(store.getState().bridge).toBe(bridge);

    store.getState().registerBridge(null);
    expect(store.getState().bridge).toBeNull();
  });
});
