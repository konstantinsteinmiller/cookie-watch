import { beforeEach, describe, expect, it, vi } from 'vitest'

// Pure-logic coverage for the Cookie Watch progression + upgrade economy.
// Each test imports fresh (vi.resetModules) so the module-singleton refs
// re-seed from a clean localStorage.

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('tilesToClear', () => {
  it('ramps 20, 40, 55, then +10 per stage', async () => {
    const { tilesToClear } = await import('@/use/useEpicProgress')
    expect(tilesToClear(1)).toBe(20)
    expect(tilesToClear(2)).toBe(40)
    expect(tilesToClear(3)).toBe(55)
    expect(tilesToClear(4)).toBe(65)
    expect(tilesToClear(5)).toBe(75)
  })
})

describe('upgrade economy', () => {
  it('upgradedValue reflects base + level * perLevel', async () => {
    const prog = await import('@/use/useEpicProgress')
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const api = prog.default()
    expect(prog.upgradedValue('calmNerves')).toBe(0)

    useEpicConfig().addCoins(10_000)
    expect(api.buyUpgrade('calmNerves')).toBe(true)
    expect(prog.levelOf('calmNerves')).toBe(1)
    expect(prog.upgradedValue('calmNerves')).toBeCloseTo(0.06)
  })

  it('refuses a purchase the player cannot afford', async () => {
    const prog = await import('@/use/useEpicProgress')
    const api = prog.default()
    expect(api.canBuy('calmNerves')).toBe(false)
    expect(api.buyUpgrade('calmNerves')).toBe(false)
    expect(prog.levelOf('calmNerves')).toBe(0)
  })

  it('locks upgrades behind their unlock stage', async () => {
    const prog = await import('@/use/useEpicProgress')
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const api = prog.default()
    useEpicConfig().addCoins(10_000)
    // extraTime unlocks at stage 2; the player starts at stage 1.
    expect(api.isUnlocked('extraTime')).toBe(false)
    expect(api.buyUpgrade('extraTime')).toBe(false)
  })

  it('cost grows with each level and maxes out', async () => {
    const prog = await import('@/use/useEpicProgress')
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const api = prog.default()
    useEpicConfig().addCoins(1_000_000)
    // c0 is the discounted first level (50% off); c1 is full price, so it must
    // still be greater than the discounted first level.
    const c0 = prog.upgradeCost('lightPaws')
    api.buyUpgrade('lightPaws')
    const c1 = prog.upgradeCost('lightPaws')
    expect(c1).toBeGreaterThan(c0)
    // Buy to max.
    for (let i = 0; i < 10; i++) api.buyUpgrade('lightPaws')
    expect(prog.levelOf('lightPaws')).toBe(5)
    expect(prog.upgradeCost('lightPaws')).toBe(Infinity)
    expect(api.buyUpgrade('lightPaws')).toBe(false)
  })
})

describe('stage + score progression', () => {
  it('advanceStage increments stage and tracks max', async () => {
    const prog = await import('@/use/useEpicProgress')
    const api = prog.default()
    expect(api.stage.value).toBe(1)
    api.advanceStage()
    expect(api.stage.value).toBe(2)
    expect(api.maxStage.value).toBe(2)
  })

  it('recordScore only updates the personal best upward', async () => {
    const prog = await import('@/use/useEpicProgress')
    const api = prog.default()
    expect(api.recordScore(120)).toBe(true)
    expect(api.bestScore.value).toBe(120)
    expect(api.recordScore(80)).toBe(false)
    expect(api.bestScore.value).toBe(120)
  })
})
