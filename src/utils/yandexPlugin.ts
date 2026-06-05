// ─── Yandex Games SDK plugin ────────────────────────────────────────────────
//
// Lazy-loaded module that owns everything the game talks to Yandex about. The
// bootstrap (`main.ts`) dynamic-imports this only when `isYandex` is true so
// non-Yandex builds tree-shake every byte below.
//
// What lives here:
//
//   1. `yandexPlugin()` — lazily injects the SDK script via the relative path
//      (chose the absolute S3 URL over the iframe-served `/sdk.js` so dev /
//      preview contexts can load the SDK too — Yandex docs flag both as
//      supported), awaits `YaGames.init()`, then `ysdk.getPlayer()` so callers
//      can trust both are ready on resolve. Idempotent — multiple calls return
//      the same Promise.
//
//   2. Pause/resume bridge — Yandex dispatches `game_api_pause` on every
//      tab-hide, ad show, and purchase dialog open, and `game_api_resume` on
//      the corresponding close. We OR these into the universal `isAdShowing`
//      gate (synchronously suspends audio + freezes the render loop, see
//      useGamePause / useGamePauseAudio). `pauseGame` / `resumeGame` are
//      idempotent so duplicate callbacks can't latch.
//
//   3. Lifecycle wrappers — `yandexLoadingReady()` fires
//      `ysdk.features.LoadingAPI.ready()` (required for cert: "when the user
//      can start playing the game, the LoadingAPI.ready() method must be
//      called"), `yandexGameplayStart/Stop` fire `GameplayAPI.start/stop()`.
//      All three are idempotent and no-op until init resolves.
//
//   4. `showRewardedAdYA()` / `showMidgameAdYA()` — Promise-based wrappers.
//      Rewarded resolves `true` ONLY when `onRewarded` fires (the documented
//      "ad impression counted" signal). Interstitial resolves when the SDK
//      reports `onClose` (with or without `wasShown` — both close out the
//      gameplay block on our side). Neither rejects — callers `await` and
//      resume gameplay regardless.
//
//   5. `isYandexSdkActive` / `isYandexAdsBlocked` / `yandexLocale` reactive
//      refs — mirror into `YandexProvider` / `main.ts`. `isAdsBlocked` is
//      best-effort: Yandex proxies the SDK through its own iframe so
//      browser-side blockers can't break the script load, but an `onError`
//      whose code matches a known ad-blocker pattern still flips the flag so
//      the shared `AdsBlockedModal` can surface.
//
// SDK reference: https://yandex.com/dev/games/doc/en/sdk/sdk-about

import { ref } from 'vue'
import { isYandex } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import { pauseGame, resumeGame } from '@/use/useGamePause'

// Relative path — Yandex's iframe wrapper rewrites `/sdk.js` to the right
// backend at request time, and the `@yandex-games/sdk-dev-proxy` intercepts
// the same path during local development. ABSOLUTE URLs to Yandex's S3
// (`https://sdk.games.s3.yandex.net/sdk.js`) work at runtime but are FORBIDDEN
// by moderation — their static scanner flags any hardcoded `*.s3.yandex.*`
// URL with "Service storage URL detected" and rejects the draft. Always
// resolve the SDK via the relative path.
const SDK_SRC = '/sdk.js'
const SDK_SCRIPT_ID = 'yandex-games-sdk'
const SDK_READY_TIMEOUT_MS = 10_000
// Soft deadline for a rewarded ad to OPEN. When an ad-blocker (Brave Shields /
// uBlock) nukes the ad scripts, Yandex's SDK takes ~10s to exhaust its bidder
// waterfall before firing `onError` — the game sits frozen the whole time with
// no feedback. If `onOpen` hasn't fired within this window we stop waiting:
// probe to confirm an ad-blocker, surface the AdsBlockedModal, and resume the
// game. We do NOT cancel the underlying SDK request — a genuinely slow ad that
// opens LATE is re-bracketed by the onOpen/onClose handlers so it never plays
// over live gameplay.
const REWARDED_SOFT_TIMEOUT_MS = 3_000

declare global {
  interface Window {
    YaGames?: {
      init: (options?: { signed?: boolean }) => Promise<YandexSdk>
    }
  }
}

