"use client";

import type { CSSProperties, ReactNode } from "react";
import { THEME_ORDER, THEMES } from "@/lib/themes";
import { useThemeStore } from "./themeStore";
import { cn } from "@/lib/utils";

/**
 * Swatch strip for the five world themes. Lives in page chrome so it stays
 * clickable after Esc releases pointer lock — clicks on the canvas itself
 * would grab the lock again.
 */
export function ThemeHud({ className }: { className?: string }) {
  const id = useThemeStore((state) => state.id);
  const setTheme = useThemeStore((state) => state.setTheme);
  const fast = useThemeStore((state) => state.fast);
  const setFast = useThemeStore((state) => state.setFast);
  const current = THEMES[id];

  return (
    <div
      role="radiogroup"
      aria-label="World theme"
      className={cn(
        "pointer-events-auto absolute top-4 right-4 z-20 flex flex-col items-end gap-1.5",
        className,
      )}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 rounded-2xl bg-white/90 px-2 py-1.5 shadow-lg ring-1 ring-slate-900/10">
        {THEME_ORDER.map((themeId) => {
          const theme = THEMES[themeId];
          const selected = themeId === id;
          return (
            <button
              key={themeId}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={theme.name}
              title={theme.name}
              onClick={() => setTheme(themeId)}
              className={cn(
                "size-7 rounded-full ring-2 transition",
                selected
                  ? "scale-110 ring-slate-800"
                  : "ring-white hover:scale-105 hover:ring-slate-400",
              )}
              style={
                {
                  background: `linear-gradient(135deg, ${theme.swatch[0]}, ${theme.swatch[1]})`,
                } as CSSProperties
              }
            />
          );
        })}

        {/* Performance mode. Sits with the theme swatches because it is the same
            kind of choice — how the world looks — but it is a toggle rather than
            a radio: it does not replace the palette, it turns off the expensive
            rendering on top of it. Hence the divider and the different shape. */}
        <span aria-hidden className="mx-0.5 h-6 w-px bg-slate-900/15" />
        <button
          type="button"
          aria-pressed={fast}
          title={
            fast
              ? "Fast mode on — post-processing and HDRI lighting are off"
              : "Fast mode — turn off post-processing and HDRI lighting for a smoother frame rate"
          }
          onClick={() => setFast(!fast)}
          className={cn(
            "flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition",
            fast
              ? "bg-amber-400 text-amber-950 ring-2 ring-slate-800"
              : "bg-slate-200 text-slate-600 ring-2 ring-white hover:bg-slate-300",
          )}
        >
          ⚡ Fast
        </button>
      </div>
      <p className="rounded-full bg-black/40 px-2.5 py-0.5 text-[11px] font-semibold text-white/90 backdrop-blur-sm">
        {current.name}
        {fast ? (
          <span className="font-medium text-amber-300"> · fast mode</span>
        ) : (
          <span className="hidden font-medium text-white/70 sm:inline">
            {" "}
            · {current.blurb}
          </span>
        )}
      </p>
    </div>
  );
}

/** Client wrapper so the page background tracks the active theme. */
export function ThemeFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const id = useThemeStore((state) => state.id);
  return (
    <main className={className} style={{ background: THEMES[id].pageBg }}>
      {children}
    </main>
  );
}
