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
    <div className="absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/55 p-1 font-sans backdrop-blur-sm">
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
          : "text-white/80 hover:bg-white/15 hover:text-white"
      }`}
    >
      {hotkey ? (
        <kbd className="rounded bg-white/20 px-1.5 py-0.5 font-mono text-[0.65rem] font-bold">
          {hotkey}
        </kbd>
      ) : null}
      {label}
    </button>
  );
}
