# Sketch-to-3D — Design Spec

**Date:** 2026-08-22
**Event:** AECTech Hackathon 2026, Boston
**Repo:** `make-revit-fun-again`
**Constraint:** 24 hours, 8 people, mixed experience
**Status:** Design approved. Not yet implemented. **Generation path verified live 2026-08-22** — see §6 and §12.

---

## 1. What we're building

Kids and non-AEC people **draw something on an overlay canvas inside the 3D world**, and it becomes
a **simplified, visually appealing 3D model** that appears in the scene in front of them.

The value is the gap between "wobbly drawing" and "adorable 3D object". This is *interpretation*,
not reconstruction — a faithful 3D copy of a bad drawing impresses nobody. Charm beats fidelity at
every decision point.

It ships as a **self-contained, portable block**. The project direction is still unsettled, so the
feature must work in the current React Three Fiber scene *and* survive being moved to a different
three.js scene later.

**Out of scope:** accounts, persistence, InstantDB sync, download/export, AR, multiplayer.

---

## 2. Repo context

Existing app (already working, do not break):

- **Next.js 16.3.2**, App Router, `app/` files are `.js`, `components/` are `.tsx`.
- **R3F 9.7 + drei 10.7 + three 0.185 + @react-three/rapier 2.2**, `zustand` 5, Tailwind 4, TS 6.
- `components/minecraft/` — a first-person voxel world: `PointerLockControls`, WASD via
  `KeyboardControls`, rapier physics, click-to-place cubes, an axe. State is a local
  `useCubeStore` (in-memory, resets on refresh).
- `python/rhino-stream.py` — meshes the live Rhino selection and pushes vertex/normal/index
  buffers to InstantDB. **The React side of this loop does not exist yet** — no `@instantdb/react`
  in `package.json`, nothing reads the `meshes` table.

**`AGENTS.md` is binding:** Next.js 16 has breaking changes from model training data. Read
`node_modules/next/dist/docs/` before writing Next.js code.

*Already checked:* Route Handlers are unchanged — plain `export async function POST(request)` in
`app/api/**/route.ts`, Web `Request`/`Response`, uncached by default. The fal proxy plan is valid.

---

## 3. Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Model | `fal-ai/hunyuan3d-v3/sketch-to-3d` | Purpose-built for line art + prompt. Removes any ControlNet pre-render stage. |
| Inference | Hosted via fal, proxied | `FAL_KEY` cannot reach the browser. fal ships a first-party Next.js proxy. |
| Input | Overlay canvas over the 3D scene | We control stroke rendering, so we emit clean high-contrast line art by construction. |
| Prompt | Tier 1: kid types. Tier 2: VLM auto-caption | `prompt` is a required API field. Typing is the PoC; auto-caption is the stretch. |
| Output | Model appears in the scene | Not a separate viewer page. The world is the point. |
| Portability | `SceneBridge` interface | Swapping renderer replaces one folder. |
| Style | Prompt suffix + `flatShading` | Style is a shading/silhouette property, not a polygon-count one. |

### Rejected alternatives

- **ControlNet pre-render stage** (sketch → shaded image → 3D). Necessary for generic image-to-3D
  models, which need tonal cues to infer depth. Unnecessary here — the sketch endpoint takes line
  art directly. Halves the build.
- **Standalone `/draw` route with an isolated viewer.** The original design, written before the repo
  was seen. Ignores what makes the project interesting.
- **Rewriting the scene in vanilla three.js.** Would mean rebuilding the render loop, controls and
  GLB loading by hand in a repo already committed to R3F. The `SceneBridge` gets us portability
  without paying that cost now.
- **Self-hosted TRELLIS / TRELLIS.2 / TripoSR.** Better licence story (TRELLIS v1 is MIT), but needs
  GPU ops we don't have time for, and none take line art as a first-class input.
- **InstantDB sync for creations.** Deferred by choice. The existing `meshes` schema is a *sync
  channel* (`guid`, `updatedAt`, `visible`, change-detection signature) designed for continuously
  updating geometry; generated models are write-once. Reusing it would work until the semantics
  diverge.

---

## 4. Architecture

Four layers, dependencies pointing strictly inward.

```
components/sketch-to-3d/
  core/            ← zero React, zero three.js. Pure TS.
    falClient.ts       generate(png, prompt, onProgress) → { glbUrl }
    prompt.ts          STYLE_SUFFIX, buildPrompt()
    creationStore.ts   zustand/vanilla store: creations + in-flight jobs
    types.ts           Creation, JobState, SceneBridge
    mockGenerator.ts   offline fallback
  ui/              ← React + DOM only. Never imports three.
    SketchOverlay.tsx  canvas that fades to white, + prompt input
  r3f/             ← the ONLY renderer-specific code
    Creations.tsx      renders the store as GLBs in the scene
    useR3FSceneBridge.ts
  README.md          how to port it
```

