"use client";

/**
 * Click a creation to select it for editing.
 *
 * Selection raycasts from the CAMERA CENTRE rather than using R3F's pointer
 * events, because those raycast from the pointer's last known position — which
 * under pointer lock is stale and meaningless. The crosshair is the cursor, so
 * the crosshair is what we cast from.
 *
 * Selecting releases pointer lock, which is what makes a Photoshop-style
 * bounding box possible at all: dragging a corner handle needs a real cursor.
 * The drawing overlay already establishes this pattern in the app — open a
 * thing, get your mouse back, close it, resume walking.
 */

import { useEffect } from "react";
import * as THREE from "three";
import { useThree } from "@react-three/fiber";
import { creationStore } from "../core/creationStore";
import { handleWasJustInteracted } from "./SelectionBox";
import { sketchStore } from "@/components/sketch3d/core/strokeStore";
import { toolsEnabled } from "@/components/world/sketchTools";

const raycaster = new THREE.Raycaster();
/** Dead centre of the screen, in normalised device coordinates. */
const CROSSHAIR = new THREE.Vector2(0, 0);

/** Walks up from a hit object to the creation it belongs to. */
function creationIdOf(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const id = current.userData?.creationId;
    if (typeof id === "string") return id;
    current = current.parent;
  }
  return null;
}

export function SelectionController() {
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      // Draw mode owns the left button, exactly as it does for cube placement.
      if (sketchStore.getState().drawMode) return;

      const { selectedId, select, bridge } = creationStore.getState();

      // Editing a creation is part of Sketch-to-3D, so it lives behind the same
      // gate as `E` and `B`. Checked AFTER reading the store, and only for
      // *acquiring* a selection: if the gate closes while something is selected
      // — the player switches activity mid-edit — the deselect path below must
      // still run, or the bounding box would strand with pointer lock released
      // and no way to dismiss it.
      if (!selectedId && !toolsEnabled()) return;

      // While something is selected the pointer is unlocked and the bounding box
      // owns the mouse. A click that a handle already claimed is a drag, not a
      // deselect — and R3F's stopPropagation cannot tell us that, because it
      // does not stop this native listener. Hence the shared flag.
      if (selectedId) {
        if (handleWasJustInteracted()) return;
        select(null);
        // Deliberately NOT re-locking via the bridge: PointerLockControls is
        // unmounted while a selection exists (see MinecraftScene), so there is
        // nothing to call. Deselecting remounts it, and its own click handler
        // re-locks on the player's next click.
        return;
      }

      // Only meaningful while playing — if the pointer is not locked, the click
      // belongs to some other piece of UI.
      if (!document.pointerLockElement) return;

      raycaster.setFromCamera(CROSSHAIR, camera);
      for (const hit of raycaster.intersectObjects(scene.children, true)) {
        const id = creationIdOf(hit.object);
        if (!id) continue;
        select(id);
        // Hand the mouse back so the bounding box can be dragged. Unmounting
        // the controls (MinecraftScene) is what restores R3F's normal
        // cursor-based hit testing; this is what releases the lock itself.
        bridge?.setInputEnabled(false);
        return;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const { selectedId, select, dropToGround, bridge } = creationStore.getState();
      if (!selectedId) return;

      if (event.code === "Escape") {
        select(null);
      } else if (event.code === "KeyG") {
        // Drop to the floor. The single most-wanted adjustment, so it gets a key
        // rather than a careful drag.
        dropToGround(selectedId);
      }
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [camera, scene]);

  return null;
}
