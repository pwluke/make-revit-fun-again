"use client";

import { useEffect, useRef } from "react";

/**
 * Points an anchored character at the pointer. The element keeps its place on
 * the page; only `--look-x` / `--look-y` change, both clamped to -1…1, so the
 * stylesheet can lean the eyes, head, and torso toward the cursor.
 */
export function useCursorLook<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const setLook = (x: number, y: number) => {
      node.style.setProperty("--look-x", `${x}`);
      node.style.setProperty("--look-y", `${y}`);
    };

    const onMove = (event: PointerEvent) => {
      if (document.pointerLockElement) return;
      const bounds = node.getBoundingClientRect();
      const offsetX = event.clientX - (bounds.left + bounds.width / 2);
      const offsetY = event.clientY - (bounds.top + bounds.height / 2);
      // Far-away pointers get a full lean, close ones only a nudge.
      const distance = Math.max(1, Math.hypot(offsetX, offsetY));
      const strength = Math.min(1, distance / 180);
      setLook((offsetX / distance) * strength, (offsetY / distance) * strength);
    };

    const onRest = () => setLook(0, 0);

    window.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("mouseleave", onRest);
    window.addEventListener("blur", onRest);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("mouseleave", onRest);
      window.removeEventListener("blur", onRest);
    };
  }, []);

  return ref;
}
