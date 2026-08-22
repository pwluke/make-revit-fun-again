/** Ring: r3f. */
import { useEffect, useState } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { sketchStore } from "../core/strokeStore";
import { StrokeLayer } from "../three/StrokeLayer";

export function Strokes() {
  const size = useThree((state) => state.size);
  const [layer, setLayer] = useState<StrokeLayer | null>(null);

  // Construct and dispose symmetrically within the same effect. Building the
  // layer here (not in useMemo) means Strict Mode's mount -> cleanup -> remount
  // cycle re-runs this whole effect, recreating the subscription it just tore
  // down, instead of leaving a memoized instance stranded with its only
  // teardown already spent.
  useEffect(() => {
    const created = new StrokeLayer(sketchStore, new THREE.Vector2(size.width, size.height));
    setLayer(created);
    return () => created.dispose();
    // Built once per mount; resolution is pushed in via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    layer?.setResolution(size.width, size.height);
  }, [layer, size.width, size.height]);

  return layer ? <primitive object={layer} /> : null;
}
