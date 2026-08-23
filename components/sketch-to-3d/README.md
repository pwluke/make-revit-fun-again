# sketch-to-3d

Draw on an overlay canvas inside the 3D world; ~2 minutes later the drawing appears in
the scene as a stylized 3D model.

Design rationale and measured API figures: `docs/specs/2026-08-22-sketch-to-3d-design.md`.

## Layout

```
core/    zero React, zero three.js — pure TS
ui/      React + DOM only, never imports three
r3f/     the ONLY renderer-specific code
SketchToWorld.tsx   DOM-side container: key binding, submit, store updates
```

Dependencies point strictly inward. **Porting to a different three.js scene means
replacing `r3f/` and nothing else.**

## Porting recipe

Implement `SceneBridge` (see `core/types.ts`) against your scene:

```ts
interface SceneBridge {
  getSpawnTransform(): SpawnTransform;   // where the next creation appears
  onModelReady(creation: Creation): void;
  setInputEnabled(enabled: boolean): void;
}
```

Then register it: `creationStore.getState().registerBridge(myBridge)`.

The block never calls your scene — your scene registers a bridge and the block calls back
through it. Consequences worth knowing before you change anything:

- **`setInputEnabled` is the portable answer to camera controls.** R3F calls
  `controls.unlock()`/`lock()`; OrbitControls would set `controls.enabled`. The overlay
  stays ignorant of which.
- **The bridge object's identity must stay stable.** It is registered once in an effect.
  If you rebuild it every render, either the effect re-runs constantly or it registers a
  stale closure — the latter silently makes `setInputEnabled` a no-op. `useR3FSceneBridge`
  holds `useMemo(..., [])` plus refs for exactly this reason.
- **The store holds the bridge** because R3F uses a separate reconciler, so React context
  does not cross the `<Canvas>` boundary. The DOM overlay and the in-Canvas bridge have no
  shared provider — they share this store instead.

## Things that will bite you

- **Generation takes ~130 seconds**, not the ~60s fal's docs claim. The ghost placeholder
  is load-bearing, not decoration: it is what makes the wait tolerable.
- **Spawn position is captured at submit time**, never on arrival. The user will have
  walked away during those two minutes.
- **`enable_pbr: false` is coupled to the viewer's material override** by intent, not by
  code. If `r3f/Creations.tsx` ever stops overriding materials, revisit `core/falClient.ts`.
- **Materials and textures are cloned per creation; geometry is not.** drei's `useGLTF`
  caches by URL and `Object3D.clone()` copies materials *by reference*, so mutating them
  would leak into every other user of that URL. That is also why disposal touches only
  materials and maps.
- **`<PointerLockControls>` needs `selector="#game-surface"`.** Without a selector drei
  attaches a document-level click listener that re-locks the pointer — including on clicks
  inside the drawing overlay.

## Running it

```bash
npm run dev            # press E in the world to draw
NEXT_PUBLIC_USE_MOCK=1 npm run dev   # offline, no API spend
```

`NEXT_PUBLIC_USE_MOCK=1` returns `/axe.glb` after a fake delay. Use it for UI work — every
real generation costs **$0.525** — and as the fallback when venue wifi dies.

Requires `FAL_KEY` in `.env.local`. It is read server-side only, by `app/api/fal/proxy/route.ts`.

## Smoke checklist

1. Press **E** → overlay fades to white, cursor appears, movement stops.
2. Draw, type what it is, **Make it real** → overlay closes, ghost appears ahead of you.
3. Walk around during the wait; the ghost stays where you were standing when you submitted.
4. Model replaces the ghost, faceted and roughly 2 units tall.
5. **Escape** mid-draw → overlay closes cleanly and does not desync.
6. Submit with an empty canvas or empty text → refused, no spend.
7. `NEXT_PUBLIC_USE_MOCK=1` → whole flow works with no network.

## Checks

```bash
npm test                    # prompt + store transitions
npm run check:portability   # core/ and ui/ must not import three
```
