import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyWithoutBroadcast,
  isSuppressed,
  publishLocalEdit,
  setEditListener,
} from "./editBus";
import type { EditOp } from "./protocol";

const op: EditOp = { kind: "add", positions: [[1, 2, 3]] };

afterEach(() => setEditListener(null));

describe("publishLocalEdit", () => {
  it("does nothing when no network layer is attached", () => {
    // Single player, and every existing test that touches the cube store, runs
    // in exactly this state. Publishing must stay a no-op there.
    expect(() => publishLocalEdit(op)).not.toThrow();
  });

  it("forwards to the listener", () => {
    const listener = vi.fn();
    setEditListener(listener);
    publishLocalEdit(op);
    expect(listener).toHaveBeenCalledWith(op);
  });

  it("stops forwarding after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = setEditListener(listener);
    unsubscribe();
    publishLocalEdit(op);
    expect(listener).not.toHaveBeenCalled();
  });

  it("keeps only the newest listener", () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    setEditListener(stale);
    setEditListener(fresh);
    publishLocalEdit(op);
    expect(stale).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledOnce();
  });

  it("does not let a stale unsubscribe detach the current listener", () => {
    const stale = vi.fn();
    const fresh = vi.fn();
    const unsubscribeStale = setEditListener(stale);
    setEditListener(fresh);
    unsubscribeStale();
    publishLocalEdit(op);
    expect(fresh).toHaveBeenCalledOnce();
  });
});

describe("applyWithoutBroadcast", () => {
  it("suppresses edits made while replaying a remote one", () => {
    // The echo guard. Without it, receiving an edit rebroadcasts it, every peer
    // does the same, and one click amplifies around the room forever.
    const listener = vi.fn();
    setEditListener(listener);
    applyWithoutBroadcast(() => publishLocalEdit(op));
    expect(listener).not.toHaveBeenCalled();
  });

  it("restores broadcasting afterwards", () => {
    const listener = vi.fn();
    setEditListener(listener);
    applyWithoutBroadcast(() => {});
    publishLocalEdit(op);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("restores broadcasting even if the apply throws", () => {
    // A stuck flag would silently mute this client for the rest of the session —
    // the player would build happily and nobody else would ever see it.
    const listener = vi.fn();
    setEditListener(listener);
    expect(() =>
      applyWithoutBroadcast(() => {
        throw new Error("bad remote op");
      }),
    ).toThrow("bad remote op");
    expect(isSuppressed()).toBe(false);
    publishLocalEdit(op);
    expect(listener).toHaveBeenCalledOnce();
  });

  it("survives nesting", () => {
    const listener = vi.fn();
    setEditListener(listener);
    applyWithoutBroadcast(() => {
      applyWithoutBroadcast(() => {});
      // Still inside the outer suppression — a naive `suppressed = false` in the
      // inner finally would have re-enabled broadcasting here.
      publishLocalEdit(op);
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
