"use client";

/**
 * Photoshop-style bounding box around the selected creation.
 *
 * Four corner handles scale it uniformly; dragging the box body moves it up and
 * down. Both are real pointer drags, which is why selecting releases pointer
 * lock (see SelectionController).
 *
 * The box is camera-facing rather than axis-aligned: at any angle you get a flat
 * rectangle with corners where you expect them, instead of a wireframe cube
 * whose "top-right corner" changes meaning as you walk around it.
 *
 * Drag state lives in refs, not state — a drag updates every mousemove, and
 * re-rendering React on each one would drop frames for no benefit. The store is
 * written on each move so the creation itself follows live.
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useStore } from "zustand";
import { creationStore } from "../core/creationStore";
import { heightFromDrag, scaleFromDrag } from "../core/transform";

/** Half-size of a corner handle, in world units at the box's distance. */
const HANDLE_SIZE = 0.12;
const BOX_COLOR = "#38bdf8";
const HANDLE_COLOR = "#ffffff";

/** Matches the normalised creation size in Creations.tsx. */
const BASE_SIZE = 2;

type DragState =
  | { kind: "none" }
  | {
      kind: "scale";
      startScale: number;
      startDistance: number;
      centerScreen: { x: number; y: number };
    }
  | { kind: "move"; startY: number; startPointerY: number; worldPerPixel: number };

export function SelectionBox() {
  const selectedId = useStore(creationStore, (state) => state.selectedId);
  const creations = useStore(creationStore, (state) => state.creations);
  const { camera, size, gl } = useThree();
  const groupRef = useRef<THREE.Group>(null!);
  const drag = useRef<DragState>({ kind: "none" });

  const creation = useMemo(
    () => creations.find((candidate) => candidate.id === selectedId) ?? null,
    [creations, selectedId],
  );

  // Keep the box facing the camera. Yaw-only, matching SpriteCreation — a full
  // lookAt tilts the rectangle when the player looks up or down.
  useFrame(() => {
    const group = groupRef.current;
    if (!group || !creation) return;
    const worldPos = group.getWorldPosition(new THREE.Vector3());
    group.rotation.y = Math.atan2(
      camera.position.x - worldPos.x,
      camera.position.z - worldPos.z,
    );
  });

  // Drag handling lives on the window, not on the meshes: once a drag starts,
  // the pointer routinely leaves the small handle it began on, and mesh-level
  // pointermove would stop firing exactly when it matters.
  useEffect(() => {
    if (!creation) return;

    const onMove = (event: PointerEvent) => {
      const state = drag.current;
      if (state.kind === "none") return;

      if (state.kind === "scale") {
        const distance = Math.hypot(
          event.clientX - state.centerScreen.x,
          event.clientY - state.centerScreen.y,
        );
        creationStore.getState().setTransform(creation.id, {
          scale: scaleFromDrag(state.startScale, state.startDistance, distance),
        });
      } else {
        creationStore.getState().setTransform(creation.id, {
          y: heightFromDrag(
            state.startY,
            event.clientY - state.startPointerY,
            state.worldPerPixel,
          ),
        });
      }
    };

    const onUp = () => {
      drag.current = { kind: "none" };
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [creation]);

  if (!creation) return null;

  const { scale, y } = creation.transform;
  const { position } = creation.spawn;
  const half = (BASE_SIZE * scale) / 2;
  const center: [number, number, number] = [position[0], y + half, position[2]];

  /** Projects the box's centre to screen pixels — the anchor a scale drag measures from. */
  const centerScreen = () => {
    const projected = new THREE.Vector3(...center).project(camera);
    const rect = gl.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  };

  const beginScale = (event: { clientX: number; clientY: number; stopPropagation: () => void }) => {
    event.stopPropagation();
    const anchor = centerScreen();
    drag.current = {
      kind: "scale",
      startScale: scale,
      startDistance: Math.hypot(event.clientX - anchor.x, event.clientY - anchor.y),
      centerScreen: anchor,
    };
  };

  const beginMove = (event: { clientY: number; stopPropagation: () => void }) => {
    event.stopPropagation();
    // How much world space one screen pixel covers at the box's distance. Without
    // this the object races away from the cursor when far and crawls when near.
    const distance = camera.position.distanceTo(new THREE.Vector3(...center));
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const worldPerPixel = (2 * Math.tan(fov / 2) * distance) / size.height;

    drag.current = {
      kind: "move",
      startY: y,
      startPointerY: event.clientY,
      worldPerPixel,
    };
  };

  const corners: Array<[number, number]> = [
    [-half, half],
    [half, half],
    [-half, -half],
    [half, -half],
  ];

  return (
    <group ref={groupRef} position={center}>
      {/* Body — invisible but pickable, so dragging anywhere inside the box
          moves it vertically. `visible={false}` would also stop it receiving
          pointer events, hence a transparent material instead. */}
      <mesh onPointerDown={beginMove}>
        <planeGeometry args={[half * 2, half * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>

      {/* Outline. lineWidth is ignored by most platforms, so this is a thin
          rectangle of line segments rather than a styled stroke. */}
      <lineSegments>
        <edgesGeometry args={[new THREE.PlaneGeometry(half * 2, half * 2)]} />
        <lineBasicMaterial color={BOX_COLOR} depthTest={false} />
      </lineSegments>

      {corners.map(([x, yOffset]) => (
        <mesh key={`${x},${yOffset}`} position={[x, yOffset, 0.01]} onPointerDown={beginScale}>
          <planeGeometry args={[HANDLE_SIZE, HANDLE_SIZE]} />
          {/* depthTest off so handles stay grabbable even when the creation's
              own geometry pokes through the box. */}
          <meshBasicMaterial color={HANDLE_COLOR} depthTest={false} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}
