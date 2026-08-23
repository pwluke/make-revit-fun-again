/** Ring: r3f. */
import { useEffect, useState } from "react";
import { sketchStore } from "../core/strokeStore";
import { StrokeLayer } from "../three/StrokeLayer";

export function Strokes() {
  const [layer, setLayer] = useState<StrokeLayer | null>(null);

  // Construct and dispose symmetrically within the same effect. Building the
  // layer here (not in useMemo) means Strict Mode's mount -> cleanup -> remount
  // cycle re-runs this whole effect, recreating the subscription it just tore
  // down, instead of leaving a memoized instance stranded with its only
  // teardown already spent.
  useEffect(() => {
    const created = new StrokeLayer(sketchStore);
    setLayer(created);
    return () => created.dispose();
  }, []);

  return layer ? <primitive object={layer} /> : null;
}
