// ─── GameDistributionProvider no-op stub (non-GD builds only) ───────────────
// See `CrazyGamesProvider.stub.ts` for rationale.
import { ref } from 'vue'
import type { AdProvider } from './types'

const inertRef = ref(false)

export const createGameDistributionProvider = (): AdProvider => ({
  name: '',
  isReady: inertRef,
  isRewardedReady: inertRef,
  isInterstitialReady: inertRef,
  isAdsBlocked: inertRef,
  init: async () => {},
  showRewardedAd: async () => false,
  showMidgameAd: async () => {}
})
