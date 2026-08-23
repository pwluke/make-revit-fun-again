import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { CARD_PICKUP_RADIUS, useAbilityCardSpots } from "./cardPlacement";
import {
  ABILITY_COLORS,
  ABILITY_ORDER,
  THEMES,
  useHeroStore,
  type AbilityId,
} from "./store";

const SPIN_SPEED = 1.2; // rad/s
const BOB_HEIGHT = 0.15;
const BOB_SPEED = 2;
const POP_SPEED = 4; // how fast a collected card shrinks away

const CARD_W = 1.0;
const CARD_H = 1.4;
const CARD_T = 0.07;

/** Draw one card face offline — emoji, name, and its dock hotkey number. */
function makeCardTexture(id: AbilityId, themeName: string, emoji: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 358;
  const ctx = canvas.getContext("2d")!;
  const color = ABILITY_COLORS[id];
  // card body
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 358, 26);
  ctx.fill();
  // frame
  ctx.strokeStyle = color;
  ctx.lineWidth = 16;
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 342, 20);
  ctx.stroke();
  // emoji
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "120px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(emoji, 128, 140);
  // name
  ctx.fillStyle = "#1e293b";
  ctx.font = "bold 34px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(themeName, 128, 246);
  // hotkey badge
  const slot = ABILITY_ORDER.indexOf(id) + 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(128, 306, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "black 34px ui-sans-serif, system-ui, sans-serif";
  ctx.fillText(String(slot), 128, 308);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/**
 * The collectible ability cards, spinning in place out in the world.
 * Walking within arm's reach collects one — the HUD unlock animation and
 * the dock take over from there. Proximity-based, so keyboard, mouse and
 * gesture players all collect the same way.
 */
export function AbilityCards() {
  const spots = useAbilityCardSpots();
  const theme = useHeroStore((s) => s.theme);
  const collect = useHeroStore((s) => s.collect);
  const groups = useRef<Map<AbilityId, THREE.Group | null>>(new Map());
  const scales = useRef<Map<AbilityId, number>>(new Map());

  const textures = useMemo(() => {
    const skins = THEMES[theme];
    return new Map(
      ABILITY_ORDER.map((id) => [
        id,
        makeCardTexture(id, skins[id].name, skins[id].emoji),
      ]),
    );
  }, [theme]);
  // Theme switches rebuild the faces; free the old GPU textures.
  useEffect(() => {
    return () => textures.forEach((t) => t.dispose());
  }, [textures]);

  useFrame((state, delta) => {
    const found = useHeroStore.getState().found;
    const t = state.clock.elapsedTime;
    spots.forEach((spot, i) => {
      const group = groups.current.get(spot.id);
      if (!group) return;
      if (found.includes(spot.id)) {
        const s = scales.current.get(spot.id) ?? 1;
        if (s <= 0) return;
        // Collected: a fast spin while shrinking away — the HUD animation
        // picks the card up from here.
        const next = Math.max(0, s - delta * POP_SPEED);
        scales.current.set(spot.id, next);
        group.scale.setScalar(next);
        group.rotation.y += delta * SPIN_SPEED * 6;
        if (next === 0) group.visible = false;
        return;
      }
      group.rotation.y += delta * SPIN_SPEED;
      group.position.y = spot.pos[1] + Math.sin(t * BOB_SPEED + i) * BOB_HEIGHT;
      if (state.camera.position.distanceTo(group.position) < CARD_PICKUP_RADIUS) {
        collect(spot.id);
      }
    });
  });

  return (
    <>
      {spots.map((spot) => {
        const color = ABILITY_COLORS[spot.id];
        const face = textures.get(spot.id)!;
        return (
          <group
            key={spot.id}
            ref={(el) => {
              groups.current.set(spot.id, el);
            }}
            position={spot.pos}
          >
            <mesh castShadow>
              <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
              {/* face order: +x, -x, +y, -y, +z (front), -z (back) */}
              <meshStandardMaterial attach="material-0" color={color} />
              <meshStandardMaterial attach="material-1" color={color} />
              <meshStandardMaterial attach="material-2" color={color} />
              <meshStandardMaterial attach="material-3" color={color} />
              <meshStandardMaterial attach="material-4" map={face} />
              <meshStandardMaterial attach="material-5" map={face} />
            </mesh>
            {/* Soft glow so cards stay findable in shade and at distance. */}
            <pointLight color={color} intensity={2.2} distance={4} decay={2} />
          </group>
        );
      })}
    </>
  );
}
