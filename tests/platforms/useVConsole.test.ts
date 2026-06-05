// Unit tests for the StageBadge → vConsole chord. Mocks `mobileCheck` and
// the `windowWidth` ref so `isMobilePortrait` returns true; without that,
// `registerChordTap` is intentionally a no-op (the chord only works on
// mobile portrait so accidental desktop taps don't accumulate).
//
// vConsole's actual mount is gated behind a dynamic `import('vconsole')`,
// which we don't exercise here — the tap-counter / window / threshold
// logic IS the unit under test. The mount path is verified at the
// integration level by the build smoke-test (vConsole appears in its
// own chunk).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `useUser` reads `mobileCheck()` and `windowWidth` at module load.
// Mock them BEFORE importing `useVConsole`. `vi.mock` is hoisted so
// the order in source doesn't matter for execution, but the explicit
// declaration here documents the dependency.
vi.mock('@/utils/function', async () => {
  const actual = await vi.importActual<typeof import('@/utils/function')>('@/utils/function')
  return {
    ...actual,
    mobileCheck: () => true
  }
})

// Force a portrait-friendly window width so `isMobilePortrait` resolves
// to true on import. The real value comes from `window.innerWidth`,
// which jsdom defaults to 1024 — too wide. Override before importing.
;(window as any).innerWidth = 390  // iPhone-ish width
;(window as any).innerHeight = 844

const importVConsoleModule = async () => {
  // Fresh module each test so the recentTaps array doesn't leak across
  // tests. `vi.resetModules` invalidates the import cache.
  vi.resetModules()
  return await import('@/use/useVConsole')
}