// Minimal structural typing of the bits of the Yandex SDK we touch. Untyped
// (`any`) was the alternative — the explicit shape catches typos at compile
// time and makes the call sites self-documenting.
export interface YandexPlayer {
  setData(data: object, flush?: boolean): Promise<void>
  getData(keys?: string[]): Promise<Record<string, unknown>>
  getUniqueID(): string
  getName(): string | undefined
  isAuthorized(): boolean
}

interface YandexAdv {
  showFullscreenAdv(args: {
    callbacks?: {
      onOpen?: () => void
      onClose?: (wasShown: boolean) => void
      onError?: (error: unknown) => void
      onOffline?: () => void
    }
  }): void
  showRewardedVideo(args: {
    callbacks?: {
      onOpen?: () => void
      onRewarded?: () => void
      onClose?: (wasShown?: boolean) => void
      onError?: (error: unknown) => void
    }
  }): void
}

interface YandexFeatures {
  LoadingAPI?: { ready: () => void }
  GameplayAPI?: { start: () => void; stop: () => void }
}

interface YandexEnvironment {
  i18n?: { lang?: string; tld?: string }
  app?: { id?: string }
  payload?: string
}

export interface YandexSdk {
  adv: YandexAdv
  features?: YandexFeatures
  environment?: YandexEnvironment
  getPlayer(options?: { signed?: boolean }): Promise<YandexPlayer>
  on(event: string, cb: () => void): void
  off(event: string, cb: () => void): void
}

/** Reactive: true once `YaGames.init()` AND `getPlayer()` have resolved. */
export const isYandexSdkActive = ref(false)

/** Reactive: true when the SDK reports an error whose code/message indicates
 *  the player has a browser ad-blocker installed. Yandex's iframe proxy makes
 *  this rare — the SDK itself loads, but ad slots can fail downstream with
 *  recognizable error codes. Latched once observed. */
export const isYandexAdsBlocked = ref(false)

/** Reactive: ISO-639-1 language the Yandex Games UI is currently running in
 *  (`en`, `ru`, `tr`, etc.). Captured at init from `ysdk.environment.i18n.lang`
 *  so main.ts can seed first-time players' locale to match the portal UI. */
export const yandexLocale = ref<string | null>(null)

let ysdk: YandexSdk | null = null
let player: YandexPlayer | null = null
let initPromise: Promise<void> | null = null
// Re-entrancy guard for the lifecycle calls. The SDK doesn't no-op duplicates,
// so we track our own state and short-circuit. Required for cert: GameplayAPI
// must be balanced (every start has exactly one stop).
let loadingReadyFired = false
let gameplayActive = false

const TAG = '[yandex]'
const dlog = (...args: unknown[]): void => {
  if (isDebug.value) console.info(...args)
}

// ─── Init ──────────────────────────────────────────────────────────────────

/**
 * Initialise the Yandex Games SDK. Idempotent — repeated calls return the
 * same Promise. Resolves once `YaGames.init()` AND `ysdk.getPlayer()` have
 * settled (or the defensive timeout has fired). Safe to call when `isYandex`
 * is false — no-op.
 *
 * The plugin is AWAITED from `main.ts` (not parallel-init like GameMonetize /
 * Playgama) because `SaveManager.init()` needs `getPlayer()` resolved before
 * hydrate so the cloud read is authoritative — without the await, hydrate
 * races SDK init and reads as empty, and the cross-device save the Yandex
 * cert mandates breaks.
 */
