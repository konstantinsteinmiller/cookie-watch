// ─── GameMonetize.com plugin ────────────────────────────────────────────────
//
// Lazy-loaded module that owns everything the game talks to GameMonetize about.
// Mirrors the shape of `gameDistributionPlugin.ts` — the bootstrap (`main.ts`)
// dynamic-imports this only when `isGameMonetize` is true so non-GameMonetize
// builds tree-shake every byte below.
//
// GameMonetize's HTML5 SDK is effectively a rebrand of GameDistribution's
// `gdsdk` (same `SDK_*` event names, same `showAd`/`preloadAd` shape) with two
// differences this module accounts for:
//   1. Init is `window.SDK_OPTIONS` + global `window.sdk` (not GD_OPTIONS/gdsdk).
//   2. `sdk.showBanner()` returns VOID, so ad completion is observed via the
//      `SDK_GAME_START` event ("advertisement done, resume game"), not a
//      returned promise. We also short-circuit on a no-fill (no `SDK_GAME_PAUSE`
//      shortly after the show call) so the game never freezes on an empty slot.
//
// What lives here:
//
//   1. `gameMonetizePlugin()` — sets `window.SDK_OPTIONS` (gameId from
//      VITE_GAME_ID) and lazily injects `https://api.gamemonetize.com/sdk.js`,
//      then resolves once the SDK fires `SDK_READY` (or after a defensive 10s
//      timeout). The single `SDK_OPTIONS.onEvent` callback is fanned out to a
//      listener bus so multiple concerns can subscribe.
//
//   2. Pause/resume bridging — `SDK_GAME_PAUSE` → `pauseGame()` + mute via
//      `isAdShowing`; `SDK_GAME_START` → `resumeGame()`. `pauseGame`/`resumeGame`
//      are idempotent (see useGamePause), so unbalanced SDK callbacks can't
//      latch the game paused.
//
//   3. `showRewardedAdGM()` / `showMidgameAdGM()` — Promise-based wrappers.
//      Rewarded resolves `true` ONLY when the ad played to the end (the IMA
//      terminal event `ALL_ADS_COMPLETED` — GameMonetize HTML5 has NO dedicated
//      rewarded-complete event); interstitial resolves on ad close. Both fall
//      back from `sdk.showAd(...)` to `sdk.showBanner()`.
//
//   4. `preloadRewardedGM()` — preload-backed FILL signal. When the SDK build
//      exposes `preloadAd`, a resolved preload sets `isGmRewardedFilled` true so
//      the watch-ad button only appears when an ad is actually loaded; a reject
//      clears it and schedules one backoff retry. When `preloadAd` is ABSENT
//      (the thin HTML5 build), there is no forward fill signal, so fill falls
//      back to the cooldown predictor (`isGmSdkActive && !isGmAdCoolingDown`).
//
//   5. `isGmSdkActive` / `isGmAdsBlocked` reactive refs — mirror into
//      `GameMonetizeProvider` to drive the `AdProvider.isReady` / `isAdsBlocked`
//      gates.
//
//   6. `isGmRewardedFilled` / `isGmAdCoolingDown` reactive refs — the real
//      per-format readiness signal. `isGmRewardedFilled` is "a rewarded ad is
//      loaded and showable right now"; `isGmAdCoolingDown` is true during the
//      post-ad min-gap window. Showing a rewarded ad starts a cooldown
//      (REWARDED_MIN_GAP_MS) that spaces offers out — this is what stops the
//      "too many in a row → silent no-fill" the player saw. After the gap the
//      preload cycle re-arms fill.
//
// SDK reference: https://github.com/MonetizeGame/GameMonetize.com-SDK

import { ref } from 'vue'
import { isGameMonetize } from '@/use/useUser'
import { isDebug } from '@/use/useMatch'
import { isAdShowing, pauseGame, resumeGame } from '@/use/useGamePause'
import { GameMonetizeStrategy } from '@/utils/save/GameMonetizeStrategy'
import type { SaveStrategy } from '@/utils/save/types'

