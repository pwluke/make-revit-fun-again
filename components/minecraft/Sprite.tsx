import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";

export type SpriteMode = "billboard" | "cross";

type CutoutTexture = { texture: THREE.CanvasTexture; aspect: number };

/**
 * Loads a transparent cutout and trims the empty padding around the subject.
 *
 * SDXL returns a fixed 832x1216 frame, so the subject sits inside a lot of
 * transparent space. Mapping that straight onto a quad leaves the creature
 * floating above the ground with invisible margins, so the alpha bounding box
 * is measured once and the image re-drawn cropped.
 */
function useCutoutTexture(url: string) {
  const [cutout, setCutout] = useState<CutoutTexture | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      if (cancelled) return;
      const { width, height } = img;

      const probe = document.createElement("canvas");
      probe.width = width;
      probe.height = height;
      const probeCtx = probe.getContext("2d", { willReadFrequently: true })!;
      probeCtx.drawImage(img, 0, 0);
      const { data } = probeCtx.getImageData(0, 0, width, height);

      let minX = width;
      let minY = height;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          // 8 rather than 0: BiRefNet leaves a faint halo of near-zero alpha
          // that would otherwise defeat the trim entirely.
          if (data[(y * width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        minX = 0;
        minY = 0;
        maxX = width - 1;
        maxY = height - 1;
      }

      const cropW = maxX - minX + 1;
      const cropH = maxY - minY + 1;
      const crop = document.createElement("canvas");
      crop.width = cropW;
      crop.height = cropH;
      crop.getContext("2d")!.drawImage(img, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

      const texture = new THREE.CanvasTexture(crop);
      texture.colorSpace = THREE.SRGBColorSpace;
      // Nearest keeps the cutout crisp and slightly pixelated, which sits
      // closer to the voxel world than a smoothly filtered photo would.
      texture.magFilter = THREE.NearestFilter;
      texture.needsUpdate = true;

      setCutout({ texture, aspect: cropW / cropH });
    };

    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return cutout;
}

const worldPos = new THREE.Vector3();

type SpriteProps = {
  url: string;
  /**
   * `billboard` turns to face the player and is the default: kids draw
   * creatures, and anything with a face looks wrong as a cross.
   * `cross` (two quads at 90 degrees) is for radially symmetric things —
   * plants, bushes, torches — where Minecraft itself uses it.
   */
  mode?: SpriteMode;
  position: [number, number, number];
  /** World height in blocks. Width follows the trimmed aspect ratio. */
  height?: number;
};

export function Sprite({ url, mode = "billboard", position, height = 2 }: SpriteProps) {
  const cutout = useCutoutTexture(url);
  const group = useRef<THREE.Group>(null);

  useFrame(({ camera }) => {
    if (mode !== "billboard" || !group.current) return;
    // Yaw only. A full lookAt would tilt the card when the player looks up or
    // down, so a standing creature reads as leaning backwards instead of turning.
    group.current.getWorldPosition(worldPos);
    group.current.rotation.y = Math.atan2(
      camera.position.x - worldPos.x,
      camera.position.z - worldPos.z,
    );
  });

  if (!cutout) return null;

  const width = height * cutout.aspect;

  const quad = (rotationY: number) => (
    <mesh rotation={[0, rotationY, 0]} castShadow>
      <planeGeometry args={[width, height]} />
      {/* alphaTest rather than `transparent`: transparent materials get depth
          sorted, which makes two intersecting quads flicker against each other
          and against other cutouts. alphaTest writes depth normally. */}
      <meshStandardMaterial
        map={cutout.texture}
        alphaTest={0.5}
        transparent={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );

  return (
    <RigidBody type="fixed" position={position} colliders={false}>
      <group ref={group} position={[0, height / 2, 0]}>
        {quad(0)}
        {mode === "cross" && quad(Math.PI / 2)}
      </group>
      {/* The quads have no depth, so the collider is authored rather than
          derived — otherwise the player walks through a paper-thin box. */}
      <CuboidCollider
        args={[width / 2, height / 2, width / 2]}
        position={[0, height / 2, 0]}
      />
    </RigidBody>
  );
}
