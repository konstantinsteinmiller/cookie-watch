// ─── End-to-end: CrazyGames build mirrors saves to sdk.data ─────────────────
//
// Reproduces the full failure mode the CG QA team reported: builds shipping
// without the crazy-web flag silently fall back to LocalStorageStrategy and
// never call sdk.data.* — every save lands locally with no cloud sync.
//
// What this test does:
//   1. Programmatically boots Vite in `crazy-web` mode (so isCrazyWeb=true).
//   2. Launches Chromium via Playwright with an `addInitScript` that
//      installs a stub `window.CrazyGames.SDK` whose `data.setItem` is
//      observable from the test.
//   3. Navigates to the served page and waits for `window.__saveManager`
//      to appear — that's the signal that SaveManager.init() finished.
//   4. Triggers a normal `localStorage.setItem('spinner_coins', ...)` from
//      the page.
//   5. Asserts that, after the strategy's flush debounce, the stub SDK
//      saw `setItem('spinner_coins', '999')` plus a manifest update.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { createServer, type ViteDevServer } from 'vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')

let server: ViteDevServer
let browser: Browser
let baseUrl: string

const installFakeSdk = () => {
  // Lives in page context — keep it self-contained.
  const calls: { method: string; key: string; value?: string; at: number }[] = []
  const store = new Map<string, string>()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__cgFakeCalls = calls
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__cgFakeStore = store
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).CrazyGames = {
    SDK: {
      environment: 'crazygames',
      init: async () => {
      },
      data: {
        getItem: async (k: string) => {
          calls.push({ method: 'get', key: k, at: Date.now() })
          return store.get(k) ?? null
        },
        setItem: async (k: string, v: string) => {
          calls.push({ method: 'set', key: k, value: v, at: Date.now() })
          store.set(k, v)
        },
        removeItem: async (k: string) => {
          calls.push({ method: 'remove', key: k, at: Date.now() })
          store.delete(k)
        }
      },
      user: {
        getUser: async () => null,
        systemInfo: { locale: 'en-US' }
      },
      game: {
        settings: { muteAudio: false },
        addSettingsChangeListener: () => {
        },
        gameplayStart: () => {
        },
        gameplayStop: () => {
        },
        happytime: () => {
        }
      },
      ad: {
        requestAd: () => {
        },
        hasAdblock: async () => false
      }
    }
  }
}

beforeAll(async () => {
  server = await createServer({
    root: PROJECT_ROOT,
    mode: 'crazy-web',
    configFile: path.resolve(PROJECT_ROOT, 'vite.config.ts'),
    server: { port: 0, strictPort: false, host: '127.0.0.1' },
    logLevel: 'warn'
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address !== 'object') {
    throw new Error('vite dev server did not expose an address')
  }
  baseUrl = `http://127.0.0.1:${address.port}`

  browser = await chromium.launch({ headless: true })
}, 90_000)

afterAll(async () => {
  await browser?.close()
  await server?.close()
})

const blockCrazyGamesSdkScript = async (context: import('playwright').BrowserContext) => {
  await context.route(/sdk\.crazygames\.com\/crazygames-sdk-v3\.js/, (route) => {
    void route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stubbed */' })
  })
}

describe('CrazyGames build → sdk.data', () => {
  it('mirrors a localStorage write per-key through to sdk.data.setItem', async () => {
    const context = await browser.newContext()
    await blockCrazyGamesSdkScript(context)
    await context.addInitScript(installFakeSdk)
    const page = await context.newPage()

    page.on('pageerror', (e) => console.error('[page error]', e.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[page console.error]', msg.text())
      else if (msg.type() === 'warn') console.warn('[page console.warn]', msg.text())
    })

    await page.goto(baseUrl, { waitUntil: 'load', timeout: 60_000 })

    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => !!(window as any).__saveManager,
      null,
      { timeout: 60_000 }
    )

    const strategyName = await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__saveManager?.strategyName ?? null
    )
    expect(strategyName).toBe('crazyGames')

    // Snapshot calls from boot (manifest get + initial mirror) and clear
    // them so we measure only the explicit save below.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).__cgFakeCalls.length = 0
    })

    await page.evaluate(() => {
      window.localStorage.setItem('spinner_coins', '999')
    })

    await page.waitForTimeout(1500)

    const calls: Array<{ method: string; key: string; value?: string }> =
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await page.evaluate(() => (window as any).__cgFakeCalls)

    const setCoinsCalls = calls.filter((c) => c.method === 'set' && c.key === 'spinner_coins')
    expect(setCoinsCalls.length).toBeGreaterThan(0)
    expect(setCoinsCalls[setCoinsCalls.length - 1]!.value).toBe('999')

    await context.close()
  }, 90_000)

  it('writes the keys-manifest to sdk.data after a save', async () => {
    const context = await browser.newContext()
    await blockCrazyGamesSdkScript(context)
    await context.addInitScript(installFakeSdk)
    const page = await context.newPage()

    page.on('pageerror', (e) => console.error('[page error]', e.message))
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error('[page console.error]', msg.text())
    })

    await page.goto(baseUrl, { waitUntil: 'load', timeout: 60_000 })
    await page.waitForFunction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => !!(window as any).__saveManager,
      null,
      { timeout: 60_000 }
    )

    await page.evaluate(() => {
      window.localStorage.setItem('spinner_player_team', JSON.stringify([1, 2, 3]))
    })
    await page.waitForTimeout(1500)

    const manifestRaw: string | null = await page.evaluate(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => (window as any).__cgFakeStore.get('__save_internal__crazy_keys') ?? null
    )
    expect(manifestRaw).not.toBeNull()
    const manifest = JSON.parse(manifestRaw!)
    expect(Array.isArray(manifest)).toBe(true)
    expect(manifest).toContain('spinner_player_team')

    await context.close()
  }, 90_000)
})
