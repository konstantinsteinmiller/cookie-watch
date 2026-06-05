// Characterization tests for the save-strategy resolver.
//
// Branches now key off `import.meta.env.VITE_APP_*` literals (so Rollup
// can tree-shake unused platform plugins from the bundle) instead of the
// historical `flags` parameter — see the file header on
// `src/platforms/resolveSaveStrategy.ts` for why.
//
// Tests stub the env via `vi.stubEnv` per case, then re-import the
// resolver so it sees the freshly stubbed env.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformFlags } from '@/platforms/capabilities'

const allOff: PlatformFlags = {
  isCrazyWeb: false,
  isWaveDash: false,
  isItch: false,
  isGlitch: false,
  isGameDistribution: false,
  isGameMonetize: false,
  isY8: false,
  isGamePix: false
}

const ALL_PLATFORM_ENVS = [
  'VITE_APP_CRAZY_WEB',
  'VITE_APP_GAME_DISTRIBUTION',
  'VITE_APP_GAME_MONETIZE',
  'VITE_APP_YANDEX',
  'VITE_APP_GLITCH'
] as const

const clearEnv = () => {
  for (const k of ALL_PLATFORM_ENVS) vi.stubEnv(k, '')
}

const loadResolver = async () => {
  // Re-import so the freshly-stubbed env is picked up by the resolver's
  // `import.meta.env` reads.
  vi.resetModules()
  const mod = await import('@/platforms/resolveSaveStrategy')
  return mod.resolveSaveStrategy
}

describe('resolveSaveStrategy', () => {
  beforeEach(clearEnv)
  afterEach(() => vi.unstubAllEnvs())

  it('returns LocalStorageStrategy when no flag is set', async () => {
    const resolveSaveStrategy = await loadResolver()
    const strategy = await resolveSaveStrategy(allOff)
    expect(strategy.name).toBe('localStorage')
  })

  it('returns LocalStorageStrategy when only itch is set', async () => {
    const resolveSaveStrategy = await loadResolver()
    const strategy = await resolveSaveStrategy({ ...allOff, isItch: true })
    expect(strategy.name).toBe('localStorage')
  })

  it('returns LocalStorageStrategy when only wavedash is set', async () => {
    const resolveSaveStrategy = await loadResolver()
    const strategy = await resolveSaveStrategy({ ...allOff, isWaveDash: true })
    expect(strategy.name).toBe('localStorage')
  })

  it('returns CrazyGamesStrategy when isCrazyWeb env is set', async () => {
    vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
    const resolveSaveStrategy = await loadResolver()
    const strategy = await resolveSaveStrategy({ ...allOff, isCrazyWeb: true })
    expect(strategy.name).toBe('crazyGames')
  })

  it('returns GameDistributionStrategy when isGameDistribution env is set', async () => {
    vi.stubEnv('VITE_APP_GAME_DISTRIBUTION', 'true')
    const resolveSaveStrategy = await loadResolver()
    const strategy = await resolveSaveStrategy({ ...allOff, isGameDistribution: true })
    expect(strategy.name).toBe('gameDistribution')
  })

  it('returns GameMonetizeStrategy (local-only) when isGameMonetize env is set', async () => {
    vi.stubEnv('VITE_APP_GAME_MONETIZE', 'true')
    const resolveSaveStrategy = await loadResolver()
    const strategy = await resolveSaveStrategy({ ...allOff, isGameMonetize: true })
    expect(strategy.name).toBe('gamemonetize')
  })

  it('returns YandexStrategy when isYandex env is set', async () => {
    vi.stubEnv('VITE_APP_YANDEX', 'true')
    const resolveSaveStrategy = await loadResolver()
    const strategy = await resolveSaveStrategy({ ...allOff, isYandex: true } as any)
    expect(strategy.name).toBe('yandex')
  })

  it('returns GlitchStrategy or LocalStorageStrategy fallback when isGlitch env is set', async () => {
    // The Glitch plugin's `createGlitchSaveStrategy()` returns null when
    // VITE_APP_GLITCH_INSTALL_ID / TOKEN env vars are missing; the
    // resolver falls back to LocalStorageStrategy in that case.
    vi.stubEnv('VITE_APP_GLITCH', 'true')
    const resolveSaveStrategy = await loadResolver()
    const strategy = await resolveSaveStrategy({ ...allOff, isGlitch: true })
    expect(['glitch', 'localStorage']).toContain(strategy.name)
  })

  describe('priority ordering matches main.ts', () => {
    it('isGlitch wins over isCrazyWeb when both env flags are set', async () => {
      vi.stubEnv('VITE_APP_GLITCH', 'true')
      vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
      const resolveSaveStrategy = await loadResolver()
      const strategy = await resolveSaveStrategy({
        ...allOff,
        isGlitch: true,
        isCrazyWeb: true
      })
      expect(['glitch', 'localStorage']).toContain(strategy.name)
    })

    it('isCrazyWeb wins over isGameDistribution when both env flags are set', async () => {
      vi.stubEnv('VITE_APP_CRAZY_WEB', 'true')
      vi.stubEnv('VITE_APP_GAME_DISTRIBUTION', 'true')
      const resolveSaveStrategy = await loadResolver()
      const strategy = await resolveSaveStrategy({
        ...allOff,
        isCrazyWeb: true,
        isGameDistribution: true
      })
      expect(strategy.name).toBe('crazyGames')
    })
  })
})
