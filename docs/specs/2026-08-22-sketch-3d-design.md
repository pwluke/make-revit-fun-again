# Sketch-3D — Draw in Space — Design Spec

**Date:** 2026-08-22
**Event:** AECTech Hackathon 2026, Boston
**Repo:** `make-revit-fun-again`
**Constraint:** 24 hours, 8 people, mixed experience
**Status:** Design approved. Not yet implemented.
**Sibling spec:** `2026-08-22-sketch-to-3d-design.md` (the AI generation path). These two are
independent. Neither imports the other.

---

## 1. What we're building

You draw **actual 3D lines in the air**, inside the existing first-person world. The strokes *are*
the geometry — there is no interpretation step, no model, no inference. Hold the mouse, look
around, and a ribbon of colour follows your crosshair through space. Walk through what you drew.

Think Feather 3D / Tilt Brush, reduced to what one person can build in a day and what a child can
understand in five seconds.

**Why this exists alongside the AI path:** the AI path costs $0.525 and **130 seconds** per creation
and dies without wifi. This one costs nothing, appears at 16ms, and works on a plane. It is the
demo that cannot fail. It is also a different pleasure — the AI path is *"look what it made of my
drawing"*, this is *"look what I made"*.

**Out of scope:** accounts, InstantDB sync, export/download, multiplayer, VR/AR, erase-by-region,
symmetry, snapping, any AI.

---

## 2. Repo context

Existing app (already working, do not break):

