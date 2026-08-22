/** Ring: r3f. */
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { sketchStore } from "../core/strokeStore";
import { StrokeLayer } from "../three/StrokeLayer";

export function Strokes() {
  const size = useThree((state) => state.size);
  const layer = useMemo(
    () => new StrokeLayer(sketchStore, new THREE.Vector2(size.width, size.height)),
    // Built once; resolution is pushed in via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => layer.setResolution(size.width, size.height), [layer, size.width, size.height]);
  useEffect(() => () => layer.dispose(), [layer]);

  return <primitive object={layer} />;
}
