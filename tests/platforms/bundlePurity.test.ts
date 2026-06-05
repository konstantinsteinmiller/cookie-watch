// @vitest-environment node
//
// ─── Bundle-purity tests ───────────────────────────────────────────────────
//
// Builds the CrazyGames target and grep-asserts that platform-foreign
// modules don't end up in the chunks the player downloads.
//
// Why this test exists: the platform refactor (commit 82f1d6e, 2026-04-28)
// regressed the CG initial-load size from ~0.7MB to ~1.6MB because the
// resolvers (`resolveSaveStrategy`, `resolveAdProvider`) were rewritten
// to branch on a runtime `flags` parameter instead of `import.meta.env.*`
// literals — Rollup couldn't tree-shake any platform plugin from any
// build's bundle. Heavy modules that leaked into the CG bundle:
//   • `gameDistributionPlugin.ts` (~500 LOC + GD SDK loader)
//   • `glitchPlugin.ts` (Glitch.fun licensing/heartbeat)
//   • `LevelPlayProvider` → `@tauri-apps/api/core` (Unity LevelPlay shim)
//   • `peerjs` (~150KB obfuscated, transitively via `usePVP.ts`)
//
// CG QA flagged the bloat on 2026-04-30. The fix:
//   1. Resolvers gate on `import.meta.env.VITE_APP_*` literals so Rollup
//      can dead-code-eliminate unused platform branches.
//   2. Heavy plugin imports inside providers became dynamic-imports so
//      tree-shaking can remove them.
//   3. PeerJS load became a build-time-gated dynamic import.
//
// This test asserts those guards stay in place. It uses an unobfuscated
// build because string-array obfuscation makes the markers unfindable.
// The build is cheap (<10s with Vite's cache).

import { describe, it, expect, beforeAll } from 'vitest'
import { build } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '../..')
// Out-of-tree dist so the test build doesn't stomp the developer's
// `pnpm build:crazy-web` artefact.
const OUT_DIR = path.resolve(PROJECT_ROOT, 'dist-purity-cg')

let chunkContents = new Map<string, string>()

beforeAll(async () => {
  // Drop any prior artefact so we measure a fresh build.
  fs.rmSync(OUT_DIR, { recursive: true, force: true })

  await build({
    root: PROJECT_ROOT,
    mode: 'crazy-web',
    configFile: path.resolve(PROJECT_ROOT, 'vite.config.ts'),
    build: {
      outDir: OUT_DIR,
      emptyOutDir: true,
      sourcemap: false
    },
    logLevel: 'silent',
    // Force-disable the obfuscator so string-marker greps work.
    define: {
      'import.meta.env.VITE_ENABLE_OBFUSCATION': JSON.stringify('false')
    }
  } as any)

  const assetsDir = path.join(OUT_DIR, 'assets')
  for (const f of fs.readdirSync(assetsDir)) {
    if (!f.endsWith('.js')) continue
    chunkContents.set(f, fs.readFileSync(path.join(assetsDir, f), 'utf8'))
  }
}, 120_000)

// Find every chunk that the CrazyGames build's user actually downloads
// before reaching the gameplay screen. That's:
//   • the entry chunk   (index-*.js)
//   • the App chunk     (App-*.js, the route-shell)
//   • the SpinnerArena route chunk (the gameplay view + its statically
//     imported composables)
// Lazy chunks (locale loaders, vConsole, glitchPlugin) are loaded on
// demand and excluded — leaking platform code into THOSE is not a
// regression because they only fetch when the relevant code path runs.
const isHotPathChunk = (name: string): boolean =>
  /^(index|App|SpinnerArena)-[A-Za-z0-9_-]+\.js$/.test(name)

const findInHotPath = (pattern: RegExp): { chunk: string; matches: number }[] => {
  const out: { chunk: string; matches: number }[] = []
  for (const [name, content] of chunkContents) {
    if (!isHotPathChunk(name)) continue
    const matches = content.match(pattern)?.length ?? 0
    if (matches > 0) out.push({ chunk: name, matches })
  }
  return out
}

