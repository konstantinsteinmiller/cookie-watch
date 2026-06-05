// ─── GameMonetize platform module ───────────────────────────────────────────
//
// Shell that colocates the GameMonetize-specific exports under a single barrel.
// Heavy implementations stay where they live (`@/utils/gameMonetizePlugin`,
// `@/utils/save/GameMonetizeStrategy`, `@/use/ads/GameMonetizeProvider`) — this
// module is just a stable re-export surface plus the platform-module descriptor
// the registry enumerates. Mirrors the Playgama / GamePix shape.
//
// GameMonetize is an ad DISTRIBUTION network — the build is embedded across many
// partner sites (and publishers may self-host), so hostname-based site locking
// would block legitimate embeds. The capability resolver therefore renders on
// the build flag alone, with no URL gate (same posture as Playgama).
//
// The SDK (https://api.gamemonetize.com/sdk.js) has no cloud-save / player-data
// API, so persistence is local-only.

export type { PlatformModule } from '../types'

// Strategy class — local-only (no GameMonetize cloud-save API exists).
export { GameMonetizeStrategy } from '@/utils/save/GameMonetizeStrategy'

// Plugin surface (SDK init, pause/resume bridging, ad show wrappers,
// save-strategy factory).
export {
  gameMonetizePlugin,
  createGameMonetizeSaveStrategy,
  showRewardedAdGM,
  showMidgameAdGM,
  preloadRewardedGM,
  isGmSdkActive,
  isGmAdsBlocked
} from '@/utils/gameMonetizePlugin'

// AdProvider wrapper.
export { createGameMonetizeProvider } from '@/use/ads/GameMonetizeProvider'

// Platform-module descriptor for the registry.
export const platform = {
  id: 'gamemonetize' as const,
  envFlag: 'GAME_MONETIZE',
  capabilities: {
    hasCloudSave: false,             // no GameMonetize player-data API
    hasAds: true,                    // sdk.showAd / sdk.showBanner
    hostnameMatcher: 'gamemonetize', // informational only — NO site-lock applied
    portalEnforcesAgeGate: false,
    // GameMonetize aggregates traffic from many sites whose visitors include
    // under-13 players. We pass a child-directed hint to SDK_OPTIONS where the
    // SDK accepts it (harmless if ignored), mirroring GameDistribution.
    childDirectedAdSignal: true,
    needsParentOriginCheck: false    // distribution network — no URL gating
  }
}
