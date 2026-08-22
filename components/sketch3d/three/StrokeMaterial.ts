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
    vec3 viewDir = normalize(viewPosition.xyz);
    vec3 crossVec = cross(tangent, viewDir);
    float crossLen = length(crossVec);

    vec3 offset;
    if (crossLen > 1e-4) {
      offset = crossVec / crossLen;
    } else {
      // tangent is (nearly) parallel to the view direction, so cross(tangent, viewDir)
      // degenerates toward zero and normalizing it would produce NaN. Fall back to a
      // perpendicular built from the tangent's smallest-magnitude axis: crossing a unit
      // vector with the world axis it is *least* aligned with can never itself be parallel,
      // so this cannot reintroduce the same singularity.
      vec3 axis = (abs(tangent.x) <= abs(tangent.y) && abs(tangent.x) <= abs(tangent.z))
        ? vec3(1.0, 0.0, 0.0)
        : (abs(tangent.y) <= abs(tangent.z) ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0));
      offset = normalize(cross(tangent, axis));
    }

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
