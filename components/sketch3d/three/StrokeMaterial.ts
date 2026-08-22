/** Ring: three. Imports three — never React, never @react-three/*. */
import * as THREE from "three";

const vertexShader = /* glsl */ `
  attribute vec3 next;
  attribute float side;
  attribute float width;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vec4 viewNext = modelViewMatrix * vec4(next, 1.0);

    vec3 tangent = viewNext.xyz - viewPosition.xyz;
    // A degenerate segment would make normalize() produce NaN.
    tangent = length(tangent) > 1e-6 ? normalize(tangent) : vec3(1.0, 0.0, 0.0);

    // Camera is at the origin in view space, so this perpendicular always faces it.
    vec3 offset = normalize(cross(tangent, normalize(viewPosition.xyz)));

    viewPosition.xyz += offset * side * width * 0.5;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  void main() {
    gl_FragColor = vec4(uColor, 1.0);
  }
`;

export function createStrokeMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
  });
}
