"use client";

import { Suspense, useLayoutEffect, useMemo } from "react";
import { Environment, Sky } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useSceneTheme } from "./themeStore";

const domeVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const domeFragment = /* glsl */ `
  varying vec3 vPos;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  void main() {
    float h = normalize(vPos).y;
    vec3 col = mix(uBottom, uMid, smoothstep(-0.25, 0.12, h));
    col = mix(col, uTop, smoothstep(0.12, 0.82, h));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function GradientDome({
  top,
  mid,
  bottom,
}: {
  top: string;
  mid: string;
  bottom: string;
}) {
  const geometry = useMemo(() => new THREE.SphereGeometry(420, 32, 16), []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uTop: { value: new THREE.Color(top) },
          uMid: { value: new THREE.Color(mid) },
          uBottom: { value: new THREE.Color(bottom) },
        },
        vertexShader: domeVertex,
        fragmentShader: domeFragment,
      }),
    [top, mid, bottom],
  );

  useLayoutEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <mesh
      geometry={geometry}
      material={material}
      frustumCulled={false}
      raycast={() => {}}
    />
  );
}

/**
 * Sky, HDRI lighting, fog, and key lights for the active world theme.
 * Clay keeps the original drei Sky + point light so that look stays intact;
 * the others use an HDRI for reflections plus a matching gradient dome.
 */
export function ThemeAtmosphere() {
  const theme = useSceneTheme();
  const scene = useThree((state) => state.scene);

  useLayoutEffect(() => {
    if (theme.fog) {
      scene.fog = new THREE.Fog(theme.fog.color, theme.fog.near, theme.fog.far);
      scene.background = new THREE.Color(theme.fog.color);
    } else {
      scene.fog = null;
    }
    // Clay's Sky owns the background and has no HDRI. Clear any leftover
    // environment map from a previous theme so reflections don't linger.
    if (theme.env.kind === "sky") {
      scene.environment = null;
    }
    return () => {
      scene.fog = null;
    };
  }, [scene, theme]);

  return (
    <>
      {theme.env.kind === "sky" ? (
        <Sky sunPosition={theme.env.sunPosition} />
      ) : (
        <>
          <GradientDome {...theme.env.dome} />
          <Suspense fallback={null}>
            <Environment
              key={theme.env.preset}
              preset={theme.env.preset}
              background={false}
              environmentIntensity={theme.env.intensity}
              blur={theme.env.blur}
            />
          </Suspense>
        </>
      )}
      <ambientLight color={theme.ambient.color} intensity={theme.ambient.intensity} />
      {theme.keyLight.point ? (
        <pointLight
          castShadow
          color={theme.keyLight.color}
          intensity={theme.keyLight.intensity}
          decay={0}
          position={theme.keyLight.position}
        />
      ) : (
        <directionalLight
          castShadow
          color={theme.keyLight.color}
          intensity={theme.keyLight.intensity}
          position={theme.keyLight.position}
          shadow-mapSize={[2048, 2048]}
          shadow-camera-far={180}
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
        />
      )}
    </>
  );
}
