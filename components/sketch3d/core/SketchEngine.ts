/** Ring: core. Pure TypeScript — no three, no React. */
import { freezePlane, projectOntoPlane, shouldSample } from "./projection";
import { WIDTHS, type StrokeStore } from "./strokeStore";
import { widthAt } from "./taper";
import type { CameraPose, Plane, Vec3 } from "./types";
import { distance } from "./vec";

/** How strongly each frame's speed pulls the smoothed speed. Higher = twitchier taper. */
const SPEED_SMOOTHING = 0.3;

/**
 * The drawing mechanic, with no renderer in the loop.
 *
 * Callers drive it with a CameraPose (six numbers) and a millisecond timestamp.
 * It never reads a clock and never touches a scene graph — which is why it ports
 * to vanilla three.js, or anything else, unchanged.
 */
export class SketchEngine {
  private plane: Plane | null = null;
  private lastPoint: Vec3 | null = null;
  private lastTime = 0;
  private smoothedSpeed = 0;
  private baseWidth: number = WIDTHS[1];

  constructor(
    private readonly store: StrokeStore,
    private readonly options: { distance?: number } = {},
  ) {}

  get isDrawing(): boolean {
    return this.plane !== null;
  }

  pointerDown(pose: CameraPose, now: number): void {
    this.plane = freezePlane(pose, this.options.distance);
    this.baseWidth = WIDTHS[this.store.getState().widthIndex];
    this.lastTime = now;
    this.smoothedSpeed = 0;

    this.store.getState().beginStroke(this.plane);

    // Seed the first point at the plane centre so a click without movement still
    // produces a visible dot rather than an empty stroke.
    const seed = projectOntoPlane(pose, this.plane);
    if (seed) {
      this.lastPoint = seed;
      this.store.getState().appendPoint(seed, widthAt(this.baseWidth, 0));
    } else {
      this.lastPoint = null;
    }
  }

  update(pose: CameraPose, now: number): void {
    if (!this.plane) return;

    const candidate = projectOntoPlane(pose, this.plane);
    // Turned away from the plane: pause sampling, keep the stroke open. Not an error.
    if (!candidate) {
      this.lastTime = now;
      return;
    }

    const points = this.store.getState().active?.points ?? [];
    if (!shouldSample(this.lastPoint ?? undefined, candidate, points.length)) {
      return;
    }

    const elapsedSeconds = Math.max(now - this.lastTime, 1) / 1000;
    const travelled = this.lastPoint ? distance(this.lastPoint, candidate) : 0;
    const speed = travelled / elapsedSeconds;
    this.smoothedSpeed = this.smoothedSpeed + (speed - this.smoothedSpeed) * SPEED_SMOOTHING;

    this.store.getState().appendPoint(candidate, widthAt(this.baseWidth, this.smoothedSpeed));
    this.lastPoint = candidate;
    this.lastTime = now;
  }

  pointerUp(): void {
    if (!this.plane) return;
    this.store.getState().commitStroke();
    this.plane = null;
    this.lastPoint = null;
  }
}
