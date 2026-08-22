"use client";

import type { CSSProperties } from "react";
import { FLOORS, INK_COLORS } from "./modes";
import { usePlayground } from "./playground-context";

export function StageToolbar() {
  const {
    mode,
    floor,
    setFloor,
    explode,
    setExplode,
    ink,
    setInk,
    clearSketch,
    saveSketch,
  } = usePlayground();

  return (
    <div className="stage-toolbar" data-mode={mode}>
      <div className="tool-group floor-tools">
        <span className="tool-label">Show me</span>
        {FLOORS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tool-chip${floor === item.id ? " active" : ""}`}
            onClick={() => setFloor(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="tool-group explode-tools">
        <span className="tool-label">Pull apart</span>
        <input
          type="range"
          min={0}
          max={100}
          value={explode}
          aria-label="Pull model layers apart"
          onChange={(event) => setExplode(Number(event.target.value))}
        />
        <span className="range-icon" aria-hidden="true">
          ✦
        </span>
      </div>
      <div className="tool-group sketch-tools">
        <span className="tool-label">Draw with</span>
        {INK_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            className={`color-dot${ink === color.value ? " active" : ""}`}
            style={{ "--ink": color.value } as CSSProperties}
            aria-label={color.label}
            onClick={() => setInk(color.value)}
          />
        ))}
        <button type="button" className="tool-chip" onClick={clearSketch}>
          Clear drawing
        </button>
        <button type="button" className="tool-chip save-sketch" onClick={saveSketch}>
          Save my idea
        </button>
      </div>
    </div>
  );
}