const SDK_SRC = 'https://api.gamemonetize.com/sdk.js'
const SDK_SCRIPT_ID = 'gamemonetize-sdk'
const SDK_READY_TIMEOUT_MS = 10_000
// If `SDK_GAME_PAUSE` hasn't fired this soon after a show call, treat it as a
// no-fill and resolve immediately so the game doesn't sit frozen behind a
// non-existent ad. Once an ad HAS started, the hard timeouts below apply.
const NO_FILL_MS = 3_000
const REWARDED_HARD_TIMEOUT_MS = 60_000
const INTERSTITIAL_HARD_TIMEOUT_MS = 45_000
// Minimum spacing between rewarded offers. After an ad plays we cool down for
// this long before re-arming fill — this is the anti-no-fill guard: requesting
// rewarded ads back-to-back is exactly what makes the SDK silently no-fill, so
// we simply hide the button until the gap has elapsed AND the next preload
// confirms a fresh ad is loaded.
const REWARDED_MIN_GAP_MS = 120_000
// Backoff before retrying a failed preload (no-fill / transient SDK error) so a
// momentary empty slot recovers on its own without hammering the SDK.
const PRELOAD_RETRY_MS = 15_000

// Event name literals — the SDK delivers these as `event.name` strings via the
// single `SDK_OPTIONS.onEvent` callback.
const EVT_SDK_READY = 'SDK_READY'
const EVT_SDK_ERROR = 'SDK_ERROR'
// GameMonetize reports a blocked Google IMA loader via these IMA-layer events
// (message: "IMA script failed to load! Probably due to an ADBLOCKER!"), NOT via
// SDK_ERROR (whose message is just "The SDK failed."). Adblock detection must
// listen to them too.
const EVT_AD_SDK_ERROR = 'AD_SDK_ERROR'
const EVT_AD_ERROR = 'AD_ERROR'
const EVT_GAME_PAUSE = 'SDK_GAME_PAUSE'
const EVT_GAME_START = 'SDK_GAME_START'
const EVT_REWARDED_COMPLETE = 'SDK_REWARDED_WATCH_COMPLETE'
// GameMonetize HTML5 (unlike the GameDistribution gdsdk it descends from) does
// NOT emit a dedicated rewarded-complete event — confirmed in the live sdk.js.
// The IMA terminal event ALL_ADS_COMPLETED is the reliable "the ad played to the
// end" signal, and it fires before SDK_GAME_START (resume). Grant on that.
const EVT_ALL_ADS_COMPLETED = 'ALL_ADS_COMPLETED'

declare global {
  interface Window {
    SDK_OPTIONS?: any
    // Global the SDK assigns. `gamemonetize` is a defensive alias some builds
    // expose; `sdk` is the documented one.
    sdk?: any
    gamemonetize?: any
  }
}

/** Reactive: true once the GameMonetize SDK has loaded and reported ready. */
export const isGmSdkActive = ref(false)

/** Reactive: true once the SDK reports (via `SDK_ERROR`) that a partner ad
 *  script was blocked by the player's browser (uBlock / AdGuard / Brave
 *  Shields / Pi-hole). Wired into `AdProvider.isAdsBlocked`. One detected
 *  blocker latches the flag — once an extension is observed blocking any
 *  partner script the rest of the ad chain typically degrades silently. */
export const isGmAdsBlocked = ref(false)

/** Reactive: true when a rewarded ad is loaded and showable RIGHT NOW. This is
 *  the real per-format fill signal `GameMonetizeProvider.isRewardedReady` binds
 *  to, so the watch-ad button only appears when an ad will actually play.
 *  Driven by a resolved `preloadAd('rewarded')` (preload-supported builds) or,
 *  when `preloadAd` is absent, predicted from `isGmSdkActive && !cooldown`. */
export const isGmRewardedFilled = ref(false)

/** Reactive: true during the post-ad min-gap window (`REWARDED_MIN_GAP_MS`).
 *  While true, fill stays false (rewarded button hidden) and interstitials are
 *  gated off too — back-to-back ads are the no-fill trigger we're avoiding. */
export const isGmAdCoolingDown = ref(false)

