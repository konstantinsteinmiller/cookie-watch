// ─── GamePix platform module ────────────────────────────────────────────────
//
// Shell that colocates the GamePix-specific exports under a single barrel.
// Heavy implementations stay where they live (`@/utils/gamepixPlugin`,
// `@/utils/save/GamePixStrategy`, `@/use/ads/GamepixProvider`) — this
// module is just a stable re-export surface plus the platform-module
// descriptor the registry enumerates.

export type { PlatformModule } from '../types'

export { GamePixStrategy } from '@/utils/save/GamePixStrategy'

export {
  gamepixPlugin,
  initGamepix,
  showRewardedAdGP,
  showMidgameAdGP,
  showRewardedGP,
  showInterstitialGP,
  gamePixGameLoadingStart,
  gamePixGameLoadingStop,
  gamePixUpdateScore,
  gamePixUpdateLevel,
  gamePixHappyMoment,
  isGamepixSdkActive,
  isGamePixSdkActive,
  isGamepixAdsBlocked,
  isGamePixAdsBlocked,
  isGamePixPlayerReady,
  gamePixLocale
} from '@/utils/gamepixPlugin'

export { createGamepixProvider } from '@/use/ads/GamepixProvider'

export const platform = {
  id: 'gamepix' as const,
  envFlag: 'GAMEPIX',
  capabilities: {
    // `sdk.localStorage` IS portal-side cross-device storage when the
    // player is signed into the GamePix portal. Outside that context
    // (localhost, dev tool, anonymous portal session) it silently
    // no-ops; the strategy's readback canary detects that case and
    // logs a one-shot warning.
    hasCloudSave: true,
    hasAds: true,
    hostnameMatcher: 'gamepix.com',
    portalEnforcesAgeGate: false,
    childDirectedAdSignal: false,
    needsParentOriginCheck: true
  }
}
