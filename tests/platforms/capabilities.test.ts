// Characterization tests for the platform capability resolver. Pins down
// the EXACT formulas currently inlined in App.vue:121-141 so the extraction
// can't drift from the original behavior. Each test models one scenario:
// "what flags + hostname + license-status do we have, and what should
// `App.vue`'s gates resolve to?".
//
// If you change `resolveCapabilities`, every test here must still pass —
// otherwise some part of App.vue is going to misrender on at least one
// platform.

import { describe, expect, it } from 'vitest'
import { resolveCapabilities } from '@/platforms/capabilities'

const allFlagsOff = {
  isCrazyWeb: false,
  isWaveDash: false,
  isItch: false,
  isGlitch: false,
  isGameDistribution: false,
  isY8: false,
  isGamePix: false,
  isPlaygama: false
}

describe('resolveCapabilities', () => {
  describe('isNotPlatformBuild', () => {
    it('true when every platform flag is false (plain web / dev)', () => {
      const c = resolveCapabilities({
        flags: allFlagsOff,
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      expect(c.isNotPlatformBuild).toBe(true)
    })

    it('false when any platform flag is true', () => {
      for (const flag of Object.keys(allFlagsOff) as (keyof typeof allFlagsOff)[]) {
        const c = resolveCapabilities({
          flags: { ...allFlagsOff, [flag]: true },
          hostname: 'localhost',
          glitchLicenseStatus: 'pending'
        })
        expect(c.isNotPlatformBuild, `flag ${flag}`).toBe(false)
      }
    })
  })

  describe('allowedToShowOnCrazyGames', () => {
    it('true when isCrazyWeb AND hostname matches', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isCrazyWeb: true },
        hostname: 'iframe.crazygames.com',
        glitchLicenseStatus: 'pending'
      })
      expect(c.allowedToShowOnCrazyGames).toBe(true)
    })

    it('false when isCrazyWeb is true but hostname does not match', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isCrazyWeb: true },
        hostname: 'example.com',
        glitchLicenseStatus: 'pending'
      })
      expect(c.allowedToShowOnCrazyGames).toBe(false)
    })

    it('true when isNotPlatformBuild (fallback escape hatch for dev)', () => {
      const c = resolveCapabilities({
        flags: allFlagsOff,
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      expect(c.allowedToShowOnCrazyGames).toBe(true)
    })
  })

  describe('allowedToShowOnGlitch — license-gated', () => {
    it('false when isGlitch + hostname matches but license is denied', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isGlitch: true },
        hostname: 'something.glitch.fun',
        glitchLicenseStatus: 'denied'
      })
      expect(c.allowedToShowOnGlitch).toBe(false)
    })

    it('false when isGlitch + hostname matches but license is still pending', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isGlitch: true },
        hostname: 'something.glitch.fun',
        glitchLicenseStatus: 'pending'
      })
      expect(c.allowedToShowOnGlitch).toBe(false)
    })

    it('true when isGlitch + hostname matches AND license is ok', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isGlitch: true },
        hostname: 'something.glitch.fun',
        glitchLicenseStatus: 'ok'
      })
      expect(c.allowedToShowOnGlitch).toBe(true)
    })

    it('true when iframe-embedded — hostname is on a CDN but parentOrigin is glitch.fun', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isGlitch: true },
        hostname: 'cdn-host-12345.somewhere.net',
        parentOrigin: 'https://glitch.fun',
        glitchLicenseStatus: 'ok'
      })
      expect(c.allowedToShowOnGlitch).toBe(true)
    })

    it('true when iframe-embedded — parentOrigin is a glitch.fun subdomain', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isGlitch: true },
        hostname: 'cdn-host.somewhere.net',
        parentOrigin: 'https://app.glitch.fun',
        glitchLicenseStatus: 'ok'
      })
      expect(c.allowedToShowOnGlitch).toBe(true)
    })

    it('false when iframe-embedded but parentOrigin is NOT glitch.fun', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isGlitch: true },
        hostname: 'cdn-host.somewhere.net',
        parentOrigin: 'https://example.com',
        glitchLicenseStatus: 'ok'
      })
      expect(c.allowedToShowOnGlitch).toBe(false)
    })
  })

  describe('isGlitchDenied', () => {
    it('true only when isGlitch AND license denied', () => {
      const denied = resolveCapabilities({
        flags: { ...allFlagsOff, isGlitch: true },
        hostname: 'foo.glitch.fun',
        glitchLicenseStatus: 'denied'
      })
      expect(denied.isGlitchDenied).toBe(true)

      const okOnGlitch = resolveCapabilities({
        flags: { ...allFlagsOff, isGlitch: true },
        hostname: 'foo.glitch.fun',
        glitchLicenseStatus: 'ok'
      })
      expect(okOnGlitch.isGlitchDenied).toBe(false)

      const deniedButNotGlitchBuild = resolveCapabilities({
        flags: allFlagsOff,
        hostname: 'localhost',
        glitchLicenseStatus: 'denied'
      })
      expect(deniedButNotGlitchBuild.isGlitchDenied).toBe(false)
    })
  })

  describe('plattformText', () => {
    it('reports the active platform domain for each flag', () => {
      const cases: Array<[keyof typeof allFlagsOff, string]> = [
        ['isCrazyWeb', 'crazygames.com'],
        ['isWaveDash', 'wavedash.com'],
        ['isItch', 'itch.io'],
        ['isGlitch', 'glitch.fun'],
        ['isGameDistribution', 'gamedistribution.com'],
        ['isY8', 'y8.com'],
        ['isGamePix', 'gamepix.com'],
        ['isPlaygama', 'playgama.com']
      ]
      for (const [flag, expected] of cases) {
        const c = resolveCapabilities({
          flags: { ...allFlagsOff, [flag]: true },
          hostname: 'localhost',
          glitchLicenseStatus: 'ok'
        })
        expect(c.plattformText, `flag ${flag}`).toBe(expected)
      }
    })

    it('empty string when no platform flag is set', () => {
      const c = resolveCapabilities({
        flags: allFlagsOff,
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      expect(c.plattformText).toBe('')
    })
  })

  describe('hostname-matching helpers — robust to subdomain shape', () => {
    it('isCrazyGamesUrl matches anything containing "crazygames"', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isCrazyWeb: true },
        hostname: 'iframe.crazygames.com',
        glitchLicenseStatus: 'ok'
      })
      expect(c.allowedToShowOnCrazyGames).toBe(true)
    })

    it('isItchUrl matches itch / itch.io / itch.zone', () => {
      const cases = ['some.itch.io', 'something.itch.zone', 'foo.itch.com']
      for (const hostname of cases) {
        const c = resolveCapabilities({
          flags: { ...allFlagsOff, isItch: true },
          hostname,
          glitchLicenseStatus: 'ok'
        })
        expect(c.allowedToShowOnItch, hostname).toBe(true)
      }
    })

    it('isGameDistUrl matches anything containing "gamedistribution.com"', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isGameDistribution: true },
        hostname: 'revision.gamedistribution.com',
        glitchLicenseStatus: 'ok'
      })
      expect(c.allowedToShowOnGameDistribution).toBe(true)
    })

    it('isY8Url matches anything ending in y8.com', () => {
      const cases = ['y8.com', 'www.y8.com', 'cdn.y8.com', 'games.y8.com']
      for (const hostname of cases) {
        const c = resolveCapabilities({
          flags: { ...allFlagsOff, isY8: true },
          hostname,
          glitchLicenseStatus: 'ok'
        })
        expect(c.allowedToShowOnY8, hostname).toBe(true)
      }
    })

    it('isY8 + non-Y8 hostname does NOT pass the gate', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isY8: true },
        hostname: 'example.com',
        glitchLicenseStatus: 'ok'
      })
      expect(c.allowedToShowOnY8).toBe(false)
    })

    it('isGamePixUrl matches anything ending in gamepix.com', () => {
      const cases = ['gamepix.com', 'www.gamepix.com', 'cdn.gamepix.com', 'play.gamepix.com']
      for (const hostname of cases) {
        const c = resolveCapabilities({
          flags: { ...allFlagsOff, isGamePix: true },
          hostname,
          glitchLicenseStatus: 'ok'
        })
        expect(c.allowedToShowOnGamePix, hostname).toBe(true)
      }
    })

    it('isGamePix + non-GamePix hostname does NOT pass the gate', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isGamePix: true },
        hostname: 'example.com',
        glitchLicenseStatus: 'ok'
      })
      expect(c.allowedToShowOnGamePix).toBe(false)
    })
  })

  describe('Y8 — minimal integration (no SDK / no ads / no cloud)', () => {
    it('isY8 sets isNotPlatformBuild = false', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isY8: true },
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      expect(c.isNotPlatformBuild).toBe(false)
    })

    it('plain web (no flag) still passes the Y8 gate via the dev escape hatch', () => {
      const c = resolveCapabilities({
        flags: allFlagsOff,
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      // Same dev-fallthrough rule as every other platform: when nothing
      // is set, every `allowedToShowOn*` is true so `pnpm dev` works.
      expect(c.allowedToShowOnY8).toBe(true)
    })
  })

  describe('GamePix — minimal integration (no SDK / no ads / no cloud)', () => {
    it('isGamePix sets isNotPlatformBuild = false', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isGamePix: true },
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      expect(c.isNotPlatformBuild).toBe(false)
    })

    it('plain web (no flag) still passes the GamePix gate via the dev escape hatch', () => {
      const c = resolveCapabilities({
        flags: allFlagsOff,
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      expect(c.allowedToShowOnGamePix).toBe(true)
    })
  })

  describe('Playgama — flag-only gate (no URL check)', () => {
    it('isPlaygama sets isNotPlatformBuild = false', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isPlaygama: true },
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      expect(c.isNotPlatformBuild).toBe(false)
    })

    it('passes the Playgama gate on any hostname (Technical Requirements forbid URL gating)', () => {
      const cases = [
        'cdn.someweirdhost.io',
        'playgama.com',
        'random.example.com',
        'iframe.partner-portal.net'
      ]
      for (const hostname of cases) {
        const c = resolveCapabilities({
          flags: { ...allFlagsOff, isPlaygama: true },
          hostname,
          glitchLicenseStatus: 'ok'
        })
        expect(c.allowedToShowOnPlaygama, hostname).toBe(true)
      }
    })

    it('plain web (no flag) still passes the Playgama gate via the dev escape hatch', () => {
      const c = resolveCapabilities({
        flags: allFlagsOff,
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      expect(c.allowedToShowOnPlaygama).toBe(true)
    })
  })

  describe('showOnlyAvailableText', () => {
    it('true when any platform flag is set AND license is not pending', () => {
      const c = resolveCapabilities({
        flags: { ...allFlagsOff, isCrazyWeb: true },
        hostname: 'iframe.crazygames.com',
        glitchLicenseStatus: 'ok'
      })
      expect(c.showOnlyAvailableText).toBe(true)
    })

    it('false on dev (no platform flag set)', () => {
      const c = resolveCapabilities({
        flags: allFlagsOff,
        hostname: 'localhost',
        glitchLicenseStatus: 'pending'
      })
      expect(c.showOnlyAvailableText).toBe(false)
    })
  })
})
