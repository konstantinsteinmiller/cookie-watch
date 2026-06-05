// Fill-gating tests for the GameMonetize plugin.
//
// The watch-ad button must only appear when a rewarded ad is ACTUALLY loaded —
// not merely when the SDK is "initialised". These tests pin the two driving
// mechanisms:
//
//   1. Preload-backed fill — `preloadRewardedGM()` flips `isGmRewardedFilled`
//      true on a resolved `preloadAd('rewarded')` and false on a reject
//      (scheduling a backoff retry).
//   2. Preload-ABSENT fallback — the thin HTML5 build (only `showBanner`) has no
//      forward fill signal, so fill is best-effort = `sdkActive && !cooldown`.
//   3. Cooldown — showing a rewarded ad clears fill (double-fire guard) and,
//      once the ad has played, starts the min-gap cooldown; fill re-arms only
//      after the gap. A pure no-fill skips the full cooldown and re-preloads soon.
//
// We mock the plugin's heavy static deps so importing it stays focused, and
// drive `window.sdk` directly. Fake timers let us step the cooldown / backoff.
// Init wires `window.SDK_OPTIONS.onEvent` (the SDK's single event callback),
// which we drive to deliver SDK_READY and the rewarded ad lifecycle events.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Keep the import graph tiny + deterministic — the plugin statically imports
// these and we only exercise the rewarded-fill logic, which doesn't need them.
vi.mock('@/use/useUser', () => ({ isGameMonetize: true }))
vi.mock('@/use/useMatch', () => {
  const { ref } = require('vue')
  return { isDebug: ref(false) }
})
vi.mock('@/use/useGamePause', () => {
  const { ref } = require('vue')
  return { isAdShowing: ref(false), pauseGame: vi.fn(), resumeGame: vi.fn() }
})
vi.mock('@/utils/save/GameMonetizeStrategy', () => ({
  GameMonetizeStrategy: class {}
}))

const loadPlugin = async () => {
  vi.resetModules()
  return await import('@/utils/gameMonetizePlugin')
}

// Flush microtasks so a resolved/rejected preload promise settles before we
// assert on the ref it drives.
const flush = async () => { await Promise.resolve(); await Promise.resolve() }

// Deliver an SDK event through the single onEvent callback the plugin installs
// on window.SDK_OPTIONS during init — exactly how the live SDK fans events out.
const emit = (name: string): void => {
  const onEvent = (window as any).SDK_OPTIONS?.onEvent
  if (typeof onEvent === 'function') onEvent({ name })
}

// Run init with a given sdk shape already on window, then fire SDK_READY so init
// resolves. Init's tail `preloadRewardedGM()` runs against the same sdk.
const initWith = async (sdkShape: any) => {
  const plugin = await loadPlugin()
  ;(window as any).sdk = sdkShape
  const ready = plugin.gameMonetizePlugin()
  emit('SDK_READY')
  await ready
  await flush()
  return plugin
}

