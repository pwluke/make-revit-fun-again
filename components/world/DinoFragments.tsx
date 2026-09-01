import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { occupiedPointCoords, useGridPoints } from "@/lib/use-grid-points";
import { seededRandom } from "./placementUtils";
import { ACTIVE_DINO, DINOS, useDinoStore, type DinoPartId } from "./dinoStore";

const PICKUP_RADIUS = 1.3;
const BOB_HEIGHT = 0.14;
const BOB_SPEED = 2.4;
const SPIN_SPEED = 1.3;
const POP_SPEED = 4;
const SIZE = 1.4;
/** Fragments float this far above the slab they sit on. */
const HOVER = 1.1;
/** A fragment needs this much headroom, so none end up inside a ceiling. */
const HEADROOM = 1.8;
/** Keep fragments from clustering. */
const MIN_SEPARATION = 6;
/** Unlike the ability emblems, these deliberately span the whole building —
 *  the point is to climb through every storey to finish the skeleton. */
const SEED = Math.floor(Math.random() * 0xffffff) + 1;

/** Load one sliced part and draw it over a soft glow, with its name under
 *  it so a fragment reads as "the tail" and not just "a green blob". */
function makeFragmentSprite(
  src: string,
  label: string,
  color: string,
): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);

  const paint = (art?: HTMLImageElement) => {
    ctx.clearRect(0, 0, size, size);
    const glow = ctx.createRadialGradient(
      size / 2, size / 2, size * 0.1,
      size / 2, size / 2, size * 0.42,
    );
    glow.addColorStop(0, color + "77");
    glow.addColorStop(0.5, color + "22");
    glow.addColorStop(0.8, color + "00");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
    if (art) {
      // Contain the piece in the upper 78%, leaving room for the label.
      const box = size * 0.78;
      const scale = Math.min(box / art.width, box / art.height);
      const w = art.width * scale;
      const h = art.height * scale;
      ctx.drawImage(art, (size - w) / 2, (size * 0.74 - h) / 2 + size * 0.02, w, h);
    }
    ctx.font = `bold ${Math.round(size * 0.13)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(15,23,42,0.85)";
    ctx.lineWidth = 6;
    ctx.strokeText(label, size / 2, size * 0.9);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, size / 2, size * 0.9);
    texture.needsUpdate = true;
  };

  paint();
  const art = new Image();
  // Same-origin from /public, so no CORS dance; repaint once it decodes.
  art.onload = () => paint(art);
  art.src = src;
  texture.anisotropy = 4;
  return texture;
}

/** One fragment per part, spread over the storeys the model actually has.
 *  Exported for the mini-map, which needs the same spots to plot markers. */
export function useFragmentSpots() {
  const { data, blockSize } = useGridPoints();
  return useMemo(() => {
    const dino = DINOS[ACTIVE_DINO];
    const points = occupiedPointCoords(data?.points);
    const random = seededRandom(SEED);
    const picked: { id: DinoPartId; pos: [number, number, number]; storey: number }[] = [];
    if (points.length === 0) return picked;

    const step = Math.max(blockSize[1], 0.01);
    const key = (x: number, y: number, z: number) =>
      `${Math.round(x / blockSize[0])},${Math.round(y / step)},${Math.round(z / blockSize[2])}`;
    const solid = new Set<string>();
    for (const { position } of points) solid.add(key(...position));
    const clearance = Math.ceil(HEADROOM / step);
    const hasHeadroom = (x: number, y: number, z: number) => {
      for (let i = 1; i <= clearance; i++) if (solid.has(key(x, y + i * step, z))) return false;
      return true;
    };

    // Group floor slabs into storeys by height, so one fragment can be dealt
    // to each level rather than all landing on whichever slab is biggest.
    const slabs = points.filter((p) => p.layer === "A-FLOR" && p.position[1] > 0.2);
    const byStorey = new Map<number, typeof slabs>();
    for (const slab of slabs) {
      const band = Math.round(slab.position[1] / 2.5);
      const list = byStorey.get(band);
      if (list) list.push(slab);
      else byStorey.set(band, [slab]);
    }
    const storeys = [...byStorey.entries()]
      .filter(([, list]) => list.length > 40)
      .sort((a, b) => a[0] - b[0]);
    if (storeys.length === 0) return picked;

    const sepSq = MIN_SEPARATION * MIN_SEPARATION;
    const tooClose = (x: number, y: number, z: number) =>
      picked.some(
        (p) => (p.pos[0] - x) ** 2 + (p.pos[1] - y) ** 2 + (p.pos[2] - z) ** 2 < sepSq,
      );

    dino.parts.forEach((part, i) => {
      // Deal round-robin, so six parts across four storeys still covers all four.
      const [band, list] = storeys[i % storeys.length];
      for (let attempt = 0; attempt < 500; attempt++) {
        const [x, fy, z] = list[Math.floor(random() * list.length)].position;
        if (!hasHeadroom(x, fy, z)) continue;
        const y = fy + HOVER;
        if (tooClose(x, y, z)) continue;
        picked.push({ id: part.id, pos: [x, y, z], storey: band });
        return;
      }
      // Never leave a part unobtainable: drop it above the storey's centre.
      const [x, fy, z] = list[0].position;
      picked.push({ id: part.id, pos: [x, fy + HOVER, z], storey: band });
    });
    return picked;
  }, [data?.points, blockSize]);
}

/**
 * The scattered dinosaur fragments. Only mounted in Treasure Hunt mode —
 * see MinecraftScene — so the other modes stay uncluttered.
 */
export function DinoFragments() {
  const spots = useFragmentSpots();
  const collect = useDinoStore((s) => s.collect);
  const groups = useRef<Map<DinoPartId, THREE.Group | null>>(new Map());
  const scales = useRef<Map<DinoPartId, number>>(new Map());
  const dino = DINOS[ACTIVE_DINO];

  const textures = useMemo(
    () =>
      new Map(
        dino.parts.map((part) => [
          part.id,
          makeFragmentSprite(part.src, part.label, dino.color),
        ]),
      ),
    [dino],
  );
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  useFrame((state, delta) => {
    const found = useDinoStore.getState().found;
    const t = state.clock.elapsedTime;
    spots.forEach((spot, i) => {
      const group = groups.current.get(spot.id);
      if (!group) return;
      if (found.includes(spot.id)) {
        const s = scales.current.get(spot.id) ?? 1;
        if (s <= 0) return;
        const next = Math.max(0, s - delta * POP_SPEED);
        scales.current.set(spot.id, next);
        group.scale.setScalar(next);
        group.rotation.y += delta * SPIN_SPEED * 5;
        if (next === 0) group.visible = false;
        return;
      }
      group.position.y = spot.pos[1] + Math.sin(t * BOB_SPEED + i) * BOB_HEIGHT;
      if (state.camera.position.distanceTo(group.position) < PICKUP_RADIUS) {
        collect(spot.id);
      }
    });
  });

  return (
    <>
      {spots.map((spot) => {
        const texture = textures.get(spot.id);
        if (!texture) return null;
        return (
          <group
            key={spot.id}
            ref={(el) => {
              groups.current.set(spot.id, el);
            }}
            position={spot.pos}
          >
            <sprite scale={[SIZE, SIZE, 1]}>
              <spriteMaterial map={texture} transparent depthWrite={false} />
            </sprite>
            <pointLight color={dino.color} intensity={1} distance={3} decay={2} />
          </group>
        );
      })}
    </>
  );
}
