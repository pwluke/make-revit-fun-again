"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CreationMode } from "../core/types";

export type SketchOverlayProps = {
  open: boolean;
  onCancel: () => void;
  onSubmit: (png: Blob, userText: string, mode: CreationMode) => void;
};

type Point = { x: number; y: number };
type Stroke = { color: string; size: number; pts: Point[] };

const PALETTE = [
  { hex: "#111111", name: "black" },
  { hex: "#c0392b", name: "red" },
  { hex: "#1f6f3f", name: "green" },
  { hex: "#1f4e9c", name: "blue" },
  { hex: "#7d3c98", name: "purple" },
  { hex: "#a04000", name: "brown" },
] as const;

/**
 * Ordered fastest to slowest, because for a queue of children the wait is the
 * thing they actually feel. Times are measured compute (see
 * docs/specs/2026-08-22-sketch-to-3d-design.md), rounded up and stated in the
 * label so the choice is honest rather than a guess about what "quick" means.
 */
const MODE_CHOICES: ReadonlyArray<{ mode: CreationMode; label: string }> = [
  { mode: "sprite", label: "⚡ Quick (10s)" },
  { mode: "fast", label: "🚀 Fast 3D (25s)" },
  // "Detailed 3D (2 min)" wrapped to two lines at 1400px, leaving this button
  // taller than its neighbours. The word "3D" is redundant next to Fast 3D.
  { mode: "mesh", label: "🧊 Detailed (2 min)" },
];

const EXPORT_SIZE = 1024;
const MAX_DPR = 2;

