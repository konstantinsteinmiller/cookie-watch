// ─── GamepixProvider no-op stub (non-GamePix builds only) ───────────────────
// See `CrazyGamesProvider.stub.ts` for rationale.
import { ref } from 'vue'
import type { AdProvider } from './types'

const inertRef = ref(false)

export const createGamepixProvider = (): AdProvider => ({
  name: '',
  isReady: inertRef,
  isRewardedReady: inertRef,
  isInterstitialReady: inertRef,
  isAdsBlocked: inertRef,
  init: async () => {},
  showRewardedAd: async () => false,
  showMidgameAd: async () => {}
})
