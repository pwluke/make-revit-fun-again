"use client";

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";

/**
 * Renders the shadow map only when the world changes, instead of every frame.
 *
 * The scene is overwhelmingly static — a voxel model plus a house — and its
 * shadow map is identical frame to frame, yet three.js re-renders the whole
 * casting set into it 60 times a second. With ~317k cubes that single pass was
 * measured at ~4.5ms of a 16.7ms budget, spent redrawing an unchanged image.
 *
 * `deps` is whatever marks the world dirty: the cube list, the theme, anything
 * that moves a shadow caster. Each change queues exactly one re-render.
 *
 * The trade this makes: anything that moves *and* casts a shadow will drag a
 * stale shadow behind it. Nothing in the scene does — the debris doesn't cast,
 * and the pickups opt out (see the note where their castShadow was removed).
 * Add a caster that moves and it will need to bump these deps, or go back to
 * autoUpdate for that case.
 */
export function StaticShadows({ deps }: { deps: unknown[] }) {
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      // Hand the renderer back as we found it — it outlives this component.
      gl.shadowMap.autoUpdate = true;
    };
  }, [gl]);

  useEffect(() => {
    gl.shadowMap.needsUpdate = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, ...deps]);

  return null;
}
