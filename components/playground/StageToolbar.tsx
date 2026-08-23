"use client";

import type { CSSProperties } from "react";
import { useLaserTagStore } from "@/components/lasertag/laserTagStore";
import { useFloodStore } from "@/components/world/floodStore";
import { FLOORS, INK_COLORS } from "./modes";
import { usePlayground } from "./playground-context";

export function StageToolbar() {
  const botsTagged = useLaserTagStore((s) => s.tagged.length);
  const botTotal = useLaserTagStore((s) => s.total);
  const botConfigCount = useLaserTagStore((s) => s.config.botCount);
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
      <div className="tool-group laser-tools">
        <span className="tool-label">Round</span>
        <button
          type="button"
          className="tool-chip"
          onClick={() => useLaserTagStore.getState().backToSetup()}
        >
          Change settings
        </button>
        <button
          type="button"
          className="tool-chip"
          onClick={() => useLaserTagStore.getState().playAgain()}
        >
          New round
        </button>
        <span className="tool-chip static">
          {/* `total` is 0 until the voxel layers land, so fall back to the
              count the player picked rather than flashing "0 left". */}
          Bots left: {Math.max(0, (botTotal || botConfigCount) - botsTagged)}
        </span>
      </div>
      {/* Race to the Top. Its own rule in the CSS for the same reason Laser Tag
          has one: a mode outside the five-step adventure must not be able to
          break the adventure's toolbar. Deliberately just the restart — the
          depth, the clock and the "higher ground" hint all live in FloodHud
          over the viewport, and printing them twice invites them to disagree. */}
      <div className="tool-group race-tools">
        <span className="tool-label">Run</span>
        <button
          type="button"
          className="tool-chip"
          onClick={() => useFloodStore.getState().reset()}
        >
          Start over
        </button>
      </div>
    </div>
  );
}
