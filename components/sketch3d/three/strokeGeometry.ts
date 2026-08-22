/** Ring: three. Imports three — never React, never @react-three/*. */
import * as THREE from "three";
import { Line2, LineGeometry, LineMaterial } from "three-stdlib";
import type { Stroke } from "../core/types";

/**
 * A single point cannot be a fat line, so a click without movement becomes a very
 * short segment — it reads as a dot and avoids the NaN tangents a zero-length
 * segment would produce.
 */
const DOT_LENGTH = 0.01;

export function strokePositions(stroke: Stroke): number[] {
  if (stroke.points.length === 0) return [];
  if (stroke.points.length === 1) {
    const [x, y, z] = stroke.points[0];
    return [x, y, z, x + DOT_LENGTH, y, z];
  }
  return stroke.points.flat();
}

/**
 * Phase 1 geometry: uniform width per stroke.
 *
 * Line2 cannot vary width along a line, so `stroke.widths` is averaged here.
 * Task 7 replaces this file's output with a per-vertex ribbon; nothing outside
 * this module needs to know which is in use.
 */
export function buildStrokeLine(stroke: Stroke, resolution: THREE.Vector2): Line2 {
  const geometry = new LineGeometry();
  geometry.setPositions(strokePositions(stroke));

  const averageWidth =
    stroke.widths.length > 0
      ? stroke.widths.reduce((sum, w) => sum + w, 0) / stroke.widths.length
      : 0.05;

  const material = new LineMaterial({
    color: new THREE.Color(stroke.color).getHex(),
    linewidth: averageWidth,
    worldUnits: true,
    // Set even in worldUnits mode — LineMaterial reads it for its shader uniforms.
    resolution: resolution.clone(),
  });

  const line = new Line2(geometry, material);
  line.computeLineDistances();
  line.name = stroke.id;
  return line;
}
