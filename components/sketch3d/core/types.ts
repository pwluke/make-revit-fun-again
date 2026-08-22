/** Ring: core. Pure TypeScript — no three, no React. */

export type Vec3 = [number, number, number];

/** Six numbers. Deliberately NOT a THREE.Camera — this is what makes the engine portable. */
export type CameraPose = { position: Vec3; forward: Vec3 };

export type Plane = { point: Vec3; normal: Vec3 };

/** One committed stroke. Inert data — never recomputed once committed. */
export type Stroke = {
  id: string;
  points: Vec3[];
  /** Parallel to `points`. */
  widths: number[];
  color: string;
  /** Kept for debugging and possible future re-projection. */
  plane: Plane;
};
