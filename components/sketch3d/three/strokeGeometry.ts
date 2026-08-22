/** Ring: three. Imports three — never React, never @react-three/*. */
import * as THREE from "three";
import type { Stroke } from "../core/types";
import { createStrokeMaterial } from "./StrokeMaterial";

/** A click without movement becomes a short segment so it reads as a dot. */
const DOT_LENGTH = 0.01;

function samplesOf(stroke: Stroke): { points: [number, number, number][]; widths: number[] } {
  if (stroke.points.length === 1) {
    const [x, y, z] = stroke.points[0];
    return { points: [[x, y, z], [x + DOT_LENGTH, y, z]], widths: [stroke.widths[0], stroke.widths[0]] };
  }
  return { points: stroke.points, widths: stroke.widths };
}

export function buildStrokeGeometry(stroke: Stroke): THREE.BufferGeometry {
  const { points, widths } = samplesOf(stroke);
  const count = points.length;

  const position = new Float32Array(count * 2 * 3);
  const next = new Float32Array(count * 2 * 3);
  const side = new Float32Array(count * 2);
  const width = new Float32Array(count * 2);
  const indices: number[] = [];

  for (let i = 0; i < count; i++) {
    const point = points[i];
    // The last sample has no successor, so extrapolate one from its predecessor —
    // otherwise the final segment's tangent is zero-length and the ribbon pinches shut.
    const previous = points[Math.max(i - 1, 0)];
    const neighbour: [number, number, number] =
      i < count - 1
        ? points[i + 1]
        : [point[0] * 2 - previous[0], point[1] * 2 - previous[1], point[2] * 2 - previous[2]];

    for (let s = 0; s < 2; s++) {
      const vertex = i * 2 + s;
      position.set(point, vertex * 3);
      next.set(neighbour, vertex * 3);
      side[vertex] = s === 0 ? -1 : 1;
      width[vertex] = widths[i];
    }

    if (i < count - 1) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("next", new THREE.BufferAttribute(next, 3));
  geometry.setAttribute("side", new THREE.BufferAttribute(side, 1));
  geometry.setAttribute("width", new THREE.BufferAttribute(width, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  return geometry;
}

export function buildStrokeMesh(stroke: Stroke): THREE.Mesh {
  const mesh = new THREE.Mesh(buildStrokeGeometry(stroke), createStrokeMaterial(stroke.color));
  mesh.frustumCulled = true;
  mesh.name = stroke.id;
  return mesh;
}
