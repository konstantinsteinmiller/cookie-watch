<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

import useCookieGame, { type Dir } from '@/use/useCookieGame'
import { drawScene, configureGeometry, setMouseSkin } from '@/use/useCookieArt'
import useEpicProgress, { UPGRADES } from '@/use/useEpicProgress'
import useEpicConfig from '@/use/useEpicConfig'
import useMissions from '@/use/useMissions'
import useAchievements from '@/use/useAchievements'
import { getState, setState } from '@/use/useEpicState'
import { DAILY_BONUS_DAY_KEY, UPGRADE_SPOTLIGHT_KEY } from '@/keys'
import useBattlePass from '@/use/useBattlePass'
import { useMusic } from '@/use/useSound'
import useSounds from '@/use/useSound'
import { useScreenshake } from '@/use/useScreenshake'
import { isGamePaused } from '@/use/useGamePause'
import { isMobilePortrait } from '@/use/useUser'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import {
  isInterstitialReady, isRewardedReady, showMidgameAd, showRewardedAd
} from '@/use/useAds'
import { startGameplay, stopGameplay } from '@/use/useCrazyGames'
import { playFirstStartInterstitial } from '@/use/useFirstStartInterstitial'

import StageBadge from '@/components/StageBadge.vue'
import ScoreBadge from '@/components/atoms/ScoreBadge.vue'
import AwarenessMeter from '@/components/atoms/AwarenessMeter.vue'
import LivesBadge from '@/components/atoms/LivesBadge.vue'
import DirButton from '@/components/atoms/DirButton.vue'
import CoinBadge from '@/components/organisms/CoinBadge.vue'
import TreasureChest from '@/components/organisms/TreasureChest.vue'
import FMuteButton from '@/components/atoms/FMuteButton.vue'
import FReward from '@/components/atoms/FReward.vue'
import DailyRewards from '@/components/organisms/DailyRewards.vue'
import AdRewardButton from '@/components/organisms/AdRewardButton.vue'
import BattlePass from '@/components/organisms/BattlePass.vue'
import AchievementsButton from '@/components/organisms/AchievementsButton.vue'
import OptionsModal from '@/components/organisms/OptionsModal.vue'
import EpicUpgradesModal from '@/components/organisms/EpicUpgradesModal.vue'
import MissionsModal from '@/components/organisms/MissionsModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconMovie from '@/components/icons/IconMovie.vue'

const { t } = useI18n()
const cookie = useCookieGame()
const {
  phase, lossCause, lives, score, timeLeft, awarenessPct, catState,
  chunksCarried, chunksRemaining, chunksDeposited, cookieTotal,
  expectedDir, pendingKind, interactHint, mustFreeze, frenzyPct, frenzyTimeLeft,
  reviewData, lastDaringTotal, stageTarget,
  begin, resetForStage, pressDir, releaseDir, releaseAllDirs, pressInteract,
  startFrenzy, frenzyTap, revive, confirmLoss
} = cookie
const progress = useEpicProgress()
const { recordRun } = useMissions()
const { recordRun: recordAchievementRun } = useAchievements()
const { addCoins } = useEpicConfig()
const { awardCampaignWin } = useBattlePass()
const { startBattleMusic, stopBattleMusic } = useMusic()
const { playSound } = useSounds()
const { shakeStyle } = useScreenshake()

setMouseSkin('#b8b3ad')

// ─── Canvas + render loop ─────────────────────────────────────────────────
const canvasRef = ref<HTMLCanvasElement | null>(null)
let ctx: CanvasRenderingContext2D | null = null
let rafId = 0
let lastT = 0
let cssW = 0
let cssH = 0

const resize = (): void => {
  const canvas = canvasRef.value
  if (!canvas) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  cssW = window.innerWidth
  cssH = window.innerHeight
  canvas.width = Math.round(cssW * dpr)
  canvas.height = Math.round(cssH * dpr)
  canvas.style.width = cssW + 'px'
  canvas.style.height = cssH + 'px'
  ctx = canvas.getContext('2d')
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
  configureGeometry(cssW, cssH)
}

const loop = (tNow: number): void => {
  rafId = requestAnimationFrame(loop)
  const dt = lastT ? Math.min(tNow - lastT, 60) : 16
  lastT = tNow
  const live = phase.value === 'playing' || phase.value === 'frenzy'
  if (!isGamePaused.value && live) cookie.step(dt)
  else cookie.step(0)
  if (ctx) drawScene(ctx, cssW, cssH, performance.now())
}

