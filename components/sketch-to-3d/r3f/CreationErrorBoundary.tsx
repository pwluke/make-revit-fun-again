"use client";

/**
 * Isolates one creation's rendering failure from the rest of the scene.
 *
 * Design spec §10 asks for exactly this — "error boundary around that creation
 * only; scene and other creations survive" — and it was never built. Without it
 * a GLB that fails to load, parse, or normalise throws straight through
 * <Suspense> (which catches promises, NOT errors) with nothing above to catch
 * it, so the failure is silent: the placeholder disappears, no model appears,
 * and no error surfaces anywhere a person would look.
 *
 * The fallback is deliberately VISIBLE. A creation that failed should look
 * failed — at a booth, a child asking "where did mine go?" is worse than a
 * child seeing an obvious broken marker, and it tells whoever is running the
 * stand that something needs attention.
 */

import { Component, type ReactNode } from "react";
import type { SpawnTransform } from "../core/types";

type Props = {
  children: ReactNode;
  spawn: SpawnTransform;
  /** Identifies the creation in the console when something goes wrong. */
  label: string;
};

type State = { error: Error | null };

export class CreationErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Loud on purpose. This is the only place a rendering failure becomes
    // observable, and the alternative is a creation that silently never appears.
    console.error(`[sketch-to-3d] creation "${this.props.label}" failed to render`, error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { position, rotationY } = this.props.spawn;
    return (
      <group position={position} rotation={[0, rotationY, 0]}>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color="#e5352b" wireframe />
        </mesh>
      </group>
    );
  }
}
