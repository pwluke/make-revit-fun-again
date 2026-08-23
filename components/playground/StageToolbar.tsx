"use client";

import type { CSSProperties } from "react";
import { useLaserTagStore } from "@/components/lasertag/laserTagStore";
import { useFloodStore } from "@/components/world/floodStore";
import {
  setControlMode,
  useControlMode,
  visibleControlModes,
} from "@/components/controls/controlModeStore";
import { useSketchTools } from "@/components/world/sketchTools";
import { FLOORS, INK_COLORS } from "./modes";
import { usePlayground } from "./playground-context";

export function StageToolbar() {
  const botsTagged = useLaserTagStore((s) => s.tagged.length);
  const botTotal = useLaserTagStore((s) => s.total);
  const botConfigCount = useLaserTagStore((s) => s.config.botCount);
  const control = useControlMode();
  const hasCrayon = useSketchTools((state) => state.crayonAvailable);
  const canDraw = useSketchTools((state) => state.enabled);
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
    showToast,
    tone,
  } = usePlayground();

  return (
    <div className="stage-toolbar" data-mode={mode}>
      {/* One row inside the scroller. The groups cannot centre themselves with
          `justify-content` on the toolbar: a centred flex row that overflows
          cannot be scrolled back to its left edge in Chrome, which would put
          the control buttons permanently out of reach on a narrow stage. This
          wrapper takes `margin: auto` instead — centred while it fits,
          scrollable when it does not. */}
      <div className="toolbar-inner">
        {/* The one group that is not mode-specific — how you drive the world is
            a setting, not an activity, so it shows in all seven. On /minecraft
            the same four modes are reached by clicking, by `B`, and by the Hands
            button; the playground has no room for that folklore, hence buttons.

            Deliberately first: a child who cannot look around cannot do any of
            the activities to its right. */}
        <div className="tool-group control-tools">
          <span className="tool-label">Move with</span>
          {visibleControlModes(hasCrayon).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={control === item.id}
              className={`tool-chip control-chip${
                control === item.id ? " active" : ""
              }`}
              title={
                item.id === "draw" && !canDraw
                  ? "Switch to Sketch to 3D to draw"
                  : item.help
              }
              disabled={item.id === "draw" && !canDraw}
              onClick={() => {
                setControlMode(item.id);
                // The orbit hint over the viewport is gone for good once the
                // child has looked around once, so the toast is the only place
                // that can still explain a mode they pick later.
                showToast(`${item.icon} ${item.label}`, item.help);
                tone(520);
              }}
            >
              <b aria-hidden="true">{item.icon}</b>
              {item.label}
            </button>
          ))}
        </div>
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
          <button
            type="button"
            className="tool-chip save-sketch"
            onClick={saveSketch}
          >
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
        {/* Race to the Top. Its own rule in the CSS for the same reason Laser
            Tag has one: a mode outside the five-step adventure must not be able
            to break the adventure's toolbar. Deliberately just the restart —
            the depth, the clock and the "higher ground" hint all live in
            FloodHud over the viewport, and printing them twice invites them to
            disagree. */}
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
    </div>
  );
}