- **Next.js 16.3.2**, App Router, `app/` files are `.js`, `components/` are `.tsx`.
- **R3F 9.7 + drei 10.7 + three 0.185 + @react-three/rapier 2.2**, `zustand` 5, Tailwind 4, TS 6.
- `three-stdlib` 2.36 is **already a dependency** — this is why Phase 1 needs no new packages
  (drei's `<Line>` wraps its `Line2`).
- `components/minecraft/` — first-person voxel world: `PointerLockControls`, WASD via
  `KeyboardControls`, rapier physics, click-to-place cubes, an axe.

**`AGENTS.md` is binding:** Next.js 16 has breaking changes from model training data. This feature
adds **no route handlers and no server code at all**, so the exposure is minimal — but read
`node_modules/next/dist/docs/` before touching anything under `app/`.

**No new dependencies for Phases 1–4.** Phase 5 adds none either (the ribbon shader is hand-written).

---

## 3. Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Depth input | Drawing plane frozen 4m ahead at pointer-down | The only way to get 3 DOF from a 2-DOF device. Reorienting is *walking and turning*, which the world already does. |
| Input model | **Crosshair painting, pointer stays locked** | Deletes the sibling spec's single biggest integration risk (§8 there: "pointer lock is the main integration risk"). No cursor, no `unlock` desync. A draw-mode toggle is still required — but only to arbitrate LMB, not to manage pointer lock. See §6.1. |
| Stroke geometry | Camera-facing ribbon | Constant apparent thickness from every angle. A plane-aligned ribbon vanishes edge-on; a tube costs 8× the triangles for volume nobody will notice on a stylized doodle. |
| Portability | **Three dependency rings** (`core` → `three` → `r3f`) | The infrastructure is unsettled. Only the smallest ring is React-specific. |
| State | `zustand/vanilla` store | Single channel between engine, meshes and HUD. None of the three require React. |
| Persistence | In-session only (localStorage is a stretch) | The booth demo does not depend on surviving a refresh. |

### Rejected alternatives

- **Unlocking the cursor to draw** (press a key → cursor appears → draw → exit → turn → re-enter).
  Better drawing fidelity, but reorienting is the *core motion* of 3D sketching, and this makes it a
  mode switch. Taxing the most frequent action is the wrong trade. It also reintroduces the exact
  pointer-lock desync the sibling spec flags as its main risk.
- **Hybrid (unlocked cursor + right-drag orbit).** Best of both, but it means a second camera
  controller running alongside `PointerLockControls`. That is the thing that eats 24 hours.
- **Raycast strokes onto existing surfaces** (spray-paint the voxels). Charming, but it makes
  drawing *in the air* — the whole point — the fallback case rather than the main case.
- **`TubeGeometry` strokes.** Real volume, real shadows, ~8× triangles, and needs a Catmull-Rom
  curve fit through noisy samples. Volume is not what makes a doodle read.
- **Neon + bloom.** Highest wow, but needs `@react-three/postprocessing`, a new render pass, and a
  dark scene. The voxel world is bright.
- **Draw-flat-then-extrude.** That is SketchUp, not sketching.

---

## 4. Architecture — three dependency rings

The sibling spec needed a `SceneBridge` because it had to *ask* the scene where to spawn things.
This block never asks the scene for anything; it consumes a camera pose, which every 3D engine has.
So the seam is simpler — but there is an extra ring, because the mesh-building code is
three-specific yet **not** React-specific, and collapsing it into `r3f/` would drag it into the part
you throw away on a port.

```
components/sketch3d/
  core/          ← pure TS. No three, no React. ~200 lines.
    types.ts         Vec3, CameraPose, Plane, Stroke, StrokeStore
    projection.ts    freezePlane, projectOntoPlane, sample guards
    taper.ts         widthAt(velocity)
    strokeStore.ts   zustand/vanilla
    SketchEngine.ts  the headless mechanic  ◄── the real portable asset
  three/         ← imports three. Does NOT import React. ~120 lines.
    strokeGeometry.ts   Stroke → BufferGeometry (incl. the 1-point dot case)
    StrokeMaterial.ts   camera-facing ribbon shader (Phase 5)
    StrokeLayer.ts      a THREE.Object3D that mirrors the store into meshes
  r3f/           ← imports React. ~60 lines. THE ONLY DISPOSABLE PART.
    SketchController.tsx   useFrame → engine.update(); pointer events
    Strokes.tsx            <primitive object={strokeLayer} />
  ui/            ← DOM overlay. React today, store-driven, not prop-driven.
    PaletteHUD.tsx
  README.md        how to port it
```

**Porting to vanilla three.js replaces `r3f/` — about 60 lines — and nothing else.** `core/` and
`three/` move untouched. `ui/` moves untouched if you keep React for the HUD, and is ~40 lines of
DOM if you don't; the palette reads and writes the vanilla store directly and never holds React
state.

### The types

```ts
type Vec3 = [number, number, number]

/** Six numbers. Deliberately NOT a THREE.Camera. */
type CameraPose = { position: Vec3; forward: Vec3 }

type Plane = { point: Vec3; normal: Vec3 }

type Stroke = {
  id: string
  points: Vec3[]        // world space, already projected
  widths: number[]      // parallel to points
  color: string
  plane: Plane          // kept for debugging and future re-projection
}
```

`points` are stored in **world space, already projected** — not as plane-local 2D coordinates plus a
transform. A committed stroke is therefore inert data: nothing about it is ever recomputed when the
camera moves. That is what keeps 300 strokes free.

### The engine surface

```ts
class SketchEngine {
  constructor(store: StrokeStore, opts?: { distance?: number })
  pointerDown(pose: CameraPose): void
  pointerUp(): void
  update(pose: CameraPose): void   // once per frame while held
}
```

That is the entire API. Because `CameraPose` is six numbers rather than a `THREE.Camera`, the engine
is pure TS and can be unit-tested by feeding it a scripted sequence of poses with no renderer in the
loop. It is also why a Babylon or raw-WebGPU port would work, not just vanilla three.

The engine takes **no keyboard input**. Movement stays entirely with the existing scene.

### Why `StrokeLayer` is a plain `Object3D`

R3F's `<primitive>` adopts an `Object3D` you built yourself. So the same class is a first-class R3F
component *and* a vanilla `scene.add()` target, with no wrapper on either side. This is the single
detail that makes the ring boundary real rather than decorative.

**Verification, treated as a literal check and not an aspiration:**
`core/` must compile with `three` uninstalled. `three/` must compile with `react` uninstalled.

---

## 5. The mechanic, precisely

**On `pointerdown`:** freeze a plane. `point = camPos + camForward × 4`, `normal = -camForward`.
Stored on the active stroke, never updated for the life of that stroke.

**Each frame while held:** the crosshair ray is `origin = camPos(t)`, `dir = camForward(t)`.
Intersect with the frozen plane. Three guards, each covering a real failure mode rather than a
hypothetical one:

| Guard | Condition | Failure it prevents |
|---|---|---|
| Parallel / behind | `dot(dir, normal) > -0.05` | Turn ~90° away and the intersection flies to infinity or lands behind you. **Pause sampling; keep the stroke open.** Turning back resumes cleanly. Not an error state. |
| Min distance | `dist(last, candidate) < 0.02m` | Holding still pumps hundreds of coincident points per second → zero-length segments → NaN tangents → an invisible or exploded mesh. |
| Max samples | `points.length >= 512` | Bounds per-stroke memory and geometry. |

**Walking while drawing is legitimate and works.** The ray origin moves, the plane does not — so
strafing draws a long straight line. This falls out of the design for free and is worth demoing.

### Width and taper

`taper.widthAt(velocity)` maps cursor speed on the plane to a width multiplier: fast → thin, slow →
thick, clamped and smoothed over the last few samples so noise doesn't produce a lumpy ribbon.
Pure function, ~10 lines, and expected to be tuned live all day.

### Rendering, in two phases

The live stroke and the committed strokes have opposite performance profiles, so they get opposite
treatment:

- **Live stroke:** one preallocated 512-point buffer, updated in place each frame with
  `setDrawRange`. Never reallocated mid-stroke.
- **Committed strokes:** geometry built **once** on `pointerup`, then never touched.

**Phase 1 — drei `<Line>`.** Wraps `three-stdlib`'s `Line2`: thick, camera-facing, world-unit
widths, vertex colours, zero new dependencies. Proves input, projection, store, undo and palette in
about half an hour.

**Phase 5 — custom ribbon shader.** `Line2` has one hard limitation: **uniform width per line**, so
it cannot express the velocity taper. Phase 5 replaces `strokeGeometry.ts` with a triangle strip
carrying per-vertex `side` and `width` attributes, expanded camera-facing in the vertex shader (the
meshline algorithm, ~80 lines, still no dependency).

This staging is not hedging. `strokeGeometry.ts` is a single pure function, so Phase 5 swaps one
file with everything around it already validated — and if hour 20 arrives with the shader
misbehaving, Phase 1 is a shippable product that is merely untapered.

---

## 6. UX and the HUD

### 6.1 Draw mode exists — but only to arbitrate the left mouse button

**Left click is already bound in the existing scene.** `components/minecraft/Cube.tsx:46` places a
new cube via R3F's `onClick`, and `components/minecraft/Player.tsx:87` swings the axe via
`onPointerMissed`. Hold-LMB-to-draw collides with both.

So there is a mode toggle after all — `B` (for *brush*; `E` is reserved by the sibling spec's AI
overlay). **It is not the mode we rejected in §3.** The rejected design unlocked the pointer, showed
a cursor, and forced a mode round-trip every time you wanted a new drawing angle. This one:

- never releases pointer lock,
- never shows a cursor,
- leaves WASD, jumping and mouse-look fully live,
- and costs nothing to reorient — you turn and keep drawing, still inside draw mode.

It is a single boolean on the store. While `drawMode` is true, `SketchController` handles LMB and
cube placement is suppressed; while false, the scene behaves exactly as it does today.

**Suppression must be explicit, not incidental.** R3F pointer events are raycast-driven, so an
invisible stroke mesh in front of a cube would *accidentally* block placement — which works right up
until someone draws in mid-air over nothing and plants a cube by surprise. `Cube.onClick` returns
early when `drawMode` is set, read from the vanilla store outside React. That is the one edit this
feature makes to an existing file beyond `App.tsx`, and it is three lines.

A small "✏ drawing" indicator next to the palette makes the mode legible. Without it, the first
thing every visitor does is click expecting a cube and conclude the app is broken.

### 6.2 The palette

**The HUD cannot be clicked.** That is the direct, unavoidable consequence of keeping the pointer
locked: there is no cursor. So the palette is a *display*, and all input is keys.

| Input | Action | Note |
|---|---|---|
| `B` | Toggle draw mode | Pointer stays locked either way (§6.1) |
| Hold LMB | Draw | Only in draw mode. Plane freezes on press |
| `1`–`6` | Colour | Six saturated, dark-value swatches |
| Scroll wheel | Width | Works under pointer lock. `[` / `]` fallback for trackpads |
| `Ctrl+Z` / Backspace | Undo last stroke | **While drawing, cancels the active stroke instead** |
| `C` | Clear all | Two-press confirm — kids *will* hit this by accident |

Layout: a small bottom-centre strip — six swatches with the active one scaled up, a width dot, a
stroke count. No modal, no panel, nothing that implies clicking.

**Colours:** saturated, dark values, no pastels. Same reasoning as the sibling spec's §12.5 — bold
reads at booth distance and on a projector.

---

## 7. Persistence

Two tiers, and the second is honestly a stretch:

1. **In-session (free).** Strokes live in the store, so walking away and coming back just works.
   This is the tier the booth demo depends on.
2. **Across refresh (`localStorage`, stretch).** A stroke is ~200 points × 3 floats. 300 strokes is
   ~2 MB of JSON — past comfortable localStorage territory. Quantizing coordinates to 2 decimals and
   widths to one byte gets it to ~600 KB, which fits. Worth doing; nothing depends on it.

InstantDB sync is explicitly deferred, for the same reason the sibling spec defers it.

---

## 8. Performance

One mesh per committed stroke is one draw call per stroke. 300 strokes is 300 draw calls sitting on
top of a rapier physics scene — a booth laptop will feel that.

Mitigations, in the order they should be reached for:

1. **Cap at 300 strokes, oldest fades out.** Ship this. It doubles as a natural "the wall gets
   repainted through the day" behaviour and as a demo-safety valve.
2. **Batch every 50 committed strokes into one merged geometry.** Hold in reserve. Easy to add once,
   miserable to debug at 3am.

Do not preemptively build (2). The cap is very likely sufficient.

---

## 9. Edge cases

Each of these is a silent-corruption bug rather than a crash, which is why they are named now:

| Case | Handling |
|---|---|
| Click without moving → 1-point stroke | Render as a **dot**, not a degenerate zero-length quad with NaN tangents. Special-cased in `strokeGeometry`. |
| Turning past the plane mid-stroke | Sampling pauses (guard 1), stroke stays open, turning back resumes. Not an error. |
| Drawing while jumping / falling | Works unchanged; the ray origin simply moves. |
| Two strokes coplanar at the same depth | z-fighting on the ribbons. `polygonOffset` on the material, or accept it. **Accept it first and look** — it may never be visible. |
| Pointer lock lost mid-stroke (Escape) | `pointerUp()` on the `unlock` event. Commits what exists rather than stranding an open stroke. |

---

## 10. Testing

Scaled the same way the sibling spec scales it — full TDD is the wrong trade for a 24-hour PoC. But
the engine is pure, which makes the valuable tests cheap:

- **`projection.ts`** — ray/plane intersection and all three guards, fed scripted `CameraPose`
  sequences. This is the one that matters: a bug here puts strokes in the wrong place, which is
  effectively unfalsifiable by eye.
- **`strokeStore` transitions** — including undo-during-active-stroke, which is the case that will
  be got wrong.
- **`taper.widthAt`** — pure, and it will be tuned live all day.
- **The two layering greps** — `core/` free of `three`, `three/` free of `react`. These protect the
  portability promise, which is the whole reason for the ring structure.

Everything else is a manual smoke list in the block's README: draw → walk through it → turn and draw
again → undo → change colour → 300-stroke stress.

---

## 11. Build order

1. **`core/`** — types, projection, store, engine, taper. Tests alongside. *No renderer involved;
   this step is fully parallelisable with any other work in the repo.*
2. **`three/strokeGeometry.ts`** (drei `<Line>` output) + **`StrokeLayer`**.
3. **`r3f/`** — controller + `<primitive>`. Wire into `components/minecraft/App.tsx`, add the
   `drawMode` toggle, and add the early-return guard to `Cube.onClick` (§6.1).
   **End-to-end drawing works at the end of this step.**
4. **`ui/PaletteHUD.tsx`** + mode indicator + key bindings + undo + clear.
5. **Custom ribbon shader** with per-vertex taper — replaces step 2's geometry only.
6. **Stroke cap + fade**, edge-case polish (§9).
7. *Stretch:* localStorage persistence.
8. *Stretch:* a `vanilla/` example — ~40 lines, and the only real proof the layering holds.

Steps 1–2 need nothing from the existing scene. `App.tsx` gains a few lines and `Cube.tsx` gains a
three-line guard (§6.1); nothing in `Player.tsx` or `Ground.tsx` is touched at any step.

---

## 12. Open questions

1. **Is 4m the right plane distance?** Untested. Too close and you can't fit a whole drawing in
   view; too far and strokes feel detached and are hard to walk around. Expect to tune, and consider
   whether it should scale with something.
2. **Is crosshair painting too coarse in practice?** The known cost of the input decision. If
   testing says yes, the unlocked-cursor mode is an *addition* on top of the same engine — only the
   pose source changes — not a rewrite.
3. **Does the taper read at all on a 2cm-wide ribbon?** It may be invisible at demo scale, in which
   case Phase 5 buys nothing and Phase 1 is the final answer.
4. **Stroke cap of 300** — a guess. Measure on the actual booth laptop before trusting it.
5. **Should strokes cast shadows?** Cheap to try, potentially a large visual win, potentially noise.
