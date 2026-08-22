"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  ExitFullscreenIcon,
  FullscreenIcon,
  ResetIcon,
} from "./icons";
import { GesturePanel } from "./GesturePanel";
import { MinecraftViewport } from "./MinecraftViewport";
import {
  INVENTORY,
  ITEM_EMOJI,
  MODES,
  PAINT_COLORS,
  TREASURES,
} from "./modes";
import { usePlayground } from "./playground-context";
import { SketchOverlay } from "./SketchOverlay";
import { StageToolbar } from "./StageToolbar";

export function ModelStage() {
  const {
    mode,
    stageRef,
    fullscreen,
    toggleFullscreen,
    resetView,
    fov,
    sceneEpoch,
    markSpun,
    spun,
    zoomIn,
    zoomOut,
    paintedColors,
    paintColor,
    placedItems,
    placeItem,
    treasures,
    findTreasure,
  } = usePlayground();
  const config = MODES[mode];
  const [pointerLocked, setPointerLocked] = useState(false);
  const wallColor = paintedColors[paintedColors.length - 1];

  useEffect(() => {
    const onLock = () => {
      const locked = Boolean(document.pointerLockElement);
      setPointerLocked(locked);
      if (locked) markSpun();
    };
    document.addEventListener("pointerlockchange", onLock);
    return () => document.removeEventListener("pointerlockchange", onLock);
  }, [markSpun]);

  return (
    <section
      ref={stageRef}
      className="model-stage"
      aria-label="Interactive architectural model"
      style={
        wallColor
          ? ({
              "--wall-light": wallColor,
            } as CSSProperties)
          : undefined
      }
    >
      <div className="stage-top">
        <div>
          <span className="mode-pill">{config.pill}</span>
          <h2>{config.title}</h2>
        </div>
        <div className="stage-actions">
          <button
            type="button"
            className="round-action"
            aria-label="Reset model view"
            title="Reset view"
            onClick={resetView}
          >
            <ResetIcon />
          </button>
          <button
            type="button"
            className="round-action"
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title="Fullscreen"
            onClick={toggleFullscreen}
          >
            {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>

      <div className={`model-viewport mode-${mode}`} data-mode={mode}>
        <MinecraftViewport
          fov={fov}
          sceneEpoch={sceneEpoch}
          onPlay={markSpun}
        />
        {pointerLocked ? <div className="crosshair" aria-hidden /> : null}

        <div className={`orbit-hint${spun ? " hidden" : ""}`}>
          <span>↔</span> Click to look around
        </div>

        {placedItems.map((item) => (
          <span
            key={item.id}
            className="placed-item"
            aria-hidden="true"
            style={{ left: item.left, top: item.top }}
          >
            {ITEM_EMOJI[item.item]}
          </span>
        ))}

        {TREASURES.map((treasure) => (
          <button
            key={treasure.id}
            type="button"
            className={`treasure-marker ${treasure.className}${
              treasures.includes(treasure.id) ? " found" : ""
            }`}
            aria-label={treasure.label}
            onClick={() => findTreasure(treasure.id)}
          >
            {treasures.includes(treasure.id) ? "★" : "?"}
          </button>
        ))}

        <SketchOverlay />

        <div className="remix-palette" aria-label="Room color choices">
          <span>Paint the walls</span>
          {PAINT_COLORS.map((color) => (
            <button
              key={color.value}
              type="button"
              style={{ "--swatch": color.value } as CSSProperties}
              aria-label={color.label}
              onClick={() => paintColor(color.value)}
            />
          ))}
        </div>

        <div className="remix-inventory" aria-label="Room item inventory">
          <span>Tap to add</span>
          {INVENTORY.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Add ${item.label === "My idea" ? "your sketch" : `a ${item.label.toLowerCase()}`}`}
              onClick={() => placeItem(item.id)}
            >
              <b>{ITEM_EMOJI[item.id]}</b>
              <small>{item.label}</small>
            </button>
          ))}
        </div>

        <GesturePanel />

        <div className="view-cube" aria-hidden="true">
          <span className="cube-top">TOP</span>
          <span className="cube-front">FRONT</span>
          <span className="cube-side">SIDE</span>
        </div>

        <div className="zoom-controls">
          <button type="button" aria-label="Zoom in" onClick={zoomIn}>
            +
          </button>
          <button type="button" aria-label="Zoom out" onClick={zoomOut}>
            −
          </button>
        </div>
      </div>

      <StageToolbar />
    </section>
  );
}
