"use client";

/**
 * The name a player picked for this browser, and where it lives.
 *
 * One name per browser, not per session: saved to localStorage so a returning
 * player is not asked again, and read once at startup by `hydrate()` so the
 * join modal never flashes for someone who already chose one.
 */

import { create } from "zustand";

/** Long enough to read as a name, short enough to fit over an avatar's head
 *  and in the room list without wrapping. */
export const MAX_PLAYER_NAME_LENGTH = 18;

const STORAGE_KEY = "mrfa.player-name";

/** Collapses whitespace and caps length. Never throws — this runs on
 *  keystroke-driven input, not just on submit. */
export function sanitizePlayerName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_PLAYER_NAME_LENGTH);
}

/** What a player gets if they submit the join form blank. */
export function randomGuestName(): string {
  return `Explorer ${Math.floor(100 + Math.random() * 900)}`;
}

function readStoredName(): string {
  if (typeof window === "undefined") return "";
  try {
    return sanitizePlayerName(window.localStorage.getItem(STORAGE_KEY) ?? "");
  } catch {
    return "";
  }
}

function writeStoredName(name: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Private browsing with storage denied. The name still works this tab.
  }
}

type PlayerIdentityState = {
  name: string;
  /** True once this tab has checked localStorage. Gates the join modal so it
   *  never flashes for a returning player while that check is pending. */
  hydrated: boolean;
  /** True once a name is set, from storage or freshly chosen. */
  ready: boolean;
  hydrate: () => void;
  /** A player confirmed the join form. Sanitizes, falls back to a guest name
   *  on a blank submit, and saves for next time. */
  join: (name: string) => string;
};

export const usePlayerIdentity = create<PlayerIdentityState>((set, get) => ({
  name: "",
  hydrated: false,
  ready: false,
  hydrate: () => {
    if (get().hydrated) return;
    const stored = readStoredName();
    set({ name: stored, hydrated: true, ready: stored.length > 0 });
  },
  join: (raw) => {
    const name = sanitizePlayerName(raw) || randomGuestName();
    writeStoredName(name);
    set({ name, ready: true });
    return name;
  },
}));
