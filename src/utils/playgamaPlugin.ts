// ─── Playgama Bridge plugin ────────────────────────────────────────────────
//
// Lazy-loaded module that owns everything the game talks to the Playgama
// Bridge SDK about. Mirrors `gameDistributionPlugin.ts` / `glitchPlugin.ts`
// in shape — `main.ts` only imports it when `isPlaygama` is true so non-
// Playgama builds never ship the SDK glue.
//
// "Playgama Bridge" is the unified abstraction Playgama ships across 28+
// portals (production Playgama, Yandex, CrazyGames, Poki, GameSnacks, …).
// On the production Playgama portal `bridge.platform.id === 'playgama'`.
// On localhost dev (no parent-frame handshake) the bridge falls back to
// MOCK and `platform.id === 'mock'` — that's the fast happy path.
//
// **DO NOT** override `forciblySetPlatformId` in the bridge config. The
// bridge has built-in detectors per parent-frame protocol; forcing a
// platform id pins it to ONE protocol and breaks every other context
// (notably the developer QA tool, which speaks a different protocol than
// production). See `nexusorbiter` integration-doc pitfall A.

import { ref } from 'vue'
import { isPlaygama } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import { pauseGame, resumeGame } from '@/use/useGamePause'
import type { SaveStrategy } from '@/utils/save/types'
// Static import — the obfuscator's `stringArray` mangles dynamic-import
// literals, which on the Playgama QA Tool surfaced as
// `Failed to resolve module specifier '@/utils/save/PlaygamaStrategy'`
// at runtime. Static-importing it inlines the (small) strategy class
// into this plugin's already-lazy-loaded chunk; non-Playgama builds
// don't touch this module at all (resolveSaveStrategy's `VITE_APP_PLAYGAMA`
// arm is dead code outside Playgama), so the bundle cost stays zero.
import { PlaygamaStrategy } from '@/utils/save/PlaygamaStrategy'

const SDK_SRC = 'https://bridge.playgama.com/v1/stable/playgama-bridge.js'
// Production handshake on cold-start can take 5-7 s; keep generous headroom
// so a slow CDN / mobile cold-cache doesn't latch the "ads blocked" rail
// for the rest of the session. Localhost MOCK resolves in <50 ms either way.
const INIT_TIMEOUT_MS = 15_000

declare global {
  interface Window {
    bridge?: any
    playgamaBridge?: any
  }
}

/** Reactive: true once the bridge has resolved `initialize()` successfully. */
export const isPlaygamaSdkActive = ref(false)
/** Reactive: true when the bridge failed to come up or the script was
 *  blocked. Wired into `AdProvider.isAdsBlocked` via `PlaygamaProvider`. */
export const isPlaygamaAdsBlocked = ref(false)
/** Two-letter locale derived from `bridge.platform.language`. Used by the
 *  i18n boot path the same way `crazyLocale` is. `null` until the bridge
 *  reports one. */
export const playgamaLocale = ref<string | null>(null)
/** Auto-detected platform id reported by the bridge after init — useful for
 *  debugging which portal protocol the bridge picked. */
export const playgamaDetectedId = ref<string | null>(null)

// ─── Internal handles ──────────────────────────────────────────────────────

let initPromise: Promise<void> | null = null
let gameReadySent = false
let gameplayStartedActive = false
let heldPause = false
let injectPromise: Promise<any> | null = null
/** Edge-triggered bridge → unified pause gate. A double-`paused=true`
 *  emission from the bridge can't drift anything: we flip
 *  `isPlatformPaused` (idempotent), and the shared `useGamePauseAudio`
 *  orchestrator is what actually suspends/resumes audio off the aggregate
 *  `isGamePaused` — one suspend driver for every build, no double-count. */
const setPaused = (paused: boolean): void => {
  if (paused === heldPause) return
  heldPause = paused
  if (paused) pauseGame()
  else resumeGame()
}

const getBridge = (): any =>
  typeof window === 'undefined' ? null : (window.bridge ?? window.playgamaBridge ?? null)

/** Public accessor — `PlaygamaStrategy` reads `bridge.storage` through this. */
export const getPlaygamaBridge = (): any => getBridge()

// ─── SDK script injection (defensive — build-time tag is primary) ─────────

