// ─── Yandex Games platform module ───────────────────────────────────────────
//
// Shell that colocates the Yandex-specific exports under a single barrel.
// Heavy implementations stay where they live (`@/utils/yandexPlugin`,
// `@/utils/save/YandexStrategy`, `@/use/ads/YandexProvider`) — this module
// is just a stable re-export surface plus the platform-module descriptor
// the registry enumerates. Mirrors the GameMonetize / Playgama shape.
//
// Yandex Games is a closed portal — games run only inside the
// yandex.com/games (or yandex.ru/games / .com.tr / etc.) iframe. Yandex
// EXPLICITLY forbids runtime URL gating in their technical requirements
// ("There are no technical ways of restricting gameplay based on the URL
// where the game is open"), so the capability resolver renders on the
// build flag alone — same posture as Playgama / GameMonetize.

export type { PlatformModule } from '../types'

export { YandexStrategy } from '@/utils/save/YandexStrategy'

export {
  yandexPlugin,
  yandexLoadingReady,
  yandexGameplayStart,
  yandexGameplayStop,
  showRewardedAdYA,
  showMidgameAdYA,
  isYandexSdkActive,
  isYandexAdsBlocked,
  yandexLocale,
  getYandexPlayer,
  getYandexSdk
} from '@/utils/yandexPlugin'

export { createYandexProvider } from '@/use/ads/YandexProvider'

export const platform = {
  id: 'yandex' as const,
  envFlag: 'YANDEX',
  capabilities: {
    hasCloudSave: true,              // player.setData / getData (200 KB)
    hasAds: true,                    // ysdk.adv.showFullscreenAdv / showRewardedVideo
    hostnameMatcher: 'yandex',       // informational only — NO site-lock applied
    portalEnforcesAgeGate: false,
    childDirectedAdSignal: false,
    // Yandex Games forbids URL-based gating in their technical requirements.
    // Flag-only, like Playgama.
    needsParentOriginCheck: false
  }
}
