"use client";

import { create } from "zustand";

/**
 * Dinosaur fossil hunt, part of Treasure Hunt mode.
 *
 * Fragments of one dinosaur are scattered through the building, a few per
 * storey. The HUD shows its outline in grey from the first find, filling in
 * as pieces arrive; the last piece brings the whole animal up in the middle
 * of the screen with a card saying what it was.
 *
 * Part art lives in /public/dino, sliced out of the supplied character
 * sheet by connected-component detection rather than by eye — every piece
 * is its own transparent PNG, plus a `whole` image of the assembled animal.
 */

export type DinoId = "trex" | "ptero";
export type DinoPartId =
  | "head"
  | "body"
  | "arms"
  | "legs"
  | "tail"
  | "markings";

export type DinoPart = {
  id: DinoPartId;
  /** Shown on the fragment in the world and in the found list. */
  label: string;
  /** Sliced artwork under /public/dino. */
  src: string;
};

export type Dino = {
  id: DinoId;
  name: string;
  /** Colour of the outline once it starts filling in. */
  color: string;
  /** The assembled animal, for the reveal card. */
  whole: string;
  /** Read out on the reveal card when the skeleton is complete. */
  species: string;
  blurb: string;
  parts: DinoPart[];
};

export const DINOS: Record<DinoId, Dino> = {
  trex: {
    id: "trex",
    name: "T-Rex",
    color: "#4d9e3f",
    whole: "/dino/trex-whole.png",
    species: "Tyrannosaurus rex",
    blurb:
      "The heaviest hunter that ever walked. Twelve metres nose to tail — about as long as this building is tall — with a bite that could crack bone, and arms so short it could not reach its own mouth.",
    parts: [
      { id: "head", label: "Head", src: "/dino/trex-head.png" },
      { id: "body", label: "Body", src: "/dino/trex-body.png" },
      { id: "arms", label: "Arms", src: "/dino/trex-arms.png" },
      { id: "legs", label: "Legs", src: "/dino/trex-legs.png" },
      { id: "tail", label: "Tail", src: "/dino/trex-tail.png" },
      { id: "markings", label: "Spots", src: "/dino/trex-markings.png" },
    ],
  },
  ptero: {
    id: "ptero",
    name: "Pterodactyl",
    color: "#e8823a",
    whole: "/dino/ptero-whole.png",
    species: "Pterodactylus antiquus",
    blurb:
      "Not a dinosaur at all, but a flying reptile that shared their sky. It steered with a bony crest on its head and hung from cliffs by its wing-claws, the way a bat hangs from a beam.",
    parts: [
      { id: "head", label: "Head", src: "/dino/ptero-head.png" },
      { id: "body", label: "Body", src: "/dino/ptero-body.png" },
      { id: "arms", label: "Wings", src: "/dino/ptero-arms.png" },
      { id: "legs", label: "Feet", src: "/dino/ptero-legs.png" },
      { id: "tail", label: "Tail", src: "/dino/ptero-tail.png" },
      { id: "markings", label: "Crest", src: "/dino/ptero-markings.png" },
    ],
  },
};

/** Which dinosaur this run is hunting. One at a time keeps the HUD readable. */
export const ACTIVE_DINO: DinoId = "trex";

type DinoState = {
  found: DinoPartId[];
  /** True once every part is in and the reveal card is up. */
  revealed: boolean;
  collect: (id: DinoPartId) => void;
  dismissReveal: () => void;
  restart: () => void;
};

export const useDinoStore = create<DinoState>((set, get) => ({
  found: [],
  revealed: false,
  collect: (id) => {
    if (get().found.includes(id)) return;
    const found = [...get().found, id];
    set({
      found,
      revealed: found.length === DINOS[ACTIVE_DINO].parts.length,
    });
  },
  dismissReveal: () => set({ revealed: false }),
  restart: () => set({ found: [], revealed: false }),
}));

// Console debug hook, matching the project's __-prefixed convention.
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__dino = useDinoStore;
}
