"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { playerOrigin } from "@/components/minecraft/player-origin";
import { liveBots } from "@/components/lasertag/Bots";
import { peerList } from "@/components/multiplayer/core/peers";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";
import { usePlayerIdentity } from "@/lib/player-identity";
import { ABILITIES, ABILITY_COLORS, useHeroStore } from "@/components/world/store";
import { useAbilityEmblemSpots } from "@/components/world/emblemPlacement";
import { ACTIVE_DINO, DINOS, useDinoStore } from "@/components/world/dinoStore";
import { useFragmentSpots } from "@/components/world/DinoFragments";
import { useStarSpots } from "@/components/world/starPlacement";
import { useTreasureStore } from "@/components/world/treasureStore";
import { POWERUPS, POWERUP_SPOTS } from "@/components/world/powerupStore";
import { usePlayground } from "./playground-context";

/** CSS pixels — the panel and its canvas are the same square. */
const MAP_SIZE = 300;
const MAP_PADDING = 16;
/** Resolution of the pre-rendered floor plan. Coarse on purpose: this is a
 *  "where am I" readout, not a blueprint, and a bucket per pixel of a real
 *  building would mean rasterising hundreds of thousands of points every
 *  time a different building loads. */
const BUCKETS = 96;

type Item = { x: number; z: number; color: string; glyph: string; label: string };

/** One pass over the building's occupied cells: its footprint, and a coarse
 *  colour-by-bucket floor plan pre-rendered to an offscreen canvas so the
 *  live draw loop only ever does one `drawImage` for it. Recomputed only when
 *  the building changes (`data.points` is a fresh array on every load). */
function useFloorPlan() {
  const { data } = useGridPoints();

  return useMemo(() => {
    const points = occupiedPointCoords(data?.points);
    if (points.length === 0) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const { position } of points) {
      const [x, , z] = position;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    // Square buckets in the LARGER axis, so a long thin building doesn't get
    // stretched to fill a square canvas.
    const span = Math.max(maxX - minX, maxZ - minZ, 1);
    const cell = span / BUCKETS;

    const buckets = new Array<string | undefined>(BUCKETS * BUCKETS);
    for (const { position, color } of points) {
      const [x, , z] = position;
      const bx = Math.min(BUCKETS - 1, Math.max(0, Math.floor((x - minX) / cell)));
      const bz = Math.min(BUCKETS - 1, Math.max(0, Math.floor((z - minZ) / cell)));
      // Last point in a cell wins — points arrive in LAYER_ORDER, so a roof
      // cell over a wall cell reads as roof, matching how the scene stacks.
      buckets[bz * BUCKETS + bx] = color;
    }

    const bitmap = document.createElement("canvas");
    bitmap.width = BUCKETS;
    bitmap.height = BUCKETS;
    const ctx = bitmap.getContext("2d");
    if (ctx) {
      for (let bz = 0; bz < BUCKETS; bz++) {
        for (let bx = 0; bx < BUCKETS; bx++) {
          const color = buckets[bz * BUCKETS + bx];
          if (!color) continue;
          ctx.fillStyle = color;
          ctx.fillRect(bx, bz, 1, 1);
        }
      }
    }

    return { bitmap, minX, minZ, span };
  }, [data?.points]);
}

/** World (x, z) to a point inside the canvas, given the current floor plan's
 *  bounds. Falls back to the centre so a building-less map still has an
 *  origin to draw peers around. */
