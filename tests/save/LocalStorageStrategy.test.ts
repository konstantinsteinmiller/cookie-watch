import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageStrategy } from '@/utils/save/LocalStorageStrategy'
import { SaveManager } from '@/utils/save/SaveManager'

// jsdom gives us a real in-memory localStorage, so we can exercise the
// manager + strategy end-to-end without mocks. We reset it between tests
// to keep each case independent.

describe('LocalStorageStrategy (default / no-guards path)', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => window.localStorage.clear())

  it('reports its name for diagnostics', () => {
    const manager = new SaveManager(new LocalStorageStrategy())
    expect(manager.strategyName).toBe('localStorage')
  })

  it('does not interfere with existing localStorage contents on hydrate', async () => {
    window.localStorage.setItem('existing_key', 'prior_value')

    const manager = new SaveManager(new LocalStorageStrategy())
    await manager.init()

    expect(window.localStorage.getItem('existing_key')).toBe('prior_value')
    expect(manager.isHydrated()).toBe(true)
  })

  it('passes writes through to localStorage without modifying them', async () => {
    const manager = new SaveManager(new LocalStorageStrategy())
    await manager.init()

    window.localStorage.setItem('coins', '42')
    window.localStorage.setItem('team', JSON.stringify([1, 2, 3]))

    expect(window.localStorage.getItem('coins')).toBe('42')
    expect(window.localStorage.getItem('team')).toBe('[1,2,3]')
  })

  it('honors removeItem', async () => {
    window.localStorage.setItem('transient', '1')
    const manager = new SaveManager(new LocalStorageStrategy())
    await manager.init()

    window.localStorage.removeItem('transient')

    expect(window.localStorage.getItem('transient')).toBeNull()
  })

  it('init() is idempotent — repeated calls do not re-patch', async () => {
    const manager = new SaveManager(new LocalStorageStrategy())
    await manager.init()
    await manager.init()

    window.localStorage.setItem('k', 'v')
    expect(window.localStorage.getItem('k')).toBe('v')
  })

  it('flush resolves cleanly with no pending work', async () => {
    const manager = new SaveManager(new LocalStorageStrategy())
    await manager.init()
    await expect(manager.flush()).resolves.toBeUndefined()
  })
})
