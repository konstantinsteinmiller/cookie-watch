// Yandex Games ad provider — wraps the lazy-loaded `yandexPlugin` in the
// cross-platform `AdProvider` surface consumed by `useAds`.
//
// Static imports (not dynamic) — if this project runs
// `vite-plugin-javascript-obfuscator`, its `stringArray` transform rewrites
// literal '@/...' specifiers inside dynamic imports so the browser throws
// "Failed to resolve module specifier" at runtime. Static is detected by
// Rollup before the obfuscator runs, and tree-shaking eliminates the plugin
// code in non-Yandex builds (the `resolveAdProvider` arm gates on
// `import.meta.env.VITE_APP_YANDEX === 'true'`, a static literal that Vite
// substitutes to 'false' on every other build). Same rationale as the
// GameMonetize / Playgama providers.
//
// NOTE: no `ownsAdBlockUi` here — Yandex relies on the shared in-game
// `AdsBlockedModal` (only CrazyGames owns its own ad-block popup). Combined
// with `isYandexAdsBlocked`, a failed rewarded tap surfaces that modal.
//
// Readiness model: Yandex has no documented preload / fill signal for either
// format. Once `YaGames.init()` resolves the SDK is "ready to show" — the
// actual fill / no-fill decision happens inside `showFullscreenAdv` /
// `showRewardedVideo`. So `isRewardedReady` / `isInterstitialReady` simply
// mirror `isYandexSdkActive`. The SDK's server-side frequency cap means a
// rapid second tap will resolve `wasShown: false` without bothering the user;
// we don't need a client-side cooldown.

import { computed } from 'vue'
import {
  yandexPlugin,
  isYandexSdkActive,
  isYandexAdsBlocked,
  showMidgameAdYA,
  showRewardedAdYA
} from '@/utils/yandexPlugin'
import type { AdProvider } from './types'

export const createYandexProvider = (): AdProvider => {
  const isReady = computed(() => isYandexSdkActive.value)
  return {
    name: 'yandex',
    isReady,
    isRewardedReady: isReady,
    isInterstitialReady: isReady,
    isAdsBlocked: isYandexAdsBlocked,
    // Mute audio only when the interstitial truly opens (see `showMidgameAdYA`
    // → onOpen). Yandex reports a no-fill by flashing the ad container open +
    // closed; deferring the mute to the real onOpen keeps a no-fill from
    // cutting the win/lose result stinger.
    managesMidgameAudio: true,
    init: async () => {
      try {
        await yandexPlugin()
      } catch (e) {
        console.warn('[ads/yandex] plugin init failed', e)
      }
    },
    showRewardedAd: () => showRewardedAdYA(),
    showMidgameAd: (onImpression) => showMidgameAdYA(onImpression)
  }
}
