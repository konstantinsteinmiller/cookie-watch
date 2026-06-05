---
name: browser-optimization
description: Optimize canvas game rendering and physics for cross-browser performance, especially Firefox
---

When optimizing canvas-based game rendering:

### shadowBlur — Avoid on Firefox

Firefox software-renders canvas shadows with Gaussian blur. Every `stroke()`/`fill()` with `shadowBlur > 0`
costs 2-5x more than the same call without shadows.

- **Detection**: `const isFirefox = /firefox/i.test(navigator.userAgent)`
- **Guard all shadowBlur**: `if (!isFirefox) { ctx.shadowColor = ...; ctx.shadowBlur = ... }`
- **Alternative**: Use wider translucent strokes for glow effects, or pre-rendered gradient halos.
- **Lightning/glow VFX**: If you already render a separate "glow pass" (wider translucent stroke),
  canvas shadowBlur is redundant — remove it for ALL browsers.

### Particle/VFX Array Management

Every array that grows per-frame MUST have a hard cap:

```ts
if (particles.length >= MAX_PARTICLES) return
particles.push(newParticle)
```

Use in-place compaction instead of `.splice(i, 1)` in reverse loops:

```ts
let w = 0
for (let i = 0; i < arr.length; i++) {
  update(arr[i])
  if (arr[i].alive) arr[w++] = arr[i]
}
arr.length = w
```

Use batch `splice(0, count)` instead of repeated `.shift()` for queue pruning.

### Draw Call Batching

Each `ctx.stroke()` / `ctx.fill()` is a GPU draw call. Trail rendering with per-segment
stroke calls (unique color per point) creates hundreds of draw calls per frame.

Batch ~4 consecutive segments per `stroke()` using the midpoint's color/alpha:

```ts
const BATCH = 4
for (let i = 1; i < pts.length; i += BATCH) {
  // compute style from midpoint
  ctx.beginPath()
  ctx.moveTo(pts[i-1].x, pts[i-1].y)
  for (let j = i; j < Math.min(i + BATCH, pts.length); j++) {
    ctx.lineTo(pts[j].x, pts[j].y)
  }
  ctx.stroke()
}
```

### Per-Frame Allocation Reduction

- **Gradients**: `createRadialGradient()` allocates every call. Cache when parameters don't change.
- **Font strings**: Pre-compute `bold ${size}px Arial` at spawn time, not per-frame render.
- **`performance.now()`**: Call once per frame, pass as parameter — not per-particle/per-blade.
- **`statsFor()` caching**: Functions called per-blade in O(n^2) collision loops should be cached
  per physics tick via a Map cleared at the top of `updatePhysics()`.

### Firefox Audio Quirks

- `audio.volume` must be in `[0, 1]` — Firefox throws `DOMException` on `NaN` or out-of-range.
  Always clamp: `Math.max(0, Math.min(1, (volume ?? fallback) * ratio))`
- Wrap `playSound` calls in physics/collision hot paths with `try/catch` — sound is best-effort.
- `cloneNode()` on audio elements can throw if the source hasn't loaded yet.

### Firefox VFX Reduction

For expensive recursive VFX (lightning bolts, branching particles), reduce count and complexity
on Firefox to ~1/5 of normal output:

```ts
const boltCount = isFirefox ? 1 : 5
const segments = isFirefox ? 4 : 8
const maxDepth = isFirefox ? 1 : 3
const branchChance = isFirefox ? 0.2 : 0.55
```

### Physics Loop Safety

Wrap the physics loop body in `try/catch` so a single-frame error doesn't permanently kill
the `requestAnimationFrame` chain:

```ts
const loop = (now) => {
  try { updatePhysics() }
  catch (e) { console.error('[physics loop]', e) }
  if (running) requestAnimationFrame(loop)
}
```
