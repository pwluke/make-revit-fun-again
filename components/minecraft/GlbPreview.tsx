import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

type GlbPreviewProps = {
  url: string;
  position: [number, number, number];
  /** Target height in blocks. The GLB is normalised to this so the two arms are comparable. */
  height?: number;
  flatShading?: boolean;
};

/**
 * Throwaway harness for eyeballing generated GLBs side by side.
 *
 * Normalises scale from the bounding box, because two generations of the same
 * prompt do not come back at the same size and an unnormalised comparison
 * mostly shows you that difference instead of the one you care about.
 */
export function GlbPreview({
  url,
  position,
  height = 2,
  flatShading = false,
}: GlbPreviewProps) {
  const { scene } = useGLTF(url);

  const { object, scale, yOffset } = useMemo(() => {
    const object = scene.clone(true);
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const scale = height / (size.y || 1);

    if (flatShading) {
      object.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.flatShading = true;
          mat.needsUpdate = true;
        }
      });
    }

    // Sit it on the ground rather than centring it on the origin.
    return { object, scale, yOffset: -box.min.y * scale };
  }, [scene, height, flatShading]);

  return (
    <primitive
      object={object}
      position={[position[0], position[1] + yOffset, position[2]]}
      scale={scale}
    />
  );
}
