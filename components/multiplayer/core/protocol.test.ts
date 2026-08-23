import { describe, expect, it } from "vitest";
import {
  AVATAR_COLORS,
  MAX_EDIT_POSITIONS,
  MAX_SHOT_LENGTH,
  decodeEdit,
  decodePeerColor,
  decodePresence,
  decodeShot,
  encodeEdit,
  encodeShot,
  randomAvatarColor,
  type EditOp,
  type ShotOp,
} from "./protocol";

const breakOp: EditOp = {
  kind: "remove",
  positions: [
    [1, 2, 3],
    [1.5, 2, 3],
  ],
};

describe("encodeEdit / decodeEdit", () => {
  it("round-trips an edit through the flat room shape", () => {
    expect(decodeEdit(encodeEdit(breakOp))).toEqual(breakOp);
  });

  it("preserves fractional coordinates", () => {
    // The grid pitch is 1/3, so voxel centres are not integers. Rounding them in
    // transit would put a remote player's edit in a neighbouring cell.
    const op: EditOp = { kind: "add", positions: [[0.3333, -4.1667, 12.6667]] };
    expect(decodeEdit(encodeEdit(op))).toEqual(op);
  });
});

describe("decodeEdit rejects untrusted payloads", () => {
  it("rejects an unknown kind", () => {
    expect(decodeEdit({ kind: "drop", positions: "[[1,2,3]]" })).toBeNull();
  });

  it("rejects positions that are not a JSON array", () => {
    expect(decodeEdit({ kind: "add", positions: "not json" })).toBeNull();
    expect(decodeEdit({ kind: "add", positions: '{"x":1}' })).toBeNull();
  });

  it("rejects a coordinate that is not a triple", () => {
    expect(decodeEdit({ kind: "add", positions: "[[1,2]]" })).toBeNull();
  });

  it("rejects NaN and Infinity", () => {
    // JSON has no NaN literal, so these arrive as null / a huge number. Both
    // would poison the instance matrix and silently break block picking.
    expect(decodeEdit({ kind: "add", positions: "[[null,2,3]]" })).toBeNull();
    expect(decodeEdit({ kind: "add", positions: '[[1,2,"3"]]' })).toBeNull();
  });

  it("rejects an empty edit", () => {
    expect(decodeEdit({ kind: "remove", positions: "[]" })).toBeNull();
  });

  it("caps how much work one message can cause", () => {
    const tooMany = Array.from({ length: MAX_EDIT_POSITIONS + 1 }, () => [0, 0, 0]);
    expect(
      decodeEdit({ kind: "remove", positions: JSON.stringify(tooMany) }),
    ).toBeNull();
  });

  it("accepts a payload exactly at the cap", () => {
    const atCap = Array.from({ length: MAX_EDIT_POSITIONS }, () => [0, 0, 0]);
    expect(
      decodeEdit({ kind: "remove", positions: JSON.stringify(atCap) }),
    ).not.toBeNull();
  });

  it("rejects a non-object", () => {
    expect(decodeEdit(null)).toBeNull();
    expect(decodeEdit("edit")).toBeNull();
  });
});

describe("decodePresence", () => {
  it("reads a full slice", () => {
    const slice = { color: "#5f63df", x: 1, y: 2, z: 3, yaw: 0.5 };
    expect(decodePresence(slice)).toEqual(slice);
  });

  it("returns null for a peer that has not reported a position yet", () => {
    // This is the normal state for a tab that has just joined: net.ts publishes
    // colour-only initial presence on purpose, so the avatar is not drawn until
    // a real position arrives instead of flashing at the world origin.
    expect(decodePresence({ color: "#5f63df" })).toBeNull();
  });

  it("rejects non-finite coordinates", () => {
    expect(
      decodePresence({ color: "#5f63df", x: 1, y: 2, z: 3, yaw: Number.NaN }),
    ).toBeNull();
  });

  it("rejects a missing colour", () => {
    expect(decodePresence({ x: 1, y: 2, z: 3, yaw: 0 })).toBeNull();
    expect(decodePresence({ color: "", x: 1, y: 2, z: 3, yaw: 0 })).toBeNull();
  });
});

describe("encodeShot / decodeShot", () => {
  const shot: ShotOp = {
    from: [1.5, 2.25, -3],
    to: [1.5, 2.25, -12],
    hit: true,
  };

  it("round-trips a bolt through the flat topic shape", () => {
    expect(decodeShot(encodeShot(shot))).toEqual(shot);
  });

  it("keeps a miss a miss", () => {
    const miss: ShotOp = { ...shot, hit: false };
    expect(decodeShot(encodeShot(miss))).toEqual(miss);
  });

  it("treats a non-boolean hit flag as a miss rather than dropping the bolt", () => {
    // Being wrong about `hit` costs eight spark particles. Being wrong about the
    // bolt means a player's shot is invisible, which is the whole feature.
    const decoded = decodeShot({ ...encodeShot(shot), hit: "yes" });
    expect(decoded).not.toBeNull();
    expect(decoded?.hit).toBe(false);
  });

  it("rejects non-finite endpoints", () => {
    expect(decodeShot({ ...encodeShot(shot), fy: Number.NaN })).toBeNull();
    expect(
      decodeShot({ ...encodeShot(shot), tz: Number.POSITIVE_INFINITY }),
    ).toBeNull();
    expect(decodeShot({ ...encodeShot(shot), fx: null })).toBeNull();
  });

  it("rejects a bolt longer than the cap", () => {
    // An unbounded length scales the bolt cylinder across the whole scene, and
    // the bloom pass then blows that out to a white screen.
    expect(
      decodeShot(
        encodeShot({ from: [0, 0, 0], to: [0, 0, MAX_SHOT_LENGTH + 1], hit: false }),
      ),
    ).toBeNull();
  });

  it("accepts a bolt exactly at the cap", () => {
    expect(
      decodeShot(
        encodeShot({ from: [0, 0, 0], to: [0, 0, MAX_SHOT_LENGTH], hit: false }),
      ),
    ).not.toBeNull();
  });

  it("rejects a non-object", () => {
    expect(decodeShot(null)).toBeNull();
    expect(decodeShot("pew")).toBeNull();
  });
});

describe("decodePeerColor", () => {
  it("reads the shooter's tint", () => {
    expect(decodePeerColor({ color: "#5f63df", x: 1 })).toBe("#5f63df");
  });

  it("accepts a peer with no position yet", () => {
    // Unlike decodePresence, which needs coordinates to draw an avatar: a peer
    // can fire in the window before their first position lands, and that bolt
    // should still be drawn in their colour.
    expect(decodePeerColor({ color: "#5f63df" })).toBe("#5f63df");
  });

  it("returns null when there is no usable colour", () => {
    expect(decodePeerColor({})).toBeNull();
    expect(decodePeerColor({ color: "" })).toBeNull();
    expect(decodePeerColor({ color: 0x5f63df })).toBeNull();
    expect(decodePeerColor(null)).toBeNull();
  });
});

describe("randomAvatarColor", () => {
  it("only ever returns a palette colour", () => {
    for (const random of [() => 0, () => 0.5, () => 0.999999]) {
      expect(AVATAR_COLORS).toContain(randomAvatarColor(random));
    }
  });
});