**Porting to a different three.js scene replaces `r3f/` and nothing else.** `core/` and `ui/` move
untouched.

### The shared types

```ts
type SpawnTransform = { position: [number, number, number]; rotationY: number }

/** One thing a kid made. Immutable once `ready`. */
type Creation = {
  id: string
  prompt: string          // the full prompt sent, suffix included
  userText: string        // what the kid actually typed, for UI
  spawn: SpawnTransform   // captured at submit time, never recomputed
  state: JobState
}

type JobState =
  | { status: 'uploading' }
  | { status: 'generating'; message: string }
  | { status: 'ready'; glbUrl: string; thumbnailUrl?: string; seed?: number }
  | { status: 'error'; message: string; retryable: boolean }
```

There is no `idle` state: a `Creation` only exists once the kid has submitted one. Idle is the
absence of an in-flight job, not a job in an idle state — modelling it otherwise invites a
permanently-idle phantom creation in the store.

### The seam

```ts
interface SceneBridge {
  /** Called at submit time — where should this creation appear? */
  getSpawnTransform(): { position: [number, number, number]; rotationY: number }

  /** Called when the GLB is ready. */
  onModelReady(creation: Creation): void

  /** Called when draw mode opens and closes. */
  setInputEnabled(enabled: boolean): void
}
```

The coupling is **inverted**: the sketch block never calls into the scene; the scene hands the block
a `SceneBridge` and the block calls back through it.

`setInputEnabled` is the portable answer to the pointer-lock problem. In the current scene it is
`controls.unlock()` / `lock()`; with `OrbitControls` it is `controls.enabled = false`; in a future
scene it is whatever that scene needs. The overlay stays ignorant of which.

**Verification that the boundary is real, not just folder names:** `core/` and `ui/` must compile
with `three` and `@react-three/*` uninstalled. Treat this as a literal check, not an aspiration.

### State

`creationStore.ts` uses `zustand/vanilla`'s `createStore`, not the React `create`. React binds via
`useStore`; a vanilla three.js scene subscribes with `store.subscribe`. Zustand is already a
dependency, so this costs nothing. This deliberately mirrors the existing `useCubeStore` idiom while
staying React-free in `core/`.

---

## 5. Data flow

```
Browser                          Vercel                    fal.ai
───────                          ──────                    ──────
overlay <canvas>
   │ toBlob() PNG 1024×1024
   ├─ fal.storage.upload(blob) ──► /api/fal/proxy ────────► storage → URL
   │                                (FAL_KEY injected)
   ├─ fal.subscribe(             ─► /api/fal/proxy ───────► hunyuan3d-v3
   │    "…/sketch-to-3d", {…})       (submit + each poll)     /sketch-to-3d
   │                                                       ~60s
   └─ result.model_glb.url ─────────────────────────────► creationStore → scene
```

The client calls fal *through* the proxy; `@fal-ai/client` handles submit-and-poll itself. The proxy
is a dumb credential-injecting passthrough. Consequences: no job table, no webhooks, no server
state, and no Vercel timeout exposure — each proxied request is milliseconds even though generation
takes ~130s. (Vercel's default max duration is 300s on all plans, so this was never tight — but note
a server-orchestrated design would have been within 3× of that ceiling.) Progress
comes free via `onQueueUpdate`.

---

## 6. API contract

`fal-ai/hunyuan3d-v3/sketch-to-3d` — **verified live 2026-08-22** (request `01a02aac-4089-78a0-9774-68694fa790f0`).

| Param | Type | Required | Our value |
|---|---|---|---|
| `input_image_url` | string | yes | uploaded canvas PNG (must be 128×128–5000×5000) |
| `prompt` | string | yes | `buildPrompt(userText)` |
| `enable_pbr` | boolean | no | `false` |
| `face_count` | integer | no | **~40,000** (range 40k–1.5M, default 500k) |

**Output — observed, not documented:** `model_glb`, `thumbnail`, and `model_urls` containing
**only `glb` and `obj`**. The docs also list `fbx` and `usdz`; they were **not returned**. They are
presumably conditional on parameters this call didn't set. Do not depend on them.

`seed` came back **`null`**, so §10's "retry re-rolls with a new seed" cannot be implemented by
passing a seed back. Retry simply re-submits; the model's own nondeterminism supplies the variation.

**Measured baseline** (default `face_count`, `enable_pbr: false`, style suffix on):

