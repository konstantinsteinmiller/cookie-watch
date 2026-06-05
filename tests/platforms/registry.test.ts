// Smoke tests for the platform registry. Confirms:
//   - Every platform module exports a `platform` descriptor with id+envFlag+capabilities.
//   - The registry enumerates all 7 platforms.
//   - `activePlatform()` returns null when no env flag is set (the test default).

import { describe, expect, it } from 'vitest'
import { ALL_PLATFORMS, activePlatform, activeCapabilities } from '@/platforms'

describe('platform registry', () => {
  it('contains all 8 platforms', () => {
    const ids = ALL_PLATFORMS.map(p => p.id).sort()
    expect(ids).toEqual(['crazygames', 'gamedistribution', 'gamepix', 'glitch', 'itch', 'playgama', 'wavedash', 'y8'])
  })

  it('every platform has the required descriptor shape', () => {
    for (const p of ALL_PLATFORMS) {
      expect(typeof p.id).toBe('string')
      expect(typeof p.envFlag).toBe('string')
      expect(p.envFlag).not.toContain('VITE_APP_')   // sans prefix
      expect(typeof p.capabilities).toBe('object')
      expect(typeof p.capabilities.hasCloudSave).toBe('boolean')
      expect(typeof p.capabilities.hasAds).toBe('boolean')
      expect(typeof p.capabilities.hostnameMatcher).toBe('string')
    }
  })

  it('platform IDs are unique', () => {
    const ids = ALL_PLATFORMS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('envFlags are unique', () => {
    const flags = ALL_PLATFORMS.map(p => p.envFlag)
    expect(new Set(flags).size).toBe(flags.length)
  })

  it('activePlatform returns null in the test env (no platform flag set)', () => {
    expect(activePlatform()).toBeNull()
    expect(activeCapabilities()).toBeNull()
  })

  it('Glitch declares hasLicenseValidation capability', () => {
    const glitch = ALL_PLATFORMS.find(p => p.id === 'glitch')!
    expect((glitch.capabilities as any).hasLicenseValidation).toBe(true)
  })

  it('GameDistribution declares childDirectedAdSignal=true (its SDK gets the flag)', () => {
    const gd = ALL_PLATFORMS.find(p => p.id === 'gamedistribution')!
    expect(gd.capabilities.childDirectedAdSignal).toBe(true)
  })

  it('CrazyGames does NOT declare childDirectedAdSignal (portal handles it)', () => {
    const cg = ALL_PLATFORMS.find(p => p.id === 'crazygames')!
    expect(cg.capabilities.childDirectedAdSignal).toBe(false)
    expect(cg.capabilities.portalEnforcesAgeGate).toBe(true)
  })

  it('itch + wavedash + y8 + gamepix have neither cloud save nor ads (minimal integrations)', () => {
    for (const id of ['itch', 'wavedash', 'y8', 'gamepix']) {
      const p = ALL_PLATFORMS.find(x => x.id === id)!
      expect(p.capabilities.hasCloudSave, id).toBe(false)
      expect(p.capabilities.hasAds, id).toBe(false)
    }
  })

  it('Y8 declares the y8.com hostname matcher', () => {
    const y8 = ALL_PLATFORMS.find(p => p.id === 'y8')!
    expect(y8.envFlag).toBe('Y8')
    expect(y8.capabilities.hostnameMatcher).toBe('y8')
  })

  it('GamePix declares the gamepix hostname matcher', () => {
    const gp = ALL_PLATFORMS.find(p => p.id === 'gamepix')!
    expect(gp.envFlag).toBe('GAMEPIX')
    expect(gp.capabilities.hostnameMatcher).toBe('gamepix')
  })

  it('Playgama declares cloud-save + ads and empty hostnameMatcher (no URL gate)', () => {
    const pg = ALL_PLATFORMS.find(p => p.id === 'playgama')!
    expect(pg.envFlag).toBe('PLAYGAMA')
    expect(pg.capabilities.hasCloudSave).toBe(true)
    expect(pg.capabilities.hasAds).toBe(true)
    // Playgama Technical Requirements forbid runtime URL gating, so the
    // hostnameMatcher is intentionally empty.
    expect(pg.capabilities.hostnameMatcher).toBe('')
  })
})