let sdk: any = null
let initPromise: Promise<void> | null = null
// True when the live SDK build does NOT expose `preloadAd` (the thin HTML5
// build). In this mode we have no forward fill signal, so fill is best-effort:
// `isGmSdkActive && !isGmAdCoolingDown`. Set on the first preload attempt.
let gmPreloadUnsupported = false
// Pending cooldown / retry timers — cleared idempotently so overlapping ad
// cycles never stack timers that double-toggle the refs.
let cooldownTimer: ReturnType<typeof setTimeout> | null = null
let preloadRetryTimer: ReturnType<typeof setTimeout> | null = null

const getSdk = (): any => {
  if (typeof window === 'undefined') return null
  return window.sdk ?? window.gamemonetize ?? null
}

// ─── Event bus ───────────────────────────────────────────────────────────────
//
// The SDK only exposes a single `onEvent` callback in `SDK_OPTIONS`. Fan it out
// into a Set-of-listeners-per-event-name map so rewarded-grant detection,
// midgame pause/resume, and ad-blocker detection can each subscribe without
// fighting over the one callback slot. Mirrors `gameDistributionPlugin.ts`.

type EventListener = (event: any) => void
const listeners = new Map<string, Set<EventListener>>()

const onSdkEvent = (eventName: string, listener: EventListener): (() => void) => {
  if (!listeners.has(eventName)) listeners.set(eventName, new Set())
  listeners.get(eventName)!.add(listener)
  return () => listeners.get(eventName)?.delete(listener)
}

const dispatchEvent = (eventName: string, payload: any): void => {
  if (isDebug.value) console.info('[gamemonetize] evt:', eventName)
  // Frequency-cap signal. The SDK rejects a show requested too soon after the
  // previous ad finished (message: "The advertisement was requested too soon
  // after the previous advertisement was finished."). Treat it as a hard "no
  // ads right now" → start the cooldown so the watch-ad button hides even when
  // our gap estimate was shorter than the SDK's real cap. Self-corrects a tap
  // that slipped through before the proactive cooldown landed.
  if (isTooSoonMessage(payload)) startRewardedCooldown()
  const set = listeners.get(eventName)
  if (!set) return
  for (const cb of set) {
    try {
      cb(payload)
    } catch (e) {
      console.warn(`[gamemonetize] listener for ${eventName} threw`, e)
    }
  }
}

// ─── Init ──────────────────────────────────────────────────────────────────

/**
 * Initialise GameMonetize. Idempotent — multiple calls return the same Promise.
 * Resolves after `SDK_READY` (or the 10s timeout) so callers can trust the SDK
 * is usable on resolution. Safe to call when `isGameMonetize` is false — no-op.
 */
