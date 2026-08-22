/** Ring: r3f. The ONLY React-specific file besides the HUD — replaced wholesale on a port. */
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { SketchEngine } from "../core/SketchEngine";
import { sketchStore } from "../core/strokeStore";
import type { CameraPose } from "../core/types";

const forward = new THREE.Vector3();

export function SketchController() {
  const camera = useThree((state) => state.camera);
  const domElement = useThree((state) => state.gl.domElement);
  const engine = useMemo(() => new SketchEngine(sketchStore), []);
  const drawing = useRef(false);

  const pose = (): CameraPose => ({
    position: camera.position.toArray() as [number, number, number],
    forward: camera.getWorldDirection(forward).toArray() as [number, number, number],
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      if (!sketchStore.getState().drawMode) return;
      drawing.current = true;
      engine.pointerDown(pose(), performance.now());
    };

    const stop = () => {
      if (!drawing.current) return;
      drawing.current = false;
      engine.pointerUp();
    };

    // Escape releases pointer lock natively. Commit what exists rather than
    // stranding an open stroke — the control's own event is the source of truth.
    const onPointerLockChange = () => {
      if (document.pointerLockElement !== domElement) stop();
    };

    domElement.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    return () => {
      domElement.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    };
  }, [domElement, engine]);

  useFrame(() => {
    if (drawing.current) engine.update(pose(), performance.now());
  });

  return null;
}
