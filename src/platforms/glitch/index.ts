// ─── Glitch.fun platform module ─────────────────────────────────────────────

export type { PlatformModule } from '../types'

export {
  GlitchStrategy
} from '@/utils/save/GlitchStrategy'
export type {
  GlitchStrategyConfig,
  ConflictChoice,
  ConflictResolver,
  GuestBlockedHandler
} from '@/utils/save/GlitchStrategy'

export {
  glitchPlugin,
  createGlitchSaveStrategy
} from '@/utils/glitchPlugin'

export { glitchLicenseStatus } from '@/use/useGlitchLicense'

// No ad provider — Glitch has no ad SDK; useAds falls through to Noop.

export const platform = {
  id: 'glitch' as const,
  envFlag: 'GLITCH',
  capabilities: {
    hasCloudSave: true,                // versioned slot API
    hasAds: false,
    hostnameMatcher: 'glitch.fun',
    portalEnforcesAgeGate: false,      // Glitch doesn't enforce
    childDirectedAdSignal: false,
    needsParentOriginCheck: true,      // game runs in CDN iframe; parent is glitch.fun
    hasLicenseValidation: true         // unique to Glitch
  }
}
