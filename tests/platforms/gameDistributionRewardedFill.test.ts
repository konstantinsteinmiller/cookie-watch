// Unit tests for the GameDistribution preload-backed rewarded FILL signal.
//
// The fix under test: the rewarded watch-ad button must only appear when the
// SDK actually has ad fill, not merely when it's "initialised". Fill is driven
// by `gdsdk.preloadAd('rewarded')` — that Promise resolves on a cached ad and
// rejects on no-fill. We mock `window.gdsdk.preloadAd` and assert
// `isGdRewardedFilled` (and the cooldown ref) transition correctly across the
// preload → no-fill-retry → show → cooldown → refill cycle.
//
// The plugin reads `gdsdk ?? window.gdsdk` on every call, so stubbing
// `window.gdsdk` is enough to exercise the fill logic without running the full
// SDK-injecting `gameDistributionPlugin()` init (which early-returns off-GD).
//
// Module is reloaded per test (`vi.resetModules`) so the module-level refs and
// timers don't leak across cases.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type PluginModule = typeof import('@/utils/gameDistributionPlugin')

const importPlugin = async (): Promise<PluginModule> => {
  vi.resetModules()
  return await import('@/utils/gameDistributionPlugin')
}

// Install a fake gdsdk whose preloadAd / showAd resolve or reject on demand.
const installSdk = (opts: {
  preload: () => Promise<unknown>
  showResolves?: boolean
}) => {
  const showAd = vi.fn(() =>
    opts.showResolves === false ? Promise.reject(new Error('no-fill')) : Promise.resolve()
  )
  const preloadAd = vi.fn((_kind: string) => opts.preload())
  ;(window as any).gdsdk = { preloadAd, showAd }
  return { showAd, preloadAd }
}

describe('GameDistribution rewarded fill signal', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    delete (window as any).gdsdk
  })

  it('starts NOT filled before any preload', async () => {
    const m = await importPlugin()
    expect(m.isGdRewardedFilled.value).toBe(false)
    expect(m.isGdAdCoolingDown.value).toBe(false)
  })

  it('sets filled=true when preloadAd resolves (fill available)', async () => {
    const m = await importPlugin()
    installSdk({ preload: () => Promise.resolve() })
    m.preloadRewardedGD()
    await vi.runOnlyPendingTimersAsync()
    expect(m.isGdRewardedFilled.value).toBe(true)
  })

  it('keeps filled=false when preloadAd rejects (no-fill) and schedules ONE retry', async () => {
    const m = await importPlugin()
    // First probe rejects (no-fill); the scheduled retry resolves.
    let call = 0
    const { preloadAd } = installSdk({
      preload: () => {
        call += 1
        return call === 1 ? Promise.reject(new Error('no-fill')) : Promise.resolve()
      }
    })

    m.preloadRewardedGD()
    // Flush the rejected preload's microtask WITHOUT advancing the 15s retry
    // timer, so we observe the no-fill state before the retry runs.
    await Promise.resolve()
    await Promise.resolve()
    expect(m.isGdRewardedFilled.value).toBe(false)
    expect(preloadAd).toHaveBeenCalledTimes(1)

    // Advance past the 15s retry backoff — the retry preload fires and resolves.
    await vi.advanceTimersByTimeAsync(15_000)
    await vi.runOnlyPendingTimersAsync()
    expect(preloadAd).toHaveBeenCalledTimes(2)
    expect(m.isGdRewardedFilled.value).toBe(true)
  })

  it('drops filled=false at the START of showRewardedAdGD (double-fire guard)', async () => {
    const m = await importPlugin()
    installSdk({ preload: () => Promise.resolve(), showResolves: true })
    m.preloadRewardedGD()
    await vi.runOnlyPendingTimersAsync()
    expect(m.isGdRewardedFilled.value).toBe(true)

    // Kick off a show but don't settle it yet — the fill must already be gone.
    void m.showRewardedAdGD()
    expect(m.isGdRewardedFilled.value).toBe(false)
  })

  it('enters cooldown after an ad cycle finishes, then refills after the min-gap', async () => {
    const m = await importPlugin()
    // preload always resolves so the post-cooldown refill flips filled back on.
    installSdk({ preload: () => Promise.resolve(), showResolves: true })

    await m.showRewardedAdGD()
    // Ad cycle ran → cooldown engaged, fill consumed.
    expect(m.isGdAdCoolingDown.value).toBe(true)
    expect(m.isGdRewardedFilled.value).toBe(false)

    // Advance past the 60s min-gap — cooldown clears and the refill preload runs.
    await vi.advanceTimersByTimeAsync(60_000)
    await vi.runOnlyPendingTimersAsync()
    expect(m.isGdAdCoolingDown.value).toBe(false)
    expect(m.isGdRewardedFilled.value).toBe(true)
  })

  it('does NOT enter the full cooldown on a no-fill show error (re-probes instead)', async () => {
    const m = await importPlugin()
    installSdk({ preload: () => Promise.resolve(), showResolves: false })

    const granted = await m.showRewardedAdGD()
    expect(granted).toBe(false)
    // Error path: no ad cycle ran, so no cooldown — and the soft re-preload
    // resolves, flipping fill back true.
    expect(m.isGdAdCoolingDown.value).toBe(false)
    await vi.runOnlyPendingTimersAsync()
    expect(m.isGdRewardedFilled.value).toBe(true)
  })

  it('is a no-op (stays not-filled) when the SDK is not active', async () => {
    const m = await importPlugin()
    // no window.gdsdk installed
    m.preloadRewardedGD()
    await vi.runOnlyPendingTimersAsync()
    expect(m.isGdRewardedFilled.value).toBe(false)
  })
})
