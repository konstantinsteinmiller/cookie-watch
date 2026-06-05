// jsdom 28 in this project ships with a stub `localStorage` that's a plain
// empty object — `.getItem`, `.setItem`, `.removeItem`, `.clear` are all
// undefined. The save code under test treats `localStorage` as a Web
// Storage implementation, so we swap in a minimal in-memory polyfill for
// the duration of the save tests.
//
// Also: jsdom does not implement IndexedDB. `useUserDb.ts` opens
// `window.indexedDB.open(...)` at module init, which would throw any time
// a test transitively imports `useUser` (now possible via the platforms
// resolver chain). A no-op stub keeps the open call silent — tests that
// actually exercise IndexedDB behavior will fail loudly elsewhere, which
// is the correct outcome.

import { beforeEach } from 'vitest'

class MemoryStorage implements Storage {
  private map = new Map<string, string>()

  get length(): number {
    return this.map.size
  }

  clear(): void {
    this.map.clear()
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null
  }

  removeItem(key: string): void {
    this.map.delete(key)
  }

  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
}

// Replace the jsdom stub up-front and before every test so that patching
// done by `SaveManager` doesn't leak across tests.
const install = (): void => {
  const storage = new MemoryStorage()
  Object.defineProperty(window, 'localStorage', {
    value: storage,
    configurable: true,
    writable: true
  })
}

// Skip the localStorage / IndexedDB shims in tests that run under the
// `node` environment (e.g. `tests/platforms/bundlePurity.test.ts`) — they
// don't touch save code and `window` doesn't exist there.
const hasWindow = typeof window !== 'undefined'
if (hasWindow) {
  install()
  beforeEach(install)
}

// IndexedDB no-op stub — useUserDb's module-init `indexedDB.open(...)`
// expects an EventTarget-like request that supports `addEventListener`.
// The fake request never resolves; tests don't depend on its data path.
if (hasWindow && (!('indexedDB' in window) || (window as any).indexedDB === undefined)) {
  class FakeIdbRequest extends EventTarget {
    result: unknown = null
    error: unknown = null
    onsuccess: ((this: any, ev: Event) => unknown) | null = null
    onerror: ((this: any, ev: Event) => unknown) | null = null
    onupgradeneeded: ((this: any, ev: Event) => unknown) | null = null
  }

  Object.defineProperty(window, 'indexedDB', {
    value: { open: () => new FakeIdbRequest() },
    configurable: true,
    writable: true
  })
}
