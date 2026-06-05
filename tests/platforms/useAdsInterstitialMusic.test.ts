import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

// Wiring test: `useAds.showMidgameAd` must hard-stop the background music
// BEFORE it requests the interstitial — so music can't be heard under the ad
// even if the GamePix SDK resolves its show-promise early. We mock useSound's
// `forceStopMusic` to assert it's called, and assert the ORDER (music killed
// before the provider's ad call).

const { forceStopMusicSpy } = vi.hoisted(() => ({ forceStopMusicSpy: vi.fn() }))

vi.mock('@/use/useSound', () => ({
  forceStopMusic: forceStopMusicSpy,
  default: () => ({ playSound: vi.fn(), playLoop: vi.fn() }),
  useMusic: () => ({
    initMusic: vi.fn(), isLoaded: ref(false), isPlaying: ref(false),
    pauseMusic: vi.fn(), continueMusic: vi.fn(),
    startBattleMusic: vi.fn(), stopBattleMusic: vi.fn()
  })
}))

const mockProvider = {
  name: 'mock-gamepix',
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

beforeEach(() => {
  vi.resetModules()
  forceStopMusicSpy.mockClear()
  forceStopMusicSpy.mockImplementation(() => {})
  mockProvider.showMidgameAd.mockReset()
  mockProvider.showMidgameAd.mockResolvedValue(undefined)
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('showMidgameAd kills music before the interstitial is requested', () => {
  it('calls forceStopMusic() exactly once per interstitial', async () => {
    const ads = await import('@/use/useAds')
    await ads.showMidgameAd()
    expect(forceStopMusicSpy).toHaveBeenCalledTimes(1)
  })

  it('kills the music BEFORE the ad provider is invoked (no music-under-ad window)', async () => {
    const order: string[] = []
    forceStopMusicSpy.mockImplementation(() => order.push('forceStopMusic'))
    mockProvider.showMidgameAd.mockImplementation(async () => { order.push('provider.showMidgameAd') })

    const ads = await import('@/use/useAds')
    await ads.showMidgameAd()

    expect(order).toEqual(['forceStopMusic', 'provider.showMidgameAd'])
  })

  it('still kills the music even when the provider resolves IMMEDIATELY (GamePix early-resolve)', async () => {
    // Synchronous-resolving provider = the worst case (the gate would drop
    // before the ad visually closes). The pre-emptive kill must still happen.
    mockProvider.showMidgameAd.mockResolvedValue(undefined)
    const ads = await import('@/use/useAds')
    await ads.showMidgameAd()
    expect(forceStopMusicSpy).toHaveBeenCalledTimes(1)
  })

  it('kills in-flight one-shot SFX before the interstitial', async () => {
    const { registerOneShotSource } = await import('@/use/useAssets')
    const src = { stop: vi.fn(), addEventListener: vi.fn() }
    registerOneShotSource(src as unknown as AudioBufferSourceNode)
    const ads = await import('@/use/useAds')
    await ads.showMidgameAd()
    expect(src.stop).toHaveBeenCalledTimes(1)
  })

  it('kills in-flight one-shot SFX before a REWARDED ad too', async () => {
    const { registerOneShotSource } = await import('@/use/useAssets')
    const src = { stop: vi.fn(), addEventListener: vi.fn() }
    registerOneShotSource(src as unknown as AudioBufferSourceNode)
    const ads = await import('@/use/useAds')
    await ads.showRewardedAd()
    expect(src.stop).toHaveBeenCalledTimes(1)
  })
})