export const yandexPlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  initPromise = (async () => {
    if (typeof window === 'undefined') return
    if (!isYandex) return

    // Inject the SDK script. Idempotent — skip if a tag is already present
    // (HMR / repeat init). The SDK is hosted on Yandex's S3; the absolute URL
    // works in dev/preview AND inside the Yandex iframe. The alternative
    // `<script src="/sdk.js">` only works inside the iframe (the path is
    // served by Yandex's wrapper), which would brick local builds.
    await loadSdkScript()

    if (!window.YaGames) {
      console.warn(`${TAG} YaGames global not present after script load — SDK disabled`)
      return
    }

    try {
      ysdk = await withTimeout(window.YaGames.init(), SDK_READY_TIMEOUT_MS, 'YaGames.init')
    } catch (e) {
      console.warn(`${TAG} YaGames.init failed`, e)
      return
    }

    if (!ysdk) return

    // Capture locale BEFORE getPlayer so main.ts can read it during the same
    // boot phase. `i18n.lang` is the Yandex UI language (ISO-639-1).
    try {
      const lang = ysdk.environment?.i18n?.lang
      if (typeof lang === 'string' && lang.length > 0) {
        yandexLocale.value = lang
        dlog(`${TAG} portal locale → ${lang}`)
      }
    } catch { /* environment optional */ }

    // getPlayer always succeeds — anonymous users get a stable unique ID
    // (used by the Yandex cloud as the row key); authorized users get name
    // + photo too. Unsigned because we have no server-side verifier.
    try {
      player = await withTimeout(ysdk.getPlayer(), SDK_READY_TIMEOUT_MS, 'ysdk.getPlayer')
    } catch (e) {
      console.warn(`${TAG} getPlayer failed — save will fall back to local-only`, e)
      // Keep ysdk set so ads still work; YandexStrategy detects the missing
      // player and degrades to local-only without bricking the boot.
    }

    isYandexSdkActive.value = true

    // Wire the universal pause gate to Yandex's lifecycle events. Yandex
    // fires `game_api_pause` on tab-hide, purchase dialogs, and ad show/close.
    //
    // The bridge ONLY toggles `isPlatformPaused` (via pauseGame/resumeGame) —
    // it deliberately does NOT touch `isAdShowing`. Two reasons:
    //
    //   1. `isAdShowing` is owned by `useAds.showRewardedAd / showMidgameAd`,
    //      which hold it for the WHOLE duration of a game-requested ad. Yandex
    //      emits `game_api_pause`/`game_api_resume` transiently around ad
    //      PRELOAD (see the console's `interstitialPreload` chatter); if the
    //      bridge flipped `isAdShowing=false` on one of those stray resumes,
    //      `isGamePaused` would drop mid-ad and the audio + render loop would
    //      resume UNDERNEATH the ad (the "music plays during the interstitial"
    //      report). Keeping `isAdShowing` solely in useAds' hands means the
    //      suspend holds for the entire ad regardless of bridge noise.
    //
    //   2. `pauseGame()` alone already drives the same `isGamePaused` gate
    //      (→ synchronous audio suspend), so flipping `isAdShowing` here was
    //      always redundant for the suspend.
    //
    // The matching `resumeGame()` on settle is ALSO forced from the ad-show
    // wrappers below — because on a no-fill / ad-blocked error Yandex fires
    // `game_api_pause` but NEVER `game_api_resume`, which would otherwise latch
    // `isPlatformPaused` true and freeze the game after the modal closes.
    try {
      ysdk.on('game_api_pause', () => { pauseGame() })
      ysdk.on('game_api_resume', () => { resumeGame() })
    } catch (e) {
      console.warn(`${TAG} pause/resume bridge wiring failed`, e)
    }
  })()
  return initPromise
}

const loadSdkScript = async (): Promise<void> => {
  // `window.YaGames` is sometimes already populated by the time the plugin
  // runs — the Yandex iframe wrapper preloads its versioned SDK chunk via
  // the iframe URL's `?sdk=` param. In that case there's nothing for us to
  // inject; skipping the script tag avoids a duplicate SDK instance.
  if (typeof window !== 'undefined' && window.YaGames) return
  if (document.getElementById(SDK_SCRIPT_ID) || document.querySelector(`script[src="${SDK_SRC}"]`)) {
    return
  }
  await new Promise<void>((resolve) => {
    const script = document.createElement('script')
    script.id = SDK_SCRIPT_ID
    script.src = SDK_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Don't reject — the plugin should resolve gracefully on script
      // failure (offline, CSP, network) so the rest of boot continues.
      // `isYandexSdkActive` stays false, ads no-op, save falls back to local.
      console.warn(`${TAG} SDK script failed to load (offline / CSP / network)`)
      isYandexAdsBlocked.value = true
      resolve()
    }
    document.head.appendChild(script)
  })
}

const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}

// ─── Player / SDK accessors ─────────────────────────────────────────────────
//
// `YandexStrategy` reads these to drive cloud setData/getData. They return
// `null` until `yandexPlugin()` has resolved — the plugin is awaited from
// `main.ts` BEFORE `SaveManager.init()` runs, so by the time the strategy
// methods fire both are populated (or `null` on the player-failed
// degradation path the strategy handles).

