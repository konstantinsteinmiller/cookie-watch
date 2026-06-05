import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SaveManager } from '@/utils/save/SaveManager'
import type { LocalStorageAccessor, SaveStrategy } from '@/utils/save/types'

// Minimal spy strategy — lets us assert that the manager routes every
// qualifying write through onLocalSet / onLocalRemove and that internal
// keys are filtered.
const makeSpyStrategy = (): SaveStrategy & {
  hydrate: ReturnType<typeof vi.fn>
  onLocalSet: ReturnType<typeof vi.fn>
  onLocalRemove: ReturnType<typeof vi.fn>
  flush: ReturnType<typeof vi.fn>
} => {
  return {
    name: 'spy',
    hydrate: vi.fn(async (_local: LocalStorageAccessor) => {
    }),
    onLocalSet: vi.fn(),
    onLocalRemove: vi.fn(),
    flush: vi.fn(async () => {
    })
  }
}

describe('SaveManager', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  it('hydrates once and short-circuits repeat init() calls', async () => {
    const strategy = makeSpyStrategy()
    const manager = new SaveManager(strategy)

    await manager.init()
    await manager.init()

    expect(strategy.hydrate).toHaveBeenCalledTimes(1)
    expect(manager.isHydrated()).toBe(true)
  })

  it('suppresses mirror calls while hydration is in flight', async () => {
    const strategy: SaveStrategy = {
      name: 'seeder',
      hydrate: async (local) => {
        local.set('from_backend', 'hello')
      },
      onLocalSet: vi.fn(),
      onLocalRemove: vi.fn()
    }
    const manager = new SaveManager(strategy)

    await manager.init()

    expect(window.localStorage.getItem('from_backend')).toBe('hello')
    expect(strategy.onLocalSet).not.toHaveBeenCalled()
  })

  it('forwards application writes to the strategy', async () => {
    const strategy = makeSpyStrategy()
    const manager = new SaveManager(strategy)
    await manager.init()

    window.localStorage.setItem('coins', '42')
    window.localStorage.removeItem('coins')

    expect(strategy.onLocalSet).toHaveBeenCalledWith('coins', '42')
    expect(strategy.onLocalRemove).toHaveBeenCalledWith('coins')
  })

  it('does not forward internal bookkeeping keys', async () => {
    const strategy = makeSpyStrategy()
    const manager = new SaveManager(strategy)
    await manager.init()

    window.localStorage.setItem('__save_internal__glitch_version', '3')
    window.localStorage.setItem('__SafeLocalStorage__foo', 'x')
    window.localStorage.setItem('SDK_DATA_bar', 'y')

    expect(strategy.onLocalSet).not.toHaveBeenCalled()
  })

  it('clear() forwards a removeItem for every non-internal key', async () => {
    const strategy = makeSpyStrategy()
    const manager = new SaveManager(strategy)
    await manager.init()

    window.localStorage.setItem('a', '1')
    window.localStorage.setItem('b', '2')
    window.localStorage.setItem('__save_internal__x', '3')
    strategy.onLocalRemove.mockClear()

    window.localStorage.clear()

    const removed = strategy.onLocalRemove.mock.calls.map(c => c[0]).sort()
    expect(removed).toEqual(['a', 'b'])
    expect(window.localStorage.length).toBe(0)
  })

  it('survives a throwing strategy without corrupting localStorage', async () => {
    const strategy: SaveStrategy = {
      name: 'broken',
      hydrate: async () => {
      },
      onLocalSet: () => {
        throw new Error('network down')
      },
      onLocalRemove: () => {
        throw new Error('network down')
      }
    }
    const manager = new SaveManager(strategy)
    await manager.init()

    // Must not throw — the local write still has to land even if the
    // mirror is broken.
    expect(() => window.localStorage.setItem('coins', '1')).not.toThrow()
    expect(window.localStorage.getItem('coins')).toBe('1')
  })

  it('delegates flush() to the strategy', async () => {
    const strategy = makeSpyStrategy()
    const manager = new SaveManager(strategy)
    await manager.init()

    await manager.flush()
    expect(strategy.flush).toHaveBeenCalledTimes(1)
  })
})
