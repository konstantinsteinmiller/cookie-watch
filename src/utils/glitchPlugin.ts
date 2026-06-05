import { glitchLicenseStatus } from '@/use/useGlitchLicense'
import { GlitchStrategy } from '@/utils/save/GlitchStrategy'
import type { SaveStrategy } from '@/utils/save/types'

// ─── Glitch plugin ─────────────────────────────────────────────────────────
//
// Encapsulates everything the game talks to Glitch.fun about:
//
//   1. License validation + payout heartbeat — existing behavior.
//   2. Save API integration — a `GlitchStrategy` that can plug into
//      `SaveManager` so progress persists through Glitch's versioned save
//      slot API.
//
// The save strategy is exposed via `createGlitchSaveStrategy()` so the
// bootstrap code can wire it into `SaveManager` without this module having
// to know about the rest of the app. Returning `null` when config is
// missing means the bootstrap can fall back to localStorage transparently.

const HEARTBEAT_INTERVAL_MS = 60_000

interface GlitchConfig {
  titleId: string
  installId: string
  token: string
}

/**
 * Resolve config from Vite env + URL. Returns `null` if any piece is
 * missing — callers should treat that as "Glitch is not available in
 * this session" and fall back gracefully.
 */
const resolveGlitchConfig = (): GlitchConfig | null => {
  const installId = new URLSearchParams(window.location.search).get('install_id')
  if (!installId) return null

  const isProduction = import.meta.env.VITE_NODE_ENV === 'production'
  const titleId = isProduction
    ? import.meta.env.VITE_APP_GLITCH_INSTALL_ID
    : import.meta.env.VITE_APP_GLITCH_TEST_INSTALL_ID
  const token = import.meta.env.VITE_APP_GLITCH_TOKEN

  if (!titleId || !token) return null
  return { titleId, installId, token }
}

/**
 * Build the save strategy for Glitch. Returns `null` when config is
 * missing so `SaveManager` can use the default localStorage strategy
 * instead of failing opaque network calls on every write.
 */
export const createGlitchSaveStrategy = (): SaveStrategy | null => {
  const cfg = resolveGlitchConfig()
  if (!cfg) return null
  return new GlitchStrategy(cfg)
}

/**
 * Kick off license validation + payout heartbeat. Should be fired early
 * during bootstrap when the build is configured for Glitch. Safe to call
 * when config is missing — license status flips to 'denied' and no
 * network calls happen.
 */
export const glitchPlugin = (): void => {
  const cfg = resolveGlitchConfig()
  if (!cfg) {
    console.warn('[Glitch] Missing install_id / titleId / token — heartbeat disabled.')
    glitchLicenseStatus.value = 'denied'
    return
  }

  const { titleId, installId, token } = cfg

  const validate = async (): Promise<void> => {
    try {
      const response = await fetch(
        `https://api.glitch.fun/api/titles/${titleId}/installs/${installId}/validate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        }
      )
      glitchLicenseStatus.value = response.ok ? 'ok' : 'denied'
    } catch {
      glitchLicenseStatus.value = 'denied'
    }
  }

  const sendPayoutHeartbeat = (): void => {
    fetch(`https://api.glitch.fun/api/titles/${titleId}/installs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ user_install_id: installId, platform: 'web' })
    }).catch(() => {
      /* swallow — heartbeat is best-effort */
    })
  }

  validate().then(() => {
    if (glitchLicenseStatus.value !== 'ok') return
    sendPayoutHeartbeat()
    setInterval(sendPayoutHeartbeat, HEARTBEAT_INTERVAL_MS)
  })
}

export default glitchPlugin
