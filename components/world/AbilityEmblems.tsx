import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { EMBLEM_PICKUP_RADIUS, useAbilityEmblemSpots } from "./emblemPlacement";
import { ABILITIES, ABILITY_COLORS, useHeroStore, type AbilityId } from "./store";

const BOB_HEIGHT = 0.16;
const BOB_SPEED = 2;
/** Gentle breathing scale — a sprite cannot spin, so this is what makes it
 *  read as alive rather than as a decal stuck in the air. */
const PULSE = 0.08;
const PULSE_SPEED = 3;
const POP_SPEED = 4; // how fast a collected emblem shrinks away
/** World height of the animal. */
const EMBLEM_SIZE = 1.6;

/** Draw one animal onto a transparent canvas, with a soft coloured disc
 *  behind it so it still reads against a pale facade. */
function makeSprite(emoji: string, color: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const glow = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.1,
    size / 2,
    size / 2,
    size * 0.5,
  );
  glow.addColorStop(0, color + "cc");
  glow.addColorStop(0.65, color + "44");
  glow.addColorStop(1, color + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  ctx.font = `${Math.round(size * 0.62)}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, size / 2, size * 0.54);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/**
 * The hidden animal emblems. Drawn as camera-facing sprites rather than
 * extruded geometry: the emoji art reads far better at pickup distance
 * than anything hand-composed, and a sprite never turns edge-on and
 * vanishes the way a spinning flat shape does.
 */
export function AbilityEmblems() {
  const spots = useAbilityEmblemSpots();
  const collect = useHeroStore((s) => s.collect);
  const groups = useRef<Map<AbilityId, THREE.Group | null>>(new Map());
  const scales = useRef<Map<AbilityId, number>>(new Map());

  const textures = useMemo(
    () =>
      new Map(
        (Object.keys(ABILITIES) as AbilityId[]).map((id) => [
          id,
          makeSprite(ABILITIES[id].emoji, ABILITY_COLORS[id]),
        ]),
      ),
    [],
  );
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures]);

  useFrame((state, delta) => {
    const found = useHeroStore.getState().found;
    const t = state.clock.elapsedTime;
    spots.forEach((spot, i) => {
      const group = groups.current.get(spot.id);
      if (!group) return;
      if (found.includes(spot.id)) {
        const s = scales.current.get(spot.id) ?? 1;
        if (s <= 0) return;
        // Collected: shrink away — the HUD animation picks it up from here.
        const next = Math.max(0, s - delta * POP_SPEED);
        scales.current.set(spot.id, next);
        group.scale.setScalar(next);
        if (next === 0) group.visible = false;
        return;
      }
      group.position.y = spot.pos[1] + Math.sin(t * BOB_SPEED + i) * BOB_HEIGHT;
      group.scale.setScalar(1 + Math.sin(t * PULSE_SPEED + i) * PULSE);
      if (state.camera.position.distanceTo(group.position) < EMBLEM_PICKUP_RADIUS) {
        collect(spot.id);
      }
    });
  });

  return (
    <>
      {spots.map((spot) => {
        const color = ABILITY_COLORS[spot.id];
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
            <sprite scale={[EMBLEM_SIZE, EMBLEM_SIZE, 1]}>
              <spriteMaterial map={texture} transparent depthWrite={false} />
            </sprite>
            {/* Keeps them findable in shade and at a distance. */}
            <pointLight color={color} intensity={2.5} distance={5} decay={2} />
          </group>
        );
      })}
    </>
  );
}