export const gameMonetizePlugin = (): Promise<void> => {
  if (initPromise) return initPromise
  initPromise = (async () => {
    if (typeof window === 'undefined') return
    if (!isGameMonetize) return

    const gameId = import.meta.env.VITE_GAME_ID
    if (!gameId) {
      console.warn('[gamemonetize] VITE_GAME_ID is missing — SDK disabled')
      return
    }

    // `SDK_OPTIONS` MUST be on `window` before the SDK script executes — the
    // script reads it synchronously. `onEvent` fans every SDK event out to the
    // listener bus. `tagForChildDirectedTreatment` mirrors the GameDistribution
    // child-directed hint; harmless if this SDK build ignores it.
    window.SDK_OPTIONS = {
      gameId,
      tagForChildDirectedTreatment: true,
      onEvent: (event: any) => {
        if (event && typeof event.name === 'string') dispatchEvent(event.name, event)
      }
    }

    // Page-lifetime pause/resume bridge. The SDK brackets every ad with
    // SDK_GAME_PAUSE (mute + freeze) / SDK_GAME_START (resume). `isAdShowing`
    // drives the synchronous audio/sim freeze (see useGamePause); pauseGame/
    // resumeGame are idempotent so duplicate callbacks can't latch.
    onSdkEvent(EVT_GAME_PAUSE, () => {
      isAdShowing.value = true
      pauseGame()
    })
    onSdkEvent(EVT_GAME_START, () => {
      isAdShowing.value = false
      resumeGame()
    })

    // Page-lifetime frequency-cap guard. GameMonetize enforces a GLOBAL min-gap
    // between ads — request one too soon and the SDK rejects it ("The
    // advertisement was requested too soon after the previous advertisement was
    // finished"), which is exactly the failed rewarded tap players hit when the
    // first-load interstitial played moments earlier. Arm OUR cooldown off a
    // GENUINE ad-completion signal so the rewarded button hides for
    // REWARDED_MIN_GAP_MS after any ad actually finished — even when the per-call
    // show promise already settled early on the NO_FILL_MS short-circuit (the
    // test-env TCF consent wall can delay the ad past 3s) and missed it.
    //
    // We key on the IMA terminal event ALL_ADS_COMPLETED, NOT on the
    // SDK_GAME_PAUSE → SDK_GAME_START pause/resume cycle: in the iframe test env
    // that pair ALSO fires for non-ad reasons (the boot TCF consent wall,
    // visibility/focus changes), so arming off it spuriously cooled the SDK down
    // BEFORE any ad played and suppressed every ad for the whole session.
    // ALL_ADS_COMPLETED only fires when a real ad reached its end, so a consent
    // dialog or tab-blur can't trip it. `startRewardedCooldown` is idempotent, so
    // this co-existing with the per-call arming just restarts the same window.
    onSdkEvent(EVT_ALL_ADS_COMPLETED, () => {
      if (isDebug.value) console.info('[gamemonetize] ad completed → arming frequency-cap cooldown')
      startRewardedCooldown()
    })

    // Page-lifetime ad-blocker detection. A blocked IMA loader surfaces as
    // AD_SDK_ERROR ("IMA script failed to load! Probably due to an ADBLOCKER!"),
    // NOT SDK_ERROR — listen to all three so blockers at boot OR mid-session
    // flip the flag → the AdProvider surfaces the AdsBlockedModal instead of
    // silently cooling down with no reward.
    for (const evt of [EVT_AD_SDK_ERROR, EVT_AD_ERROR, EVT_SDK_ERROR]) {
      onSdkEvent(evt, (event) => {
        // Match on the message text ("…Probably due to an ADBLOCKER!"); fall
        // back to the whole event if a future SDK build nests the message.
        const text = typeof event?.message === 'string'
          ? event.message
          : (() => { try { return JSON.stringify(event) } catch { return String(event) } })()
        if (isAdBlockerError(text)) {
          if (!isGmAdsBlocked.value) console.info('[gamemonetize] ad-blocker detected →', text)
          isGmAdsBlocked.value = true
        }
      })
    }

    // Proactive ad-block probe. The event listeners above only catch blockers
    // that make the SDK *say* "ADBLOCKER" (e.g. when the IMA loader itself is
    // blocked at boot). Brave Shields is sneakier: the SDK reaches SDK_READY,
    // then the ad's video resources (s0.2mdn.net, the in-iframe ima3.js) are
    // blocked with ERR_BLOCKED_BY_CLIENT and the ad just times out via
    // AD_SAFETY_TIMER — no SDK event carries an "adblocker" string. We can't
    // observe that network error as an SDK event, so we reproduce it: probe the
    // same ad-tech endpoints directly. If they're unreachable, flag ads as
    // blocked so a failed rewarded tap surfaces the AdsBlockedModal. Non-blocking.
    void probeAdBlocked().then((blocked) => {
      if (blocked && !isGmAdsBlocked.value) {
        console.info('[gamemonetize] ad-blocker detected via network probe')
        isGmAdsBlocked.value = true
      }
    })

    await new Promise<void>((resolve) => {
      let settled = false
      const settle = (): void => {
        if (settled) return
        settled = true
        unsubReady()
        unsubError()
        clearTimeout(timer)
        sdk = getSdk()
        isGmSdkActive.value = !!sdk
        resolve()
      }

      const unsubReady = onSdkEvent(EVT_SDK_READY, () => settle())
      const unsubError = onSdkEvent(EVT_SDK_ERROR, (event) => {
        const msg = String(event?.message ?? 'unknown')
        console.warn('[gamemonetize] SDK_ERROR during init —', msg)
        if (isAdBlockerError(msg)) isGmAdsBlocked.value = true
        // SDK_ERROR during init is terminal for GameMonetize (its ad loader
        // failed to set up — typically a blocked IMA script). Settle now rather
        // than burning the full 10s timeout. `sdk` still exists so pause/resume
        // keep working; ad calls no-op and isGmAdsBlocked (set above / from
        // AD_SDK_ERROR) drives the AdsBlockedModal.
        settle()
      })

      // Defensive timeout — if the SDK never reports ready (ad-blocker, offline,
      // CDN down), don't block the rest of boot indefinitely.
      const timer = setTimeout(() => {
        if (settled) return
        console.warn(`[gamemonetize] SDK init timed out after ${SDK_READY_TIMEOUT_MS}ms — ad calls will no-op`)
        settle()
      }, SDK_READY_TIMEOUT_MS)

      // Inject the SDK script now that SDK_OPTIONS + listeners are in place.
      // Idempotent — skip if a tag is already present (HMR / repeat init).
      if (document.getElementById(SDK_SCRIPT_ID) || document.querySelector(`script[src="${SDK_SRC}"]`)) {
        return
      }
      const script = document.createElement('script')
      script.id = SDK_SCRIPT_ID
      script.src = SDK_SRC
      script.async = true
      script.onerror = () => {
        if (settled) return
        console.warn('[gamemonetize] SDK script failed to load (ad-blocker / CSP / network)')
        isGmAdsBlocked.value = true
        settle()
      }
      document.head.appendChild(script)
    })

    // Pre-warm a rewarded ad once the SDK is up so the first watch-ad tap is
    // instant. Non-fatal — the show call triggers its own preload if needed.
    if (sdk) preloadRewardedGM()
  })()
  return initPromise
}

