/** Ring: three. Imports three — never React, never @react-three/*. */
import * as THREE from "three";
import type { SketchState, StrokeStore } from "../core/strokeStore";
import { buildStrokeGeometry, buildStrokeMesh } from "./strokeGeometry";
import { createStrokeMaterial } from "./StrokeMaterial";

/**
 * Mirrors the stroke store into meshes.
 *
 * A plain Object3D on purpose: R3F adopts it via <primitive>, and a vanilla
 * three.js app adds it with scene.add(). Same class, no wrapper on either side.
 */
export class StrokeLayer extends THREE.Object3D {
  private readonly committed = new Map<string, THREE.Mesh>();
  private live: THREE.Mesh | null = null;
  // Reused across every appended point of the in-progress stroke — only the geometry
  // is rebuilt per point. Recreating (and disposing) the material every frame would
  // drop its WebGL program refcount to zero and force a shader recompile on every
  // single point of the very first stroke drawn (see design review finding 2).
  private liveMaterial: THREE.ShaderMaterial | null = null;
  private liveColor: string | null = null;
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
    const active = state.active;

    if (!active || active.points.length === 0) {
      this.clearLive();
      return;
    }

    // Colour is fixed for the lifetime of a stroke (it's snapshotted from the
    // palette when the stroke begins), so a change here only ever means the
    // previous live mesh was fully torn down (e.g. a fresh stroke started).
    if (!this.liveMaterial || this.liveColor !== active.color) {
      this.liveMaterial?.dispose();
      this.liveMaterial = createStrokeMaterial(active.color);
      this.liveColor = active.color;
    }

    if (this.live) {
      this.remove(this.live);
      this.live.geometry.dispose();
    }

    this.live = new THREE.Mesh(buildStrokeGeometry(active), this.liveMaterial);
    this.live.frustumCulled = true;
    this.live.name = active.id;
    this.add(this.live);
  }

  private clearLive(): void {
    if (this.live) {
      this.remove(this.live);
      this.live.geometry.dispose();
      this.live = null;
    }
    this.liveMaterial?.dispose();
    this.liveMaterial = null;
    this.liveColor = null;
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  dispose(): void {
    this.unsubscribe();
    for (const mesh of this.committed.values()) this.disposeMesh(mesh);
    this.committed.clear();
    this.clearLive();
    this.clear();
  }
}
