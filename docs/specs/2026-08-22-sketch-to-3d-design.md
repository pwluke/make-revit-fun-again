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

- **ControlNet pre-render stage / two-stage split** (sketch → shaded image → 3D). Originally
  rejected by reasoning: the sketch endpoint takes line art directly, so the stage is redundant.
  **Now rejected on measurement.** Tested against the single-stage call on identical input, the
  two are indistinguishable on compute: B1 (`fast-sdxl-controlnet-canny`) 6.2s + B2
  (`hunyuan3d-v3/image-to-3d`) 98.7s = **104.9s**, against **105.2s** single-stage.
  Image-conditioned mesh generation is not cheaper than sketch-conditioned — the cost is in the
  mesh, not the conditioning. The split's only real effect is a second draw from fal's queue-wait
  distribution (0.1s–77.5s observed); one sampled run lost 66s purely to a cold queue on
  `image-to-3d`.

  **REVERSED for a different second stage — see §14.** The measurement above is sound but its
  conclusion was scoped too widely. "The cost is in the mesh, not the conditioning" is true, and
  that is precisely why the bridge stage is worth paying for once the *mesh* stage is something
  cheaper than Hunyuan. Against `fal-ai/trellis` the same split is **22.7s**, not 104.9s. The
  bridge was never the problem; pairing it with Hunyuan was.
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

**Measured** (`enable_pbr: false`, style suffix on). Compute figures at 500k are n=3 from the
`fal-bench` worktree. Always compare **compute, not wall-clock**: observed queue waits ranged
**0.1s–77.5s** in a single session, so wall-clock is dominated by noise.

| Metric | `face_count` default (500k) | `face_count: 40000` |
|---|---|---|
| Compute | **114.3s** (n=3, range 112.5–117.4s) | **105.2s** (n=1) |
| Triangles | exactly **500,000** | **39,318** — honoured |
| GLB size | **26.2 MB** (~14 MB geometry + 12 MB texture) | **13.6 MB** |
| Texture share | ~46% | **93%** — one 12.6 MB base-colour PNG |
| Cost | $0.375 | $0.525 |

Textures are `baseColorTexture` only; `enable_pbr: false` is confirmed working — no
metallic/roughness/normal maps are generated.

40k is **possibly ~8% faster, single sample, not confirmed.** It sits just below the 500k
range, which is suggestive, but the latency saving is not established. The honoured triangle
count is solid; the latency delta is not.

Queue is only ~2% of wall-clock on a warm endpoint, so there is nothing to optimise there.

`enable_pbr: false` is confirmed working — no metallicRoughness or normal textures were generated.

**Cost with our settings:** $0.375 base **+$0.15 for a custom `face_count`** → **$0.525 per generation**.

### Why `face_count` is set, and why that reversed

An earlier draft omitted `face_count` to save $0.15, reasoning that it controls performance rather
than style. That was correct for a single model on an isolated page. It is **wrong here**: several
500k-face models coexisting in a live physics scene is 2.5M+ triangles and will wreck the frame rate
on a laptop at a booth. The parameter did not change; the context did.

**Measurement moved the problem, then moved it again.** The first run showed geometry was only half
of it. Benchmarking at 40k settled it: **at `face_count: 40000` the GLB is 13.6 MB, of which
12.6 MB is a single base-colour PNG — 93% texture.** Cutting faces 12× only halved the file.

**Geometry has ceased to be the payload problem. Every remaining megabyte is one texture.**

Mitigations, in corrected priority order:

1. **Downscale the texture on load.** The base-colour map does not need to be 12 MB for a stylized
   toy. Resampling above 1024² in the loader costs nothing and is now the dominant lever.
   *(Implemented in `r3f/Creations.tsx`.)*
2. **`face_count: 40000`** — cuts geometry 12× for $0.15. Confirmed honoured (39,318 triangles).
   Still worth it for scene frame-rate, but it barely dents download size.
3. **Cap concurrent creations** (`MAX_CREATIONS = 8`, oldest evicted). Crude, effective, and worth
   having regardless as a demo-safety valve.

This order is the reverse of the first draft's. The parameter that looked decisive on paper
(`face_count`) turned out to address the smaller half of the payload.

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

**CLOSED — `face_count: 40000` is honoured.** Verified by parsing the returned GLB's JSON chunk and
summing primitive index accessors: **39,318 triangles**. A 200 response proves nothing; the count
does. `image-to-3d` also accepts it, returning exactly 40,000. No client-side decimation needed.

Still open:

1. **Is `generate_type` (Normal/LowPoly/Geometry) reachable here?** Documented for the v3 family but
   **absent from the sketch endpoint's own schema**. Three outcomes: rejected, accepted-and-different,
   or accepted-and-silently-ignored. The third is the dangerous one — compare triangle counts rather
   than trusting a 200 response. The design deliberately does not depend on it.
   *Spike command:* `node spike.mjs cat.png "a cat" --lowpoly`
2. **Is `STYLE_SUFFIX_SPRITE` right for SDXL?** Untested. Sprite mode never reaches Hunyuan — the
   suffix steers **SDXL**, a different model with different prompt sensitivities. The constant is
   currently a copy of the mesh suffix so behaviour starts predictable, *not* because a shared
   string has been shown to work. ~$0.06 through the SDXL stage alone.