// ─── Save strategy ─────────────────────────────────────────────────────────

/**
 * Build the SaveStrategy used by SaveManager. GameMonetize has no cloud-save
 * API, so this returns a local-only strategy. Kept as a factory (rather than a
 * const instance) to mirror the other platform plugins.
 */
export const createGameMonetizeSaveStrategy = (): SaveStrategy => new GameMonetizeStrategy()

// ─── Rewarded video ad ──────────────────────────────────────────────────────

/**
 * Show a rewarded ad. Resolves `true` only when the ad actually played to the
 * end — callers grant the reward only on `true`.
 *
 * GameMonetize's HTML5 SDK has NO dedicated rewarded-complete event (the
 * `SDK_REWARDED_WATCH_COMPLETE` of its GameDistribution ancestor is absent —
 * confirmed in the live sdk.js). The reliable "ad finished playing" signal is
 * the IMA terminal event `ALL_ADS_COMPLETED`, which fires before the
 * `SDK_GAME_START` (resume). We grant when a completion event fired and resolve
 * on `SDK_GAME_START` (with a no-fill short-circuit + hard timeout, since
 * `showBanner()` returns void). A bare `SDK_GAME_START` — resume after a
 * no-fill / error / skip with no completion event — resolves `false`.
 *
 * No-op (resolves false) when the SDK is not active.
 */