| Metric | Value |
|---|---|
| Wall-clock | **130.8s** (≈12s queued, ≈119s generating) — *docs claim ~60s* |
| Triangles | **exactly 500,000** (the documented default) |
| GLB size | **26.2 MB** |
| Textures | **one 12 MB PNG**, `baseColorTexture` only |
| Cost | $0.375 |

`enable_pbr: false` is confirmed working — no metallicRoughness or normal textures were generated.

**Cost with our settings:** $0.375 base **+$0.15 for a custom `face_count`** → **$0.525 per generation**.

### Why `face_count` is set, and why that reversed

An earlier draft omitted `face_count` to save $0.15, reasoning that it controls performance rather
than style. That was correct for a single model on an isolated page. It is **wrong here**: several
500k-face models coexisting in a live physics scene is 2.5M+ triangles and will wreck the frame rate
on a laptop at a booth. The parameter did not change; the context did.

**The measured run made this worse than predicted, and shifted where the problem is.** Geometry is
only half of it: the 26.2 MB GLB is **12 MB of base-colour PNG**. Five creations is ~60 MB of
texture — download time on hackathon wifi, GPU memory once uploaded, and a main-thread decode stall
per model. Nothing in fal's docs hints at this.

Mitigations, cheapest first:

1. **`face_count: 40000`** — cuts geometry 12×. Costs $0.15. Does *not* touch the texture.
2. **Downscale the texture on load** — the base-colour map does not need to be 12 MB for a stylized
   toy. Resampling to 1024² or 512² in the loader is the single biggest win and costs nothing.
3. **Cap concurrent creations in the scene** (e.g. oldest despawns past N). Crude, effective,
   and worth having regardless as a demo-safety valve.

### Why `enable_pbr` is false

The viewer overrides materials, so metallic/roughness maps would be generated and discarded. These
two settings live in different layers and are coupled by intent but not by code — **comment this at
the call site**, or someone will later enable PBR to "improve quality" and silently pay for nothing.

**Deprecated — do not use:** `fal-ai/hunyuan3d-v21`, `fal-ai/bytedance/seed3d/image-to-3d`. Note
also that LowPoly and sketch support are **v3-only**; v3.1 dropped both, so "newer version" is the
wrong instinct.

---

## 7. Where the style comes from

Neither source is a geometry setting.

**1. Prompt suffix** — the highest-leverage tuning knob in the app, and the thing to iterate on live
during the day. One constant in `core/prompt.ts`:

```ts
const STYLE_SUFFIX =
  "simple cute toy figure, smooth rounded forms, soft matte colors, clean silhouette";

export const buildPrompt = (userText: string) => `${userText}, ${STYLE_SUFFIX}`;
```

**2. `flatShading: true`** on the loaded GLB's materials, retaining the base-color texture. The
faceted result reads as deliberate stylization while keeping the kid's colours. Costs nothing and is
instantly reversible — unlike mesh decimation, which is slow, lossy, and can shred the silhouette.

---

## 8. Draw-mode flow

```
in-world (pointer locked, WASD)
    │  press E  →  bridge.setInputEnabled(false)
    ▼
overlay canvas fades transparent → white
    │  kid draws lines, types "a dragon", hits "Make it real"
    │  → capture spawn transform NOW
    ▼
overlay fades out, bridge.setInputEnabled(true), ghost placeholder at spawn point
    │  ~130s (measured; docs claim ~60s)
    ▼
GLB replaces the ghost
```

**The wait is over two minutes, not one.** This is the most important UX consequence of the live
test. Two minutes is far past what a child will watch a progress bar for — which is exactly why the
model must spawn *into the world* and the kid must be free to walk around while it generates. The
ghost placeholder is not decoration; it is what makes a 130-second wait tolerable, because it gives
the kid something of theirs to see immediately. Do not defer it to "polish".

**Pointer lock is the main integration risk.** `PointerLockControls` captures the mouse; drawing
needs a cursor. Escape releases the lock natively, so a self-managed boolean will desync — **listen
to the control's `unlock` event as the source of truth.**

**Placement is captured at submit time, not arrival time.** The kid will have wandered off during
the 60 seconds; a model that spawns wherever they happen to be standing a minute later feels broken.
Spawn point is `camera.position + forward * 4`, stored *with the job*.

**In-flight jobs are an array, not a single value.** With a 60-second wait, overlapping generations
are the normal case, not an edge case. Each carries its own prompt and spawn transform.

**Physics:** start `type="fixed"` with no collider. Convex-hull colliders on generated meshes are
expensive and can hang. A `colliders="cuboid"` bounding box is a cheap later addition if kids should
be able to knock creations over.

---

## 9. Cost & abuse protection

**The most important failure mode is financial, not technical.** The fal proxy hides the key from
the browser bundle, but **anyone can POST to `/api/fal/proxy`**. This is a public Vercel URL, at a
hackathon, spending $0.525 per call with no auth.

