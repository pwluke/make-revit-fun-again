import * as THREE from "three";
import type { AbilityId, ThemeId } from "./store";

/**
 * Emblem artwork, declared once and drawn two ways: extruded into the 3D
 * world as the collectible itself, and as flat SVG in the HUD slot. One
 * spec means the thing you pick up and the thing in your slot are the same
 * silhouette, which is what makes a locked grey slot readable as a hint.
 *
 * These are original simplified marks — a spider, an ant, a cape, a bolt, a
 * faceplate, a portal — rather than any studio's trademarked logo.
 *
 * Coordinates live on a 0..100 grid with y pointing DOWN (SVG convention);
 * the three.js builder flips it.
 */

export type Prim =
  | { k: "circle"; x: number; y: number; r: number; accent?: boolean }
  | {
      k: "ellipse";
      x: number;
      y: number;
      rx: number;
      ry: number;
      rot?: number;
      accent?: boolean;
    }
  | {
      k: "bar";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      w: number;
      accent?: boolean;
    }
  | { k: "poly"; pts: [number, number][]; accent?: boolean };

const mirrorBar = (b: Extract<Prim, { k: "bar" }>): Prim => ({
  ...b,
  x1: 100 - b.x1,
  x2: 100 - b.x2,
});

// --- heroes ---------------------------------------------------------------

const SPIDER: Prim[] = [
  { k: "ellipse", x: 50, y: 58, rx: 15, ry: 19 },
  { k: "circle", x: 50, y: 33, r: 11 },
  ...(
    [
      { k: "bar", x1: 39, y1: 46, x2: 13, y2: 27, w: 5 },
      { k: "bar", x1: 37, y1: 54, x2: 8, y2: 49, w: 5 },
      { k: "bar", x1: 37, y1: 62, x2: 10, y2: 71, w: 5 },
      { k: "bar", x1: 40, y1: 69, x2: 19, y2: 88, w: 5 },
    ] as Extract<Prim, { k: "bar" }>[]
  ).flatMap((b) => [b, mirrorBar(b)]),
  { k: "circle", x: 45, y: 31, r: 3, accent: true },
  { k: "circle", x: 55, y: 31, r: 3, accent: true },
];

const ANT: Prim[] = [
  { k: "circle", x: 50, y: 25, r: 11 },
  { k: "ellipse", x: 50, y: 48, rx: 9, ry: 11 },
  { k: "ellipse", x: 50, y: 74, rx: 14, ry: 17 },
  ...(
    [
      { k: "bar", x1: 45, y1: 17, x2: 33, y2: 5, w: 4 },
      { k: "bar", x1: 42, y1: 42, x2: 22, y2: 31, w: 4 },
      { k: "bar", x1: 41, y1: 50, x2: 17, y2: 52, w: 4 },
      { k: "bar", x1: 42, y1: 57, x2: 22, y2: 71, w: 4 },
    ] as Extract<Prim, { k: "bar" }>[]
  ).flatMap((b) => [b, mirrorBar(b)]),
  { k: "circle", x: 45, y: 23, r: 3, accent: true },
  { k: "circle", x: 55, y: 23, r: 3, accent: true },
];

const CAPE: Prim[] = [
  { k: "poly", pts: [[26, 30], [74, 30], [90, 90], [50, 68], [10, 90]] },
  { k: "circle", x: 50, y: 19, r: 10 },
  { k: "bar", x1: 50, y1: 30, x2: 50, y2: 62, w: 13 },
  { k: "bar", x1: 52, y1: 36, x2: 84, y2: 18, w: 8 },
  { k: "poly", pts: [[42, 44], [58, 44], [50, 60]], accent: true },
];

const BOLT: Prim[] = [
  {
    k: "poly",
    pts: [[60, 4], [24, 55], [46, 55], [38, 96], [76, 43], [52, 43]],
  },
];