// ─── Input ────────────────────────────────────────────────────────────────
let startingRun = false
const startRun = async (): Promise<void> => {
  if (startingRun || phase.value !== 'idle') return
  startingRun = true
  try {
    await playFirstStartInterstitial()
    if (phase.value === 'idle') begin()
  } finally {
    startingRun = false
  }
}

const onCanvasDown = (e: PointerEvent): void => {
  try { window.focus() } catch { /* cross-origin parent — ignore */ }
  e.preventDefault()
  if (showResult.value || showSecondChance.value || showReview.value) return
  if (phase.value === 'idle') void startRun()
  else if (phase.value === 'frenzy') frenzyTap()
}

// Directions held right now (keyboard + on-screen pad), tracked reactively so
// the pad can highlight whichever way the Mouse is currently sneaking.
const heldDirs = ref<Set<Dir>>(new Set())
const setHeld = (dir: Dir, down: boolean): void => {
  const next = new Set(heldDirs.value)
  if (down) next.add(dir)
  else next.delete(dir)
  heldDirs.value = next
}

const onDirDown = (dir: Dir): void => {
  if (phase.value !== 'playing') return
  setHeld(dir, true)
  pressDir(dir)   // engine handles continuous move + double-tap → run
}
const onDirUp = (dir: Dir): void => {
  setHeld(dir, false)
  releaseDir(dir)
}
const onInteract = (): void => {
  if (phase.value === 'playing') pressInteract()
  else if (phase.value === 'frenzy') frenzyTap()
  else if (phase.value === 'idle') void startRun()
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right'
}
// Genuine key-down codes (the OS auto-repeats keydown while held; we ignore
// repeats so a single hold = one continuous sneak, and a real double-tap runs).
const downCodes = new Set<string>()
const onKeyDown = (e: KeyboardEvent): void => {
  const tgt = e.target
  if (tgt instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tgt.tagName)) return
  const mapped = KEY_DIR[e.code]
  if (mapped) {
    e.preventDefault()
    if (downCodes.has(e.code)) return
    downCodes.add(e.code)
    onDirDown(mapped)
  } else if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault()
    onInteract()
  }
}
const onKeyUp = (e: KeyboardEvent): void => {
  const mapped = KEY_DIR[e.code]
  if (!mapped) return
  downCodes.delete(e.code)
  onDirUp(mapped)
}
// Letting go of focus (alt-tab, ad overlay) must drop every held direction so
// the Mouse doesn't keep sneaking into a stomp while the player is away.
const onBlur = (): void => {
  downCodes.clear()
  heldDirs.value = new Set()
  releaseAllDirs()
}

// ─── HUD state ──────────────────────────────────────────────────────────────
const showOptions = ref(false)
const showUpgrades = ref(false)
const showResult = ref(false)
const showSecondChance = ref(false)
const showReview = ref(false)
const isAdInFlight = ref(false)
const firstRunBonusActive = ref(false)

// Control hints (GDD: "Tap to move" / "Click to move"). Shown the first two
// stages only, then hidden to keep the board clean.
const showHint = computed(() => phase.value === 'playing' && progress.stage.value < 3)
const hintText = computed(() => isMobilePortrait.value ? t('hints.tapToMove') : t('hints.keysToMove'))
const startText = computed(() => isMobilePortrait.value ? t('startTouch') : t('startDesktop'))

// On-screen pad highlight: light up whichever direction is held; otherwise give
// a gentle pulse on the suggested heading (toward the cookie / back home).
const isDirActive = (d: Dir): boolean =>
  heldDirs.value.has(d) || (heldDirs.value.size === 0 && expectedDir.value === d)
const interactActive = computed(() => pendingKind.value === 'interact' || interactHint.value === 'grab')
// "Freeze!" warning — the cat is watching and the Mouse must hold still.
const freezeWarn = computed(() => phase.value === 'playing' && mustFreeze.value)

// Timer display (mm:ss) + low-time pulse.
const timeDisplay = computed(() => {
  const s = Math.max(0, Math.ceil(timeLeft.value))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
})
const lowTime = computed(() => timeLeft.value <= 15)

// ─── 2× reward / second chance cooldowns ─────────────────────────────────────
const SECOND_CHANCE_COOLDOWN = 30_000
const TWO_X_COOLDOWN = 30_000
let lastSecondChanceAt = 0
let twoXReadyAt = 0
const twoXUsed = ref(false)
const tickNow = ref(Date.now())

