import { ref, type Ref } from 'vue'
import { isSdkActive } from '@/use/useCrazyGames'

/**
 * Runtime "safe area" guard for the bottom of the screen.
 *
 * Two reasons a bottom-anchored element can end up clipped on a real device:
 *
 *  1. Dynamic browser chrome (Android Chrome / Safari URL bar) that overlaps
 *     `position: fixed` content even when `dvh` units are honored. We detect
 *     this via `window.innerHeight − window.visualViewport.height`.
 *
 *  2. iOS PWA standalone mode, where `env(safe-area-inset-bottom)` can report
 *     0 even though the home indicator is present (cached old installs, or
 *     the `position: fixed; height: 100%` on `html/body` can interact badly
 *     with the layout viewport). We probe the actual computed env value and
 *     top it up to a minimum floor on iOS standalone so the buttons always
 *     clear the home indicator.
 *
 * The shared `bottomGapPx` reactive value is the *extra* number of pixels
 * any bottom-anchored element should add on top of `env(safe-area-inset-bottom)`
 * — it never double-counts what env() already contributes.
 */

const bottomGapPx: Ref<number> = ref(0)

// Hidden probe used to read the actual computed env(safe-area-inset-bottom).
let safeAreaProbe: HTMLDivElement | null = null

const readEnvSafeAreaBottom = (): number => {
  if (typeof document === 'undefined') return 0
  if (!safeAreaProbe) {
    safeAreaProbe = document.createElement('div')
    safeAreaProbe.style.position = 'fixed'
    safeAreaProbe.style.left = '0'
    safeAreaProbe.style.top = '0'
    safeAreaProbe.style.width = '0'
    safeAreaProbe.style.height = '0'
    safeAreaProbe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)'
    safeAreaProbe.style.visibility = 'hidden'
    safeAreaProbe.style.pointerEvents = 'none'
    document.body.appendChild(safeAreaProbe)
  }
  return parseFloat(getComputedStyle(safeAreaProbe).paddingBottom) || 0
}

const isIOSStandalonePWA = (): boolean => {
  if (typeof window === 'undefined') return false
  const nav: any = window.navigator
  const isStandalone = nav.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true
  const isIOS = /iPad|iPhone|iPod/.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  return isStandalone && isIOS
}

// Minimum bottom clearance on iOS PWA standalone — covers the iPhone home
// indicator (~34px) plus a bit of breathing room. Used as a floor only.
const IOS_BOTTOM_FLOOR_PX = 36

// CrazyGames injects a bottom footer bar (~50px) inside the iframe that
// overlaps fixed-positioned content. Neither visualViewport nor
// env(safe-area-inset-bottom) can detect it, so we add a static offset.
const CRAZYGAMES_FOOTER_PX = 0

const measureBottomGap = () => {
  if (typeof window === 'undefined') return
  const vv = window.visualViewport
  const layoutH = window.innerHeight
  const visibleBottom = vv ? vv.height + vv.offsetTop : layoutH
  const dynamicGap = Math.max(0, Math.ceil(layoutH - visibleBottom))

  // The CSS callsites already inject `env(safe-area-inset-bottom)`. If env()
  // is working correctly, we don't want to add more on top of it. We only
  // top *up* to the floor when env() under-reports.
  const envSafeBottom = readEnvSafeAreaBottom()
  const floorTopUp = isIOSStandalonePWA()
    ? Math.max(0, IOS_BOTTOM_FLOOR_PX - envSafeBottom)
    : 0

  const crazyGamesGap = isSdkActive.value ? CRAZYGAMES_FOOTER_PX : 0

  bottomGapPx.value = dynamicGap + floorTopUp + crazyGamesGap
}

const scheduleBottomMeasure = () => {
  // Two-pass: microtask for layout settle, then rAF for visualViewport
  // metrics catching up after orientation/chrome transitions.
  Promise.resolve().then(() => {
    measureBottomGap()
    requestAnimationFrame(() => measureBottomGap())
  })
}

export default function useBottomSafe() {
  return { bottomGapPx, measureBottomGap, scheduleBottomMeasure }
}
