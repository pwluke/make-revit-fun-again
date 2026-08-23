"use client";

import {
  setControlMode,
  useControlMode,
  visibleControlModes,
} from "@/components/controls/controlModeStore";
import { useSketchTools } from "@/components/world/sketchTools";

/** Hotkey worth advertising, where one exists. */
const HOTKEY: Record<string, string> = { pointerlock: "click", draw: "B" };

/**
 * Clickable switcher for the control modes.
 *
 * Pointer lock hides the cursor, so while you are looking around with the mouse
 * this is only a display — Esc (or Keys, or Hands) gives the cursor back, then
 * the buttons work. The modes share one mouse and one camera, which is why
 * they are radio buttons rather than toggles: see
 * components/controls/controlModeStore.ts for who takes what.
 *
 * Crayon is hidden (not greyed) where there is no 2D surface — /minecraft never
 * renders one, and advertising a mode that page cannot enter reads as a bug.
 * Draw is disabled rather than hidden when Sketch-to-3D is off, so the bar
 * keeps its shape; matches `B` being inert under the same condition.
 */
export function ControlBar({ onCreate }: { onCreate?: () => void } = {}) {
  const mode = useControlMode();
  const canDraw = useSketchTools((state) => state.enabled);
  const hasCrayon = useSketchTools((state) => state.crayonAvailable);

  return (
    // White rather than the translucent black it started as, matching ThemeHud's
    // swatch strip — the light chrome is what this codebase uses for things you
    // click, and the dark pills for things you only read.
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/90 p-1 font-sans shadow-lg ring-1 ring-slate-900/10 backdrop-blur-sm">
      {visibleControlModes(hasCrayon).map((item) => (
        <ModeButton
          key={item.id}
          label={item.label}
          hotkey={HOTKEY[item.id] ?? ""}
          title={
            item.id === "draw" && !canDraw
              ? "Switch to Sketch to 3D to draw"
              : item.help
          }
          active={mode === item.id}
          disabled={item.id === "draw" && !canDraw}
          onClick={() => setControlMode(item.id)}
        />
      ))}

      {/* `E` is an ACTION, not a mode — it opens the generate overlay and
          returns you to whatever mode you were in. Hence the divider: the
          buttons to the left are a radio group, this is a push button.

          It lives here because the E/B hint strip was removed and nothing else
          advertised `E`, leaving the single most important entry point in the
          app undiscoverable. A button rather than a tip also gives it a
          pointer-driven route: press Esc for the cursor, then click. */}
      {onCreate ? (
        <>
          <span aria-hidden className="mx-0.5 h-6 w-px bg-slate-900/15" />
          <ModeButton
            label="Make"
            hotkey="E"
            active={false}
            disabled={!canDraw}
            title={
              canDraw
                ? "Draw a picture and turn it into a 3D thing"
                : "Switch to Sketch to 3D to make something"
            }
            onClick={onCreate}
          />
        </>
      ) : null}
    </div>
  );
}

function ModeButton({
  label,
  hotkey,
  title,
  active,
  disabled = false,
  onClick,
}: {
  label: string;
  hotkey: string;
  title?: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={(event) => {
        // Don't let the click bubble into a look-lock listener if this bar
        // ever sits inside the canvas host.
        event.stopPropagation();
        onClick();
      }}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-emerald-600 text-white"
          : disabled
            ? "cursor-not-allowed text-slate-400"
            : "text-slate-600 hover:bg-slate-900/10 hover:text-slate-900"
      }`}
    >
      {/* The keycap has to follow the button, not the bar: the active button is
          still emerald, so a light cap reads there, while an inactive one now
          sits on white and needs a dark cap to be legible at all. */}
      {hotkey ? (
        <kbd
          className={`rounded px-1.5 py-0.5 font-mono text-[0.65rem] font-bold ${
            active ? "bg-white/25 text-white" : "bg-slate-900/10 text-slate-500"
          }`}
        >
          {hotkey}
        </kbd>
      ) : null}
      {label}
    </button>
  );
}
