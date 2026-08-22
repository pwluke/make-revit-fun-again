/** Ring: three. Imports three — never React, never @react-three/*. */
import * as THREE from "three";
import type { Line2 } from "three-stdlib";
import type { SketchState, StrokeStore } from "../core/strokeStore";
import { buildStrokeLine } from "./strokeGeometry";

/**
 * Mirrors the stroke store into meshes.
 *
 * A plain Object3D on purpose: R3F adopts it via <primitive>, and a vanilla
 * three.js app adds it with scene.add(). Same class, no wrapper on either side.
 */
export class StrokeLayer extends THREE.Object3D {
  private readonly committed = new Map<string, Line2>();
  private live: Line2 | null = null;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly store: StrokeStore,
    private readonly resolution: THREE.Vector2,
  ) {
    super();
    this.name = "StrokeLayer";
    this.sync(store.getState());
    this.unsubscribe = store.subscribe((state) => this.sync(state));
  }

  setResolution(width: number, height: number): void {
    this.resolution.set(width, height);
    for (const line of this.committed.values()) line.material.resolution.set(width, height);
    this.live?.material.resolution.set(width, height);
  }

  private sync(state: SketchState): void {
    const seen = new Set<string>();

    for (const stroke of state.strokes) {
      seen.add(stroke.id);
      // Committed strokes are inert — build once, never rebuild.
      if (!this.committed.has(stroke.id)) {
        const line = buildStrokeLine(stroke, this.resolution);
        this.committed.set(stroke.id, line);
        this.add(line);
      }
    }

    for (const [id, line] of this.committed) {
      if (seen.has(id)) continue;
      this.remove(line);
      this.disposeLine(line);
      this.committed.delete(id);
    }

    this.syncLive(state);
  }

  private syncLive(state: SketchState): void {
    if (this.live) {
      this.remove(this.live);
      this.disposeLine(this.live);
      this.live = null;
    }
    if (!state.active || state.active.points.length === 0) return;

    this.live = buildStrokeLine(state.active, this.resolution);
    this.add(this.live);
  }

  private disposeLine(line: Line2): void {
    line.geometry.dispose();
    line.material.dispose();
  }

  dispose(): void {
    this.unsubscribe();
    for (const line of this.committed.values()) this.disposeLine(line);
    this.committed.clear();
    if (this.live) this.disposeLine(this.live);
    this.live = null;
    this.clear();
  }
}
