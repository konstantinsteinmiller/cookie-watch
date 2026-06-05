// ─── Playgama save strategy ────────────────────────────────────────────────
//
// Mirrors every meaningful `localStorage` write through `bridge.storage`.
// Prefers cloud (`platform_internal`) and falls back to `local_storage`
// when the active Playgama context (or QA tool) doesn't expose cloud.
//
// **Two non-obvious rules** baked into this implementation — both are
// rejection-grade issues on the Playgama QA Tool:
//
//   1. **Never skip the bridge call when storageType === 'local_storage'.**
//      The "Game Saves" certification check watches `bridge.storage.set` as
//      its detection signal. A "local-only → skip" optimization breaks the
//      gate at 0% even when local writes are landing fine.
//
//   2. **Break the SaveManager↔bridge re-entrancy with `writeInFlight`,
//      NOT a local-mode skip.** The bridge's local adapter calls
//      `window.localStorage.setItem` internally during `storage.set`. That
//      hits SaveManager's patched setItem → `strategy.onLocalSet` → us →
//      another `storage.set` → ∞. The guard short-circuits the re-entrant
//      `onLocalSet` for the duration of an outbound `set` call.
//
// Hydrate is local-only (browser already populated localStorage at boot);
// the bridge's cloud adapter syncs in the background, but for the
// progress-merge timing here we treat the local mirror as authoritative.
// Future enhancement: read `bridge.storage.get` for known keys at hydrate
// time and merge against local using the same `SaveMergePolicy` the
// CrazyGames strategy uses.

import { ref } from 'vue'
import type {
  HydrateState,
  LocalStorageAccessor,
  SaveStrategy
} from './types'
import {
  getPlaygamaBridge,
  isPlaygamaSdkActive
} from '@/utils/playgamaPlugin'

const FLUSH_POLL_MS = 250

/** Storage types the bridge accepts as the third arg of `set`/`get`. */
type StorageType = 'platform_internal' | 'local_storage'

/** Subset of `bridge.storage` we touch — defensively typed so future bridge
 *  versions can add fields without us breaking. */
interface BridgeStorage {
  defaultType?: StorageType
  isAvailable?: (type: StorageType) => boolean | Promise<boolean>
  set?: (key: string, value: string, type?: StorageType) => unknown
  get?: (key: string | string[], type?: StorageType) => unknown
  delete?: (key: string | string[], type?: StorageType) => unknown
}

const getBridgeStorage = (): BridgeStorage | null => {
  // Gate on `isPlaygamaSdkActive` first: the bridge's `storage` getter
  // throws `Before using the SDK you must initialize it` when accessed
  // before `initialize()` has resolved. Without the gate, hydrate (which
  // SaveManager calls synchronously at boot) crashes the boot path.
  if (!isPlaygamaSdkActive.value) return null
  const bridge = getPlaygamaBridge()
  try {
    const storage = bridge?.storage
    if (!storage) return null
    return storage as BridgeStorage
  } catch {
    // Belt-and-braces: even with the active gate, some bridge versions
    // throw on `storage` access during teardown / ad takeover. Return
    // null and let the dirty-queue retry on the next tick.
    return null
  }
}

const resolveStorageType = async (storage: BridgeStorage): Promise<StorageType> => {
  if (typeof storage.isAvailable !== 'function') {
    return storage.defaultType ?? 'local_storage'
  }
  try {
    const cloud = await Promise.resolve(storage.isAvailable('platform_internal'))
    if (cloud) return 'platform_internal'
  } catch (e) {
    console.warn('[playgama-save] isAvailable(platform_internal) threw', e)
  }
  return 'local_storage'
}

export class PlaygamaStrategy implements SaveStrategy {
  readonly name = 'playgama'

  // ─── Hydrate state ──────────────────────────────────────────────────────
  // Local-only hydrate for now — the browser already populated localStorage
  // by the time SaveManager.init runs. Marked `success-with-data` so the
  // manager's flush guard never engages (no remote to wait on for the
  // initial paint). The strategy still mirrors WRITES to cloud via
  // `bridge.storage.set` once the bridge becomes ready.
  readonly hydrateState: HydrateState = 'success-with-data'

  // Reactive ref so the UI status banner can pick up a future cloud-state
  // change if we add background hydrate. Today it just tracks the constant
  // above so subscribers don't need a special case.
  readonly _state = ref<HydrateState>('success-with-data')

  // Queue of writes that arrived BEFORE the bridge resolved. The bridge
  // takes ~50 ms (MOCK) to multiple seconds (production cold) to come up,
  // and SaveManager patches `localStorage.setItem` immediately at boot —
  // so without this queue the first dozen writes (mirrorRefs flush,
  // splash-time toggles, etc.) silently miss the cloud.
  private dirty = new Map<string, string | null>()
  private flushTimer: ReturnType<typeof setInterval> | null = null

