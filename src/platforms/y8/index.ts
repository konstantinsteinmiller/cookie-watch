// ─── Y8 platform module ─────────────────────────────────────────────────────
//
// Y8 (y8.com) is a casual-games portal that hosts the game in an iframe
// from one of their CDNs (`y8.com`, `cdn.y8.com`, `*.y8.com`). They
// publish an ad/leaderboard SDK (`idplaysdk.js`) but consuming it is
// opt-in — for chaos-arena we ship the same minimal shape as itch.io:
// no cloud-save API, no in-frame ads, no parent-origin handshake.
// The platform module exists so App.vue's hostname gate, the resolver
// chain, and the registry treat Y8 uniformly with the others.

export type { PlatformModule } from '../types'

export const platform = {
  id: 'y8' as const,
  envFlag: 'Y8',
  capabilities: {
    hasCloudSave: false,
    hasAds: false,
    hostnameMatcher: 'y8',
    portalEnforcesAgeGate: false,
    childDirectedAdSignal: false,
    needsParentOriginCheck: false
  }
}
