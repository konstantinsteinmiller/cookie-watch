import type { HydrateState, LocalStorageAccessor, SaveStrategy } from './types'

// Default fallback strategy — no remote backend, `localStorage` is the
// source of truth. `hydrate` is a no-op because localStorage is already
// populated by the browser; `onLocalSet`/`onLocalRemove` are no-ops
// because there is no backend to mirror to.
//
// Reports `hydrateState = 'success-with-data'` unconditionally: there's
// no remote that could be in a "pending" or "failed" state, so the
// SaveManager's draft-queue / retry guards never engage.
export class LocalStorageStrategy implements SaveStrategy {
  readonly name = 'localStorage'
  // Local-only — there's nothing to fail. Always treated as a successful
  // hydrate so SaveManager's flush guard never blocks (the strategy is a
  // no-op anyway, but the contract still holds).
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