  // Re-entrancy guard: any key whose `storage.set` / `storage.delete` is
  // in flight short-circuits `onLocalSet` / `onLocalRemove`. The bridge's
  // local adapter calls `localStorage.setItem` synchronously inside its
  // `set` — that re-enters our onLocalSet through SaveManager's patched
  // setItem and recurses infinitely without this guard.
  private writeInFlight = new Set<string>()

  private storageType: StorageType = 'local_storage'
  private storageTypeResolved = false
  private loggedQueueWrite = false

  async hydrate(_local: LocalStorageAccessor): Promise<void> {
    // No-op. SaveManager calls hydrate synchronously at boot — the bridge
    // hasn't run `initialize()` yet, and `bridge.storage` throws when
    // accessed pre-init. The browser already populated localStorage for
    // us; storage-type resolution + first cloud write happen lazily on
    // the next `onLocalSet`, by which point the bridge has resolved
    // (or the dirty-queue poll catches it).
  }

  onLocalSet(key: string, value: string): void {
    if (this.writeInFlight.has(key)) return // ← re-entrancy guard
    this.dirty.set(key, value)
    if (!isPlaygamaSdkActive.value || !getBridgeStorage()) {
      this.ensureFlushPoll()
      return
    }
    void this.drainDirty()
  }

  onLocalRemove(key: string): void {
    if (this.writeInFlight.has(key)) return // ← re-entrancy guard
    this.dirty.set(key, null)
    if (!isPlaygamaSdkActive.value || !getBridgeStorage()) {
      this.ensureFlushPoll()
      return
    }
    void this.drainDirty()
  }

  async flush(): Promise<void> {
    if (this.dirty.size === 0) return
    await this.drainDirty()
  }

  dispose(): void {
    if (this.flushTimer != null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  // ─── Internal ───────────────────────────────────────────────────────────

  private ensureFlushPoll(): void {
    if (this.flushTimer != null) return
    if (!this.loggedQueueWrite) {
      this.loggedQueueWrite = true
      console.info('[playgama-save] queueing writes — bridge not ready yet')
    }
    this.flushTimer = setInterval(() => {
      if (!isPlaygamaSdkActive.value || !getBridgeStorage()) return
      void this.drainDirty().then(() => {
        if (this.dirty.size === 0 && this.flushTimer != null) {
          clearInterval(this.flushTimer)
          this.flushTimer = null
        }
      })
    }, FLUSH_POLL_MS)
  }

  private async ensureStorageType(): Promise<void> {
    if (this.storageTypeResolved) return
    const storage = getBridgeStorage()
    if (!storage) return
    this.storageType = await resolveStorageType(storage)
    this.storageTypeResolved = true
  }

  private async drainDirty(): Promise<void> {
    await this.ensureStorageType()
    if (this.dirty.size === 0) return
    const snapshot = Array.from(this.dirty.entries())
    this.dirty.clear()
    for (const [key, value] of snapshot) {
      if (value === null) {
        await this.deleteKey(key)
      } else {
        await this.writeKey(key, value)
      }
    }
  }

  private async writeKey(key: string, value: string): Promise<void> {
    const storage = getBridgeStorage()
    if (!storage?.set) {
      // Bridge went away mid-flight (rare, but defensible). Re-queue.
      this.dirty.set(key, value)
      this.ensureFlushPoll()
      return
    }
    this.writeInFlight.add(key)
    try {
      // Always call through the bridge — even when storageType is
      // `local_storage`. The Playgama QA Tool's "Game Saves" check watches
      // this exact call as its detection signal; skipping breaks cert.
      await Promise.resolve(storage.set(key, value, this.storageType))
    } catch (e) {
      console.warn(`[playgama-save] set(${key}) threw`, e)
      this.dirty.set(key, value)
      this.ensureFlushPoll()
    } finally {
      this.writeInFlight.delete(key)
    }
  }

  private async deleteKey(key: string): Promise<void> {
    const storage = getBridgeStorage()
    if (!storage?.delete) {
      this.dirty.set(key, null)
      this.ensureFlushPoll()
      return
    }
    this.writeInFlight.add(key)
    try {
      await Promise.resolve(storage.delete(key, this.storageType))
    } catch (e) {
      console.warn(`[playgama-save] delete(${key}) threw`, e)
      this.dirty.set(key, null)
      this.ensureFlushPoll()
    } finally {
      this.writeInFlight.delete(key)
    }
  }
}