export const showRewardedAdGM = (): Promise<boolean> => {
  return new Promise((resolve) => {
    const s = getSdk()
    if (!s) {
      resolve(false)
      return
    }

    // Double-fire guard: clear fill the moment a show starts so a second tap
    // (or a re-render of the button before the cooldown lands) can't kick off a
    // concurrent show. Fill is re-armed by the preload cycle after the ad ends.
    isGmRewardedFilled.value = false

    let completed = false
    let adStarted = false
    let settled = false
    const finish = (granted: boolean): void => {
      if (settled) return
      settled = true
      unsubAllAds()
      unsubComplete()
      unsubPause()
      unsubStart()
      clearTimeout(noFillTimer)
      clearTimeout(hardTimer)
      if (isDebug.value) {
        console.info(
          `[gamemonetize] rewarded finish → granted=${granted} (adStarted=${adStarted}, completed=${completed})`
        )
      }
      // Re-arm the fill cycle based on whether an ad actually played:
      //   • adStarted (granted OR skipped) → an ad was consumed; start the full
      //     min-gap cooldown, then re-preload after it.
      //   • pure no-fill (adStarted === false) → nothing was shown; don't burn
      //     a cooldown, just re-preload soon so a momentary empty slot recovers
      //     (fill stays false until that preload confirms).
      if (adStarted) startRewardedCooldown()
      else schedulePreloadRetry()
      resolve(granted)
    }

    // Grant signal: the ad played to the end. GameMonetize HTML5 surfaces this
    // as the IMA terminal event ALL_ADS_COMPLETED (it has no dedicated rewarded
    // event). Also accept the legacy gd-style SDK_REWARDED_WATCH_COMPLETE in
    // case a future SDK build emits it — harmless if it never fires.
    const unsubAllAds = onSdkEvent(EVT_ALL_ADS_COMPLETED, () => { completed = true })
    const unsubComplete = onSdkEvent(EVT_REWARDED_COMPLETE, () => { completed = true })
    const unsubPause = onSdkEvent(EVT_GAME_PAUSE, () => {
      adStarted = true
      clearTimeout(noFillTimer)
    })
    // Resume = ad cycle done. Grant iff a completion event fired first.
    const unsubStart = onSdkEvent(EVT_GAME_START, () => finish(completed))

    // No ad within NO_FILL_MS → assume no fill and resolve (no reward).
    const noFillTimer = setTimeout(() => { if (!adStarted) finish(false) }, NO_FILL_MS)
    // Hard cap once an ad is playing, in case the resume event never arrives.
    const hardTimer = setTimeout(() => finish(completed), REWARDED_HARD_TIMEOUT_MS)

    invokeShow(s, 'rewarded', () => finish(false))
  })
}

// ─── Midgame interstitial ad ─────────────────────────────────────────────────

/**
 * Show an interstitial (midgame) ad. Resolves when the ad closes (or on a
 * no-fill / timeout) so callers can `await` it before resuming the next match.
 * `sdk.showAd()` with no argument (or `sdk.showBanner()`) is the interstitial.
 * No-op (resolves immediately) when the SDK is not active.
 */
export const showMidgameAdGM = (): Promise<void> => {
  return new Promise((resolve) => {
    const s = getSdk()
    if (!s) {
      resolve()
      return
    }

    let adStarted = false
    let settled = false
    const finish = (): void => {
      if (settled) return
      settled = true
      unsubPause()
      unsubStart()
      clearTimeout(noFillTimer)
      clearTimeout(hardTimer)
      // An interstitial that actually played trips the SAME global frequency-cap
      // cooldown a rewarded ad does — the SDK's cap is shared across ad types,
      // so a midgame interstitial must hide the watch-ad buttons too (the bug
      // where they stayed visible 3 s after an interstitial). A pure no-fill
      // (adStarted === false) skips the cooldown.
      if (adStarted) startRewardedCooldown()
      resolve()
    }

    const unsubPause = onSdkEvent(EVT_GAME_PAUSE, () => {
      adStarted = true
      clearTimeout(noFillTimer)
    })
    const unsubStart = onSdkEvent(EVT_GAME_START, () => finish())

    const noFillTimer = setTimeout(() => { if (!adStarted) finish() }, NO_FILL_MS)
    const hardTimer = setTimeout(() => finish(), INTERSTITIAL_HARD_TIMEOUT_MS)

    invokeShow(s, 'interstitial', finish)
  })
}

// ─── Pre-warm ────────────────────────────────────────────────────────────────

/**
 * Pre-load a rewarded ad AND drive the `isGmRewardedFilled` fill signal off the
 * result. This is the primary mechanism the watch-ad button gates on. Two modes:
 *
 *   • `preloadAd` SUPPORTED — call `preloadAd('rewarded')`; on resolve set fill
 *     true (the next show is instant AND real), on reject clear fill and
 *     schedule ONE backoff retry so a momentary no-fill recovers on its own.
 *
 *   • `preloadAd` ABSENT (thin HTML5 build) — there is no forward fill signal,
 *     so flag the mode and predict fill best-effort = `isGmSdkActive &&
 *     !isGmAdCoolingDown`. We can't pre-confirm an ad, but we can at least hide
 *     the button during the post-ad cooldown (the no-fill-trigger window).
 *
 * Fire-and-forget — never throws; the show call still works if no preload ran.
 */
