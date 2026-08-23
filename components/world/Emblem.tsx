"use client";

import { EMBLEMS, type Prim } from "./emblems";
import type { AbilityId } from "./store";

/** Locked slots draw the same silhouette in flat grey: the shape is a hint
 *  at what is still out there, without giving the power away. */
const TONES = {
  locked: { main: "#94a3b8", accent: "#64748b" },
  idle: { main: "currentColor", accent: "rgba(15,23,42,0.45)" },
  active: { main: "#0f172a", accent: "rgba(15,23,42,0.5)" },
} as const;

export type EmblemTone = keyof typeof TONES;

function drawPrim(p: Prim, i: number, fill: string) {
  if (p.k === "circle") {
    return <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={fill} />;
  }
  if (p.k === "ellipse") {
    return (
      <ellipse
        key={i}
        cx={p.x}
        cy={p.y}
        rx={p.rx}
        ry={p.ry}
        fill={fill}
        transform={
          p.rot ? `rotate(${(-p.rot * 180) / Math.PI} ${p.x} ${p.y})` : undefined
        }
      />
    );
  }
  if (p.k === "bar") {
    return (
      <line
        key={i}
        x1={p.x1}
        y1={p.y1}
        x2={p.x2}
        y2={p.y2}
        stroke={fill}
        strokeWidth={p.w}
        strokeLinecap="round"
      />
    );
  }
  return (
    <polygon key={i} points={p.pts.map(([x, y]) => `${x},${y}`).join(" ")} fill={fill} />
  );
}

export function Emblem({
  ability,
  tone,
  className,
}: {
  ability: AbilityId;
  tone: EmblemTone;
  className?: string;
}) {
  const prims = EMBLEMS[ability];
  const { main, accent } = TONES[tone];
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      {prims.filter((p) => !p.accent).map((p, i) => drawPrim(p, i, main))}
      {prims
        .filter((p) => p.accent)
        .map((p, i) => drawPrim(p, i + 1000, accent))}
    </svg>
  );
}