function projector(plan: ReturnType<typeof useFloorPlan>) {
  const inner = MAP_SIZE - MAP_PADDING * 2;
  return (x: number, z: number) => {
    if (!plan) return { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
    return {
      x: MAP_PADDING + ((x - plan.minX) / plan.span) * inner,
      y: MAP_PADDING + ((z - plan.minZ) / plan.span) * inner,
    };
  };
}

/**
 * What counts as "a key thing" changes with the activity: Treasure Hunt hides
 * its emblems and dino bones behind the map same as it does behind the HUD,
 * so the other modes' star hunt takes over once that mode ends.
 */
function useItems(): Item[] {
  const { mode } = usePlayground();
  const emblemSpots = useAbilityEmblemSpots();
  const heroFound = useHeroStore((s) => s.found);
  const fragmentSpots = useFragmentSpots();
  const dinoFound = useDinoStore((s) => s.found);
  const starSpots = useStarSpots();
  const starsFound = useTreasureStore((s) => s.found);

  return useMemo(() => {
    const items: Item[] = [];
    if (mode === "treasure") {
      for (const spot of emblemSpots) {
        if (heroFound.includes(spot.id)) continue;
        items.push({
          x: spot.pos[0],
          z: spot.pos[2],
          color: ABILITY_COLORS[spot.id],
          glyph: ABILITIES[spot.id].emoji,
          label: `${ABILITIES[spot.id].name} power`,
        });
      }
      for (const spot of fragmentSpots) {
        if (dinoFound.includes(spot.id)) continue;
        items.push({
          x: spot.pos[0],
          z: spot.pos[2],
          color: DINOS[ACTIVE_DINO].color,
          glyph: "🦴",
          label: "Dino bone",
        });
      }
      return items;
    }

    for (const spot of starSpots) {
      if (starsFound.includes(spot.id)) continue;
      items.push({ x: spot.pos[0], z: spot.pos[2], color: "#f3b939", glyph: "★", label: "Star" });
    }
    if (mode === "race") {
      for (const spot of POWERUP_SPOTS) {
        items.push({
          x: spot.pos[0],
          z: spot.pos[2],
          color: POWERUPS[spot.kind].color,
          glyph: POWERUPS[spot.kind].icon,
          label: POWERUPS[spot.kind].label,
        });
      }
    }
    return items;
  }, [mode, emblemSpots, heroFound, fragmentSpots, dinoFound, starSpots, starsFound]);
}

/**
 * A toggle button plus the map it opens. Kept as one component and one piece
 * of local state rather than routed through the playground context: nothing
 * outside this button cares whether the map is open.
 */
export function MiniMap() {
  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plan = useFloorPlan();
  const items = useItems();
  const selfName = usePlayerIdentity((s) => s.name);
  const { mode } = usePlayground();

  // Built from the same list the canvas draws from, so the legend can never
  // drift out of sync with what is actually plotted this mode.
  const legend = useMemo(() => {
    const byKey = new Map<string, Item>();
    for (const item of items) {
      byKey.set(`${item.glyph}|${item.color}`, item);
    }
    return [...byKey.values()];
  }, [items]);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = MAP_SIZE * dpr;
    canvas.height = MAP_SIZE * dpr;
    ctx.scale(dpr, dpr);

    const toCanvas = projector(plan);
    let frame: number;

    const draw = () => {
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE);

      if (plan) {
        const inner = MAP_SIZE - MAP_PADDING * 2;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(plan.bitmap, MAP_PADDING, MAP_PADDING, inner, inner);
      } else {
        ctx.fillStyle = "#9a9cb0";
        ctx.font = "600 12px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Loading the building…", MAP_SIZE / 2, MAP_SIZE / 2);
      }

      for (const item of items) {
        const p = toCanvas(item.x, item.z);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = item.color;
        ctx.fill();
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(item.glyph, p.x, p.y + 3.5);
      }

      for (const peer of peerList()) {
        const p = toCanvas(peer.drawn.x, peer.drawn.z);
        drawPlayerDot(ctx, p.x, p.y, peer.color, peer.name);
      }

      // Bots wander every frame just like players, so — unlike the stationary
      // items above — they are read fresh here rather than through `items`.
      if (mode === "lasertag") {
        for (const bot of liveBots()) {
          const p = toCanvas(bot.x, bot.z);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = "#ef4444";
          ctx.fill();
        }
      }

      const self = toCanvas(playerOrigin.x, playerOrigin.z);
      drawPlayerDot(ctx, self.x, self.y, "#5f63df", selfName || "You", true);

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(frame);
  }, [open, plan, items, selfName, mode]);

  return (
    <>
      <button
        type="button"
        className="round-action map-toggle"
        aria-label={open ? "Close the map" : "Open the map"}
        aria-pressed={open}
        title="Map"
        onClick={() => setOpen((v) => !v)}
      >
        <MapPinIcon />
      </button>

      {open ? (
        <div className="mini-map" role="dialog" aria-label="Building map">
          <div className="mini-map-head">
            <span>Map</span>
            <button
              type="button"
              className="mini-map-close"
              aria-label="Close the map"
              onClick={() => setOpen(false)}
            >
              ✕
            </button>
          </div>
          <div className="mini-map-body">
            <ul className="mini-map-legend">
              <li>
                <i style={{ background: "#5f63df" }} />
                You
              </li>
              <li>
                <i className="mini-map-legend-ring" />
                Other players
              </li>
              {mode === "lasertag" ? (
                <li>
                  <i style={{ background: "#ef4444" }} />
                  Bot to tag
                </li>
              ) : null}
              {legend.map((item) => (
                <li key={`${item.glyph}-${item.color}`}>
                  <i style={{ background: item.color }} />
                  {item.label}
                </li>
              ))}
            </ul>
            <canvas ref={canvasRef} width={MAP_SIZE} height={MAP_SIZE} />
          </div>
        </div>
      ) : null}
    </>
  );
}

function drawPlayerDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  self = false,
) {
  ctx.beginPath();
  ctx.arc(x, y, self ? 6 : 5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "white";
  ctx.stroke();

  if (!label) return;
  ctx.font = self ? "700 10px system-ui, sans-serif" : "600 9px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#202347";
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.strokeText(label, x, y - 9);
  ctx.fillText(label, x, y - 9);
}

function MapPinIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.4" />
    </svg>
  );
}
