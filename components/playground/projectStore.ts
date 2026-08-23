"use client";

import { create } from "zustand";

/**
 * Projects the user has uploaded, shown as preview cards in the model
 * dropdown next to the live stream.
 *
 * Client-side only for now: the file never leaves the browser, and the
 * preview is an object URL. `uploadProject` is the single place a backend
 * would slot in — POST the file, keep the returned id and thumbnail URL,
 * and nothing else here has to change.
 */

export type Project = {
  id: string;
  name: string;
  /** Object URL of the preview image, or null while one is being made. */
  preview: string | null;
  /** Bytes, for the card's subtitle. */
  size: number;
  /** Set for models we cannot preview, e.g. an .ifc with no thumbnail. */
  kind: string;
};

type ProjectState = {
  projects: Project[];
  /** Which project the playground is showing; null means the live stream. */
  selectedId: string | null;
  add: (project: Project) => void;
  remove: (id: string) => void;
  select: (id: string | null) => void;
};

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  selectedId: null,
  add: (project) => set((s) => ({ projects: [project, ...s.projects] })),
  remove: (id) => {
    const gone = get().projects.find((p) => p.id === id);
    // Object URLs are held by the document until revoked; dropping the card
    // without this leaks the whole image.
    if (gone?.preview) URL.revokeObjectURL(gone.preview);
    set((s) => ({
      projects: s.projects.filter((p) => p.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },
  select: (id) => set({ selectedId: id }),
}));

/** Images preview themselves; anything else gets a card with its extension. */
const IMAGE_TYPES = /^image\//;

export function projectFromFile(file: File): Project {
  const isImage = IMAGE_TYPES.test(file.type);
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name.replace(/\.[^.]+$/, ""),
    preview: isImage ? URL.createObjectURL(file) : null,
    size: file.size,
    kind: (file.name.split(".").pop() ?? "file").toUpperCase(),
  };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