const FACEPLATE: Prim[] = [
  { k: "poly", pts: [[50, 7], [78, 21], [80, 55], [50, 95], [20, 55], [22, 21]] },
  { k: "bar", x1: 31, y1: 45, x2: 44, y2: 40, w: 8, accent: true },
  { k: "bar", x1: 56, y1: 40, x2: 69, y2: 45, w: 8, accent: true },
  { k: "bar", x1: 38, y1: 70, x2: 62, y2: 70, w: 6, accent: true },
];

const PORTAL: Prim[] = [
  { k: "circle", x: 50, y: 50, r: 40 },
  { k: "circle", x: 50, y: 50, r: 26, accent: true },
  { k: "circle", x: 50, y: 50, r: 11 },
  ...(
    [
      { k: "bar", x1: 50, y1: 8, x2: 50, y2: -2, w: 6 },
      { k: "bar", x1: 92, y1: 50, x2: 102, y2: 50, w: 6 },
    ] as Extract<Prim, { k: "bar" }>[]
  ).flatMap((b) => [
    b,
    { ...b, y1: 100 - b.y1, y2: 100 - b.y2 } as Prim,
  ]),
];

// --- animals --------------------------------------------------------------

const GECKO: Prim[] = [
  { k: "ellipse", x: 50, y: 54, rx: 12, ry: 25 },
  { k: "circle", x: 50, y: 22, r: 11 },
  { k: "bar", x1: 50, y1: 76, x2: 74, y2: 94, w: 7 },
  ...(
    [
      { k: "bar", x1: 40, y1: 38, x2: 18, y2: 25, w: 6 },
      { k: "bar", x1: 40, y1: 66, x2: 18, y2: 80, w: 6 },
    ] as Extract<Prim, { k: "bar" }>[]
  ).flatMap((b) => [b, mirrorBar(b)]),
  { k: "circle", x: 45, y: 19, r: 3, accent: true },
  { k: "circle", x: 55, y: 19, r: 3, accent: true },
];

const MOUSE: Prim[] = [
  { k: "circle", x: 27, y: 27, r: 15 },
  { k: "circle", x: 73, y: 27, r: 15 },
  { k: "circle", x: 50, y: 45, r: 22 },
  { k: "ellipse", x: 50, y: 74, rx: 20, ry: 15 },
  { k: "bar", x1: 68, y1: 82, x2: 93, y2: 67, w: 5 },
  { k: "circle", x: 42, y: 43, r: 3.5, accent: true },
  { k: "circle", x: 58, y: 43, r: 3.5, accent: true },
  { k: "circle", x: 50, y: 55, r: 4.5, accent: true },
];

const EAGLE: Prim[] = [
  { k: "poly", pts: [[40, 36], [3, 18], [9, 45], [37, 59]] },
  { k: "poly", pts: [[60, 36], [97, 18], [91, 45], [63, 59]] },
  { k: "ellipse", x: 50, y: 56, rx: 11, ry: 22 },
  { k: "circle", x: 50, y: 23, r: 12 },
  { k: "poly", pts: [[42, 76], [58, 76], [50, 97]] },
  { k: "poly", pts: [[50, 20], [66, 26], [50, 32]], accent: true },
  { k: "circle", x: 45, y: 20, r: 3, accent: true },
];

const BUNNY: Prim[] = [
  { k: "ellipse", x: 37, y: 20, rx: 8, ry: 19 },
  { k: "ellipse", x: 63, y: 20, rx: 8, ry: 19 },
  { k: "circle", x: 50, y: 50, r: 20 },
  { k: "ellipse", x: 50, y: 78, rx: 22, ry: 15 },
  { k: "circle", x: 77, y: 84, r: 8 },
  { k: "circle", x: 43, y: 47, r: 3.5, accent: true },
  { k: "circle", x: 57, y: 47, r: 3.5, accent: true },
  { k: "circle", x: 50, y: 58, r: 4, accent: true },
];

