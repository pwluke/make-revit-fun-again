"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  ExitFullscreenIcon,
  FullscreenIcon,
  ResetIcon,
} from "./icons";
import GestureTracker from "@/components/gesture/GestureTracker";
import { LaserTag } from "@/components/lasertag/LaserTag";
import { LaserTagHud } from "@/components/lasertag/LaserTagHud";
import FloodHud from "@/components/world/FloodHud";
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
import { ThemeHud } from "@/components/world/ThemeHud";
import {
  useControlMode,
  type ControlModeId,
} from "@/components/controls/controlModeStore";
import TreasureHud from "@/components/world/TreasureHud";
import PowerupHud from "@/components/world/PowerupHud";
import { SketchToWorld } from "@/components/sketch-to-3d/SketchToWorld";
import { PaletteHUD } from "@/components/sketch3d/ui/PaletteHUD";
import type { ModeId } from "./modes";

/**
 * First-run nudge inside the viewport. The control mode wins over the activity:
 * "Click to look around" is a lie in keyboard and hands mode, and being told to
 * click something that will not respond is worse than no hint at all.
 */
function lookHint(control: ControlModeId, mode: ModeId): string {
  if (control === "keyboard") return "Arrow keys to look · WASD to walk";
  if (control === "hands") return "Turn your head to look around";
  if (control === "crayon") return "Draw on the picture";
  if (control === "draw") return "Click to look, then hold to draw";
  if (mode === "lasertag") return "Click to take aim";
  if (mode === "race") return "Click to look, WASD to run";
  return "Click to look around";
}

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
  const control = useControlMode();
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

      {/* `data-control` is here rather than only in the toolbar so the CSS can
          stand the flat sketch overlay down when the child asks for real 3D
          lines — it is a sibling of the look-lock element, so while it is up it
          swallows the click that would grab the pointer. */}
      <div
        className={`model-viewport mode-${mode}`}
        data-mode={mode}
        data-control={control}
      >
        <MinecraftViewport
          fov={fov}
          sceneEpoch={sceneEpoch}
          onPlay={markSpun}
        >
          {mode === "lasertag" ? <LaserTag /> : null}
        </MinecraftViewport>
        {/* Keyboard mode never takes the lock, but the centre of the screen is
            still where the arrow keys aim, so it needs the reticle just as
            much. */}
        {pointerLocked || control === "keyboard" ? (
          <div className="crosshair" aria-hidden />
        ) : null}
        {mode === "lasertag" ? <LaserTagHud /> : null}
        {/* Water depth, breath and the drowned card. Only in the race: every
            other mode runs creative, where the flood is frozen and there is
            nothing for this to report. */}
        {mode === "race" ? <FloodHud /> : null}

        <div className={`orbit-hint${spun ? " hidden" : ""}`}>
          <span>↔</span> {lookHint(control, mode)}
        </div>

        {/* No 🛠 Creative button: the activity rail owns creative mode now. */}
        <ThemeHud
          className="top-4 left-4 right-auto items-start"
          creativeToggle={false}
        />

        {/* The DOM half of the shared world, mounted here for the same reason
            app/minecraft/page.js mounts it: none of this can live inside
            <Canvas>, so every host of <MinecraftScene/> has to remount it by
            hand. The scene already renders <Stars/>, <Powerups/>, <Flood/>,
            <SketchController/> and <Creations/> on this page — without the
            components below the star count, the breath bar, the drown-restart
            button and the `E`/`B` key bindings simply did not exist here, with
            no error to say so.

            All of these are `absolute`, so they land inside .model-viewport
            (position: relative) rather than over the playground chrome. */}
        {/* The stars/water pills stack in the bottom-left of the viewport. Two
            modes park a panel in that same corner, so playground.css lifts the
            stack clear of them — see .world-hud-* there. */}
        <TreasureHud className="world-hud-stars" />
        <PowerupHud />
        <FloodHud className="world-hud-water" />
        {/* top-14 rather than the default top-4: the orbit hint owns the top
            centre of this viewport. */}
        <SketchToWorld modeStripClassName="top-14 z-20" />
        <PaletteHUD />

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

        {/* Camera hand/head control for the Minecraft scene. The tracker owns
            its own Hands button, so it must live inside the viewport (the same
            box the scene fills) on every mode, not just explode. */}
        <div className="gesture-tracker">
          <GestureTracker />
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