/** Strategy accessor — `null` until `yandexPlugin()` resolves. */
export const getYandexPlayer = (): YandexPlayer | null => player

/** Strategy accessor — `null` until `yandexPlugin()` resolves. */
export const getYandexSdk = (): YandexSdk | null => ysdk

// ─── Lifecycle wrappers (LoadingAPI + GameplayAPI) ──────────────────────────

/**
 * Fire `ysdk.features.LoadingAPI.ready()` — Yandex's "game is interactive"
 * edge. Cert-mandatory ("when the user can start playing the game, the
 * LoadingAPI.ready() method must be called"). Idempotent: safe to call from
 * multiple places (App.vue's asset-loaded watcher, splash unmount). No-op
 * until `yandexPlugin()` resolves.
 */
export const yandexLoadingReady = (): void => {
  if (!isYandexSdkActive.value || loadingReadyFired) return
  try {
    ysdk?.features?.LoadingAPI?.ready()
    loadingReadyFired = true
    dlog(`${TAG} LoadingAPI.ready()`)
  } catch (e) {
    console.warn(`${TAG} LoadingAPI.ready() threw`, e)
  }
}

/**
 * Fire `ysdk.features.GameplayAPI.start()` — Yandex's "active gameplay
 * starting" edge. Used for analytics + ad eligibility. Cert is strict here
 * (per the requirements page: "if used in the game, the timing of event
 * dispatches must strictly correspond to those described"). Idempotent.
 */
export const yandexGameplayStart = (): void => {
  if (!isYandexSdkActive.value || gameplayActive) return
  try {
    ysdk?.features?.GameplayAPI?.start()
    gameplayActive = true
    dlog(`${TAG} GameplayAPI.start()`)
  } catch (e) {
    console.warn(`${TAG} GameplayAPI.start() threw`, e)
  }
}

/** Companion to `yandexGameplayStart`. Idempotent. */
export const yandexGameplayStop = (): void => {
  if (!isYandexSdkActive.value || !gameplayActive) return
  try {
    ysdk?.features?.GameplayAPI?.stop()
    gameplayActive = false
    dlog(`${TAG} GameplayAPI.stop()`)
  } catch (e) {
    console.warn(`${TAG} GameplayAPI.stop() threw`, e)
  }
}

// ─── Rewarded video ad ──────────────────────────────────────────────────────

/**
 * Show a rewarded ad. Resolves `true` only when `onRewarded` fired — the
 * Yandex-documented "ad impression counted" signal. `onClose` alone resolves
 * `false` (player skipped). Resolves `false` on `onError` too.
 *
 * No-op (resolves false) when the SDK is not active.
 */
export const showRewardedAdYA = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!ysdk) {
      resolve(false)
      return
    }
    let granted = false
    let settled = false
    let adOpened = false
    let softTimer: ReturnType<typeof setTimeout> | null = null

    const clearSoftTimer = (): void => {
      if (softTimer !== null) { clearTimeout(softTimer); softTimer = null }
    }

    const finish = (): void => {
      if (settled) return
      settled = true
      clearSoftTimer()
      // Force-clear any platform pause the SDK's `game_api_pause` set when the
      // ad was requested. On a no-fill / ad-blocked error Yandex fires
      // `game_api_pause` but NEVER the matching `game_api_resume`, which would
      // otherwise latch `isPlatformPaused` true and freeze the game after the
      // modal closes. `resumeGame()` is idempotent — harmless after a normal
      // ad where `game_api_resume` already fired.
      resumeGame()
      dlog(`${TAG} rewarded finish (granted=${granted}, adOpened=${adOpened})`)
      resolve(granted)
    }

    // Soft deadline: if the ad hasn't OPENED within REWARDED_SOFT_TIMEOUT_MS,
    // stop waiting for Yandex's slow (~10s) waterfall exhaustion. Probe to
    // confirm an ad-blocker (→ AdsBlockedModal via useAds), then `finish()`
    // (resume + resolve false). The SDK request is NOT cancelled — see the
    // late-open handling in `onOpen` below.
    softTimer = setTimeout(() => {
      if (adOpened || settled) return
      dlog(`${TAG} rewarded soft-timeout (${REWARDED_SOFT_TIMEOUT_MS}ms, no onOpen) — probing ad-block`)
      void confirmAdBlockViaProbe().finally(finish)
    }, REWARDED_SOFT_TIMEOUT_MS)

    try {
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onOpen: () => {
            adOpened = true
            clearSoftTimer()
            dlog(`${TAG} rewarded onOpen`)
            // LATE OPEN: the soft-timeout already fired `finish()` (game
            // resumed, modal maybe shown) but the ad actually loaded after all
            // (slow network, not blocked). Re-pause the game via the platform
            // gate so the ad never plays over live gameplay; `onClose`/`onError`
            // below clear it. The reward is forfeited on this rare path (the
            // promise already resolved false) — acceptable vs. an indefinite
            // freeze.
            if (settled) pauseGame()
          },
          onRewarded: () => { granted = true },
          onClose: () => {
            // Late close after a soft-timeout: just clear the re-pause.
            if (settled) { resumeGame(); return }
            finish()
          },
          onError: (e) => {
            console.warn(`${TAG} rewarded onError`, e)
            if (settled) { resumeGame(); return }
            void flagAdBlockIfConfirmed(e).finally(finish)
          }
        }
      })
    } catch (e) {
      console.warn(`${TAG} rewarded show threw`, e)
      if (!settled) void flagAdBlockIfConfirmed(e).finally(finish)
    }
  })
}

