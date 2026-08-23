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
      // Re-acquiring pointer lock (e.g. clicking to resume after Escape) also fires
      // pointerdown. Without this guard that click plants a stray dot against a
      // stationary camera before the lock — and mouse-look — has actually resumed.
      //
      // Test that SOMETHING is locked, not that a specific element is. drei picks
      // the lock target as `domElement || events.connected || gl.domElement`
      // (node_modules/@react-three/drei/core/PointerLockControls.js:28), so it
      // usually locks the canvas's WRAPPER, not the canvas. Comparing against
      // gl.domElement therefore never matched and silently suppressed every
      // stroke — the feature looked mounted and did nothing.
      if (!document.pointerLockElement) return;
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
      if (!document.pointerLockElement) stop();
    };

    // Listen on window, not on the canvas. While pointer lock is held, mouse
    // events are dispatched to the LOCKED element — which drei usually makes the
    // canvas's wrapper (see the note in onPointerDown). Events aimed at a parent
    // never reach a listener on its child, so a canvas-bound listener silently
    // receives nothing. window sees them either way, and the pointer-lock check
    // in onPointerDown is what keeps stray UI clicks from starting a stroke.
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    };
  }, [engine]);

  useFrame(() => {
    if (drawing.current) engine.update(pose(), performance.now());
  });

  return null;
}
