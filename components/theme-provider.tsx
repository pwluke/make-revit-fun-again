"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// Layout-level infrastructure rather than page code, so it sits outside
// `game-2/`: the provider has to wrap <body> for the `.dark` class to land on
// <html>, where `@custom-variant dark (&:is(.dark *))` in globals.css reads it.
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