// ─── Midgame interstitial ad ─────────────────────────────────────────────────

/**
 * Show an interstitial. Resolves when the SDK reports the ad has closed
 * (whether shown or skipped via frequency cap). Never rejects — callers
 * `await` and resume gameplay regardless.
 *
 * Yandex enforces interstitial frequency SERVER-SIDE ("controlled by Yandex
 * Games"), so we don't need our own cooldown. `wasShown: false` from the
 * SDK callback means the cap engaged — resolving anyway because the gate is
 * already released by the time onClose fires.
 *
 * No-op (resolves immediately) when the SDK is not active.
 */
export const showMidgameAdYA = (onImpression?: () => void): Promise<void> => {
  return new Promise((resolve) => {
    if (!ysdk) {
      resolve()
      return
    }
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      // Same `resumeGame()` safety as the rewarded path — clear any platform
      // pause `game_api_pause` set so a no-fill interstitial can't freeze the
      // game. Idempotent.
      resumeGame()
      resolve()
    }
    try {
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          // Mute the game's audio ONLY now that the ad has genuinely opened.
          // A no-fill never reaches here (only onError/onClose fire), so the
          // win/lose result stinger keeps playing instead of being cut for an
          // ad the player never saw.
          onOpen: () => {
            dlog(`${TAG} interstitial onOpen`)
            onImpression?.()
          },
          onClose: (wasShown) => {
            dlog(`${TAG} interstitial onClose (wasShown=${wasShown})`)
            finish()
          },
          onError: (e) => {
            console.warn(`${TAG} interstitial onError`, e)
            // Interstitials aren't user-initiated, so don't probe/flag the
            // ad-blocker modal here (only the rewarded path surfaces it). Just
            // resume and move on.
            finish()
          },
          onOffline: () => {
            dlog(`${TAG} interstitial onOffline`)
            finish()
          }
        }
      })
    } catch (e) {
      console.warn(`${TAG} interstitial show threw`, e)
      finish()
    }
  })
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Extract a searchable string from an unknown error. CRUCIAL: an `Error`
 *  object's `message` is non-enumerable, so `JSON.stringify(err)` yields `{}`
 *  and loses it — the previous matcher never saw "No available waterfall item".
 *  Pull `message` + `code` explicitly, then fall back to stringify. */
const errorText = (error: unknown): string => {
  if (typeof error === 'string') return error
  const e = error as { message?: unknown; code?: unknown }
  const parts = [e?.code, e?.message].filter((p) => typeof p === 'string') as string[]
  if (parts.length) return parts.join(' ')
  try { return JSON.stringify(error) } catch { return String(error) }
}

/** Recognises an error message that explicitly names an ad-blocker. */
const looksLikeAdBlockerError = (error: unknown): boolean => {
  const s = errorText(error).toLowerCase()
  return s.includes('adblock') || s.includes('blocked') || s.includes('err_blocked_by_client')
}

/** Recognises Yandex's empty-waterfall / no-fill rewarded errors
 *  (e.g. "No available waterfall item for tag rewarded:waterfall"). These
 *  are AMBIGUOUS — they fire on both a genuine no-fill AND when an ad-blocker
 *  nuked every ad source — so they only TRIGGER a network probe, they don't
 *  flag the modal on their own. */