3. **Colour palette vs pure black strokes.** Kids expect colour, but this is a sketch model and bold
   dark line art is its trained-on input. Ship saturated dark-value colours, no pastels, and A/B it.
4. **Does bounding-box normalisation help or hurt reconstruction?** The overlay now scales the
   drawing's bbox to fill the 1024² export. Untested against the model — every generation so far
   used the older fixed-square framing.

### CLOSED — the style suffix earns its keep, at a cost

Validated against a bare-prompt control (n=1 per arm, identical sketch, `face_count: 40000`,
`enable_pbr: false`, only the prompt differed).

| | suffix ON | bare prompt |
|---|---|---|
| Colour | flat matte, single tone | cream belly, red neckerchief, saturated |
| Surface | matte | glossier, specular |
| Detail | simplified, soft rounded forms | eyes, whiskers, fur markings |
| Reads as | **toy figure** | character illustration |
| Geometry | 40,000 tris, 13.1 MB | 40,000 tris, 12.8 MB |

**File metrics are useless here** — zero triangle difference, 0.3 MB apart. The entire effect is
form and material. Compare renders, not bytes.

On the n=1 weakness: `seed` is `null`, so a reroll cannot be excluded outright. But the observed
difference lies along **all four axes the suffix names** — *soft matte colors* → matte, *smooth
rounded forms* → simplified, *clean silhouette* → fiddly markings dropped. A reroll varies in
random directions, not the specified ones.

**The cost, to be decided rather than inherited:** the bare-prompt version is arguably the *more
charming single object* — more personality, more colour. The suffix buys **set coherence** at the
price of **individual appeal**. Right for a booth filling with many creations; a real loss for one
hero object shown to a judge. One constant, changeable in seconds.

**Methodology trap — do not repeat:** the two arms were first run *concurrently* to control for
queue depth, and it backfired (200.5s vs 102.8s), almost certainly concurrent submits serialising
on the same GPU pool. Those timings are artifacts; discard them. **Run arms sequentially.**

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

---

## 14. Fast 3D mode — TRELLIS (added 2026-08-22)

A third generation mode, `"fast"`, alongside `"mesh"` and `"sprite"`. Same deliverable as
`"mesh"` — a walkable GLB — via a different, much cheaper route.

```
sketch ──► fal-ai/fast-sdxl-controlnet-canny ──► fal-ai/trellis ──► GLB
             6.5s  (bridge)                       16.3s  (mesh)
```

**Measured** (`scripts/bench-trellis.mjs`, compute not wall-clock, n=1 per arm):

| | `mesh` (Hunyuan @40k) | `fast` (TRELLIS, shipped settings) |
|---|---|---|
| Compute | 105.2s | **22.7s** (6.5s bridge + 16.3s mesh) |
| GLB size | 13.6 MB | **0.4 MB** |
| Texture share | 93% (one 12.6 MB PNG) | 76% of a 0.4 MB payload |
| Triangles | 39,318 (40,000 is the floor) | **3,864** |
| Cost | $0.525 | ~$0.02 + bridge |

**Shipped settings:** `texture_size: "512"`, `mesh_simplify: 0.98`.

Three things this settles that the vendor docs do not state:

1. **TRELLIS publishes no latency figure anywhere.** 16.3s is measured, not documented.
2. **`mesh_simplify` direction.** fal documents it only as "Mesh simplification factor".
   Higher means FEWER triangles: 0.95 → 9,192, 0.98 → 3,864. Do not raise it to "improve quality".
3. **`texture_size` is the parameter that mattered.** Hunyuan's sketch endpoint has no equivalent,
   and at `face_count: 40000` texture was 93% of the payload — so `face_count`, the knob that
   exists and costs $0.15 extra, was only ever addressing the other 7%.

Note `texture_size` is a **string** in `@fal-ai/client`'s types (`"512" | "1024" | "2048"`). The
bench script passes the number and the endpoint honoured it, so the API coerces; the typed client
does not.

### Why it is a separate mode and not a replacement

TRELLIS cannot read line art; it needs the bridge stage. On the spike's sketch the bridge was
excellent — pose, scarf, whiskers, paw pads and expression all survived, gaining colour and
shading. **But that sketch was clean, confident line art, not a child's drawing.** ControlNet
canny had strong unambiguous edges to lock onto; a wobbly figure with gaps and overlapping
strokes is a materially harder input, and that is the case that actually matters at a booth.
Keeping `"mesh"` preserves both a fallback and an on-the-day A/B.

**The open question this mode carries:** re-run `scripts/bench-trellis.mjs` with `SKETCH_URL`
pointed at two or three genuine children's drawings before trusting it as the default. ~$0.06
per run, and `IMAGE_URL` skips stages already paid for.

### Prompt

`STYLE_SUFFIX_FAST` steers the **SDXL bridge, not TRELLIS** — TRELLIS accepts no prompt. It asks
for *photorealistic product photo, plain background, soft studio lighting*, deliberately unlike
the mesh suffix's flat matte toy language: the bridge's job is to supply the tonal and depth cues
reconstruction needs, which a matte toy render withholds. It is the only validated suffix in
`prompt.ts`. A test pins it as distinct from the mesh one.
