// ─── GameMonetizeProvider no-op stub (non-GameMonetize builds only) ─────────
//
// Replaces `GameMonetizeProvider.ts` on builds that don't target
// GameMonetize via a `resolve.alias` in `vite.config.ts`. Same reason as
// the CrazyGames stub — `createGameMonetizeProvider` is statically
// imported by `resolveAdProvider` so its `name: 'gamemonetize'` literal
// would otherwise end up in the bundle even though the function is never
// called on non-GM builds. Yandex's moderator flags non-Yandex identifier
// strings as "Service storage URL detected".

import { ref } from 'vue'
import type { AdProvider } from './types'

const inertRef = ref(false)

export const createGameMonetizeProvider = (): AdProvider => ({
  name: '',
  isReady: inertRef,
  isRewardedReady: inertRef,
  isInterstitialReady: inertRef,
  isAdsBlocked: inertRef,
  init: async () => {},
  showRewardedAd: async () => false,
  showMidgameAd: async () => {}
})
