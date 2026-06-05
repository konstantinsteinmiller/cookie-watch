// ─── GameDistribution platform module ───────────────────────────────────────

export type { PlatformModule } from '../types'

export { GameDistributionStrategy } from '@/utils/save/GameDistributionStrategy'

export {
  gameDistributionPlugin,
  createGameDistributionSaveStrategy,
  showRewardedAdGD,
  showMidgameAdGD,
  preloadRewardedGD,
  isGdSdkActive,
  isGdAdsBlocked,
  gdDebug
} from '@/utils/gameDistributionPlugin'

export { createGameDistributionProvider } from '@/use/ads/GameDistributionProvider'

export const platform = {
  id: 'gamedistribution' as const,
  envFlag: 'GAME_DISTRIBUTION',
  capabilities: {
    hasCloudSave: false,                  // GD has no cloud save API
    hasAds: true,
    hostnameMatcher: 'gamedistribution.com',
    portalEnforcesAgeGate: false,         // GD aggregates traffic; we declare child-directed
    childDirectedAdSignal: true,          // tagForChildDirectedTreatment in GD_OPTIONS
    needsParentOriginCheck: false
  }
}
