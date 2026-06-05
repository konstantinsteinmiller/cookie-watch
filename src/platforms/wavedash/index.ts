// ─── Wavedash platform module ───────────────────────────────────────────────
//
// Wavedash provides telemetry / load-progress / ready signals via a
// `WavedashJS` global injected by their platform wrapper. No save backend,
// no ads. Init lives inline in `main.ts` (a few `await window.WavedashJS`
// calls) — no separate composable to re-export here today.

export type { PlatformModule } from '../types'

export const platform = {
  id: 'wavedash' as const,
  envFlag: 'WAVEDASH',
  capabilities: {
    hasCloudSave: false,
    hasAds: false,
    hostnameMatcher: 'wavedash',
    portalEnforcesAgeGate: false,
    childDirectedAdSignal: false,
    needsParentOriginCheck: false
  }
}
