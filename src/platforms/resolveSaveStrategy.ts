// ─── Save-strategy resolver ─────────────────────────────────────────────────
//
// Pure function that takes the platform flags and returns the right
// `SaveStrategy`. Lifted from the inline ternary in `main.ts` so the
// branching is testable in isolation.
//
// ## Imports are DYNAMIC — and gated by `import.meta.env.VITE_APP_*`. Why:
//
// The previous version of this file used static imports of every platform
// plugin, with the wrong claim that `flags.isXxx` would let Rollup
// tree-shake. It can't: `flags` is a runtime parameter, not a build-time
// constant, so Rollup conservatively keeps every import. That regressed
// the CrazyGames bundle from ~700KB to ~1.6MB transferred (CG QA flagged
// it 2026-04-30) because `gameDistributionPlugin.ts` (486 LOC) and
// `glitchPlugin.ts` were being inlined into the entry chunk for every
// build, including CrazyGames.
//
// The pre-refactor `main.ts` had it right: dynamic `await import('@/...')`
// inside `if (import.meta.env.VITE_APP_XXX === 'true') {}` branches.
// Rollup recognises the env literal as a constant, dead-code-eliminates
// the unmatched branches, and only the active platform's plugin chunk
// ends up in the bundle.
//
// The obfuscator catch — `vite-plugin-javascript-obfuscator`'s
// `stringArray` transform rewrites the `'@/...'` literals inside dynamic
// imports, breaking them at runtime. Solved by adding THIS file to the
// obfuscator's exclude list in `vite.config.ts` (alongside `main.ts`,
// `router/index.ts`, `i18n/index.ts`).
//
// ## Priority order MUST match `main.ts`'s historical ternary:
//   1. isGlitch         → GlitchStrategy (fallback to LocalStorageStrategy)
//   2. isCrazyWeb       → CrazyGamesStrategy
//   3. isGameDistribution → GameDistributionStrategy (fallback to LocalStorageStrategy)
//   4. else              → LocalStorageStrategy

import type { SaveStrategy } from '@/utils/save/types'
import type { PlatformFlags } from './capabilities'

export const resolveSaveStrategy = async (_flags: PlatformFlags): Promise<SaveStrategy> => {
  if (import.meta.env.VITE_APP_GLITCH === 'true') {
    const { createGlitchSaveStrategy } = await import('@/utils/glitchPlugin')
    const { LocalStorageStrategy } = await import('@/utils/save/LocalStorageStrategy')
    return createGlitchSaveStrategy() ?? new LocalStorageStrategy()
  }
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') {
    const { createCrazyGamesSaveStrategy } = await import('@/use/useCrazyGames')
    return await createCrazyGamesSaveStrategy()
  }
  if (import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true') {
    const { createGameDistributionSaveStrategy } = await import('@/utils/gameDistributionPlugin')
    const { LocalStorageStrategy } = await import('@/utils/save/LocalStorageStrategy')
    return createGameDistributionSaveStrategy() ?? new LocalStorageStrategy()
  }
  if (import.meta.env.VITE_APP_PLAYGAMA === 'true') {
    const { createPlaygamaSaveStrategy } = await import('@/utils/playgamaPlugin')
    return await createPlaygamaSaveStrategy()
  }
  if (import.meta.env.VITE_APP_GAMEPIX === 'true') {
    // GamePix has portal-side cross-device storage at
    // `window.GamePix.localStorage`. Native localStorage alone gets
    // wiped on every toolkit upload (each upload is a fresh iframe
    // origin), so we must mirror through the strategy. The strategy
    // handles the boot race (SDK init lags SaveManager init) with a
    // pending-writes queue + 250 ms flush poll.
    const { GamePixStrategy } = await import('@/utils/save/GamePixStrategy')
    return new GamePixStrategy()
  }
  if (import.meta.env.VITE_APP_GAME_MONETIZE === 'true') {
    // GameMonetize has no cloud-save / player-data API — local-only. Its own
    // strategy (rather than LocalStorageStrategy) so SaveManager.strategyName
    // reports `gamemonetize` in telemetry.
    const { GameMonetizeStrategy } = await import('@/utils/save/GameMonetizeStrategy')
    return new GameMonetizeStrategy()
  }
  if (import.meta.env.VITE_APP_YANDEX === 'true') {
    // Yandex has `player.setData / getData` (200 KB per player, 100 req /
    // 5 min). `yandexPlugin()` is AWAITED from main.ts BEFORE this resolver
    // runs, so by the time `hydrate()` is called both ysdk + player are
    // settled — the strategy reads them via `getYandexPlayer()` and
    // performs an authoritative cloud-read before SaveManager continues.
    const { YandexStrategy } = await import('@/utils/save/YandexStrategy')
    return new YandexStrategy()
  }
  const { LocalStorageStrategy } = await import('@/utils/save/LocalStorageStrategy')
  return new LocalStorageStrategy()
}