const winReward = computed(() => Math.max(5, Math.min(500, Math.round(lastDaringTotal.value / 150))))
const runTotalCoins = computed(() => phase.value === 'won' ? winReward.value : chunksDeposited.value)
const twoXAvailable = computed(() =>
  !twoXUsed.value && isRewardedReady.value && runTotalCoins.value > 0 &&
  (firstRunBonusActive.value || tickNow.value >= twoXReadyAt)
)
const secondChanceEligible = (): boolean =>
  isRewardedReady.value && Date.now() - lastSecondChanceAt > SECOND_CHANCE_COOLDOWN

const todayKey = (): string => new Date().toISOString().slice(0, 10)
const finishRun = (cleared: boolean): void => {
  const run = { tiles: lastDaringTotal.value, coins: runTotalCoins.value, items: chunksDeposited.value, cleared }
  recordRun(run)
  recordAchievementRun(run)
  firstRunBonusActive.value = getState<string>(DAILY_BONUS_DAY_KEY, '') !== todayKey()
}

// ─── Upgrade spotlight (one-shot) ────────────────────────────────────────────
const upgradeSpotlightSeen = ref(getState<boolean>(UPGRADE_SPOTLIGHT_KEY, false) === true)
const canAffordAnyUpgrade = computed(() =>
  UPGRADES.some((u) => progress.isUnlocked(u.id) && progress.canBuy(u.id)))
const showUpgradeSpotlight = computed(() =>
  !upgradeSpotlightSeen.value && phase.value === 'idle' && !showUpgrades.value && canAffordAnyUpgrade.value)
const openUpgrades = (): void => {
  showUpgrades.value = true
  if (!upgradeSpotlightSeen.value) { upgradeSpotlightSeen.value = true; setState(UPGRADE_SPOTLIGHT_KEY, true) }
}

const coinBadgeRef = ref<InstanceType<typeof CoinBadge> | null>(null)
const coinBadgeEl = computed<HTMLElement | null>(() => coinBadgeRef.value?.rootEl ?? null)
const rewardCoinRef = ref<HTMLElement | null>(null)

// ─── Death / review / frenzy / win flow ──────────────────────────────────────
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const onDeath = async (): Promise<void> => {
  stopBattleMusic()
  playSound('lose', 0.07)
  await wait(450)
  if (phase.value !== 'dead') return
  if (secondChanceEligible()) {
    lastSecondChanceAt = Date.now()
    showSecondChance.value = true
  } else {
    void presentLoseScreen()
  }
}

const onAcceptContinue = async (): Promise<void> => {
  if (isAdInFlight.value) return
  isAdInFlight.value = true
  showSecondChance.value = false
  try {
    const ok = await showRewardedAd()
    if (ok) { revive(); startBattleMusic() }
    else await presentLoseScreen()
  } finally { isAdInFlight.value = false }
}
const onSkipContinue = (): void => { showSecondChance.value = false; void presentLoseScreen() }

const RESULT_INTERSTITIAL_DELAY_MS = 600
const LOSE_AD_EVERY = 3
let loseScreenCount = 0
const presentResultInterstitial = async (): Promise<void> => {
  await wait(RESULT_INTERSTITIAL_DELAY_MS)
  if (isInterstitialReady.value) await showMidgameAd()
}

const outOfLives = ref(false)
const presentLoseScreen = async (): Promise<void> => {
  twoXUsed.value = false
  outOfLives.value = confirmLoss()   // spend a life; true if campaign reset
  finishRun(false)
  showResult.value = true
  void grantRunCoins()
  stopBattleMusic()
  loseScreenCount += 1
  if (loseScreenCount % LOSE_AD_EVERY === 0) await presentResultInterstitial()
}

// Stage fully cleared → Level Review tally.
const onReview = (): void => {
  stopBattleMusic()
  playSound('celebration-2', 0.06)
  showReview.value = true
}
const onReviewContinue = (): void => {
  showReview.value = false
  startFrenzy()
}

// Eating Frenzy finished (engine flips to 'won') → Win screen.
const onWin = async (): Promise<void> => {
  awardCampaignWin()
  twoXUsed.value = false
  finishRun(true)
  stopBattleMusic()
  playSound('happy', 0.08)
  playSound('celebration-3', 0.08)
  showResult.value = true
  void grantRunCoins()
  void presentResultInterstitial()
}