const ensureSdkLoaded = (): Promise<any> => {
  if (injectPromise) return injectPromise
  injectPromise = new Promise<any>((resolve) => {
    if (typeof window === 'undefined') return resolve(null)
    if (getBridge()) return resolve(getBridge())
    const existing = document.querySelector(`script[src="${SDK_SRC}"]`) as HTMLScriptElement | null
    const onLoad = () => {
      // Poll briefly — the bridge sets `window.bridge` synchronously on
      // load but some wrappers wrap the script in a deferred chunk.
      let tries = 0
      const tick = () => {
        const b = getBridge()
        if (b) return resolve(b)
        if (++tries > 200) return resolve(null) // ~10 s @ 50 ms
        setTimeout(tick, 50)
      }
      tick()
    }
    if (existing) {
      if (existing.dataset.loaded === 'true') return onLoad()
      existing.addEventListener('load', onLoad, { once: true })
      existing.addEventListener('error', () => resolve(null), { once: true })
      return
    }
    const tag = document.createElement('script')
    tag.src = SDK_SRC
    tag.async = false
    tag.addEventListener('load', () => { tag.dataset.loaded = 'true'; onLoad() }, { once: true })
    tag.addEventListener('error', () => resolve(null), { once: true })
    document.head.appendChild(tag)
  })
  return injectPromise
}

// ─── Public init ──────────────────────────────────────────────────────────

export const playgamaPlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  if (!isPlaygama) {
    initPromise = Promise.resolve()
    return initPromise
  }
  initPromise = (async () => {
    const sdk = await ensureSdkLoaded()
    if (!sdk) {
      isPlaygamaAdsBlocked.value = true
      if (isDebug.value) console.warn('[playgama] SDK script missing — ads disabled')
      return
    }
    const bridge = getBridge()
    if (!bridge?.initialize) {
      isPlaygamaAdsBlocked.value = true
      return
    }
    try {
      await Promise.race([
        bridge.initialize(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('initialize() timeout')), INIT_TIMEOUT_MS)
        )
      ])
      isPlaygamaSdkActive.value = true
      playgamaDetectedId.value = bridge?.platform?.id ?? null
      console.info('[playgama] initialized — platform.id:', playgamaDetectedId.value)

      const lang = bridge?.platform?.language
      if (typeof lang === 'string' && lang.length > 0) {
        playgamaLocale.value = lang.toLowerCase().split(/[-_]/)[0] ?? null
      }

      const ev = bridge?.EVENT_NAME ?? {}
      const pauseEventName = ev.PAUSE_STATE_CHANGED ?? 'pause_state_changed'
      const audioEventName = ev.AUDIO_STATE_CHANGED ?? 'audio_state_changed'
      const visibilityEventName = ev.VISIBILITY_STATE_CHANGED ?? 'visibility_state_changed'
      const interstitialEventName = ev.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed'
      const rewardedEventName = ev.REWARDED_STATE_CHANGED ?? 'rewarded_state_changed'

      // Aggregated pause from the bridge already includes interstitial /
      // visibility / platform pauses — DO NOT also subscribe to
      // INTERSTITIAL_STATE_CHANGED for pause; that double-counts the
      // suspend stack and the engine ends up permanently muted.
      bridge.platform?.on?.(pauseEventName, (p: boolean) => setPaused(!!p))
      bridge.platform?.on?.(audioEventName, (enabled: boolean) => {
        if (enabled === false) setPaused(true)
        else if (heldPause) setPaused(false)
      })
      bridge.platform?.on?.(visibilityEventName, (state: string) => {
        if (state === 'hidden') setPaused(true)
        else setPaused(false)
      })
      // Per-format flags drive only the ad-show promise resolution edges —
      // never pause. (Pause is the aggregated `PAUSE_STATE_CHANGED`.)
      bridge.advertisement?.on?.(interstitialEventName, (_s: string) => {
        // Pause is already handled by the aggregated event. Keep this
        // subscriber registered so the bridge knows we care about
        // interstitial lifecycle — used internally for `showInterstitialPG`.
      })
      bridge.advertisement?.on?.(rewardedEventName, (_s: string) => {
        // Same: grant edge is read inside `showRewardedPG` via a dedicated
        // listener registered at show time.
      })
    } catch (e) {
      console.warn('[playgama] initialize() failed', e)
      isPlaygamaAdsBlocked.value = true
    }
  })()
  return initPromise
}

// ─── Lifecycle messages ───────────────────────────────────────────────────

const sendMessage = (name: string, params?: any): void => {
  const bridge = getBridge()
  try {
    bridge?.platform?.sendMessage?.(name, params)
  } catch (e) {
    if (isDebug.value) console.warn('[playgama] sendMessage failed', name, e)
  }
}

/** Fires `in_game_loading_started`. Safe to call before init resolves — a
 *  no-op until `isPlaygamaSdkActive` flips true. */
export const playgamaLoadingStart = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage('in_game_loading_started')
}

/** Fires `in_game_loading_stopped` AND `game_ready` (once). `game_ready`
 *  is a certification-mandatory edge — missing it is an explicit rejection
 *  reason on the Playgama QA Tool. Idempotent. */
export const playgamaGameLoadingStop = (): void => {
  if (!isPlaygamaSdkActive.value) return
  sendMessage('in_game_loading_stopped')
  if (gameReadySent) return
  gameReadySent = true
  sendMessage('game_ready')
}

