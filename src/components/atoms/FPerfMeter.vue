<template lang="pug">
  div(
    v-if="visible"
    class="fixed pointer-events-none select-none font-mono text-right"
    :style="positionStyle"
  )
    div(:class="['text-base leading-tight font-bold perf-shadow', fpsClass]") {{ fps }} fps
    div(v-if="trackDrawCalls" class="text-xs leading-tight text-slate-300/80 perf-shadow") {{ drawCalls }} dc
</template>

<!--
  Drop-in FPS + draw-call meter.

  Copy this single file into any Vue 3 project and mount it once near the
  top of the tree:

      <FPerfMeter />

  It renders nothing by default — flip it on at runtime with
  `localStorage.setItem('fps', 'true')` and reload. No import of a
  companion composable, no bootstrap call from `main.ts`, no settings
  file to wire up.

  ─── Props ──────────────────────────────────────────────────────────────
    enabled          boolean | null   force on/off, `null` = read localStorage
    position         'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
    offsetX          number (px)      extra inset from the corner edge
    offsetY          number (px)      extra inset (useful if a logo
                                      already sits in that corner)
    trackDrawCalls   boolean          instrument canvas 2D + show `dc`
                                      counter. When false, the canvas
                                      prototype is NOT patched at all.
    localStorageKey  string           gate key, default 'fps'
    zIndex           number

  Slot-free, pointer-events-none, safe-area insets applied — doesn't
  interfere with anything underneath.

  ─── How it works ───────────────────────────────────────────────────────
  • A single `requestAnimationFrame` loop drives the fps value from a
    rolling 60-frame timestamp window.
  • For draw calls, the 2D canvas prototype (and OffscreenCanvas
    prototype, when available) is monkey-patched so every `drawImage`,
    `fill`, `stroke`, `*Rect`, `*Text`, `putImageData` call increments a
    per-frame counter. The patch is installed once (idempotent) and
    never removed — unpatching a prototype can race with in-flight
    drawing, and at zero runtime cost it's not worth the complexity.
  • The wrapper forwards via `arguments` → `apply(this, arguments)` which
    V8 compiles to a zero-alloc thunk. `...args` spread allocates a
    fresh array per call — measurable at thousands of canvas ops / sec,
    so that form is intentionally avoided here.
-->

<script lang="ts">
// ─── Module-level state (shared across instances, survives HMR) ─────────
//
// This block runs once per module load, NOT per component instance. The
// RAF loop and canvas-prototype patch should never double-fire even if
// the component is re-mounted (route change, HMR, parent re-render with
// a different `v-if`), so we keep them up here rather than in setup().

import { ref } from 'vue'

const perfFps = ref(0)
const perfDrawCalls = ref(0)

// Incremented by the instrumented canvas methods; sampled + zeroed once
// per RAF tick. Not a ref — this is on the hot path (can tick thousands
// of times per frame) and Vue's reactivity tracking would show up.
let drawCallsCurrentFrame = 0

const FRAME_WINDOW = 60
const frameTimestamps: number[] = []

// Canvas 2D methods that actually submit GPU work. Path builders
// (`beginPath`, `moveTo`, `arc`, …) are excluded — they only mutate
// the current path and don't cost a draw.
const DRAW_METHODS = [
  'drawImage',
  'fill',
  'stroke',
  'fillRect',
  'strokeRect',
  'clearRect',
  'fillText',
  'strokeText',
  'putImageData'
] as const

let instrumented = false
let rafId: number | null = null
let loopActive = false

const onRafTick = (now: number): void => {
  perfDrawCalls.value = drawCallsCurrentFrame
  drawCallsCurrentFrame = 0

  frameTimestamps.push(now)
  if (frameTimestamps.length > FRAME_WINDOW) {
    frameTimestamps.shift()
  }
  if (frameTimestamps.length >= 2) {
    const first = frameTimestamps[0]!
    const last = frameTimestamps[frameTimestamps.length - 1]!
    const elapsed = last - first
    if (elapsed > 0) {
      perfFps.value = Math.round(((frameTimestamps.length - 1) * 1000) / elapsed)
    }
  }
}

