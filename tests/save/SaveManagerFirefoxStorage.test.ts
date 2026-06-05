// Regression test for the Firefox-specific data-loss bug CG QA reported
// 2026-05-05.
//
// Symptom on Firefox (other browsers fine):
//   • Hydrate from `sdk.data` returns the right values for every key.
//   • The game UI nevertheless boots at stage 1 with default settings.
//   • A few seconds later, the strategy writes `spinner_player_max_stage = 1`
//     to the cloud, OVERWRITING the player's hard-earned cloud value.
//
// Root cause: `SaveManager.patchLocalStorage` was assigning override
// methods directly:
//
//     localStorage.getItem = (key) => this.blob.get(key)
//     localStorage.setItem = (key, value) => …
//
// The Web Storage `Storage` interface is a `[LegacyOverrideBuiltIns]`
// object: in Firefox the assignment can be intercepted by the named
// setter and silently turn into `localStorage.setItem('getItem', '…')`
// instead of replacing the method. Subsequent `localStorage.getItem(key)`
// calls then hit the prototype method which reads the RAW (scrubbed)
// storage and returns null, so every composable's
// `loadX = ref(readFromStorage())` produced a default. The defaults
// then propagated to the cloud via `setRemoteOnly`.
//
// Fix: use `Object.defineProperty` so the override is unambiguously an
// own data property that wins over the named-setter machinery.
//
// This test simulates the Firefox semantics by installing a Storage-like
// object whose property-setter routes any non-method assignment to
// setItem (the part that breaks Firefox). We verify SaveManager's
// patching survives that hostile environment.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SaveManager } from '@/utils/save/SaveManager'
import type { LocalStorageAccessor, SaveStrategy } from '@/utils/save/types'

/** Storage that mimics Firefox's `[LegacyOverrideBuiltIns]` named-setter
 *  semantics: writing `storage.foo = bar` falls through to setItem('foo',
 *  bar) for ANY property name (including method names that exist on the
 *  prototype). The only way to install a real own data property is
 *  `Object.defineProperty`. The methods themselves live on a prototype
 *  (mirrors how the real `Storage` interface has them on
 *  `Storage.prototype`, NOT on instances). */
