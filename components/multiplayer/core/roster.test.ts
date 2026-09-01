import { beforeEach, describe, expect, it } from "vitest";
import { clearRoster, syncRoster, usePeerRoster } from "./roster";
import type { PeerState } from "./protocol";

const at = (name: string, color = "#5f63df"): PeerState => ({
  color,
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  armed: false,
  name,
});

beforeEach(clearRoster);

describe("syncRoster", () => {
  it("lists peers sorted by id, regardless of arrival order", () => {
    syncRoster(
      new Map([
        ["b", at("Bo")],
        ["a", at("Ann")],
      ]),
    );
    expect(usePeerRoster.getState().entries).toEqual([
      { id: "a", name: "Ann", color: "#5f63df" },
      { id: "b", name: "Bo", color: "#5f63df" },
    ]);
  });

  it("does not replace the entries array when nothing changed", () => {
    syncRoster(new Map([["a", at("Ann")]]));
    const first = usePeerRoster.getState().entries;
    // A position-only republish upstream looks like this once net.ts strips
    // the coordinates: same id, name and colour.
    syncRoster(new Map([["a", at("Ann")]]));
    expect(usePeerRoster.getState().entries).toBe(first);
  });

  it("updates when a name changes", () => {
    syncRoster(new Map([["a", at("Ann")]]));
    syncRoster(new Map([["a", at("Annie")]]));
    expect(usePeerRoster.getState().entries[0].name).toBe("Annie");
  });

  it("removes peers no longer present", () => {
    syncRoster(
      new Map([
        ["a", at("Ann")],
        ["b", at("Bo")],
      ]),
    );
    syncRoster(new Map([["b", at("Bo")]]));
    expect(usePeerRoster.getState().entries).toEqual([
      { id: "b", name: "Bo", color: "#5f63df" },
    ]);
  });
});