const looksLikeNoFillError = (error: unknown): boolean => {
  const s = errorText(error).toLowerCase()
  return s.includes('waterfall') || s.includes('no available') || s.includes('no ad')
}

// Ad endpoints an ad-blocker (Brave Shields / uBlock / AdGuard) blocks with
// ERR_BLOCKED_BY_CLIENT but are otherwise reachable. Deliberately YANDEX-ONLY
// hosts — `an.yandex.ru` / `yandex.ru/ads` are Yandex's own ad network (the
// exact scripts seen failing with ERR_BLOCKED_BY_CLIENT in the moderation
// console). Using Yandex-only baits keeps the bundle free of foreign ad-tech
// URLs (`imasdk.googleapis.com`, `pagead2.googlesyndication.com`, ...) that
// could draw Yandex moderation scrutiny. A no-cors GET does NOT execute the
// fetched script, so this has no side effects.
const AD_BLOCK_BAIT_URLS: ReadonlyArray<string> = [
  'https://an.yandex.ru/system/context.js',
  'https://yandex.ru/ads/system/context.js'
]

/** Detect a client-side ad-blocker by trying to reach known ad endpoints.
 *  A blocked request rejects (ERR_BLOCKED_BY_CLIENT → TypeError, which a
 *  blocker raises ~instantly); a reachable one resolves with an opaque
 *  response even on 404. Returns true when ANY bait is actively blocked — for
 *  Brave/uBlock the whole ad chain is blocked, and requiring only one keeps
 *  the detection fast + robust when a single endpoint is merely down. A
 *  slow-network abort counts as 'unknown' (not blocked), so a flaky
 *  connection alone can't false-positive the modal. 2.5s per-bait cap keeps
 *  the worst case bounded so the modal still appears promptly. */
const probeAdBlocked = async (): Promise<boolean> => {
  if (typeof fetch !== 'function') return false
  const check = async (url: string): Promise<'ok' | 'blocked' | 'unknown'> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2500)
    try {
      await fetch(`${url}?_=${Date.now()}`, {
        method: 'GET', mode: 'no-cors', cache: 'no-store', signal: ctrl.signal
      })
      return 'ok'
    } catch (e) {
      return (e as { name?: string })?.name === 'AbortError' ? 'unknown' : 'blocked'
    } finally {
      clearTimeout(timer)
    }
  }
  const results = await Promise.all(AD_BLOCK_BAIT_URLS.map(check))
  return results.some((r) => r === 'blocked')
}

/** Run the network probe and flag the shared AdsBlockedModal if a blocker is
 *  confirmed. Used by the rewarded soft-timeout (no error object — the timeout
 *  itself is the signal). Idempotent. */
const confirmAdBlockViaProbe = async (): Promise<void> => {
  if (isYandexAdsBlocked.value) return
  if (await probeAdBlocked()) {
    console.info(`${TAG} ad-blocker confirmed via network probe`)
    isYandexAdsBlocked.value = true
  }
}

/** On a rewarded ad error, decide whether to flag the shared AdsBlockedModal.
 *  - An error that NAMES a blocker → flag immediately.
 *  - An ambiguous empty-waterfall / no-fill error → confirm with a network
 *    probe first (genuine no-fill must NOT nag ad-blocker-free players).
 *  Awaited by the rewarded `onError` so `isYandexAdsBlocked` is set BEFORE the
 *  show promise resolves and `useAds` checks `provider.isAdsBlocked`. */
const flagAdBlockIfConfirmed = async (error: unknown): Promise<void> => {
  if (isYandexAdsBlocked.value) return
  if (looksLikeAdBlockerError(error)) {
    isYandexAdsBlocked.value = true
    return
  }
  if (looksLikeNoFillError(error)) {
    await confirmAdBlockViaProbe()
  }
}

// ─── Default export (composable-style convenience) ──────────────────────────

const useYandex = () => ({
  isYandexSdkActive,
  isYandexAdsBlocked,
  yandexLocale,
  yandexPlugin,
  yandexLoadingReady,
  yandexGameplayStart,
  yandexGameplayStop,
  showRewardedAdYA,
  showMidgameAdYA,
  getYandexPlayer,
  getYandexSdk
})

export default useYandex
