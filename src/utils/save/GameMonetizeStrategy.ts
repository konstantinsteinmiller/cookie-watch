import type { HydrateState, LocalStorageAccessor, SaveStrategy } from './types'

// ─── GameMonetize save strategy ────────────────────────────────────────────
//
// GameMonetize.com's HTML5 SDK does NOT expose any per-user cloud-save /
// player-data API (confirmed across its docs, the GitHub README, and the live
// sdk.js — it is purely an advertising SDK). Saves on this platform are
// therefore local-only: the unified state blob lives in the browser's
// localStorage and follows the device/browser, not the player's account.
//
// Implemented as its own class (rather than just selecting `LocalStorageStrategy`
// at the bootstrap site) so:
//   - `SaveManager.strategyName` reports `gamemonetize` in logs / telemetry,
//     making it possible to slice metrics by platform.
//   - If GameMonetize ever ships a cloud-save API, this class is the single
//     seam to upgrade — strategy callers / tests don't change.
//
// `hydrateState` is hardcoded to `success-with-data`: there's no remote to fail
// on, so the SaveManager's flush guard never engages and no background retries
// are scheduled. The bulletproof-save protocol applies only to remote-mirroring
// strategies. Mirrors `GameDistributionStrategy`.

export class GameMonetizeStrategy implements SaveStrategy {
  readonly name = 'gamemonetize'
  // Local-only — there's no remote that could be in any non-success state.
  readonly hydrateState: HydrateState = 'success-with-data'

  async hydrate(_local: LocalStorageAccessor): Promise<void> {
    // noop — the browser already hydrated localStorage for us.
  }

  onLocalSet(_key: string, _value: string): void {
    // noop — no remote backend.
  }

  onLocalRemove(_key: string): void {
    // noop — no remote backend.
  }
}
