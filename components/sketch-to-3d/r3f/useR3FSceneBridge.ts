import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import type { PointerLockControls as PointerLockControlsImpl } from "three-stdlib";
import type { Creation, SceneBridge, SpawnTransform } from "../core/types";

// Reused across calls so getSpawnTransform never allocates — same pattern as
// the module-scope THREE.Vector3s in components/minecraft/Player.tsx.
const direction = new THREE.Vector3();

/**
 * Module-scope pub-sub for "the pointer lock was released by something other
 * than our own setInputEnabled(false) call" — i.e. the player hit Escape.
 *
 * This exists purely to cross the Canvas boundary the cheap way. `SketchToWorld`
 * lives outside <Canvas> as a DOM sibling, so it cannot receive a callback prop
 * from a component mounted inside the Canvas tree, and the shared creationStore
 * (the one channel that does cross the boundary) has no slot for it — its
 * contract is fixed by core/creationStore.ts. A tiny listener slot in this module
 * is the least invasive way to let the DOM container react to a native unlock.
 */
type UnlockListener = () => void;
let externalUnlockListener: UnlockListener | null = null;

/** Called by SketchToWorld to learn about native (Escape-driven) unlocks. */
export function onSceneInputUnlocked(listener: UnlockListener | null): void {
  externalUnlockListener = listener;
}

/**
 * Builds the SceneBridge for the R3F scene. Must be called from inside <Canvas>.
 */
export function useR3FSceneBridge(): SceneBridge {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as PointerLockControlsImpl | null;

  // drei's <PointerLockControls makeDefault> writes `controls` into the R3F
  // store from inside its OWN useEffect, so on the first render of the
  // component that calls this hook, `controls` above is still null. If the
  // returned bridge object were rebuilt on every render (e.g. a plain object
  // literal, or useMemo keyed on `controls`), the caller registering it in a
  // `useEffect(() => registerBridge(bridge), [bridge])` would only ever see
  // the stale null-controls version — the corrected bridge from a later
  // render is a *different* object that nothing re-registers. So the bridge
  // identity below is held stable via useMemo(..., []) / refs, and every
  // method reads current controls/camera from refs AT CALL TIME instead of
  // closing over the value from the render that created the function.
  const controlsRef = useRef<PointerLockControlsImpl | null>(controls);
  const cameraRef = useRef(camera);

  useEffect(() => {
    controlsRef.current = controls;
  }, [controls]);

  useEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  // Set right before we call controls.unlock() ourselves, so the native
  // "unlock" event handler below can tell a deliberate close-for-drawing
  // apart from the player hitting Escape mid-game — see the CRITICAL note
  // in the task brief: Escape releases pointer lock without going through
  // our code, so anything that infers "drawing is open" from a hand-rolled
  // boolean will desync from what the browser actually did.
  const suppressNextUnlockRef = useRef(false);

  useEffect(() => {
    if (!controls) return;
    const handleUnlock = () => {
      if (suppressNextUnlockRef.current) {
        suppressNextUnlockRef.current = false;
        return;
      }
      externalUnlockListener?.();
    };
    controls.addEventListener("unlock", handleUnlock);
    return () => controls.removeEventListener("unlock", handleUnlock);
  }, [controls]);

  return useMemo<SceneBridge>(() => {
    const getSpawnTransform = (): SpawnTransform => {
      const currentCamera = cameraRef.current;
      currentCamera.getWorldDirection(direction);
      const position: [number, number, number] = [
        currentCamera.position.x + direction.x * 4,
        currentCamera.position.y + direction.y * 4,
        currentCamera.position.z + direction.z * 4,
      ];
      // Face the model back toward the player: the model's default forward
      // (-Z at rotation.y = 0) should point opposite the camera's look
      // direction, which works out to atan2(dir.x, dir.z).
      const rotationY = Math.atan2(direction.x, direction.z);
      return { position, rotationY };
    };

    const setInputEnabled = (enabled: boolean) => {
      const currentControls = controlsRef.current;
      if (!currentControls) return;
      if (enabled) {
        currentControls.lock();
      } else {
        suppressNextUnlockRef.current = true;
        currentControls.unlock();
      }
    };

    const onModelReady = (_creation: Creation) => {
      // No-op: the shared creationStore already drives rendering (see
      // r3f/Creations.tsx), so nothing needs to happen here yet. Kept so the
      // SceneBridge interface stays honest and a future scene (e.g. spawn VFX,
      // camera nudge) has somewhere to hook in without touching the interface.
    };

    return { getSpawnTransform, onModelReady, setInputEnabled };
    // Intentionally empty: this object's IDENTITY must never change across
    // renders (see the comment above). Everything read inside these
    // closures is a ref (stable identity, exempt from exhaustive-deps), so
    // an empty array is both correct and lint-clean — no suppression needed.
  }, []);
}
