// Fallback provider for builds without an ad backend (plain web, itch,
// wavedash, glitch, desktop electron, etc.). Every call is inert and
// every readiness ref stays false, which hides ad UI via the v-if gates
// on the ad placements.
import { ref } from 'vue'
import type { AdProvider } from './types'

export const createNoopProvider = (): AdProvider => {
  const off = ref(false)
  return {
    name: 'noop',
    isReady: off,
    isRewardedReady: off,
    isInterstitialReady: off,
    // No backend → no blocker concept. Always false so the modal never
    // appears in non-ad builds.
    isAdsBlocked: off,
    init: async () => {
    },
    showRewardedAd: async () => false,
    showMidgameAd: async () => {
    }
  }
}
