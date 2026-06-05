import type { HydrateState, LocalStorageAccessor, SaveStrategy } from './types'

// ─── GameDistribution save strategy ───────────────────────────────────────
//
// GameDistribution.com's HTML5 SDK does NOT expose a per-user cloud-save
// API as of 2026-04 (their "Store API" handles digital-purchase inventory
// and currencies, not arbitrary game state). Saves on this platform are
// therefore local-only — the player's progress lives in the browser's
// localStorage and follows the device, not the account.
//
// Implemented as its own class (rather than just selecting `LocalStorageStrategy`
// at the bootstrap site) so:
//   - `SaveManager.strategyName` reports `gameDistribution` in logs / telemetry,
//     making it possible to slice metrics by platform.
//   - If GameDistribution ever ships a cloud-save API, this class is the
//     single seam to upgrade — strategy callers / tests don't change.
//
// `hydrateState` is hardcoded to `success-with-data`: there's no remote
// to fail on, so the SaveManager's flush guard never engages and no
// background retries are scheduled. The bulletproof-save protocol
// applies only to remote-mirroring strategies.

export class GameDistributionStrategy implements SaveStrategy {
  readonly name = 'gameDistribution'
  // Local-only — there's no remote that could be in any non-success state.
  readonly hydrateState: HydrateState = 'success-with-data'

  async hydrate(_local: LocalStorageAccessor): Promise<void> {
    // noop — browser already hydrated localStorage for us.
  }

  onLocalSet(_key: string, _value: string): void {
    // noop — no remote backend.
  }

  onLocalRemove(_key: string): void {
    // noop — no remote backend.
  }
}
