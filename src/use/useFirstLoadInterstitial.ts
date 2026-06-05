// First-load interstitial orchestrator. Portal QA on GameDistribution +
// GameMonetize + GamePix requires an interstitial right after the game
// finishes loading ("show ads the first time after the game loads"). The
// fire is gated on TWO signals so it lands cleanly:
//
//   • Splash gone — flipped from `FLogoProgress` when the logo unmounts.
//     Without this, a fast SDK init would race the splash and the ad
//     would cover the loading screen.
//   • SDK reports a fillable interstitial — `isInterstitialReady` from
//     `useAds`. Avoids pausing the game just to hit a no-fill, and gives
//     a slow SDK init room to finish.
//
// Fires once per session. Other platform builds never call `arm()` so the
// module is inert (and the watcher is never installed).
import { watch } from 'vue'
import { isInterstitialReady, showMidgameAd } from '@/use/useAds'

let armed = false
let splashGone = false
let fired = false

const tryFire = (): void => {
  if (!armed || !splashGone || fired) return
  if (!isInterstitialReady.value) return
  fired = true
  showMidgameAd().catch((e) => console.warn('[first-load-ad] failed', e))
}

/** Install the SDK-readiness watcher. Idempotent — safe to call from
 *  multiple component setups. Only call on builds that actually need
 *  a first-load interstitial. */
export const armFirstLoadInterstitial = (): void => {
  if (armed) return
  armed = true
  watch(isInterstitialReady, () => tryFire(), { immediate: true })
}

/** Mark the splash as gone. Triggers the fire if the SDK is already
 *  ready; otherwise the watcher set up in `arm()` catches the next
 *  flip. */
export const notifySplashGone = (): void => {
  if (splashGone) return
  splashGone = true
  tryFire()
}