export const preloadRewardedGM = (): void => {
  const s = getSdk()
  if (!s) {
    isGmRewardedFilled.value = false
    return
  }

  // Preload-absent build: no forward fill signal — predict from SDK + cooldown.
  if (typeof s.preloadAd !== 'function') {
    gmPreloadUnsupported = true
    refreshFillForUnsupported()
    return
  }

  try {
    const r = s.preloadAd('rewarded')
    if (r && typeof r.then === 'function') {
      r.then(
        () => {
          isGmRewardedFilled.value = true
          if (isDebug.value) console.info('[gamemonetize] preloadAd(rewarded) resolved → filled')
        },
        (e: unknown) => {
          isGmRewardedFilled.value = false
          console.warn('[gamemonetize] preloadAd(rewarded) error — scheduling retry', e)
          schedulePreloadRetry()
        }
      )
    } else {
      // Non-thenable return (older sync build): assume the call queued a fill.
      isGmRewardedFilled.value = true
    }
  } catch (e) {
    isGmRewardedFilled.value = false
    console.warn('[gamemonetize] preloadAd(rewarded) threw — scheduling retry', e)
    schedulePreloadRetry()
  }
}

// ─── Cooldown + refill cycle ──────────────────────────────────────────────────

/**
 * Recompute fill for the preload-UNSUPPORTED build, where fill is best-effort:
 * an ad is "available" whenever the SDK is up and we're not inside the post-ad
 * min-gap. No-op for preload-supported builds (those drive fill off preloadAd).
 */
const refreshFillForUnsupported = (): void => {
  if (!gmPreloadUnsupported) return
  isGmRewardedFilled.value = isGmSdkActive.value && !isGmAdCoolingDown.value
}

/**
 * Start the post-ad min-gap cooldown after an ad actually played. Hides the
 * rewarded button (and interstitials) for `REWARDED_MIN_GAP_MS`, then re-arms
 * the fill cycle: preload-supported → preload again; unsupported → just clear
 * cooldown and let the predictor flip fill back true. Idempotent — restarts the
 * timer rather than stacking.
 */
const startRewardedCooldown = (): void => {
  clearCooldownTimer()
  clearPreloadRetryTimer()
  isGmAdCoolingDown.value = true
  isGmRewardedFilled.value = false
  refreshFillForUnsupported() // forces false while cooling down
  cooldownTimer = setTimeout(() => {
    cooldownTimer = null
    isGmAdCoolingDown.value = false
    if (isDebug.value) console.info('[gamemonetize] rewarded cooldown elapsed → re-arming fill')
    if (gmPreloadUnsupported) refreshFillForUnsupported()
    else preloadRewardedGM()
  }, REWARDED_MIN_GAP_MS)
}

/**
 * Schedule ONE preload retry after a short backoff. Used on a pure no-fill or a
 * rejected preload so a momentary empty slot recovers without a full cooldown.
 * Idempotent — a pending retry is replaced, not stacked. No-op (best-effort
 * fill) on preload-unsupported builds.
 */
const schedulePreloadRetry = (): void => {
  if (gmPreloadUnsupported) {
    refreshFillForUnsupported()
    return
  }
  clearPreloadRetryTimer()
  preloadRetryTimer = setTimeout(() => {
    preloadRetryTimer = null
    preloadRewardedGM()
  }, PRELOAD_RETRY_MS)
}

const clearCooldownTimer = (): void => {
  if (cooldownTimer !== null) {
    clearTimeout(cooldownTimer)
    cooldownTimer = null
  }
}

const clearPreloadRetryTimer = (): void => {
  if (preloadRetryTimer !== null) {
    clearTimeout(preloadRetryTimer)
    preloadRetryTimer = null
  }
}

// ─── helpers ────────────────────────────────────────────────────────────────

