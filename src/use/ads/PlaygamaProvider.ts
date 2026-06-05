// Playgama ad provider — wraps the lazy-loaded `playgamaPlugin` in the
// cross-platform `AdProvider` surface consumed by `useAds`.
//
// Mirrors `GameDistributionProvider`: dynamic-imports the plugin so the
// ~280 LOC bridge module only ships on Playgama builds; the file itself
// is excluded from the obfuscator's stringArray transform (see
// `vite.config.ts`) so the `await import('@/...')` literal survives.

import { ref, watch } from 'vue'
import type { AdProvider } from './types'

export const createPlaygamaProvider = (): AdProvider => {
  const isReady = ref(false)
  const isAdsBlocked = ref(false)

  let pluginPromise: Promise<typeof import('@/utils/playgamaPlugin')> | null = null
  const loadPlugin = (): Promise<typeof import('@/utils/playgamaPlugin')> => {
    if (!pluginPromise) pluginPromise = import('@/utils/playgamaPlugin')
    return pluginPromise
  }

  return {
    name: 'playgama',
    isReady,
    // The Playgama bridge has no per-format readiness query — mirror the
    // coarse gate. Show calls handle no-fill via the closed/failed edges.
    isRewardedReady: isReady,
    isInterstitialReady: isReady,
    isAdsBlocked,
    init: async () => {
      try {
        const m = await loadPlugin()
        await m.playgamaPlugin()
        watch(m.isPlaygamaSdkActive, (v) => {
          isReady.value = v
        }, { immediate: true })
        watch(m.isPlaygamaAdsBlocked, (v) => {
          isAdsBlocked.value = v
        }, { immediate: true })
      } catch (e) {
        console.warn('[ads/playgama] plugin init failed', e)
      }
    },
    showRewardedAd: async () => {
      const m = await loadPlugin()
      return m.showRewardedPG()
    },
    showMidgameAd: async () => {
      const m = await loadPlugin()
      return m.showInterstitialPG()
    }
  }
}
