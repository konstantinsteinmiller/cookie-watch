// ─── gamepixPlugin no-op stub (non-GamePix builds only) ─────────────────────
//
// Replaces `@/utils/gamepixPlugin` on non-GamePix builds via `resolve.alias`
// in `vite.config.ts`. The real module hardcodes the GamePix SDK URL
// (`https://integration.gamepix.com/sdk/v3/gamepix.sdk.js`) which Yandex's
// moderation flags as "Service storage URL detected".
//
// CRUCIAL: `MawScene.vue` STATICALLY imports `gamePixHappyMoment` from this
// module, so Rollup emits gamepixPlugin as a shared chunk that MawScene
// depends on. Previously a Vite plugin DELETED that chunk on Yandex builds —
// but MawScene's import reference remained, so the chunk 404'd at runtime and
// the whole MawScene route failed to load ("Failed to fetch dynamically
// imported module"). Aliasing to this stub keeps the real URL out of the
// bundle AND leaves a valid (tiny, no-op) module for MawScene to import, so
// there's no dangling chunk reference. This replaces the fragile chunk-strip.
//
// Stub matches the real module's FULL export surface (every name imported
// anywhere, incl. the platforms/gamepix barrel re-exports). No SDK-URL
// literal anywhere in this file.

import { ref } from 'vue'
import type { Ref } from 'vue'

export const isGamepixSdkActive: Ref<boolean> = ref(false)
export const isGamePixSdkActive = isGamepixSdkActive
export const isGamepixAdsBlocked: Ref<boolean> = ref(false)
export const isGamePixAdsBlocked = isGamepixAdsBlocked
export const isGamePixPlayerReady: Ref<boolean> = ref(false)
export const gamePixLocale: Ref<string | null> = ref(null)

export const gamePixGameLoadingStart = (): void => {}
export const gamePixGameLoadingStop = (): void => {}
export const gamePixUpdateScore = (_score: number): void => {}
export const gamePixUpdateLevel = (_level: number): void => {}
export const gamePixHappyMoment = (): void => {}
export const gamepixCustomLoading = (): void => {}
export const gamepixGameLoading = (_pct?: number): void => {}
export const gamepixGameLoaded = (): void => {}

export const showRewardedAdGP = async (): Promise<boolean> => false
export const showMidgameAdGP = async (): Promise<boolean> => false
export const showRewardedGP = showRewardedAdGP
export const showInterstitialGP = showMidgameAdGP

export const gamepixPlugin = async (): Promise<void> => {}
export const initGamepix = gamepixPlugin