const OWL: Prim[] = [
  { k: "poly", pts: [[25, 30], [33, 5], [43, 28]] },
  { k: "poly", pts: [[75, 30], [67, 5], [57, 28]] },
  { k: "ellipse", x: 50, y: 58, rx: 28, ry: 33 },
  { k: "circle", x: 38, y: 46, r: 11, accent: true },
  { k: "circle", x: 62, y: 46, r: 11, accent: true },
  { k: "poly", pts: [[50, 55], [44, 64], [56, 64]], accent: true },
];

const FOX: Prim[] = [
  {
    k: "poly",
    pts: [[50, 90], [19, 52], [25, 17], [41, 33], [59, 33], [75, 17], [81, 52]],
  },
  { k: "circle", x: 39, y: 50, r: 4, accent: true },
  { k: "circle", x: 61, y: 50, r: 4, accent: true },
  { k: "poly", pts: [[50, 82], [42, 66], [58, 66]], accent: true },
];

export const EMBLEMS: Record<ThemeId, Record<AbilityId, Prim[]>> = {
  heroes: {
    climb: SPIDER,
    tiny: ANT,
    fly: CAPE,
    speed: BOLT,
    scan: FACEPLATE,
    portal: PORTAL,
  },
  animals: {
    climb: GECKO,
    tiny: MOUSE,
    fly: EAGLE,
    speed: BUNNY,
    scan: OWL,
    portal: FOX,
  },
};

// --- three.js shape building ----------------------------------------------

/** SVG space (y down, 0..100) -> shape space (y up, centred on the origin). */
const sx = (x: number) => x - 50;
const sy = (y: number) => 50 - y;

function barShape(b: Extract<Prim, { k: "bar" }>) {
  const shape = new THREE.Shape();
  const dx = b.x2 - b.x1;
  const dy = b.y2 - b.y1;
  const len = Math.hypot(dx, dy) || 1;
  // Normal in SVG space, then converted per-point below.
  const nx = (-dy / len) * (b.w / 2);
  const ny = (dx / len) * (b.w / 2);
  const pts: [number, number][] = [
    [b.x1 + nx, b.y1 + ny],
    [b.x2 + nx, b.y2 + ny],
    [b.x2 - nx, b.y2 - ny],
    [b.x1 - nx, b.y1 - ny],
  ];
  shape.moveTo(sx(pts[0][0]), sy(pts[0][1]));
  for (let i = 1; i < pts.length; i++) shape.lineTo(sx(pts[i][0]), sy(pts[i][1]));
  shape.closePath();
  return shape;
}

function capShape(x: number, y: number, r: number) {
  const shape = new THREE.Shape();
  shape.absarc(sx(x), sy(y), r, 0, Math.PI * 2, false);
  return shape;
}

/** Every shape for one tone of an emblem. Bars get round caps so the 3D
 *  silhouette matches the SVG's stroke-linecap. */
export function emblemShapes(prims: Prim[], accent: boolean): THREE.Shape[] {
  const out: THREE.Shape[] = [];
  for (const p of prims) {
    if (Boolean(p.accent) !== accent) continue;
    if (p.k === "circle") {
      out.push(capShape(p.x, p.y, p.r));
    } else if (p.k === "ellipse") {
      const shape = new THREE.Shape();
      shape.absellipse(
        sx(p.x),
        sy(p.y),
        p.rx,
        p.ry,
        0,
        Math.PI * 2,
        false,
        p.rot ?? 0,
      );
      out.push(shape);
    } else if (p.k === "bar") {
      out.push(barShape(p));
      out.push(capShape(p.x1, p.y1, p.w / 2));
      out.push(capShape(p.x2, p.y2, p.w / 2));
    } else {
      const shape = new THREE.Shape();
      shape.moveTo(sx(p.pts[0][0]), sy(p.pts[0][1]));
      for (let i = 1; i < p.pts.length; i++) {
        shape.lineTo(sx(p.pts[i][0]), sy(p.pts[i][1]));
      }
      shape.closePath();
      out.push(shape);
    }
  }
  return out;
}

/** Emblems are authored on the 0..100 grid; this scales them to world size. */
export const EMBLEM_UNIT = 1 / 100;