/** Notify the portal that gameplay is starting. Idempotent. */
export const playgamaGameplayStart = (): void => {
  if (!isPlaygamaSdkActive.value || gameplayStartedActive) return
  gameplayStartedActive = true
  sendMessage('gameplay_started')
}

/** Companion to `playgamaGameplayStart`. Idempotent. */
export const playgamaGameplayStop = (): void => {
  if (!isPlaygamaSdkActive.value || !gameplayStartedActive) return
  gameplayStartedActive = false
  sendMessage('gameplay_stopped')
}

// ─── Ad show wrappers ─────────────────────────────────────────────────────

/** Shows an interstitial; resolves on `closed` or `failed`. Never rejects. */
export const showInterstitialPG = async (): Promise<void> => {
  await playgamaPlugin()
  const bridge = getBridge()
  if (!bridge?.advertisement?.showInterstitial) return
  return new Promise<void>((resolve) => {
    let settled = false
    let opened = false
    const ev = bridge?.EVENT_NAME ?? {}
    const evName = ev.INTERSTITIAL_STATE_CHANGED ?? 'interstitial_state_changed'
    const finish = () => {
      if (settled) return
      settled = true
      try { off?.() } catch { /* ignore */ }
      resolve()
    }
    const off = bridge.advertisement?.on?.(evName, (state: string) => {
      if (state === 'loading' || state === 'opened') { opened = true; return }
      if (state === 'closed' || state === 'failed') finish()
    })
    try {
      const maybe = bridge.advertisement.showInterstitial()
      if (maybe && typeof maybe.then === 'function') {
        // DO NOT settle when the show() promise resolves: Playgama resolves it
        // the instant the request is DISPATCHED, before the ad opens. Settling
        // there dropped the pause gate immediately, so music + gameplay resumed
        // UNDERNEATH the still-open ad. The lifecycle is driven by
        // INTERSTITIAL_STATE_CHANGED ('opened' → 'closed'/'failed'). The promise
        // is only used to (a) catch a hard dispatch failure, and (b) detect a
        // no-fill where the ad never opened (short grace, then finish).
        maybe.then(
          () => { setTimeout(() => { if (!opened) finish() }, 800) },
          () => finish()
        )
      }
    } catch (e) {
      console.warn('[playgama] showInterstitial threw', e)
      finish()
    }
    // Belt-and-braces: hard cap so a state event drop can't strand the call.
    setTimeout(finish, 60_000)
  })
}

/** Shows a rewarded video. Resolves `true` only when the bridge fired
 *  `rewarded` BEFORE the `closed` / `failed` edge (Playgama's docs note
 *  the grant edge is `'rewarded'`, not `'closed'`). */
export const showRewardedPG = async (): Promise<boolean> => {
  await playgamaPlugin()
  const bridge = getBridge()
  if (!bridge?.advertisement?.showRewarded) return false
  return new Promise<boolean>((resolve) => {
    let settled = false
    let rewarded = false
    let opened = false
    const ev = bridge?.EVENT_NAME ?? {}
    const evName = ev.REWARDED_STATE_CHANGED ?? 'rewarded_state_changed'
    const finish = () => {
      if (settled) return
      settled = true
      try { off?.() } catch { /* ignore */ }
      resolve(rewarded)
    }
    const off = bridge.advertisement?.on?.(evName, (state: string) => {
      if (state === 'loading' || state === 'opened') { opened = true; return }
      if (state === 'rewarded') {
        rewarded = true
        return
      }
      if (state === 'closed' || state === 'failed') finish()
    })
    try {
      const maybe = bridge.advertisement.showRewarded()
      if (maybe && typeof maybe.then === 'function') {
        // DO NOT settle when the show() promise resolves: Playgama resolves it
        // the instant the request is DISPATCHED — before the ad opens, and well
        // before the 'rewarded' grant edge. Settling there resolved granted=false
        // immediately and dropped the pause gate, so music + gameplay resumed
        // UNDER the still-open ad (the bug in the log). The grant + close are
        // driven entirely by REWARDED_STATE_CHANGED ('opened' → 'rewarded' →
        // 'closed'/'failed'). The promise is only used to (a) catch a hard
        // dispatch failure, and (b) detect a no-fill where the ad never opened.
        maybe.then(
          () => { setTimeout(() => { if (!opened) finish() }, 800) },
          () => finish()
        )
      }
    } catch (e) {
      console.warn('[playgama] showRewarded threw', e)
      finish()
    }
    setTimeout(finish, 120_000)
  })
}

// ─── Save-strategy factory ────────────────────────────────────────────────

/**
 * Build the Playgama save strategy. Non-Playgama builds never reach this
 * code (resolveSaveStrategy's `VITE_APP_PLAYGAMA` arm is dead code there),
 * so the static import above doesn't bloat their bundles.
 */
export const createPlaygamaSaveStrategy = async (): Promise<SaveStrategy> => {
  return new PlaygamaStrategy()
}
