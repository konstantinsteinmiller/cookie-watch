// ─── CrazyGamesProvider no-op stub (non-CrazyGames builds only) ─────────────
//
// Replaces `CrazyGamesProvider.ts` on builds that don't target CrazyGames
// via a `resolve.alias` in `vite.config.ts`. The real provider's
// `createCrazyGamesProvider` is statically imported by `resolveAdProvider`,
// so even though `createCrazyGamesProvider()` is never CALLED on non-CG
// builds (the env-gated arm in `resolveAdProvider` is statically dead),
// the function's literal string `name: 'crazygames'` would otherwise end
// up in the bundle as a non-Yandex identifier — which Yandex's moderator
// flags as "Service storage URL detected".
//
// The stub provider has no platform-identifier literal and is never
// returned by `resolveAdProvider` at runtime, so this no-op object never
// reaches any consumer.

import { ref } from 'vue'
import type { AdProvider } from './types'

const inertRef = ref(false)

export const createCrazyGamesProvider = (): AdProvider => ({
  name: '',
  isReady: inertRef,
  isRewardedReady: inertRef,
  isInterstitialReady: inertRef,
  isAdsBlocked: inertRef,
  init: async () => {},
  showRewardedAd: async () => false,
  showMidgameAd: async () => {}
})