In priority order:

1. **Spend cap in the fal dashboard.** Lives outside our code, so it holds even when our code is
   wrong. If only one control ships, this is it.
2. **Rate limit on the proxy POST** — in-memory, per-IP, ~5 generations / 10 min. fal's route
   handlers compose: run the check, then `return route.POST(req)`. Resets on cold start; crude but
   far better than nothing.
3. **Client-side validation before spending** — reject an empty canvas (count strokes, not pixels)
   and an empty prompt.

---

## 10. Error handling

| Failure | Handling |
|---|---|
| fal 5xx / network drop | job → `error`, `retryable: true`, one-tap retry preserving strokes + prompt |
| Rate limited (429) | Distinct message ("lots of people are drawing, try in a minute") |
| GLB fails to load | Error boundary around that creation only; scene and other creations survive |
| Wifi dead at venue | `NEXT_PUBLIC_USE_MOCK=1` → `mockGenerator` serves a bundled GLB |
| Model returns something ugly | Not programmatically detectable. UI affordance only: "Try again" re-submits. **`seed` comes back `null`**, so variation relies on the model's own nondeterminism, not on us passing a new seed |

The last row is the honest one: for a generative pipeline, "wrong output" is not a catchable error
state. Retry is the entire strategy.

---

## 11. Testing

Scaled to a 24-hour PoC. Full TDD is the wrong trade here. Three things are cheap and worth it:

- **The job reducer / store transitions** — pure, and bugs there strand a creation in `generating`
  forever.
- **`buildPrompt()`** — pure, and it will be edited live all day. A test pins the contract while the
  suffix is tuned.
- **The layering check** — `core/` and `ui/` must not import `three` or `@react-three/*`. A grep in
  CI, or just a documented manual check. This is the one that protects the portability promise.

Everything else: a manual smoke checklist in the block's README — draw → generate → spawn → retry →
offline mock.

---

## 12. Open questions — resolve before building on them

**RESOLVED 2026-08-22 — the endpoint works.** One baseline call turned a crude stick-figure cat into
a charming stylized toy. Quality on child-like line art is confirmed good, and the style suffix
visibly does its job. See §6 for measured figures.

Corrections that call produced: latency is **130.8s not ~60s**; `model_urls` returns **only glb and
obj**; `seed` is **null**; and the texture is **12 MB**, a cost the docs never mention.

Still open:

1. **Is `generate_type` (Normal/LowPoly/Geometry) reachable here?** Documented for the v3 family but
   **absent from the sketch endpoint's own schema**. Three outcomes: rejected, accepted-and-different,
   or accepted-and-silently-ignored. The third is the dangerous one — compare triangle counts rather
   than trusting a 200 response. The design deliberately does not depend on it.
   *Spike command:* `node spike.mjs cat.png "a cat" --lowpoly`
2. **Does `face_count: 40000` hold?** Untested. The default of 500,000 was honoured exactly, which is
   mild evidence the parameter is respected. If it is ignored, §6 needs client-side decimation.
3. **How much does the style suffix actually contribute?** Untested against a control.
   *Spike command:* `node spike.mjs cat.png "a cat" --raw`
4. **Texture downscaling** — §6 mitigation 2 is unimplemented and unmeasured.
5. **Colour palette vs pure black strokes.** Kids expect colour, but this is a sketch model and bold
   dark line art is its trained-on input. Ship saturated dark-value colours, no pastels, and A/B it.
6. **Prompt suffix wording** — expect to iterate repeatedly.

Items 1–3 are one spike run each, ~$0.4 apiece.

---

## 13. Build order

1. Add `@fal-ai/client`. Create `app/api/fal/proxy/route.ts` + `FAL_KEY` in `.env.local`. Set the
   fal spend cap. Make one real call. **Resolves §12.1–3.**
2. `core/types.ts`, `core/prompt.ts`, `core/creationStore.ts` (vanilla zustand).
3. `core/falClient.ts` + `core/mockGenerator.ts`.
4. `ui/SketchOverlay.tsx` — canvas, fade, tools, prompt input, validation.
5. `r3f/useR3FSceneBridge.ts` — spawn transform, pointer-lock handling via the `unlock` event.
6. `r3f/Creations.tsx` — GLB loading, `flatShading`, ghost placeholder.
7. Wire into `components/minecraft/App.tsx` (two lines) + a key binding. Nothing in `Cube.tsx`,
   `Player.tsx` or `Ground.tsx` is touched.
8. Rate limit, error states, retry.
9. Visual polish.
10. *Stretch:* VLM auto-caption (prompt tier 2).

Steps 2–6 are independent of the existing scene and can proceed in parallel with other work.