// `function` + `arguments` forwarding — V8's "apply idiom" fast path.
// `...args` + spread would allocate a fresh array per call, which at
// thousands of canvas ops per second is real GC pressure.
const wrap = (original: Function) => {
  return function(this: unknown): unknown {
    drawCallsCurrentFrame++
    // eslint-disable-next-line prefer-rest-params
    return original.apply(this, arguments as unknown as unknown[])
  }
}

const patchProto = (proto: object): void => {
  const bag = proto as unknown as Record<string, unknown>
  for (const name of DRAW_METHODS) {
    const original = bag[name]
    if (typeof original !== 'function') continue
    bag[name] = wrap(original as Function)
  }
}

const instrumentCanvasProto = (): void => {
  if (instrumented) return
  if (typeof CanvasRenderingContext2D !== 'undefined') {
    patchProto(CanvasRenderingContext2D.prototype)
  }
  // Also cover offscreen contexts — engines that pre-render to an
  // OffscreenCanvas (static arena buffers, texture atlases, etc) would
  // otherwise produce a lower draw-call reading than reality.
  const OffCtx = (
    globalThis as {
      OffscreenCanvasRenderingContext2D?: { prototype: object }
    }
  ).OffscreenCanvasRenderingContext2D
  if (OffCtx) patchProto(OffCtx.prototype)
  instrumented = true
}

const startLoop = (withDrawTracking: boolean): void => {
  if (loopActive) return
  if (withDrawTracking) instrumentCanvasProto()
  loopActive = true
  const loop = (now: number): void => {
    onRafTick(now)
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)
}

// Exposed mostly for tests; the component never calls this directly
// because the loop stays alive for the lifetime of the tab.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _stopLoop = (): void => {
  if (rafId !== null) cancelAnimationFrame(rafId)
  rafId = null
  loopActive = false
}
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    enabled?: boolean | null
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
    offsetX?: number
    offsetY?: number
    trackDrawCalls?: boolean
    localStorageKey?: string
    zIndex?: number
  }>(),
  {
    enabled: null,
    position: 'top-right',
    offsetX: 12,
    offsetY: 12,
    trackDrawCalls: true,
    localStorageKey: 'fps',
    zIndex: 9999
  }
)

const visible = computed<boolean>(() => {
  if (props.enabled === true) return true
  if (props.enabled === false) return false
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(props.localStorageKey) === 'true'
})

// Kick off the RAF loop (and canvas patch, if requested) as soon as we
// become visible. `startLoop` is idempotent — safe to call every time
// visibility flips on; the patch is also idempotent.
watch(
  visible,
  (on) => {
    if (on) startLoop(props.trackDrawCalls)
  },
  { immediate: true }
)

const positionStyle = computed<Record<string, string | number>>(() => {
  const vertical = props.position.startsWith('top') ? 'top' : 'bottom'
  const horizontal = props.position.endsWith('right') ? 'right' : 'left'
  return {
    position: 'fixed',
    zIndex: props.zIndex,
    [vertical]: `calc(${props.offsetY}px + env(safe-area-inset-${vertical}, 0px))`,
    [horizontal]: `calc(${props.offsetX}px + env(safe-area-inset-${horizontal}, 0px))`
  }
})

const fps = perfFps
const drawCalls = perfDrawCalls

// Cheap heuristic colouring — green ≥55, amber ≥40, red below.
const fpsClass = computed(() => {
  const v = fps.value
  if (v >= 55) return 'text-emerald-400'
  if (v >= 40) return 'text-amber-400'
  return 'text-rose-500'
})

// Makes the reactive values reachable from a parent via `ref.value.fps`
// if it ever wants to sample them (e.g. to write into a benchmark log).
defineExpose({ fps, drawCalls, visible })
</script>

<style scoped lang="sass">
.perf-shadow
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85), 0 0 2px rgba(0, 0, 0, 0.6)
</style>
