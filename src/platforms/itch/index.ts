// ─── itch.io platform module ────────────────────────────────────────────────
//
// itch.io has no SDK, no ads, no cloud save. The platform module exists for
// symmetry — declaring the capabilities lets App.vue and any future
// platform-aware code treat itch uniformly with the others.

export type { PlatformModule } from '../types'

export const platform = {
  id: 'itch' as const,
  envFlag: 'ITCH',
  capabilities: {
    hasCloudSave: false,
    hasAds: false,
    hostnameMatcher: 'itch',           // matches itch / itch.io / itch.zone
    portalEnforcesAgeGate: false,
    childDirectedAdSignal: false,
    needsParentOriginCheck: false
  }
}
