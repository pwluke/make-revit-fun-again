"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Toggle } from "@/components/ui/toggle";

// Never notifies, so the snapshot is read once per render pass. Module-level to
// keep the reference stable across renders.
const neverChanges = () => () => {};

/**
 * False in the server render and in the hydrating render, true afterwards.
 * `useSyncExternalStore` is the hydration-safe way to ask "am I on the client
 * yet" — the `setState`-in-`useEffect` version trips `react-hooks/set-state-in-effect`.
 */
function useHydrated() {
  return useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
}

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useHydrated();

  // `resolvedTheme` is undefined until next-themes has read the DOM, so
  // deriving `pressed` from it before hydration would not match the server
  // HTML. The button's footprint is identical either way, so nothing shifts.
  const isDark = hydrated && resolvedTheme === "dark";

  return (
    <Toggle
      variant="outline"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      pressed={isDark}
      onPressedChange={(pressed) => setTheme(pressed ? "dark" : "light")}
      className="bg-background/80 fixed top-4 right-4 z-50 size-9 rounded-full backdrop-blur-sm sm:top-6 sm:right-6"
    >
      {hydrated ? (
        isDark ? (
          <Moon aria-hidden />
        ) : (
          <Sun aria-hidden />
        )
      ) : (
        // Pre-hydration placeholder: same box, no icon to flash and swap.
        <span aria-hidden className="size-4" />
      )}
    </Toggle>
  );
}
