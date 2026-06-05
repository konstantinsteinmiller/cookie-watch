// GamePix.com ad provider — wraps the `gamepixPlugin` in the cross-platform
// `AdProvider` surface consumed by `useAds`.
//
// Imports of the plugin are STATIC, matching the approved nexusorbiter
// integration. The previous DYNAMIC-import version (`await import(...)`) was an
// unnecessary and fragile workaround:
//   • The GamePix SDK URL is already kept out of every OTHER build by the
//     `resolve.alias` stub swap in `vite.config.ts` — on non-GamePix builds
//     both this provider AND `@/utils/gamepixPlugin` are aliased to no-op
//     stubs, so the real module (with the `integration.gamepix.com` URL) is
//     ONLY ever bundled on the GamePix build. A static import is therefore safe.
//   • The dynamic import split `gamepixPlugin` into a separately-fetched chunk.
//     In the GamePix testing toolkit / build-preview env those lazy chunks were
//     returning 403, so `loadGamepix()` could never resolve and the show call
//     silently did nothing. A static import folds the plugin into the boot
//     chunks that are already loaded.
//   • It also caused the reactivity bug patched earlier: a
//     `computed(() => gamepixModule?.isGamepixSdkActive.value)` reads through a
//     null module variable before `init()` runs, so it never tracks the real
//     ref. With a static import the ref is real from module-eval time and the
//     computed tracks it correctly — no watch-bridge needed.
//
// Tree-shaking + stub-aliasing keep this off non-GamePix bundles, so the static
// import costs nothing elsewhere.

import { computed } from 'vue'
import {
  gamepixPlugin,
  isGamepixAdsBlocked,
  isGamepixSdkActive,
  showMidgameAdGP,
  showRewardedAdGP
} from '@/utils/gamepixPlugin'
import type { AdProvider } from './types'

export const createGamepixProvider = (): AdProvider => {
  const isReady = computed(() => isGamepixSdkActive.value)
  return {
    name: 'gamepix',
    isReady,
    // GamePix v3 SDK has no per-format readiness query — mirror the coarse
    // gate. No-fill bubbles up as `{ success: false }` from the show call.
    isRewardedReady: isReady,
    isInterstitialReady: isReady,
    isAdsBlocked: computed(() => isGamepixAdsBlocked.value),
    init: async () => {
      try {
        await gamepixPlugin()
      } catch (e) {
        console.warn('[ads/gamepix] plugin init failed', e)
      }
    },
    showRewardedAd: () => showRewardedAdGP(),
    showMidgameAd: async () => {
      // Discard the boolean — the cross-provider contract is void.
      await showMidgameAdGP()
    }
  }
}
