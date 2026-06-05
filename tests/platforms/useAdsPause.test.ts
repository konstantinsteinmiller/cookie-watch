// Integration test: every ad placement on every build flows through
// `useAds.showRewardedAd` / `showMidgameAd`, which flip the unified pause
// gate (`isAdShowing`). That gate drives BOTH the render-loop early-return
// (MawScene) and the audio orchestrator (`useGamePauseAudio`). This file
// proves the audio + gate are paused for the whole ad and resumed after —
// including when the provider throws (the "cut off due to error" case
// GamePix QA called out).
//
// We mock only `resolveAdProvider` (a controllable stub provider); the gate
// + audio layer + orchestrator are the REAL modules, so `isAudioSuspended()`
// reflects the actual ref-counted suspend state.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}
const defer = <T>(): Deferred<T> => {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

const mockProvider = {
  name: 'mock-test',
  isReady: ref(true),
  isRewardedReady: ref(true),
  isInterstitialReady: ref(true),
  isAdsBlocked: ref(false),
  init: vi.fn(async () => {}),
  showRewardedAd: vi.fn(async () => true),
  showMidgameAd: vi.fn(async () => {})
}

vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => mockProvider
}))

const importAll = async () => {
  vi.resetModules()
  mockProvider.isAdsBlocked.value = false
  mockProvider.showRewardedAd.mockReset()
  mockProvider.showMidgameAd.mockReset()
  // Re-import the whole graph fresh so useAds, the gate, the audio layer and
  // the orchestrator all share one module registry (useAds installs the
  // orchestrator at import time).
  const ads = await import('@/use/useAds')
  const assets = await import('@/use/useAssets')
  const gate = await import('@/use/useGamePause')
  // The [ads]/[pause] audit lines are gated behind isDebug — enable it so the
  // log-assertion tests below see them (same fresh module instance post-reset).
  const { isDebug } = await import('@/use/useMatch')
  isDebug.value = true
  return { ads, assets, gate }
}

describe('useAds — pauses audio + gameplay around ads (all providers)', () => {
  beforeEach(() => { window.localStorage.clear() })
  afterEach(() => { window.localStorage.clear() })

  it('rewarded: suspends audio + pauses the gate while in flight, resumes after grant', async () => {
    const { ads, assets, gate } = await importAll()
    const d = defer<boolean>()
    mockProvider.showRewardedAd.mockReturnValue(d.promise)

    expect(assets.isAudioSuspended()).toBe(false)
    expect(gate.isGamePaused.value).toBe(false)

    const p = ads.showRewardedAd()
    // Synchronously — BEFORE the provider promise settles — the gate must
    // already be paused and audio suspended (no window for music under the ad).
    expect(gate.isAdShowing.value).toBe(true)
    expect(gate.isGamePaused.value).toBe(true)
    expect(assets.isAudioSuspended()).toBe(true)

    d.resolve(true)
    const granted = await p
    expect(granted).toBe(true)
    expect(gate.isAdShowing.value).toBe(false)
    expect(gate.isGamePaused.value).toBe(false)
    expect(assets.isAudioSuspended()).toBe(false)
  })

  it('rewarded: resumes audio + gameplay even when the provider THROWS (cut off by error)', async () => {
    const { ads, assets, gate } = await importAll()
    mockProvider.showRewardedAd.mockRejectedValue(new Error('sdk boom'))

    const granted = await ads.showRewardedAd()
    expect(granted).toBe(false)
    expect(gate.isAdShowing.value).toBe(false)
    expect(gate.isGamePaused.value).toBe(false)
    expect(assets.isAudioSuspended()).toBe(false)
  })

  it('interstitial: suspends while in flight and resumes after close', async () => {
    const { ads, assets, gate } = await importAll()
    const d = defer<void>()
    mockProvider.showMidgameAd.mockReturnValue(d.promise)

    const p = ads.showMidgameAd()
    expect(gate.isAdShowing.value).toBe(true)
    expect(gate.isGamePaused.value).toBe(true)
    expect(assets.isAudioSuspended()).toBe(true)

    d.resolve()
    await p
    expect(gate.isAdShowing.value).toBe(false)
    expect(assets.isAudioSuspended()).toBe(false)
  })

  it('interstitial: resumes even when the provider THROWS', async () => {
    const { ads, assets, gate } = await importAll()
    mockProvider.showMidgameAd.mockRejectedValue(new Error('sdk boom'))

    await ads.showMidgameAd()
    expect(gate.isAdShowing.value).toBe(false)
    expect(gate.isGamePaused.value).toBe(false)
    expect(assets.isAudioSuspended()).toBe(false)
  })

  it('logs structured START/END lines for the rewarded ad lifecycle', async () => {
    const { ads } = await importAll()
    mockProvider.showRewardedAd.mockResolvedValue(true)
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    await ads.showRewardedAd()
    const lines = infoSpy.mock.calls.map(c => String(c[0]))
    expect(lines.some(s => s.includes('[ads]') && s.includes('rewarded START'))).toBe(true)
    expect(lines.some(s => s.includes('[ads]') && s.includes('rewarded END'))).toBe(true)
    // The orchestrator's gate-level pause/resume lines fire too.
    expect(lines.some(s => s.includes('[pause]') && s.includes('PAUSE'))).toBe(true)
    expect(lines.some(s => s.includes('[pause]') && s.includes('RESUME'))).toBe(true)
    infoSpy.mockRestore()
  })

  it('logs an ERROR line on the cut-off path', async () => {
    const { ads } = await importAll()
    mockProvider.showMidgameAd.mockRejectedValue(new Error('sdk boom'))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await ads.showMidgameAd()
    const lines = warnSpy.mock.calls.map(c => String(c[0]))
    expect(lines.some(s => s.includes('[ads]') && s.includes('interstitial ERROR'))).toBe(true)
    warnSpy.mockRestore()
  })
})
