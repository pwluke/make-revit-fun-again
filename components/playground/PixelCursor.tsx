"use client";

import { useEffect, useRef, useState } from "react";

export function PixelCursor() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (document.pointerLockElement) return;
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${event.clientX - 5}px,${event.clientY - 2}px,0)`;
      }
      setVisible(true);
    };
    const onDown = () => setPressed(true);
    const onUp = () => setPressed(false);
    const onLeave = () => setVisible(false);
    const onLock = () => {
      if (document.pointerLockElement) setVisible(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("mouseleave", onLeave);
    document.addEventListener("pointerlockchange", onLock);

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("pointerlockchange", onLock);
    };
  }, []);

  return (
    <div
      ref={cursorRef}
      className={`pixel-cursor${visible ? " visible" : ""}${pressed ? " pressed" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 40" shapeRendering="crispEdges">
        <path
          className="cursor-outline"
          d="M8 0h8v4h4v4h4v4h4v4h4v16h-4v8H8v-4H4v-8H0V16h8z"
        />
        <path
          className="cursor-fill"
          d="M8 4h4v16h4V8h4v12h4v-8h4v16h-4v8H8v-4H4V20h4z"
        />
        <path className="cursor-shine" d="M8 8h4v8H8z" />
      </svg>
    </div>
  );
}