/**
 * Invoke the right show method for `type`, preferring `sdk.showAd(...)` (which
 * supports a 'rewarded' argument on the gdsdk lineage) and falling back to
 * `sdk.showBanner()` (the only method the thin HTML5 README documents). If the
 * call returns a thenable (some SDK builds), its settlement is wired as an
 * extra resolve signal via `onSettle`. Throwing invokes `onError`.
 */
const invokeShow = (s: any, type: 'rewarded' | 'interstitial', onError: () => void): void => {
  try {
    let ret: any
    if (typeof s.showAd === 'function') {
      ret = type === 'rewarded' ? s.showAd('rewarded') : s.showAd()
    } else if (typeof s.showBanner === 'function') {
      ret = s.showBanner()
    } else {
      onError()
      return
    }
    // Some SDK builds return a promise from showAd — tap it as a belt-and-braces
    // resolve signal. We swallow the result here; the event-driven path above
    // owns the actual resolve so the reward boolean stays authoritative.
    if (ret && typeof ret.catch === 'function') {
      ret.catch((e: unknown) => {
        console.warn(`[gamemonetize] show ${type} rejected`, e)
        onError()
      })
    }
  } catch (e) {
    console.warn(`[gamemonetize] show ${type} threw`, e)
    onError()
  }
}

// Ad-tech endpoints that ad-blockers (Brave Shields, uBlock, AdGuard) block
// with ERR_BLOCKED_BY_CLIENT but are otherwise reachable. `adsbygoogle.js` is the
// canonical adblock-test URL; `2mdn` is the instream-video resource Brave was
// observed blocking. CSP already allows https: connect on GameMonetize builds, so
// a rejection here means a client-side blocker, not our own policy.
const AD_BLOCK_BAIT_URLS: ReadonlyArray<string> = [
  'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
  'https://s0.2mdn.net/instream/video/client.js'
]

/**
 * Detect a client-side ad-blocker by trying to reach known ad-tech endpoints.
 * A blocked request rejects (ERR_BLOCKED_BY_CLIENT → TypeError); a reachable one
 * resolves with an opaque (no-cors) response even on 404. A no-cors GET does NOT
 * execute the fetched script, so this has no side effects. Returns true only
 * when EVERY bait was actively blocked — a slow-network timeout counts as
 * 'unknown' (not blocked) so a flaky connection can't false-positive the modal.
 */
const probeAdBlocked = async (): Promise<boolean> => {
  if (typeof fetch !== 'function') return false
  const check = async (url: string): Promise<'ok' | 'blocked' | 'unknown'> => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
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
  return results.every((r) => r === 'blocked')
}

/** Recognise the SDK's frequency-cap rejection. When a show is requested too
 *  soon after the previous ad finished, the SDK fires an event whose message
 *  reads "The advertisement was requested too soon after the previous
 *  advertisement was finished." We use it to (re)arm the post-ad cooldown so a
 *  tap that slipped through gets the buttons hidden right away. */
const isTooSoonMessage = (event: any): boolean => {
  const msg = typeof event?.message === 'string'
    ? event.message
    : typeof event?.description === 'string'
      ? event.description
      : ''
  return msg.toLowerCase().includes('too soon')
}

/** Recognise `SDK_ERROR` messages that indicate a browser ad-blocker. The SDK
 *  reports extension blocks as `Blocked: <url>` strings; some chains stuff
 *  `ERR_BLOCKED_BY_CLIENT` / `adblock` into the message. Match all patterns. */
const isAdBlockerError = (text: unknown): boolean => {
  const s = String(text ?? '').toLowerCase()
  return s.includes('blocked:')
    || s.includes('err_blocked_by_client')
    || s.includes('adblock')
    || s.includes('adsblocked')
}

// ─── Default export (composable-style convenience) ────────────────────────────

const useGameMonetize = () => ({
  isGmSdkActive,
  isGmAdsBlocked,
  isGmRewardedFilled,
  isGmAdCoolingDown,
  gameMonetizePlugin,
  createGameMonetizeSaveStrategy,
  showRewardedAdGM,
  showMidgameAdGM,
  preloadRewardedGM,
  onSdkEvent
})

export default useGameMonetize