describe('useVConsole.registerChordTap', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('does NOT trigger on a single tap', async () => {
    const mod = await importVConsoleModule()
    expect(mod.registerChordTap()).toBe(false)
    expect(mod.isVConsoleVisible.value).toBe(false)
  })

  it('does NOT trigger at threshold-1 taps', async () => {
    const mod = await importVConsoleModule()
    let triggered = false
    for (let i = 0; i < mod.TAP_THRESHOLD - 1; i++) {
      vi.advanceTimersByTime(100)
      if (mod.registerChordTap()) triggered = true
    }
    expect(triggered).toBe(false)
    expect(mod.isVConsoleVisible.value).toBe(false)
  })

  it('triggers exactly at the TAP_THRESHOLD-th tap within 60s', async () => {
    const mod = await importVConsoleModule()
    let triggeredAt = -1
    for (let i = 0; i < mod.TAP_THRESHOLD + 5; i++) {
      // Advance fake time by 100ms between taps so the COALESCE_MS=60
      // dedupe doesn't drop them. Real fingers can't tap faster than
      // ~150ms apart anyway; the dedupe only catches duplicate event
      // dispatches for the SAME physical tap (pointerdown + touchstart
      // + click within ~50ms).
      vi.advanceTimersByTime(100)
      const fired = mod.registerChordTap()
      if (fired && triggeredAt < 0) triggeredAt = i + 1
    }
    expect(triggeredAt).toBe(mod.TAP_THRESHOLD)
  })

  it('coalesces three rapid event dispatches for the same physical tap as ONE count', async () => {
    const mod = await importVConsoleModule()
    // Simulate one physical tap producing pointerdown + touchstart + click
    // within ~30ms (typical browser dispatch order).
    mod.registerChordTap()
    vi.advanceTimersByTime(10)
    mod.registerChordTap()
    vi.advanceTimersByTime(20)
    mod.registerChordTap()
    expect(mod.chordTapCount.value).toBe(1)
  })

  it('exposes a chordTapCount ref that reflects the rolling-window total', async () => {
    const mod = await importVConsoleModule()
    expect(mod.chordTapCount.value).toBe(0)
    // Tap up to (threshold - 1) so vConsole hasn't mounted yet — once it
    // mounts, `isVConsoleVisible.value === true` short-circuits further
    // counting, which would mask a broken counter implementation.
    const taps = mod.TAP_THRESHOLD - 1
    for (let i = 0; i < taps; i++) {
      vi.advanceTimersByTime(100)
      mod.registerChordTap()
    }
    expect(mod.chordTapCount.value).toBe(taps)
  })

  it('respects the 60-second sliding window — taps older than 60s drop out', async () => {
    const mod = await importVConsoleModule()
    // Both batches sized to (threshold - 1) so each is individually safe,
    // but if the window logic were broken (older taps still counting),
    // the combined `2*(threshold-1)` would exceed `threshold`. This test
    // works for any threshold >= 2.
    const partial = Math.max(1, mod.TAP_THRESHOLD - 1)
    for (let i = 0; i < partial; i++) {
      vi.advanceTimersByTime(100)
      mod.registerChordTap()
    }
    // 61 seconds later, all the prior taps have aged out of the window.
    vi.advanceTimersByTime(61_000)
    // A fresh batch, also one short of threshold. Must NOT trigger
    // because the older ones don't count any more.
    let triggered = false
    for (let i = 0; i < partial; i++) {
      vi.advanceTimersByTime(100)
      if (mod.registerChordTap()) triggered = true
    }
    expect(triggered).toBe(false)
  })

  it('tap inside the window combines with prior taps to reach the threshold', async () => {
    const mod = await importVConsoleModule()
    const partial = mod.TAP_THRESHOLD - 5
    for (let i = 0; i < partial; i++) {
      vi.advanceTimersByTime(100)
      mod.registerChordTap()
    }
    // 30 seconds later (still within the 60s window) …
    vi.advanceTimersByTime(30_000)
    // … 5 more taps. Total within-window count = TAP_THRESHOLD → trigger.
    let triggered = false
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(100)
      if (mod.registerChordTap()) triggered = true
    }
    expect(triggered).toBe(true)
  })

  it('further taps after vConsole is already visible do not double-trigger', async () => {
    const mod = await importVConsoleModule()
    // Reach threshold.
    for (let i = 0; i < mod.TAP_THRESHOLD; i++) {
      vi.advanceTimersByTime(100)
      mod.registerChordTap()
    }
    // Simulate vConsole now being mounted (we can't actually mount it
    // without the real lib, but flipping the visibility flag tests the
    // guard).
    mod.isVConsoleVisible.value = true
    // Subsequent taps should be no-ops.
    expect(mod.registerChordTap()).toBe(false)
  })

  describe('isMobilePortrait gate', () => {
    afterEach(() => {
      ;(window as any).innerWidth = 390
      ;(window as any).innerHeight = 844
      vi.doUnmock('@/utils/function')
    })

    it('does NOT trigger when the viewport is landscape (width >= height)', async () => {
      // The user re-added the `isMobilePortrait` gate after the chord
      // started working reliably on iPhone via the pointer-events-auto
      // fix. The gate now uses `width < height` (replaces the old
      // hard-coded `<= 500` that broke wrapper-iframe scenarios), so
      // the chord is portrait-only.
      ;(window as any).innerWidth = 1280
      ;(window as any).innerHeight = 720
      vi.resetModules()
      vi.doMock('@/utils/function', async () => {
        const actual = await vi.importActual<typeof import('@/utils/function')>('@/utils/function')
        return { ...actual, mobileCheck: () => true }
      })
      const mod = await import('@/use/useVConsole')
      let triggered = false
      for (let i = 0; i < mod.TAP_THRESHOLD; i++) {
        vi.advanceTimersByTime(100)
        if (mod.registerChordTap()) triggered = true
      }
      expect(triggered).toBe(false)
    })

    it('triggers when the viewport is portrait, regardless of absolute width', async () => {
      // Even an iPhone-iframe-with-wider-than-default viewport works,
      // as long as height > width. This is the property that the old
      // `<= 500` gate violated and broke iPhone QA.
      ;(window as any).innerWidth = 600   // wider than the old 500 cutoff
      ;(window as any).innerHeight = 1024 // but still portrait shape
      vi.resetModules()
      vi.doMock('@/utils/function', async () => {
        const actual = await vi.importActual<typeof import('@/utils/function')>('@/utils/function')
        return { ...actual, mobileCheck: () => true }
      })
      const mod = await import('@/use/useVConsole')
      let triggered = false
      for (let i = 0; i < mod.TAP_THRESHOLD; i++) {
        vi.advanceTimersByTime(100)
        if (mod.registerChordTap()) triggered = true
      }
      expect(triggered).toBe(true)
    })
  })

  describe('isVConsoleSignaledByUrl — URL-based bypass trigger', () => {
    afterEach(() => {
      // Reset the mocked URL so other tests don't see a vconsole hint.
      window.history.replaceState(null, '', '/')
    })

    it('returns true when ?vconsole=1 is present in search', async () => {
      window.history.replaceState(null, '', '/?vconsole=1')
      const mod = await importVConsoleModule()
      expect(mod.isVConsoleSignaledByUrl()).toBe(true)
    })

    it('returns true when #vconsole is present in hash', async () => {
      window.history.replaceState(null, '', '/#vconsole')
      const mod = await importVConsoleModule()
      expect(mod.isVConsoleSignaledByUrl()).toBe(true)
    })

    it('returns false on a plain URL', async () => {
      window.history.replaceState(null, '', '/')
      const mod = await importVConsoleModule()
      expect(mod.isVConsoleSignaledByUrl()).toBe(false)
    })

    it('does NOT match a partial substring like ?vconsoleStuff=1', async () => {
      window.history.replaceState(null, '', '/?vconsoleStuff=1')
      const mod = await importVConsoleModule()
      expect(mod.isVConsoleSignaledByUrl()).toBe(false)
    })
  })
})
