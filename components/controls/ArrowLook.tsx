"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { controlMode } from "./controlModeStore";

/** Radians per second while an arrow is held. Slower on pitch — a child holding
 *  Up should not end up staring at the sky before they can let go. */
const YAW_SPEED = 1.9;
const PITCH_SPEED = 1.3;
/** Just shy of straight up/down, matching PointerLockControls' own polar clamp,
 *  so mouse-look and arrow-look cannot disagree about how far up "up" goes. */
const MAX_PITCH = Math.PI / 2 - 0.02;

const ARROWS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
} as const;

type Held = Record<(typeof ARROWS)[keyof typeof ARROWS], boolean>;

const NONE_HELD: Held = { up: false, down: false, left: false, right: false };

/**
 * Arrow keys look around. WASD walks (see `minecraftKeyMap`), which is why the
 * arrows are free to steer: they used to be a second set of walk keys, so
 * "arrows look" and "arrows walk" were the same four keys doing two jobs.
 *
 * Deliberately live in every mode except Hands rather than only in keyboard
 * mode — mouse-look players lose nothing by also being able to nudge the view
 * with a key, and drawing one-handed is much easier when the other hand can aim.
 * Hands is the exception because `Player` writes the camera quaternion outright
 * every frame there (head-look, fist-orbit), so anything written here would be
 * overwritten mid-frame or, worse, fight it.
 *
 * The euler is read back off the camera each frame instead of being accumulated
 * locally: PointerLockControls writes the same quaternion on every mouse move,
 * and a private copy would snap the view back to wherever the last arrow press
 * left it the moment one was pressed.
 */
export function ArrowLook() {
  const camera = useThree((state) => state.camera);
  const held = useRef<Held>({ ...NONE_HELD });
  const euler = useRef(new THREE.Euler(0, 0, 0, "YXZ"));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const slot = ARROWS[event.key as keyof typeof ARROWS];
      if (!slot) return;
      // The sketch prompt's text field and the pull-apart slider both steer with
      // the arrow keys. Same guard as components/sketch3d/ui/PaletteHUD.tsx.
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) {
        return;
      }
      // Arrows scroll by default, which drags the page out from under the
      // viewport while you are trying to look around inside it.
      event.preventDefault();
      held.current[slot] = true;
    };

    // Deliberately unguarded, unlike keydown: a keyup must ALWAYS release the
    // key it names. Skipping it for a text field strands the camera spinning
    // whenever an arrow goes down over the scene and comes back up somewhere
    // else — clicking into the sketch prompt mid-turn was enough to do it.
    const onKeyUp = (event: KeyboardEvent) => {
      const slot = ARROWS[event.key as keyof typeof ARROWS];
      if (slot) held.current[slot] = false;
    };

    // A key held while the tab loses focus never delivers its keyup, which would
    // leave the camera spinning forever after alt-tabbing away mid-turn.
    const onBlur = () => {
      held.current = { ...NONE_HELD };
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useFrame((_, delta) => {
    if (controlMode() === "hands") return;
    const { up, down, left, right } = held.current;
    // Left is +yaw and up is +pitch, matching PointerLockControls' own signs
    // (it subtracts movementX from yaw and movementY from pitch).
    const yaw = (+left - +right) * YAW_SPEED * delta;
    const pitch = (+up - +down) * PITCH_SPEED * delta;
    if (!yaw && !pitch) return;
    const angles = euler.current;
    angles.setFromQuaternion(camera.quaternion);
    angles.y += yaw;
    angles.x = THREE.MathUtils.clamp(angles.x + pitch, -MAX_PITCH, MAX_PITCH);
    // Roll is never wanted here, and reading it back off a camera the gesture
    // paths have written can leave a trace of one.
    angles.z = 0;
    camera.quaternion.setFromEuler(angles);
  });

  return null;
}