const onTwoX = async (): Promise<void> => {
  if (isAdInFlight.value || !twoXAvailable.value) return
  isAdInFlight.value = true
  try {
    const bonus = runTotalCoins.value
    const ok = await showRewardedAd()
    if (ok) {
      addCoins(bonus)
      twoXUsed.value = true
      twoXReadyAt = Date.now() + TWO_X_COOLDOWN
      const el = rewardCoinRef.value
      if (el && coinBadgeEl.value) spawnCoinExplosion({ sourceEl: el, targetEl: coinBadgeEl.value, count: 26 })
    }
  } finally { isAdInFlight.value = false }
}

const grantRunCoins = async (): Promise<void> => {
  const total = runTotalCoins.value
  if (total <= 0) return
  addCoins(total)
  await nextTick()
  const el = rewardCoinRef.value
  if (el && coinBadgeEl.value) {
    spawnCoinExplosion({ sourceEl: el, targetEl: coinBadgeEl.value, count: Math.min(40, 12 + Math.round(total / 4)) })
  }
}

const consumeFirstRunBonus = (): void => {
  if (!firstRunBonusActive.value) return
  firstRunBonusActive.value = false
  setState(DAILY_BONUS_DAY_KEY, todayKey())
}

const onResultContinue = (): void => {
  if (isAdInFlight.value) return
  showResult.value = false
  consumeFirstRunBonus()
  resetForStage()
  startBattleMusic()
}

const retry = (): void => {
  if (isAdInFlight.value) return
  showSecondChance.value = false
  showResult.value = false
  showReview.value = false
  outOfLives.value = confirmLoss()
  resetForStage()
  begin()
  startBattleMusic()
}

const fireCoinExplosion = (sourceEl: HTMLElement): void => {
  if (coinBadgeEl.value) spawnCoinExplosion({ sourceEl, targetEl: coinBadgeEl.value })
}

// ─── Review tally rows (staggered reveal) ────────────────────────────────────
const reviewRows = computed(() => {
  const r = reviewData.value
  const rows: { key: string; label: string; value: string }[] = [
    { key: 'chunks', label: t('review.chunkPoints'), value: '+' + r.chunkPoints.toLocaleString() }
  ]
  if (r.greedyMult > 1) rows.push({ key: 'greedy', label: t('review.greedyMult'), value: '×' + r.greedyMult.toFixed(2) })
  if (r.greedyFinish > 0) rows.push({ key: 'finish', label: t('review.greedyFinish'), value: '+' + r.greedyFinish.toLocaleString() })
  if (r.sneaky > 0) rows.push({ key: 'sneaky', label: t('review.sneaky'), value: '+' + r.sneaky.toLocaleString() })
  if (r.lucky > 0) rows.push({ key: 'lucky', label: t('review.lucky'), value: '+' + r.lucky.toLocaleString() })
  if (r.speedy > 0) rows.push({ key: 'speedy', label: t('review.speedy'), value: '+' + r.speedy.toLocaleString() })
  return rows
})

watch(phase, (p, prev) => {
  if (p !== 'playing') onBlur()   // leaving play drops any held sneak input
  if (p === 'playing' && prev !== 'playing') startBattleMusic()
  if (p === 'dead' && prev === 'playing') void onDeath()
  if (p === 'review' && prev === 'playing') onReview()
  if (p === 'won') void onWin()
  if (p === 'playing') startGameplay()
  else stopGameplay()
})

// ─── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(() => {
  resetForStage()
  nextTick(resize)
  window.addEventListener('resize', resize)
  window.addEventListener('orientationchange', resize)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)
  rafId = requestAnimationFrame(loop)
  tickTimer = window.setInterval(() => { tickNow.value = Date.now() }, 250)
})
let tickTimer = 0
onUnmounted(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  window.removeEventListener('orientationchange', resize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  window.removeEventListener('blur', onBlur)
  clearInterval(tickTimer)
  stopBattleMusic()
})
</script>

