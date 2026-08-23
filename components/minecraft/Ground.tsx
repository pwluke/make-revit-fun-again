import { useEffect, useMemo } from "react";
import * as THREE from "three";
import {
  CuboidCollider,
  RigidBody,
  type RigidBodyProps,
} from "@react-three/rapier";
import { SCENE } from "@/lib/palette";
import { useSceneTheme } from "../world/themeStore";

/** World units per tile. Four keeps the seams from aliasing into moiré at the
 *  horizon while still reading as a ruled floor rather than a void. */
const TILE = 4;
const PLANE = 1000;

/**
 * The floor's faint tile grid, drawn rather than loaded. This used to be
 * `public/grass.jpg` tinted green; a photograph of grass cannot be made to
 * match a pastel interface no matter what colour is multiplied over it, so the
 * texture is now two flat palette values and a one-pixel seam.
 */
function useTileTexture() {
  const texture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d")!;

    ctx.fillStyle = SCENE.ground;
    ctx.fillRect(0, 0, size, size);
    // Only two edges, so adjacent tiles share one seam apiece instead of
    // doubling up into a heavier line.
    ctx.fillStyle = SCENE.groundSeam;
    ctx.fillRect(0, 0, size, 2);
    ctx.fillRect(0, 0, 2, size);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(PLANE / TILE, PLANE / TILE);
    // A colour map, so it has to be declared as sRGB — left at the default the
    // renderer would treat these values as linear and the floor would come out
    // markedly lighter than the token it was built from.
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }, []);

  useEffect(() => () => texture.dispose(), [texture]);

  return texture;
}

export function Ground(props: RigidBodyProps) {
  const theme = useSceneTheme();
  const texture = useTileTexture();
  return (
    <RigidBody {...props} type="fixed" colliders={false}>
      <mesh receiveShadow position={[0, 0, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[PLANE, PLANE]} />
        {/* Low roughness and a trace of metalness give the polished-plaster
            sheen the reference art has underfoot, and give the sun something
            to glance off so the plane isn't a flat field of one value. Clay
            keeps the ruled pastel tile; the other themes drop the map and
            tint the plane with their ground colour. */}
        <meshStandardMaterial
          map={theme.groundTexture ? texture : null}
          color={theme.groundTexture ? "#ffffff" : theme.ground}
          roughness={theme.groundRoughness}
          metalness={theme.groundMetalness}
        />
      </mesh>
      <CuboidCollider args={[PLANE, 2, PLANE]} position={[0, -2, 0]} />
    </RigidBody>
  );
}
