"use client";

import { useMemo } from "react";
import { BackSide, Color, ShaderMaterial } from "three";
import { SCENE } from "@/lib/palette";

/**
 * Well inside the camera's default far plane, and well outside anything the
 * player can walk to — so the dome can stay parked at the origin rather than
 * tracking the camera. Sixty units of walking against seven hundred of radius
 * moves the gradient by an amount nobody can see.
 */
const RADIUS = 760;

const vertexShader = /* glsl */ `
varying float vHeight;

void main() {
  vHeight = normalize(position).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 horizon;
uniform vec3 mid;
uniform vec3 zenith;
uniform float band;
varying float vHeight;

void main() {
  // Below the horizon is flat horizon colour; the ground plane covers it, and
  // matching the fog there is what hides the join.
  float h = clamp(vHeight, 0.0, 1.0);
  vec3 c = mix(horizon, mid, smoothstep(0.0, band, h));
  c = mix(c, zenith, smoothstep(band, 1.0, h));
  gl_FragColor = vec4(c, 1.0);
}
`;

/**
 * Three-stop pastel sky: blush at the horizon, lilac through the middle, mint
 * at the zenith. Replaces drei's `Sky`, whose Preetham model can only ever
 * produce a physically plausible sky — and a physically plausible sky is the
 * one thing this scene must not have.
 */
export function GradientSky() {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader,
        fragmentShader,
        side: BackSide,
        // Drawn first and writing no depth: the classic skybox arrangement.
        // Every opaque thing in the scene then paints straight over it without
        // needing to win a depth test against it.
        depthWrite: false,
        // A raw ShaderMaterial writes gl_FragColor into the renderer's linear
        // working space untouched, so these uniforms want three's ordinary
        // sRGB-to-linear conversion. (The grade in PastelGradeEffect is the
        // opposite case — it works in gamma space and bypasses it.)
        uniforms: {
          horizon: { value: new Color(SCENE.skyHorizon) },
          mid: { value: new Color(SCENE.skyMid) },
          zenith: { value: new Color(SCENE.skyZenith) },
          band: { value: 0.32 },
        },
      }),
    [],
  );

  return (
    <mesh material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[RADIUS, 32, 16]} />
    </mesh>
  );
}