describe('gameMonetize rewarded fill gating', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // VITE_GAME_ID gate inside init — give it any non-empty value.
    vi.stubEnv('VITE_GAME_ID', 'test-game')
    delete (window as any).sdk
    delete (window as any).gamemonetize
    delete (window as any).SDK_OPTIONS
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllEnvs()
    delete (window as any).sdk
    delete (window as any).gamemonetize
    delete (window as any).SDK_OPTIONS
  })

  it('fill is false before any preload', async () => {
    const plugin = await loadPlugin()
    expect(plugin.isGmRewardedFilled.value).toBe(false)
  })

  it('preload-supported: resolved preloadAd flips fill true', async () => {
    const plugin = await loadPlugin()
    ;(window as any).sdk = { preloadAd: vi.fn(() => Promise.resolve()) }

    plugin.preloadRewardedGM()
    await flush()

    expect((window as any).sdk.preloadAd).toHaveBeenCalledWith('rewarded')
    expect(plugin.isGmRewardedFilled.value).toBe(true)
  })

  it('preload-supported: rejected preloadAd keeps fill false and retries after backoff', async () => {
    const plugin = await loadPlugin()
    const preloadAd = vi
      .fn()
      .mockReturnValueOnce(Promise.reject(new Error('no-fill')))
      .mockReturnValueOnce(Promise.resolve())
    ;(window as any).sdk = { preloadAd }

    plugin.preloadRewardedGM()
    await flush()
    expect(plugin.isGmRewardedFilled.value).toBe(false)
    expect(preloadAd).toHaveBeenCalledTimes(1)

    // After the backoff one retry preload fires.
    await vi.advanceTimersByTimeAsync(15_000)
    await flush()
    expect(preloadAd).toHaveBeenCalledTimes(2)
    expect(plugin.isGmRewardedFilled.value).toBe(true)
  })

  it('preload-ABSENT: fill is best-effort = sdkActive && !cooldown', async () => {
    const plugin = await loadPlugin()
    // Thin HTML5 build — only showBanner, no preloadAd.
    ;(window as any).sdk = { showBanner: vi.fn() }
    plugin.isGmSdkActive.value = true

    plugin.preloadRewardedGM()
    await flush()
    expect(plugin.isGmRewardedFilled.value).toBe(true)
  })

  it('showRewardedAd clears fill immediately (double-fire guard)', async () => {
    const plugin = await initWith({ preloadAd: vi.fn(() => Promise.resolve()), showBanner: vi.fn() })
    expect(plugin.isGmRewardedFilled.value).toBe(true)

    // Kick off a show — fill must drop synchronously so a second tap can't fire.
    void plugin.showRewardedAdGM()
    expect(plugin.isGmRewardedFilled.value).toBe(false)
  })

  it('an ad that played starts the cooldown and re-arms fill only after the gap', async () => {
    let preloadCalls = 0
    const preloadAd = vi.fn(() => { preloadCalls++; return Promise.resolve() })
    const plugin = await initWith({ preloadAd, showBanner: vi.fn() })
    expect(plugin.isGmRewardedFilled.value).toBe(true)
    expect(preloadCalls).toBe(1) // init's initial preload

    const adP = plugin.showRewardedAdGM()
    expect(plugin.isGmRewardedFilled.value).toBe(false)

    // Drive the lifecycle: pause (ad started) → complete → resume (= done).
    emit('SDK_GAME_PAUSE')
    emit('ALL_ADS_COMPLETED')
    emit('SDK_GAME_START')

    const granted = await adP
    expect(granted).toBe(true)

    // Cooldown engaged → fill stays false, interstitial gate (cooling down) on.
    expect(plugin.isGmAdCoolingDown.value).toBe(true)
    expect(plugin.isGmRewardedFilled.value).toBe(false)

    // After the 120s min-gap (REWARDED_MIN_GAP_MS) the cooldown clears and a
    // fresh preload re-arms fill.
    await vi.advanceTimersByTimeAsync(120_000)
    await flush()
    expect(plugin.isGmAdCoolingDown.value).toBe(false)
    expect(plugin.isGmRewardedFilled.value).toBe(true)
    expect(preloadCalls).toBe(2) // initial preload + post-cooldown re-preload
  })

  it('a pure no-fill (no ad started) re-preloads soon WITHOUT a full cooldown', async () => {
    const preloadAd = vi.fn(() => Promise.resolve())
    const plugin = await initWith({ preloadAd, showBanner: vi.fn() })
    preloadAd.mockClear()

    const adP = plugin.showRewardedAdGM()
    // No SDK_GAME_PAUSE → after NO_FILL_MS the show resolves false (no fill).
    await vi.advanceTimersByTimeAsync(3_000)
    const granted = await adP
    expect(granted).toBe(false)

    // No full cooldown for a pure no-fill.
    expect(plugin.isGmAdCoolingDown.value).toBe(false)

    // A short backoff retry re-preloads (recovers a momentary empty slot).
    await vi.advanceTimersByTimeAsync(15_000)
    await flush()
    expect(preloadAd).toHaveBeenCalledTimes(1)
    expect(plugin.isGmRewardedFilled.value).toBe(true)
  })

  it('an INTERSTITIAL that played trips the shared cooldown → rewarded fill hides', async () => {
    // Regression: the SDK's frequency cap is global across ad types, so a
    // midgame interstitial must hide the watch-ad buttons too. Previously the
    // cooldown only fired on rewarded ads, so buttons stayed visible right
    // after an interstitial and the next tap got "requested too soon".
    const preloadAd = vi.fn(() => Promise.resolve())
    const plugin = await initWith({ preloadAd, showBanner: vi.fn() })
    expect(plugin.isGmRewardedFilled.value).toBe(true)

    const adP = plugin.showMidgameAdGM()
    // Interstitial lifecycle: pause (ad started) → resume (= done).
    emit('SDK_GAME_PAUSE')
    emit('SDK_GAME_START')
    await adP

    // Shared cooldown engaged → rewarded fill forced false even though
    // preloadAd would resolve.
    expect(plugin.isGmAdCoolingDown.value).toBe(true)
    expect(plugin.isGmRewardedFilled.value).toBe(false)
  })

  it('a completed ad (ALL_ADS_COMPLETED, no show wrapper) arms the cooldown', async () => {
    // Regression: an ad can finish WITHOUT our per-call show promise observing it —
    // the first-load interstitial's NO_FILL_MS short-circuit settles before the
    // (consent-wall-delayed) ad plays, and a portal pre-roll never goes through a
    // wrapper at all. The SDK still consumes its global frequency cap, so the
    // page-lifetime ALL_ADS_COMPLETED (the IMA "ad reached its end" terminal
    // event) must arm OUR cooldown; otherwise the rewarded button stays visible
    // inside the cap window and the next tap gets "requested too soon".
    const preloadAd = vi.fn(() => Promise.resolve())
    const plugin = await initWith({ preloadAd, showBanner: vi.fn() })
    expect(plugin.isGmRewardedFilled.value).toBe(true)

    // A real ad finished — no showRewardedAdGM / showMidgameAdGM call involved.
    emit('ALL_ADS_COMPLETED')

    expect(plugin.isGmAdCoolingDown.value).toBe(true)
    expect(plugin.isGmRewardedFilled.value).toBe(false)
  })

  it('a non-ad pause/resume cycle (consent wall, visibility) does NOT arm the cooldown', async () => {
    // Regression guard: in the iframe test env SDK_GAME_PAUSE → SDK_GAME_START
    // ALSO fires for the boot TCF consent wall and visibility/focus changes — NOT
    // just ads. Arming the cooldown off that pair cooled the SDK down before any
    // ad played and suppressed EVERY ad for the session. Only ALL_ADS_COMPLETED
    // (a genuine ad completion) may arm it, so a bare pause/resume must leave both
    // the first-load interstitial gate and the rewarded button available.
    const preloadAd = vi.fn(() => Promise.resolve())
    const plugin = await initWith({ preloadAd, showBanner: vi.fn() })
    expect(plugin.isGmRewardedFilled.value).toBe(true)

    emit('SDK_GAME_PAUSE')
    emit('SDK_GAME_START')

    expect(plugin.isGmAdCoolingDown.value).toBe(false)
    expect(plugin.isGmRewardedFilled.value).toBe(true)
  })

  it('a "too soon" SDK message arms the cooldown (frequency-cap self-correction)', async () => {
    const preloadAd = vi.fn(() => Promise.resolve())
    const plugin = await initWith({ preloadAd, showBanner: vi.fn() })
    expect(plugin.isGmRewardedFilled.value).toBe(true)

    // The SDK rejects a show requested too soon after the previous ad finished.
    ;(window as any).SDK_OPTIONS.onEvent({
      name: 'SDK_SHOW_BANNER',
      message: 'The advertisement was requested too soon after the previous advertisement was finished.'
    })

    expect(plugin.isGmAdCoolingDown.value).toBe(true)
    expect(plugin.isGmRewardedFilled.value).toBe(false)
  })
})
