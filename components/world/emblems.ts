import * as THREE from "three";
import type { AbilityId } from "./store";

/**
 * Emblem artwork, declared once and drawn two ways: extruded into the 3D
 * world as the collectible itself, and as flat SVG in the HUD slot. One
 * spec means the thing you pick up and the thing in your slot are the same
 * silhouette, which is what makes a locked grey slot readable as a hint.
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

const BUTTERFLY: Prim[] = [
  // Upper wings, then lower — big rounded shapes so it reads at slot size.
  { k: "ellipse", x: 27, y: 34, rx: 22, ry: 17, rot: -0.42 },
  { k: "ellipse", x: 73, y: 34, rx: 22, ry: 17, rot: 0.42 },
  { k: "ellipse", x: 31, y: 68, rx: 16, ry: 13, rot: 0.34 },
  { k: "ellipse", x: 69, y: 68, rx: 16, ry: 13, rot: -0.34 },
  // Body and head.
  { k: "ellipse", x: 50, y: 55, rx: 5, ry: 24 },
  { k: "circle", x: 50, y: 25, r: 7 },
  // Antennae.
  { k: "bar", x1: 47, y1: 20, x2: 38, y2: 6, w: 3 },
  { k: "bar", x1: 53, y1: 20, x2: 62, y2: 6, w: 3 },
  // Wing spots, the detail that makes it a butterfly and not a moth.
  { k: "circle", x: 26, y: 32, r: 6, accent: true },
  { k: "circle", x: 74, y: 32, r: 6, accent: true },
  { k: "circle", x: 31, y: 68, r: 4, accent: true },
  { k: "circle", x: 69, y: 68, r: 4, accent: true },
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

export const EMBLEMS: Record<AbilityId, Prim[]> = {
  climb: SPIDER,
  tiny: MOUSE,
  fly: BUTTERFLY,
  speed: BUNNY,
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
