// Integration test: useAds composes the rewarded-ad throttle so all three
// reward placements (RouletteWheel respin, AdRewardButton, 2x speed boost)
// hide once the player burns their watch budget — without per-component
// changes.
//
// We mock `resolveAdProvider` so `useAds` resolves to a controllable
// stub provider; that lets us assert that `showRewardedAd` short-circuits
// (no SDK call) when the throttle is engaged, even though the provider
// would otherwise be willing to play.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

const mockProvider = {
  name: 'mock',
  isReady: ref(true),
  isRewardedReady: ref(true),
  isInterstitialReady: ref(true),
  isAdsBlocked: ref(false),
  init: vi.fn(async () => {
  }),
  showRewardedAd: vi.fn(async () => true),
  showMidgameAd: vi.fn(async () => {
  })
}

vi.mock('@/platforms/resolveAdProvider', () => ({
  resolveAdProvider: () => mockProvider
}))

const importAds = async () => {
  vi.resetModules()
  // Reset spy call counts and the provider readiness defaults between
  // tests so each `await import` starts from a clean slate.
  mockProvider.isRewardedReady.value = true
  mockProvider.isAdsBlocked.value = false
  mockProvider.showRewardedAd.mockClear()
  mockProvider.showRewardedAd.mockResolvedValue(true)
  return await import('@/use/useAds')
}

describe('useAds + rewarded throttle', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.localStorage.clear()
  })

  it('isRewardedReady is true when provider is ready and throttle is open', async () => {
    const ads = await importAds()
    expect(ads.isRewardedReady.value).toBe(true)
  })

  it('isRewardedReady flips false once the throttle closes', async () => {
    const ads = await importAds()
    const throttle = await import('@/use/useRewardedThrottle')
    for (let i = 0; i < throttle.MAX_REWARDED; i++) {
      throttle.recordRewardedGranted()
    }
    expect(throttle.isRewardedThrottled.value).toBe(true)
    expect(ads.isRewardedReady.value).toBe(false)
  })

  it('showRewardedAd records a grant on success', async () => {
    const ads = await importAds()
    const throttle = await import('@/use/useRewardedThrottle')
    expect(throttle.isRewardedThrottled.value).toBe(false)

    for (let i = 0; i < throttle.MAX_REWARDED; i++) {
      const ok = await ads.showRewardedAd()
      expect(ok).toBe(true)
    }
    expect(throttle.isRewardedThrottled.value).toBe(true)
    expect(ads.isRewardedReady.value).toBe(false)
  })

  it('showRewardedAd refuses (returns false) without invoking provider when throttled', async () => {
    const ads = await importAds()
    const throttle = await import('@/use/useRewardedThrottle')
    for (let i = 0; i < throttle.MAX_REWARDED; i++) {
      throttle.recordRewardedGranted()
    }
    mockProvider.showRewardedAd.mockClear()

    const ok = await ads.showRewardedAd()
    expect(ok).toBe(false)
    expect(mockProvider.showRewardedAd).not.toHaveBeenCalled()
  })

  it('does NOT record a grant when the provider returned false', async () => {
    const ads = await importAds()
    const throttle = await import('@/use/useRewardedThrottle')
    mockProvider.showRewardedAd.mockResolvedValue(false)

    await ads.showRewardedAd()
    await ads.showRewardedAd()
    await ads.showRewardedAd()
    expect(throttle.isRewardedThrottled.value).toBe(false)
  })
})