export function SketchOverlay({ open, onCancel, onSubmit }: SketchOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);

  const [color, setColor] = useState<string>(PALETTE[0].hex);
  const [size, setSize] = useState(14);
  const [userText, setUserText] = useState("");
  const [mode, setMode] = useState<CreationMode>("sprite");
  const [drawHint, setDrawHint] = useState<string | null>(null);
  const [textHint, setTextHint] = useState<string | null>(null);
  // Tracks whether the overlay should still render interactive content while
  // the fade-out transition plays; flips to false only once it's fully hidden.
  const [visible, setVisible] = useState(open);

  // Renders strokes stored in strokesRef. The same renderer drives both the
  // live display (identity transform) and the export canvas (bounding-box
  // scale + offset), so there is exactly one source of truth for stroke data.
  const drawStrokes = useCallback(
    (ctx: CanvasRenderingContext2D, strokes: Stroke[], scale = 1, offsetX = 0, offsetY = 0) => {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const stroke of strokes) {
        if (stroke.pts.length < 2) continue;
        ctx.strokeStyle = stroke.color;
        ctx.lineWidth = stroke.size * scale;
        ctx.beginPath();
        ctx.moveTo(stroke.pts[0].x * scale + offsetX, stroke.pts[0].y * scale + offsetY);
        for (let i = 1; i < stroke.pts.length; i++) {
          ctx.lineTo(stroke.pts[i].x * scale + offsetX, stroke.pts[i].y * scale + offsetY);
        }
        ctx.stroke();
      }
    },
    [],
  );

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Display canvas stays transparent so the live 3D scene shows through.
    // Clear in device-pixel space (identity transform) regardless of the
    // DPR scale currently applied to the context, then restore it.
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    drawStrokes(ctx, strokesRef.current);
  }, [drawStrokes]);

  const resetDrawing = useCallback(() => {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    redraw();
  }, [redraw]);

  // Every setState here lives inside an async callback rather than the effect body.
  // Setting state synchronously in an effect triggers cascading renders and is
  // flagged by react-hooks/set-state-in-effect. Deferring the reveal by one frame
  // is also what lets the CSS enter-transition actually run: the element has to be
  // mounted at its start state before the opacity change can animate.
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => {
        setVisible(true);
        textInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }

    // Keep rendering interactive content through the fade-out, then hide and clear.
    // Resetting on close rather than on open means a half-finished drawing is not
    // left sitting in memory while the kid is back in the world.
    const timer = setTimeout(() => {
      setVisible(false);
      resetDrawing();
      setUserText("");
      setDrawHint(null);
      setTextHint(null);
    }, 250);
    return () => clearTimeout(timer);
  }, [open, resetDrawing]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  // Sizes the canvas backing store to its CSS size * devicePixelRatio (capped
  // at 2), scales the context so strokes can be stored in CSS-pixel
  // coordinates, and redraws after every resize since resizing a canvas
  // element clears it. No React state involved — purely imperative.
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [visible, redraw]);

  const posFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const stroke: Stroke = { color, size, pts: [posFromEvent(e)] };
      currentStrokeRef.current = stroke;
      strokesRef.current.push(stroke);
      setDrawHint(null);
      redraw();
    },
    [color, size, posFromEvent, redraw],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!currentStrokeRef.current) return;
      currentStrokeRef.current.pts.push(posFromEvent(e));
      redraw();
    },
    [posFromEvent, redraw],
  );

  const handlePointerEnd = useCallback(() => {
    currentStrokeRef.current = null;
  }, []);

  const handleUndo = useCallback(() => {
    strokesRef.current.pop();
    redraw();
  }, [redraw]);

  const handleClear = useCallback(() => {
    strokesRef.current = [];
    redraw();
  }, [redraw]);

  const handleSubmit = useCallback(() => {
    const hasStrokes = strokesRef.current.length > 0;
    const hasText = userText.trim().length > 0;

    setDrawHint(hasStrokes ? null : "Draw something first");
    setTextHint(hasText ? null : "Tell us what it is");

    if (!hasStrokes || !hasText) return;

    // Export canvas is a separate offscreen surface: solid white background
    // (the fal sketch model needs dark line art on white, not transparency),
    // with the strokes replayed normalised to their bounding box so the
    // drawing fills the export image regardless of where or how big it was
    // drawn on the full-viewport canvas.
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = EXPORT_SIZE;
    exportCanvas.height = EXPORT_SIZE;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;
    exportCtx.fillStyle = "#ffffff";
    exportCtx.fillRect(0, 0, EXPORT_SIZE, EXPORT_SIZE);

    const PADDING = 0.08 * EXPORT_SIZE;
    const usable = EXPORT_SIZE - 2 * PADDING;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const stroke of strokesRef.current) {
      for (const pt of stroke.pts) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }

    // Guard degenerate boxes (a single dot, or a perfectly straight
    // horizontal/vertical line) so we never divide by zero.
    const bw = Math.max(maxX - minX, 1);
    const bh = Math.max(maxY - minY, 1);

    // Uniform scale, preserving aspect ratio, clamped so a tiny scribble
    // doesn't blow up into an unrecognisable blob.
    const scale = Math.min(usable / bw, usable / bh, 6);

    // Centre the scaled drawing in the export.
    const offsetX = (EXPORT_SIZE - bw * scale) / 2 - minX * scale;
    const offsetY = (EXPORT_SIZE - bh * scale) / 2 - minY * scale;

    drawStrokes(exportCtx, strokesRef.current, scale, offsetX, offsetY);

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      onSubmit(blob, userText.trim(), mode);
      resetDrawing();
      setUserText("");
    }, "image/png");
  }, [userText, mode, onSubmit, resetDrawing, drawStrokes]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Draw something to bring into the world"
      className="fixed inset-0 z-50 transition-opacity duration-[250ms] ease-out"
      style={{
        opacity: open ? 1 : 0,
        pointerEvents: open ? "auto" : "none",
      }}
    >
      {/* Drawing surface: fully invisible, full viewport. Only the strokes
          drawn on it are visible, floating directly over the live 3D scene. */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
        style={{ touchAction: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      />

      {/* The control layer spans the viewport for layout, so it MUST be
          click-through: without `pointer-events-none` it sits on top of the
          full-screen canvas and swallows every pointer event, so no stroke is
          ever recorded and the canvas silently appears to do nothing. Each
          interactive panel below re-enables pointer events for itself. */}
      <div className="pointer-events-none relative z-10 flex h-full w-full flex-col items-center justify-between gap-4 p-4 sm:p-6">
        <div className="rounded-2xl bg-black/60 px-5 py-3 text-center backdrop-blur-sm">
          <h1 className="text-xl font-bold text-white">Draw something!</h1>
          <p className="text-sm text-slate-200">Turn your drawing into a real 3D thing.</p>
        </div>

        <div className="pointer-events-none flex w-full max-w-3xl flex-col items-center gap-4">
          {drawHint && (
            <p className="rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-amber-300 backdrop-blur-sm">{drawHint}</p>
          )}

          <div className="pointer-events-auto flex w-full flex-wrap items-center justify-center gap-3 rounded-2xl bg-black/60 p-3 backdrop-blur-sm">
          {PALETTE.map((swatch) => (
            <button
              key={swatch.hex}
              type="button"
              aria-label={`Choose ${swatch.name} color`}
              aria-pressed={color === swatch.hex}
              onClick={() => setColor(swatch.hex)}
              className="h-10 w-10 rounded-full border-4 transition-transform"
              style={{
                backgroundColor: swatch.hex,
                borderColor: color === swatch.hex ? "#ffffff" : "rgba(255,255,255,0.25)",
                transform: color === swatch.hex ? "scale(1.15)" : "scale(1)",
              }}
            />
          ))}

          <label className="flex items-center gap-2 text-sm text-slate-200">
            Size
            <input
              type="range"
              min={4}
              max={48}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="w-28"
            />
          </label>

          <button
            type="button"
            onClick={handleUndo}
            className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-600"
          >
            Clear
          </button>
        </div>

        <div className="pointer-events-auto flex w-full flex-col items-stretch gap-1 rounded-2xl bg-black/60 p-3 backdrop-blur-sm sm:flex-row sm:items-center sm:gap-3">
          <label htmlFor="sketch-overlay-text" className="text-sm font-semibold text-slate-200">
            What did you draw?
          </label>
          <input
            id="sketch-overlay-text"
            ref={textInputRef}
            type="text"
            value={userText}
            onChange={(e) => {
              setUserText(e.target.value);
              if (e.target.value.trim().length > 0) setTextHint(null);
            }}
            onKeyDown={(e) => {
              // Enter submits. Typing the name of the thing and pressing Enter
              // is what everyone tries first; making them hunt for the button
              // afterwards is a small tax paid on every single creation.
              // stopPropagation keeps it from reaching the window-level key
              // handlers that drive draw mode and selection.
              if (e.key !== "Enter") return;
              e.preventDefault();
              e.stopPropagation();
              handleSubmit();
            }}
            placeholder="a red dragon... (press Enter)"
            className="flex-1 rounded-full border-2 border-slate-600 bg-slate-800 px-4 py-2 text-base text-white placeholder-slate-400 outline-none focus:border-sky-400"
          />
        </div>
        {textHint && <p className="-mt-2 self-start rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-amber-300 backdrop-blur-sm sm:self-center">{textHint}</p>}

        <div
          role="radiogroup"
          aria-label="Generation speed"
          className="pointer-events-auto flex w-full max-w-lg items-center justify-center gap-2 rounded-2xl bg-black/60 p-2 backdrop-blur-sm"
        >
          {MODE_CHOICES.map((choice) => (
            <button
              key={choice.mode}
              type="button"
              role="radio"
              aria-checked={mode === choice.mode}
              onClick={() => setMode(choice.mode)}
              className="flex-1 rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap transition-colors"
              style={{
                backgroundColor: mode === choice.mode ? "#0ea5e9" : "transparent",
                color: mode === choice.mode ? "#ffffff" : "#cbd5e1",
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto flex w-full items-center justify-center gap-4 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full bg-slate-700 px-6 py-3 text-base font-semibold text-white hover:bg-slate-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-full bg-emerald-500 px-8 py-3 text-lg font-bold text-white shadow-lg hover:bg-emerald-400"
          >
            Make it real
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