const makeFirefoxLikeStorage = (): Storage => {
  const map = new Map<string, string>()
  // Methods live on a prototype object, not on the instance. This is the
  // shape that triggers the bug: `instance.getItem = fn` doesn't shadow
  // anything as an own property, so the named-setter is reached.
  const proto: any = {
    clear() {
      map.clear()
    },
    getItem(this: any, key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    key(i: number) {
      return Array.from(map.keys())[i] ?? null
    },
    removeItem(key: string) {
      map.delete(key)
    },
    setItem(key: string, value: string) {
      map.set(key, String(value))
    }
  }
  Object.defineProperty(proto, 'length', {
    get() {
      return map.size
    },
    configurable: true
  })
  const target: any = Object.create(proto)
  return new Proxy(target, {
    set(obj, prop, value): boolean {
      if (typeof prop !== 'string') {
        obj[prop] = value
        return true
      }
      // Route ALL writes to setItem, mirroring the Firefox named-setter
      // behaviour for Storage. The escape hatch is `Object.defineProperty`
      // (handled by the `defineProperty` trap below), which the
      // production fix uses.
      proto.setItem(prop, String(value))
      return true
    },
    defineProperty(obj, prop, descriptor): boolean {
      // Object.defineProperty bypasses the named setter and creates a
      // real own data property — exactly the path the production fix
      // takes.
      return Reflect.defineProperty(obj, prop, descriptor)
    }
  }) as Storage
}

const makeSeedingStrategy = (snapshot: Record<string, string>): SaveStrategy => ({
  name: 'firefox-seed',
  hydrate: async (local: LocalStorageAccessor) => {
    for (const [key, value] of Object.entries(snapshot)) local.set(key, value)
  },
  onLocalSet: vi.fn(),
  onLocalRemove: vi.fn()
})

describe('SaveManager — Firefox storage semantics', () => {
  let storage: Storage

  beforeEach(() => {
    storage = makeFirefoxLikeStorage()
  })

  it('patched getItem proxies to BlobStorage even in cloud-only mode (persistToRaw=false)', async () => {
    const strategy = makeSeedingStrategy({
      'spinner_campaign_stage': '7',
      'spinner_player_max_stage': '14'
    })
    const manager = new SaveManager(strategy, storage, { blob: { persistToRaw: false } })
    await manager.init()

    // The CG production path: BlobStorage's in-memory state holds the
    // hydrated cloud values, but raw storage is intentionally empty.
    // The patched `getItem` MUST route through BlobStorage. If patching
    // silently failed (Firefox bug), the prototype's getItem reads the
    // empty raw map and returns null — which is exactly what
    // `useSpinnerCampaign.loadStage()` saw before the fix.
    expect(storage.getItem('spinner_campaign_stage')).toBe('7')
    expect(storage.getItem('spinner_player_max_stage')).toBe('14')
  })

  it('patched setItem forwards to the strategy (does not stash under a "setItem" key)', async () => {
    const strategy = makeSeedingStrategy({})
    const manager = new SaveManager(strategy, storage)
    await manager.init()

    storage.setItem('spinner_campaign_stage', '8')

    expect(strategy.onLocalSet).toHaveBeenCalledWith('spinner_campaign_stage', '8')
    expect(storage.getItem('spinner_campaign_stage')).toBe('8')
  })

  it('reproduces the recordPlayerStage data-loss scenario (defaults must NOT win after hydrate)', async () => {
    // CG cloud has spinner_player_max_stage=14 from prior sessions on
    // other browsers. Firefox loads the iframe, hydrate succeeds — but
    // if patching is broken, every composable's
    // `ref(parseInt(localStorage.getItem(...) ?? '0', 10))` initialiser
    // sees null, defaults to 0, and the next gameplay tick writes back
    // the default. That was the bug.
    const strategy = makeSeedingStrategy({ 'spinner_player_max_stage': '14' })
    const manager = new SaveManager(strategy, storage, { blob: { persistToRaw: false } })
    await manager.init()

    const loadPlayerMaxStage = (): number => {
      const raw = storage.getItem('spinner_player_max_stage')
      return parseInt(raw ?? '0', 10) || 0
    }
    expect(loadPlayerMaxStage()).toBe(14) // would be 0 with the unpatched assignment
  })
})

describe('SaveManager — Proxy path on window.localStorage (Opera/Firefox QA bug 2026-05-05)', () => {
  // After CG QA reported the previous defineProperty fix STILL failed on
  // Opera and Firefox, the patch was changed to replace `window.localStorage`
  // with a Proxy when the SaveManager's storage IS window.localStorage.
  // These tests verify the proxy path: install a hostile storage AT
  // `window.localStorage`, run init(), and confirm reads/writes via
  // `window.localStorage.X` route through SaveManager regardless of how
  // the underlying storage handles direct method assignment.

  let originalLocalStorage: PropertyDescriptor | undefined
  let underlying: Storage

  beforeEach(() => {
    originalLocalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage')
    underlying = makeFirefoxLikeStorage()
    Object.defineProperty(window, 'localStorage', {
      value: underlying,
      configurable: true,
      writable: true
    })
  })

  // Restore window.localStorage so the global jsdom MemoryStorage (set up
  // by tests/save/setup.ts) is back in place for subsequent test files.
  // Without this, the proxy installed by `init()` leaks across files.
  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(window, 'localStorage', originalLocalStorage)
    }
  })

  it('reads of `window.localStorage.getItem` go through the SaveManager proxy', async () => {
    const strategy = makeSeedingStrategy({
      'spinner_campaign_stage': '10',
      'spinner_player_max_stage': '14'
    })
    const manager = new SaveManager(strategy, window.localStorage, { blob: { persistToRaw: false } })
    await manager.init()

    expect(window.localStorage.getItem('spinner_campaign_stage')).toBe('10')
    expect(window.localStorage.getItem('spinner_player_max_stage')).toBe('14')
  })

  it('writes via `window.localStorage.setItem` reach the strategy', async () => {
    const strategy = makeSeedingStrategy({})
    const manager = new SaveManager(strategy, window.localStorage)
    await manager.init()

    window.localStorage.setItem('spinner_campaign_stage', '11')

    expect(strategy.onLocalSet).toHaveBeenCalledWith('spinner_campaign_stage', '11')
    expect(window.localStorage.getItem('spinner_campaign_stage')).toBe('11')
  })
})