<template lang="pug">
  div.cookie-arena.relative.w-screen.overflow-hidden(class="h-screen h-dvh bg-[#0d2a18]")
    canvas(
      ref="canvasRef"
      class="block touch-none absolute inset-0"
      :style="shakeStyle"
      @pointerdown="onCanvasDown"
      @contextmenu.prevent
    )

    //- ── HUD overlay ──────────────────────────────────────────────────────
    div.absolute.inset-0.pointer-events-none
      //- Top bar: StageBadge (left) + CoinBadge / chest (right)
      div.flex.justify-between.items-start(
        class="p-2"
        :style="{\
          paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',\
          paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        StageBadge(:stage-id="progress.stage.value" :cleared="chunksDeposited" :target="stageTarget")
        div.flex.flex-col.items-end.gap-4
          CoinBadge(ref="coinBadgeRef")
          TreasureChest(:target-el="coinBadgeEl")

      //- Center-top: awareness meter + score + timer + chunk counters
      div.absolute.left-0.right-0.flex.flex-col.items-center.gap-1(
        class="z-[5]"
        :style="{ top: 'calc(3.0rem + env(safe-area-inset-top, 0px))' }"
      )
        AwarenessMeter(
          v-if="phase === 'playing' || phase === 'dead'"
          :value="awarenessPct"
          :state="catState"
        )
        ScoreBadge(v-if="phase === 'playing' || phase === 'dead'" :score="score")
        div.flex.items-center.gap-3(v-if="phase === 'playing' || phase === 'dead'")
          //- timer
          div.flex.items-center.gap-1.rounded-full.px-2(
            class="py-0.5 bg-black/40 border border-white/10"
            :class="lowTime ? 'animate-pulse' : ''"
          )
            svg(viewBox="0 0 24 24" class="w-4 h-4" :class="lowTime ? 'text-red-400' : 'text-white/70'" fill="currentColor")
              path(d="M12 2 a10 10 0 1 0 0.001 0 Z M12 6 v6 l4 2" fill="none" stroke="currentColor" stroke-width="2")
            span.game-text.font-black.leading-none(class="text-sm sm:text-base" :class="lowTime ? 'text-red-300' : 'text-white'") {{ timeDisplay }}
          //- chunks carried / cookie remaining
          div.flex.items-center.gap-1.rounded-full.px-2(class="py-0.5 bg-black/40 border border-white/10")
            span.text-base {{ '🍪' }}
            span.game-text.font-black.text-yellow-200.leading-none(class="text-sm sm:text-base") {{ chunksCarried }}/6
          div.flex.items-center.gap-1.rounded-full.px-2(class="py-0.5 bg-black/40 border border-white/10")
            span.game-text.font-black.text-white.leading-none(class="text-xs sm:text-sm") {{ chunksDeposited }}/{{ cookieTotal }}

      //- Lives (top-center, just under the counters)
      div.absolute.left-0.right-0.flex.justify-center(
        v-if="phase === 'playing' || phase === 'dead'"
        :style="{ top: 'calc(10.5rem + env(safe-area-inset-top, 0px))' }"
      )
        LivesBadge(:value="lives")

      //- Tap-to-start prompt
      div.absolute.inset-0.flex.items-center.justify-center.z-10(v-if="phase === 'idle'" class="pointer-events-none")
        div.text-center.px-6
          div.text-white.font-black.uppercase.tracking-wider.animate-pulse.game-text(class="text-3xl sm:text-5xl mb-2") {{ startText }}
          div.text-yellow-100.italic.game-text(class="text-sm sm:text-lg opacity-80 max-w-md mx-auto") {{ t('startSubhint') }}

      //- Control hint (Hold/Release to sneak) — first stages only
      Transition(name="fade")
        div.absolute.left-0.right-0.flex.justify-center.z-10(
          v-if="showHint && !freezeWarn"
          :style="{ bottom: 'calc(13rem + env(safe-area-inset-bottom, 0px))' }"
        )
          div.text-white.italic.game-text.opacity-80(class="text-xs sm:text-sm px-3 py-1 rounded-full bg-black/40") {{ hintText }}

      //- FREEZE! warning — the cat is awake, the Mouse must hold still
      Transition(name="fade")
        div.absolute.left-0.right-0.flex.justify-center.z-10(
          v-if="freezeWarn"
          :style="{ top: 'calc(13rem + env(safe-area-inset-top, 0px))' }"
        )
          div.font-black.uppercase.tracking-widest.game-text.animate-pulse(
            class="text-2xl sm:text-4xl px-4 py-1 rounded-xl bg-red-700/70 border-2 border-red-300 text-white"
          ) {{ t('hints.freeze') }}

      //- ── D-pad + interact (bottom-center) ────────────────────────────────
      div.absolute.left-0.right-0.flex.justify-center.pointer-events-none(
        v-show="phase === 'playing'"
        :style="{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }"
      )
        div.dpad.grid.pointer-events-auto(
          class="gap-1.5"
          :style="{\
            gridTemplateColumns: 'repeat(3, var(--pad))',\
            gridTemplateRows: 'repeat(3, var(--pad))'\
          }"
        )
          div(style="grid-area: 1 / 2")
            DirButton(dir="up" :active="isDirActive('up')" class="w-full h-full" @press="onDirDown('up')" @release="onDirUp('up')")
          div(style="grid-area: 2 / 1")
            DirButton(dir="left" :active="isDirActive('left')" class="w-full h-full" @press="onDirDown('left')" @release="onDirUp('left')")
          div(style="grid-area: 2 / 2")
            DirButton(:interact="true" :active="interactActive" class="w-full h-full" @press="onInteract")
          div(style="grid-area: 2 / 3")
            DirButton(dir="right" :active="isDirActive('right')" class="w-full h-full" @press="onDirDown('right')" @release="onDirUp('right')")
          div(style="grid-area: 3 / 2")
            DirButton(dir="down" :active="isDirActive('down')" class="w-full h-full" @press="onDirDown('down')" @release="onDirUp('down')")

      //- Bottom-left: mute + settings + meta (hidden during a run)
      div.absolute.pointer-events-auto.z-50.flex.flex-col.items-start.gap-1(
        :style="{\
          bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',\
          left: 'calc(0.5rem + env(safe-area-inset-left, 0px))'\
        }"
      )
        FMuteButton
        button.cursor-pointer.transition-transform.mb-1(
          v-show="phase !== 'playing' && phase !== 'frenzy'"
          class="hover:scale-[103%] active:scale-90 scale-80 sm:scale-100"
          @click="showOptions = true"
        )
          div.relative
            div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#0c5a2e]")
            div.relative.rounded-lg.border-2.flex.items-center.justify-center.p-2(class="bg-gradient-to-b from-[#5cd16d] to-[#2e9a4a] border-[#0a3a1c]")
              svg(viewBox="0 0 24 24" class="w-7 h-7 text-white" fill="currentColor")
                path(d="M12 4 a1 1 0 0 1 1 1 v1.6 a6 6 0 0 1 1.8 0.7 l1.1 -1.1 a1 1 0 0 1 1.4 1.4 l -1.1 1.1 a6 6 0 0 1 0.7 1.8 H18 a1 1 0 1 1 0 2 h-1.6 a6 6 0 0 1 -0.7 1.8 l1.1 1.1 a1 1 0 0 1 -1.4 1.4 l-1.1 -1.1 a6 6 0 0 1 -1.8 0.7 V18 a1 1 0 1 1 -2 0 v -1.6 a6 6 0 0 1 -1.8 -0.7 l-1.1 1.1 a1 1 0 0 1 -1.4 -1.4 l1.1 -1.1 a6 6 0 0 1 -0.7 -1.8 H6 a1 1 0 1 1 0 -2 h1.6 a6 6 0 0 1 0.7 -1.8 L7.2 7.6 a1 1 0 0 1 1.4 -1.4 l1.1 1.1 a6 6 0 0 1 1.8 -0.7 V5 a1 1 0 0 1 1 -1 Z M12 9 a3 3 0 1 0 0 6 a3 3 0 0 0 0 -6 Z")
        div.flex.items-end(v-show="phase !== 'playing' && phase !== 'frenzy'" class="gap-0 sm:gap-2")
          DailyRewards(@coins-awarded="fireCoinExplosion")
          MissionsModal(@coins-awarded="fireCoinExplosion")
          AchievementsButton(@coins-awarded="fireCoinExplosion")
          AdRewardButton(@coins-awarded="fireCoinExplosion")
          BattlePass(@coins-awarded="fireCoinExplosion")

      //- Bottom-right: upgrades (hidden during a run)
      div.absolute.pointer-events-auto.z-50.flex.flex-col.items-end.gap-2(
        v-show="phase !== 'playing' && phase !== 'frenzy'"
        :style="{\
          bottom: 'calc(0.5rem + env(safe-area-inset-bottom, 0px))',\
          right: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        div.relative
          div.absolute.right-full.mr-2.whitespace-nowrap.rounded-lg.border-2.px-2.py-1.font-black.uppercase.game-text.text-white.animate-pulse(
            v-if="showUpgradeSpotlight"
            class="top-1/2 -translate-y-1/2 bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0a3a1c] text-[10px]"
          ) {{ t('upgrades.spotlight') }} →
          button.cursor-pointer.transition-transform(
            class="hover:scale-[103%] active:scale-90 scale-80 sm:scale-100"
            :class="showUpgradeSpotlight ? 'animate-pulse' : ''"
            @click="openUpgrades"
          )
            div.relative
              div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#0c5a2e]")
              div.relative.rounded-lg.border-2.flex.items-center.justify-center.p-2(
                class="bg-gradient-to-b from-[#5cd16d] to-[#2e9a4a]"
                :class="showUpgradeSpotlight ? 'border-yellow-300 ring-4 ring-yellow-300/70' : 'border-[#0a3a1c]'"
              )
                svg(viewBox="0 0 24 24" class="w-7 h-7 text-white" fill="currentColor")
                  path(d="M4 14 L12 6 L20 14 H15 V20 H9 V14 Z" stroke="black" stroke-width="0.8")

    //- ── Eating Frenzy overlay (canvas draws the scene; HUD is the prompt) ──
    Transition(name="fade")
      div.absolute.inset-0.flex.flex-col.items-center.justify-between.pointer-events-none.z-20(
        v-if="phase === 'frenzy'"
        :style="{\
          paddingTop: 'calc(2rem + env(safe-area-inset-top, 0px))',\
          paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))'\
        }"
      )
        div.text-center
          div.text-yellow-300.font-black.uppercase.tracking-widest.game-text.animate-pulse(class="text-3xl sm:text-5xl") {{ t('frenzy.title') }}
          div.text-white.game-text.opacity-80(class="text-sm sm:text-base") {{ t('frenzy.sub') }}
          div.text-white.font-black.game-text.mt-1(class="text-lg sm:text-2xl") {{ frenzyTimeLeft.toFixed(1) }}s
        div.w-full.flex.flex-col.items-center.gap-3.px-6
          div.relative.rounded-full.overflow-hidden.border-2.border-yellow-200(class="w-[80vw] max-w-md h-5 bg-black/50")
            div.absolute.inset-y-0.left-0.bg-gradient-to-r.from-yellow-300.to-orange-500(:style="{ width: frenzyPct + '%', transition: 'width 0.1s linear' }")
          button.pointer-events-auto.cursor-pointer.rounded-2xl.border-2.border-yellow-200.px-8.py-4.font-black.uppercase.game-text.text-white.bg-gradient-to-b.from-orange-400.to-red-600(
            class="text-xl sm:text-2xl active:scale-95"
            @pointerdown.prevent="frenzyTap"
          ) {{ isMobilePortrait ? t('frenzy.tap') : t('frenzy.click') }}

    //- ── Level Review overlay ────────────────────────────────────────────
    Transition(name="fade")
      div.fixed.inset-0.flex.items-center.justify-center.backdrop-blur-md.p-4(
        v-if="showReview"
        class="z-[110] bg-black/70"
        :style="{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }"
      )
        div.flex.flex-col.items-center.gap-3.rounded-2xl.border-2.shadow-2xl.w-full(
          class="bg-gradient-to-b from-[#16321f] to-[#0a1a10] border-yellow-300 px-6 py-5 max-w-sm"
        )
          div.font-black.uppercase.tracking-wider.game-text.text-yellow-300(class="text-2xl sm:text-3xl") {{ t('review.title') }}
          div.flex.flex-col.gap-1.w-full
            div.flex.justify-between.items-center.review-row.w-full(
              v-for="(row, i) in reviewRows"
              :key="row.key"
              :style="{ animationDelay: (i * 0.25) + 's' }"
            )
              span.text-white.game-text.opacity-80(class="text-xs sm:text-sm") {{ row.label }}
              span.text-yellow-200.font-black.game-text(class="text-sm sm:text-base") {{ row.value }}
          div.w-full.bg-white.opacity-20.my-1(class="h-0.5")
          div.flex.flex-col.items-center(class="gap-0.5")
            span.text-white.game-text.uppercase.opacity-70(class="text-xs") {{ t('review.daringTotal') }}
            span.text-yellow-300.font-black.game-text.animate-pulse(class="text-3xl sm:text-4xl") {{ reviewData.daringTotal.toLocaleString() }}
          button.cursor-pointer.transition-transform.w-full.mt-1(
            class="px-4 py-2 rounded-lg bg-gradient-to-b from-[#5cd16d] to-[#2e9a4a] border-2 border-[#0a3a1c] text-white font-black uppercase game-text hover:scale-[103%] active:scale-95"
            @click="onReviewContinue"
          ) {{ t('review.toFrenzy') }}

    //- ── Second-chance overlay ───────────────────────────────────────────
    Transition(name="fade")
      div.fixed.inset-0.flex.items-center.justify-center.backdrop-blur-md.p-4(
        v-if="showSecondChance"
        class="z-[110] bg-black/70"
        :style="{ paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' }"
      )
        div.flex.flex-col.items-center.gap-4.rounded-2xl.border-2.shadow-2xl(
          class="bg-gradient-to-b from-[#16321f] to-[#0a1a10] border-yellow-300 px-6 py-5 max-w-sm"
        )
          div.font-black.uppercase.tracking-wider.game-text.text-yellow-300(class="text-2xl sm:text-3xl") {{ t('secondChance.title') }}
          div.text-white.game-text.text-center.opacity-80(class="text-sm sm:text-base") {{ t('secondChance.body') }}
          button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-2(
            class="w-full px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-700 border-2 border-emerald-200 text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50 disabled:cursor-wait"
            :disabled="isAdInFlight"
            @click="onAcceptContinue"
          )
            IconMovie(class="w-5 h-5 shrink-0")
            span {{ t('secondChance.watch') }}
          button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-2(
            class="w-full px-4 py-2 rounded-lg bg-gradient-to-b from-emerald-400 to-emerald-700 border-2 border-emerald-200 text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50"
            :disabled="isAdInFlight"
            @click="retry"
          )
            svg(viewBox="0 0 24 24" class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round")
              path(d="M3 12 a9 9 0 1 0 3 -6.7 L3 8")
              path(d="M3 4 v4 h4")
            span {{ t('result.retry') }}
          button.cursor-pointer.transition-transform(
            class="w-full px-4 py-2 rounded-lg bg-slate-700 border-2 border-slate-500 text-white font-bold uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50"
            :disabled="isAdInFlight"
            @click="onSkipContinue"
          ) {{ t('secondChance.skip') }}

    //- ── Win / Lose result overlay ───────────────────────────────────────
    FReward(v-model="showResult" :show-continue="!isAdInFlight" @continue="onResultContinue")
      template(#ribbon)
        span.text-white.font-black.uppercase.italic.game-text(class="sm:text-2xl") {{ t('rewards') }}
      div.flex.flex-col.items-center.gap-4
        div.font-black.uppercase.tracking-wider.game-text(
          class="text-3xl sm:text-5xl"
          :class="phase === 'won' ? 'text-green-400' : 'text-red-400'"
        ) {{ phase === 'won' ? t('result.win') : t('result.lose') }}
        div.text-white.game-text.text-center.opacity-80(v-if="phase !== 'won'" class="text-sm sm:text-base")
          | {{ lossCause === 'timeout' ? t('result.timeout') : lossCause === 'trap' ? t('result.trap') : t('result.caught') }}
        div.text-yellow-200.game-text.text-center.font-black.animate-pulse(v-if="phase !== 'won' && outOfLives" class="text-sm sm:text-base") {{ t('result.outOfLives') }}
        //- Daring total (win) / lost score (lose)
        div.flex.items-center.gap-2.text-white.game-text(class="text-base sm:text-lg")
          span.opacity-70.uppercase.tracking-wider.text-xs {{ phase === 'won' ? t('result.daring') : t('result.scoreLost') }}
          span.font-black.text-yellow-200(class="text-xl sm:text-2xl") {{ phase === 'won' ? lastDaringTotal.toLocaleString() : (chunksDeposited * 100).toLocaleString() }}
        //- Coins
        div.flex.flex-col.items-center.gap-1(ref="rewardCoinRef")
          div.flex.items-center.gap-3
            IconCoin(class="w-8 h-8 text-yellow-300")
            span.text-yellow-400.font-black.game-text(class="text-2xl sm:text-4xl") +{{ runTotalCoins }}
        //- 2× rewarded
        button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-2(
          v-if="twoXAvailable"
          class="rounded-xl bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-2 border-[#0a3a1c] text-white font-black uppercase game-text hover:scale-[103%] active:scale-95 disabled:opacity-50 px-5 py-2"
          :disabled="isAdInFlight"
          @click="onTwoX"
        )
          IconMovie(class="w-5 h-5 shrink-0")
          span {{ firstRunBonusActive ? t('result.firstRunDouble') : t('result.double') }}

    OptionsModal(:is-open="showOptions" @close="showOptions = false")
    EpicUpgradesModal(v-model="showUpgrades")
</template>

<style scoped lang="sass">
.dpad
  --pad: clamp(56px, 16vmin, 92px)
.review-row
  animation: review-in 0.4s ease both
@keyframes review-in
  from
    opacity: 0
    transform: translateY(8px)
  to
    opacity: 1
    transform: translateY(0)
.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter-from, .fade-leave-to
  opacity: 0
</style>