describe('CrazyGames build — bundle purity', () => {
  it('builds at all (sanity check)', () => {
    expect(chunkContents.size).toBeGreaterThan(0)
    const hot = [...chunkContents.keys()].filter(isHotPathChunk)
    expect(hot.length, `hot-path chunks found: ${hot.join(', ')}`).toBeGreaterThan(0)
  })

  // ── Marker selection rationale ─────────────────────────────────────────
  // Patterns target unique IDENTIFIERS that only appear when the actual
  // SDK / library code is bundled (function names, runtime globals, SDK
  // URLs). Plain platform-NAME strings ("gamedistribution.com",
  // "glitch.fun", "wavedash.com") are EXPECTED in the hot path because
  // App.vue and the CSP-checking code legitimately compare hostnames
  // against them; matching on those would produce false positives.

  it('does NOT bundle GameDistribution SDK code in any hot-path chunk', () => {
    // SDK-only identifiers — present in the entry chunk only when the
    // actual `gameDistributionPlugin.ts` body is inlined (vs. a lazy
    // dynamic-import call that just references its filename).
    //   - `html5.api.gamedistribution` — SDK script URL
    //   - `GD_OPTIONS`                — SDK config global
    //   - `gdsdk`                     — SDK accessor global
    //   - `SDK_REWARDED_WATCH_COMPLETE` — SDK event name
    const leaks = findInHotPath(/html5\.api\.gamedistribution|\bGD_OPTIONS\b|\bgdsdk\b|SDK_REWARDED_WATCH_COMPLETE/)
    expect(leaks, `GameDistribution SDK code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT bundle Glitch.fun SDK code in any hot-path chunk', () => {
    // GlitchStrategy class definition + glitch-internal endpoints.
    // (Plain `"glitch.fun"` string is allowed — used as a hostname
    // literal in CSP/host-detection code. `glitchLicenseStatus` is also
    // allowed: it's a 5-line `ref()` shared with App.vue's capability
    // gate; the actual API calls live in a lazy chunk.)
    const leaks = findInHotPath(/GlitchStrategy\b|GLITCH_LICENSE_API|aegis-bridge|glitch-heartbeat-token/)
    expect(leaks, `Glitch SDK code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT bundle @tauri-apps / LevelPlay code in any hot-path chunk', () => {
    // Tauri runtime globals appear ONLY when `@tauri-apps/api/core` is
    // bundled. The package writes/reads these on the global window.
    // (Plain `"@tauri-apps/api"` strings appear in error messages we
    // wrote and are OK.)
    const leaks = findInHotPath(/__TAURI_INTERNALS__|__TAURI_INVOKE_KEY__|__TAURI_TO_IPC_KEY__|levelPlayInit|__levelplay/)
    expect(leaks, `Tauri/LevelPlay code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT bundle PeerJS / WebRTC plumbing in any hot-path chunk', () => {
    // PeerJS itself ships WebRTC constructor names and the iceServers
    // config helper. ~150KB obfuscated when bundled; should ONLY be
    // loaded via a build-time-gated dynamic import in `usePVP.ts`.
    // (Plain `"peerjs"` string is a debug label in usePVP.ts and
    // expected to remain.)
    const leaks = findInHotPath(/RTCPeerConnection|RTCDataChannel|RTCSessionDescription|RTCIceCandidate/)
    expect(leaks, `PeerJS leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT emit a vConsole chunk on a web (non-native) build', () => {
    // vConsole is gated to `VITE_APP_NATIVE === 'true'` (or an explicit
    // `VITE_APP_INCLUDE_VCONSOLE=true` opt-in) in `main.ts`. On a CG
    // build the dynamic-import call is dead code, so no `vconsole.min`
    // chunk should be emitted at all.
    const allChunks = [...chunkContents.keys()]
    const vconsoleChunks = allChunks.filter((n) => /vconsole/i.test(n))
    expect(
      vconsoleChunks,
      `vConsole chunks emitted on a web build: ${vconsoleChunks.join(', ')}`
    ).toEqual([])
  })

  it('does NOT bundle Playgama Bridge code in any hot-path chunk', () => {
    // PlaygamaProvider / PlaygamaStrategy / playgamaPlugin should
    // tree-shake on non-Playgama builds because the resolver arms gate
    // on the `VITE_APP_PLAYGAMA` literal. We grep for the strategy
    // class name + the bridge CDN URL + the play-time lifecycle event
    // strings — none of those appear anywhere in the project except
    // inside the Playgama plugin / strategy. (Plain `"playgama"` and
    // `"playgama.com"` ARE expected in the hot path — capabilities /
    // CSP code legitimately reference them as hostname/text literals.)
    const leaks = findInHotPath(/PlaygamaStrategy\b|bridge\.playgama\.com|playgama-bridge|PLAYGAMA_BRIDGE|in_game_loading_started\b/)
    expect(leaks, `Playgama plugin code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does NOT bundle Wavedash SDK code in any hot-path chunk', () => {
    // `@wvdsh/sdk-js` is the Wavedash NPM package; the runtime relies on
    // `window.WavedashJS` injected by Wavedash's iframe wrapper, so
    // neither of these literals should appear in a CrazyGames build.
    // (Plain `"wavedash"` string is a build-flag label and OK.)
    const leaks = findInHotPath(/@wvdsh\/sdk-js|wvdsh\b|WavedashSDK\b/)
    expect(leaks, `Wavedash SDK code leaked into hot-path: ${JSON.stringify(leaks)}`).toEqual([])
  })

  it('does include the CrazyGames Strategy + provider markers (positive control)', () => {
    // Sanity check that we DIDN'T accidentally tree-shake the platform
    // we DO want — catches a future "fixed everything to Noop" regression.
    const cgStrategy = findInHotPath(/CrazyGamesStrategy|crazyGames|sdk\.crazygames\.com/)
    expect(cgStrategy.length, 'CrazyGames provider/strategy missing from hot-path bundle!').toBeGreaterThan(0)
  })
})
