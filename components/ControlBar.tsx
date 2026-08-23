"use client";

import {
  CONTROL_MODES,
  setControlMode,
  useControlMode,
} from "@/components/controls/controlModeStore";

/** Hotkey worth advertising, where one exists. */
const HOTKEY: Record<string, string> = { pointerlock: "click", draw: "B" };

/**
 * Clickable switcher for the four control modes.
 *
 * Pointer lock hides the cursor, so while you are looking around with the mouse
 * this is only a display — Esc (or Keys, or Hands) gives the cursor back, then
 * the buttons work. All four modes share one mouse and one camera, which is why
 * they are radio buttons rather than toggles: see
 * components/controls/controlModeStore.ts for who takes what.
 */
export function ControlBar() {
  const mode = useControlMode();

  return (
    // White rather than the translucent black it started as, matching ThemeHud's
    // swatch strip — the light chrome is what this codebase uses for things you
    // click, and the dark pills for things you only read.
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/90 p-1 font-sans shadow-lg ring-1 ring-slate-900/10 backdrop-blur-sm">
      {CONTROL_MODES.map((item) => (
        <ModeButton
          key={item.id}
          label={item.label}
          hotkey={HOTKEY[item.id] ?? ""}
          title={item.help}
          active={mode === item.id}
          onClick={() => setControlMode(item.id)}
        />
      ))}
    </div>
  );
}

function ModeButton({
  label,
  hotkey,
  title,
  active,
  onClick,
}: {
  label: string;
  hotkey: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
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
