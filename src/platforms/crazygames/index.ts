// ─── CrazyGames platform module ─────────────────────────────────────────────
//
// Shell that colocates everything the rest of the app touches when running
// on CrazyGames. The actual implementations still live at their original
// paths (lifting them in-place would balloon this PR); this module is a
// stable re-export surface so future code can import from
// `@/platforms/crazygames` instead of three different places.
//
// Re-exports preserve the existing dynamic-import lazy-loading patterns —
// CrazyGames composable is statically importable here, but consumers
// should still gate their import behind `isCrazyWeb` to keep tree-shaking
// honest.

export type { PlatformModule } from '../types'

// Strategy class (cloud-save backed by SDK `data` module).
export { CrazyGamesStrategy } from '@/utils/save/CrazyGamesStrategy'
export type { CrazySdkDataGetter } from '@/utils/save/CrazyGamesStrategy'

// Strategy factory + composable surface (SDK init, mute sync, locale, ad calls).
export {
  initCrazyGames,
  createCrazyGamesSaveStrategy,
  showRewardedAd,
  showMidgameAd,
  triggerHappytime,
  startGameplay,
  stopGameplay,
  onCrazyMuteChange,
  setCrazyMuted,
  isSdkActive as isCrazySdkActive,
  isSdkMuted as isCrazySdkMuted,
  isCrazyAdsBlocked,
  crazyPlayerName,
  crazyLocale
} from '@/use/useCrazyGames'

// AdProvider wrapper.
export { createCrazyGamesProvider } from '@/use/ads/CrazyGamesProvider'

// Platform-module descriptor for the registry. Capabilities are encoded
// here so the App.vue capability resolver can look them up uniformly.
export const platform = {
  id: 'crazygames' as const,
  envFlag: 'CRAZY_WEB',
  capabilities: {
    hasCloudSave: true,
    hasAds: true,
    hostnameMatcher: 'crazygames',
    portalEnforcesAgeGate: true,    // CG = 13+ portal policy
    childDirectedAdSignal: false,   // not declared on CG (handled by portal)
    needsParentOriginCheck: false   // CG iframe hostname matches
  }
}
