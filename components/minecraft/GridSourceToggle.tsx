"use client";

import { useGridSourceStore, type GridSource } from "@/lib/use-grid-points";

const OPTIONS: { value: GridSource; label: string }[] = [
  { value: "points", label: "Points" },
  { value: "voxels", label: "Voxels" },
];

export function GridSourceToggle() {
  const source = useGridSourceStore((state) => state.source);
  const setSource = useGridSourceStore((state) => state.setSource);

  return (
    <div
      role="group"
      aria-label="Grid source"
      className="absolute top-4 right-4 flex rounded-full bg-black/40 p-1 backdrop-blur-sm"
    >
      {OPTIONS.map((option) => {
        const active = source === option.value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => setSource(option.value)}
            className={
              active
                ? "rounded-full bg-white/20 px-3 py-1 text-sm text-white"
                : "rounded-full px-3 py-1 text-sm text-white/70 transition-colors hover:text-white"
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
