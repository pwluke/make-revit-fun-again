export function ExploreIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <path d="M9 18 24 9l15 9-15 9-15-9Z" />
      <path d="m9 25 15 9 15-9M9 32l15 9 15-9" />
    </svg>
  );
}

export function ExplodeIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <path d="m9 18 15-8 15 8-15 8-15-8Z" />
      <path d="m9 31 15 8 15-8M24 27v11M8 24H3m42 0h-5M24 6V2" />
    </svg>
  );
}

export function SketchIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <path d="m11 36 3-10L31 9l8 8-17 17-11 2Z" />
      <path d="m27 13 8 8M14 27l7 7" />
    </svg>
  );
}

export function RemixIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <path d="M8 36V18l16-9 16 9v18L24 44 8 36Z" />
      <path d="m8 18 16 9 16-9M24 27v17M17 23l15-9" />
    </svg>
  );
}

export function TreasureIcon() {
  return (
    <svg viewBox="0 0 48 48">
      <path d="M10 20h28v20H10z" />
      <path d="M7 16h34v8H7zM17 16v-4h14v4M21 24h6v7h-6z" />
    </svg>
  );
}

export function LaserTagIcon() {
  return (
    <svg viewBox="0 0 48 48">
      {/* Blocky gun silhouette, plus a reticle for the scan. */}
      <path d="M6 18h18v9H14l-4 7H6V18Z" />
      <path d="M24 21h8M33 24a6 6 0 1 0 12 0 6 6 0 1 0-12 0M39 15v-3m0 27v-3m9-9h3m-24 0h3" />
    </svg>
  );
}

export function SoundOnIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.1-3.8v7.6a4.5 4.5 0 0 0 2.1-3.8zm-2.1-8v2.1a7 7 0 0 1 0 11.8V20a9 9 0 0 0 0-16z" />
    </svg>
  );
}

export function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 4v6h6M5.5 15a7 7 0 1 0 .4-6.5L4 10" />
    </svg>
  );
}

export function FullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5m13 5h5v-5" />
    </svg>
  );
}

export function ExitFullscreenIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3v5H3M16 3v5h5M8 21v-5H3m13 5v-5h5" />
    </svg>
  );
}

export const ACTIVITY_ICONS = {
  explore: ExploreIcon,
  explode: ExplodeIcon,
  sketch: SketchIcon,
  remix: RemixIcon,
  treasure: TreasureIcon,
  lasertag: LaserTagIcon,
} as const;
