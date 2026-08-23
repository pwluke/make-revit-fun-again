"use client";

import { useEffect, useRef } from "react";
import { useSketchTools } from "@/components/world/sketchTools";
import { usePlayground } from "./playground-context";

export function SketchOverlay() {
  const { ink, sketchVersion, markSketchDrawn } = usePlayground();
  // Crayon is one of four exclusive input modes (see components/ControlBar).
  // This canvas covers the whole viewport, so while it is capturing, nothing
  // behind it can be clicked — which is what made 3D drawing and creation
  // editing unreachable in the very mode that offers them. It stays VISIBLE at
  // all times in sketch mode (the marks you already made should not vanish
  // because you switched to Draw); only pointer capture follows the mode.
  const crayon = useSketchTools((state) => state.crayon);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef(ink);
  inkRef.current = ink;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const resize = () => {
      const bounds = parent.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [sketchVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let drawing = false;

    const point = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    };

    const onDown = (event: PointerEvent) => {
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const start = point(event);
      context.beginPath();
      context.moveTo(start.x, start.y);
    };

    const onMove = (event: PointerEvent) => {
      if (!drawing) return;
      const next = point(event);
      context.lineTo(next.x, next.y);
      context.strokeStyle = inkRef.current;
      context.lineWidth = 5;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
      markSketchDrawn();
    };

    const onUp = () => {
      drawing = false;
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [markSketchDrawn]);

  return (
    <canvas
      ref={canvasRef}
      className={`sketch-canvas${crayon ? " is-drawing" : ""}`}
      aria-label="Drawing canvas"
    />
  );
}
