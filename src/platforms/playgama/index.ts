// ─── Playgama platform module ───────────────────────────────────────────────
//
// Shell that colocates the Playgama-specific exports under a single barrel.
// Heavy implementations stay where they live (`@/utils/playgamaPlugin`,
// `@/utils/save/PlaygamaStrategy`, `@/use/ads/PlaygamaProvider`) — this
// module is just a stable re-export surface plus the platform-module
// descriptor the registry enumerates.

export type { PlatformModule } from '../types'

export { PlaygamaStrategy } from '@/utils/save/PlaygamaStrategy'

export {
  playgamaPlugin,
  createPlaygamaSaveStrategy,
  showRewardedPG,
  showInterstitialPG,
  playgamaLoadingStart,
  playgamaGameLoadingStop,
  playgamaGameplayStart,
  playgamaGameplayStop,
  isPlaygamaSdkActive,
  isPlaygamaAdsBlocked,
  playgamaLocale,
  playgamaDetectedId,
  getPlaygamaBridge
} from '@/utils/playgamaPlugin'

export { createPlaygamaProvider } from '@/use/ads/PlaygamaProvider'

export const platform = {
  id: 'playgama' as const,
  envFlag: 'PLAYGAMA',
  capabilities: {
    hasCloudSave: true,                  // bridge.storage with platform_internal
    hasAds: true,
    hostnameMatcher: 'playgama.com',
    portalEnforcesAgeGate: false,
    childDirectedAdSignal: false,
    // No hostname check — Playgama's Technical Requirements forbid runtime
    // URL gating ("game does not include any technical means of limiting
    // its operation due to the URL it is opened from"). See capabilities.ts.
    needsParentOriginCheck: false
  }
}
