/** Ring: three. Imports three — never React, never @react-three/*. */
import * as THREE from "three";
import type { SketchState, StrokeStore } from "../core/strokeStore";
import { buildStrokeMesh } from "./strokeGeometry";

/**
 * Mirrors the stroke store into meshes.
 *
 * A plain Object3D on purpose: R3F adopts it via <primitive>, and a vanilla
 * three.js app adds it with scene.add(). Same class, no wrapper on either side.
 */
export class StrokeLayer extends THREE.Object3D {
  private readonly committed = new Map<string, THREE.Mesh>();
  private live: THREE.Mesh | null = null;
  private readonly unsubscribe: () => void;

  constructor(private readonly store: StrokeStore) {
    super();
    this.name = "StrokeLayer";
    this.sync(store.getState());
    this.unsubscribe = store.subscribe((state) => this.sync(state));
  }

  private sync(state: SketchState): void {
    const seen = new Set<string>();

    for (const stroke of state.strokes) {
      seen.add(stroke.id);
      // Committed strokes are inert — build once, never rebuild.
      if (!this.committed.has(stroke.id)) {
        const mesh = buildStrokeMesh(stroke);
        this.committed.set(stroke.id, mesh);
        this.add(mesh);
      }
    }

    for (const [id, mesh] of this.committed) {
      if (seen.has(id)) continue;
      this.remove(mesh);
      this.disposeMesh(mesh);
      this.committed.delete(id);
    }

    this.syncLive(state);
  }

  private syncLive(state: SketchState): void {
    if (this.live) {
      this.remove(this.live);
      this.disposeMesh(this.live);
      this.live = null;
    }
    if (!state.active || state.active.points.length === 0) return;

    this.live = buildStrokeMesh(state.active);
    this.add(this.live);
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  dispose(): void {
    this.unsubscribe();
    for (const mesh of this.committed.values()) this.disposeMesh(mesh);
    this.committed.clear();
    if (this.live) this.disposeMesh(this.live);
    this.live = null;
    this.clear();
  }
}
