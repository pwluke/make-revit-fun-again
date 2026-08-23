# sketch3d — draw 3D ribbons in space

Design spec: `docs/specs/2026-08-22-sketch-3d-design.md`

Hold the left mouse button and sweep your view: a coloured ribbon follows the crosshair
through the air, four metres ahead. The strokes **are** the geometry — no AI, no network,
no cost, no latency. Walk through what you drew.

## Rings

The whole architecture exists to keep the drawing mechanic portable. Dependencies point
strictly inward.

| Ring | May import | Portable? |
|---|---|---|
| `core/` | itself + `zustand/vanilla` | yes — this is the entire mechanic |
| `three/` | `three` | yes — any three.js app |
| `r3f/` | React + `@react-three/fiber` | **no — replace this on a port** |
| `ui/` | React DOM + `zustand` | yes if you keep React; ~40 lines of DOM if not |

Enforced by `npm run check:layering`. **Do not relax it** — folder names decay into fiction
within a day; the check is what actually holds the promise.

## Porting to vanilla three.js

Copy `core/` and `three/` unchanged. Replace `r3f/` — about 60 lines — with this, in your
own render loop:

```js
import * as THREE from "three";
import { SketchEngine } from "./core/SketchEngine";
import { sketchStore } from "./core/strokeStore";
import { StrokeLayer } from "./three/StrokeLayer";

const engine = new SketchEngine(sketchStore);
scene.add(new StrokeLayer(sketchStore));

const forward = new THREE.Vector3();
const pose = () => ({
  position: camera.position.toArray(),
  forward: camera.getWorldDirection(forward).toArray(),
});

let drawing = false;
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || !sketchStore.getState().drawMode) return;
  drawing = true;
  engine.pointerDown(pose(), performance.now());
});
window.addEventListener("pointerup", () => {
  if (!drawing) return;
  drawing = false;
  engine.pointerUp();
});

// inside your animation loop:
if (drawing) engine.update(pose(), performance.now());
```

That is the entire integration. `CameraPose` is six numbers, not a `THREE.Camera` — which
is why this also ports to engines that are not three.js at all.

The HUD in `ui/` reads and writes the vanilla store directly and holds no React state, so
it moves untouched if you keep React, and is a small rewrite if you don't.

## Controls

Pointer lock is never released, so there is no cursor and **the HUD cannot be clicked**. It
is a display; every input is a key.

| Input | Action |
|---|---|
| `B` | Toggle draw mode |
| Hold LMB | Draw (the plane freezes where you press) |
| `1`–`6` | Colour |
| Scroll wheel, or `[` / `]` | Width |
| `Ctrl+Z` / Backspace | Undo — mid-stroke, cancels that stroke instead |
| `C`, `C` | Clear all (two presses, 2s window) |

Draw mode exists only to arbitrate the left mouse button, which the voxel world already uses
to place cubes. It does not release pointer lock and does not interrupt movement — WASD,
jumping and mouse-look stay live while you draw.

## Manual smoke test

Automated tests cover `core/` only; the renderer and the HUD are verified by hand. Work
through all eight — steps 3 and 4 are the ones that catch projection bugs, and step 5 catches
degenerate geometry.

1. `B`, hold LMB, sweep — a ribbon appears 4m ahead.
2. Walk around it — it stays put and keeps constant apparent thickness (it must not vanish
   edge-on, including when you look straight down its length).
3. Strafe while drawing — you get a straight line, because the plane does not follow you.
4. Turn ~90° mid-stroke — sampling pauses, the stroke stays open; turn back and it resumes on
   the same plane at a sane width.
5. Click without moving — a dot, not a crash.
6. `Ctrl+Z` mid-stroke cancels that stroke; otherwise it removes the last one.
7. `C` shows the confirm banner; `C` again clears; waiting 2s cancels it.
8. `B` off — clicking places cubes again, exactly as before.

## Tests

```bash
npm test               # core/ only: projection, taper, store, engine
npm run check:layering # ring boundaries
```

`core/` is pure TypeScript, so the engine is tested by feeding it scripted camera poses with
no renderer in the loop. `three/` and `r3f/` have no unit tests by design — see the smoke
list above.

## Known limitations

- **Taper is subtle.** Width varies 0.35×–1× with cursor speed, which on a 5cm ribbon is a
  real but easily-missed effect at walking distance. See spec §12.3.
- **One draw call per stroke.** The store caps at 300 strokes and evicts the oldest. If that
  hurts on a slower machine, batch committed strokes into merged geometry — but measure first.
- **Strokes do not survive a refresh.** In-session only; `localStorage` persistence is
  designed but not built (spec §7).
