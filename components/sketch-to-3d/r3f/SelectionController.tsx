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
import { sketchStore } from "@/components/sketch3d/core/strokeStore";

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

      // While something is selected the pointer is unlocked and the bounding box
      // handles own the mouse. Clicks are theirs to handle (they stopPropagation);
      // anything reaching here is a click on empty space, meaning "deselect".
      if (selectedId) {
        select(null);
        bridge?.setInputEnabled(true);
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
        // Hand the mouse back so the bounding box can be dragged.
        bridge?.setInputEnabled(false);
        return;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const { selectedId, select, dropToGround, bridge } = creationStore.getState();
      if (!selectedId) return;

      if (event.code === "Escape") {
        select(null);
        bridge?.setInputEnabled(true);
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
