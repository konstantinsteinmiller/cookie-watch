/**
 * Cookie Watch — core engine (free-movement revision).
 *
 * A Game & Watch–style stealth arcade. The Mouse sneaks across the kitchen
 * floor — a continuous track from its mouse hole (`pos` 0) to the giant cookie
 * (`pos` 1) guarded by the dozing Cat-Eye — breaks off chunks, carries the
 * weight home and deposits for points.
 *
 * The threat is a "Green Light / Red Light" cat: it naps on a random timer,
 * gives a brief `stirring` tell, then snaps `awake`. While it is awake the
 * Mouse must FREEZE (release the controls = hide). Caught moving, the Cat's
 * mechanical arms wind up and STOMP — but you can still freeze during the
 * wind-up to slip away. Running is fast but noisy: it wakes the cat sooner.
 *
 * This module owns ALL game logic and the per-frame mutable render model
 * (`game`). The renderer (`useCookieArt`) reads `game.*` each frame and owns no
 * logic; the scene (`GameScene.vue`) feeds input + reads the reactive HUD refs.
 * Persisted progress lives inside the single `cookie_watch_state` blob.
 */
import { ref, computed, type Ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import { STAGE_KEY } from '@/keys'
import { difficultySpeedFactor } from '@/use/useUser'
import useEpicProgress from '@/use/useEpicProgress'
import useScreenshake from '@/use/useScreenshake'
import useSounds from '@/use/useSound'

// ─── Public types ───────────────────────────────────────────────────────────
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Phase = 'idle' | 'playing' | 'dead' | 'review' | 'frenzy' | 'won'
export type CatState = 'asleep' | 'stirring' | 'awake' | 'alert' | 'pounce'
export type LossCause = '' | 'caught' | 'trap' | 'timeout'
/** Kept for HUD compatibility — only 'interact' / 'none' are used now. */
export type PendingKind = 'move' | 'interact' | 'trap' | 'none'

export const DIRS: ReadonlyArray<Dir> = ['up', 'down', 'left', 'right']
/** Which directions push the Mouse forward (toward the cookie) vs back home. */
const FORWARD_DIRS: ReadonlyArray<Dir> = ['right', 'up']
const BACK_DIRS: ReadonlyArray<Dir> = ['left', 'down']

/** A transient visual event the renderer pops and animates. */
export interface FxEvent {
  kind: 'noise' | 'crumb' | 'deposit' | 'pounce' | 'escape' | 'grab' | 'step' | 'trap'
  /** Track position the fx originates at (0..1); renderer maps to screen. */
  at: number
  /** Magnitude 0..1 for size/intensity. */
  power: number
  t: number
}

const LIVES_KEY = 'cw_lives'
const START_LIVES = 3

// ─── Movement tuning ──────────────────────────────────────────────────────────
const BASE_SPEED = 0.34          // track-units / sec while sneaking (≈3s end-to-end)
const RUN_MULT = 1.9             // double-tap dash multiplier
const HEAVY_SLOWDOWN = 0.85      // 4–6 chunks carried → 15% slower (GDD)
const HOLE_R = 0.05              // |pos| within this of the hole = home/safe
const COOKIE_R = 0.93            // pos beyond this = at the cookie (can chunk)
const DOUBLE_TAP_MS = 260        // two presses within this window engage running
const RENDER_LERP_PER_S = 14     // how fast renderPos chases pos

// ─── Cat awareness / state-machine tuning ─────────────────────────────────────
const AW_RUN_PER_S = 34          // suspicion gained per second while running
const AW_CHUNK_TAP = 6           // suspicion per greedy chunk tap (fast mashing)
const AW_HESITATE = 22           // suspicion spike if the player idles too long
const AW_DECAY_HIDDEN = 22       // suspicion bled off per second while frozen
const AW_DECAY_HOLE = 40         // …faster while tucked in the hole
const HESITATE_MS = 9_000
const CHUNK_EXPOSE_MS = 240      // a chunk tap keeps you "exposed" this long after

// Nap / watch durations (ms). Scaled by stage + difficulty. The cat sleeps in
// bursts; a `stirring` tell precedes every wake so a watchful player can freeze.
const NAP_MIN = 2600
const NAP_MAX = 5200
const STIR_MS = 650              // warning window before the eyes snap open
const WATCH_MIN = 1500
const WATCH_MAX = 2900
const STOMP_WINDUP = 360         // ms from "spotted" to the arm landing (escape window)

const FRENZY_SECONDS = 20
const FRENZY_1UP_UNDER = 15
const FRENZY_PER_TAP = 3.6       // % of cookie devoured per frenzy tap

// ─── Stage configuration ─────────────────────────────────────────────────────
/** Legacy difficulty hint (kept for tests/compat); no longer drives layout. */
export const zoneCountForStage = (stage: number): number =>
  Math.min(6, 4 + Math.floor((Math.max(1, stage) - 1) / 2))
/** Chunks in the cookie this stage: 6 at stage 1, +1/stage, cap 18. */
export const cookieChunksForStage = (stage: number): number =>
  Math.min(18, 6 + (Math.max(1, stage) - 1))
/** Stage time limit (seconds): 90 at stage 1, −5/stage, floor 45. */
export const stageTimeForStage = (stage: number): number =>
  Math.max(45, 90 - (Math.max(1, stage) - 1) * 5)
/** How much shorter the cat naps as stages climb (0..0.55). */
const napTightenForStage = (stage: number): number =>
  Math.min(0.55, (Math.max(1, stage) - 1) * 0.05)

/** Taps required to break ONE chunk off, given the carried weight (GDD: a
 *  heavy sack makes every grab harder). */
export const tapsForChunks = (chunks: number): number =>
  chunks >= 5 ? 3 : chunks >= 3 ? 2 : 1
/** Per-run greedy multiplier contribution by chunks deposited (GDD table). */
export const greedyMultForChunks = (chunks: number): number =>
  chunks >= 6 ? 1.5 : chunks >= 5 ? 1.4 : chunks >= 4 ? 1.3 : chunks >= 3 ? 1.25 : 0

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const randRange = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)

// ─── Per-frame mutable render model (read by the renderer; NOT reactive) ─────
export const game = {
  stage: 1,
  seg: 4,                 // legacy difficulty hint
  pos: 0,                 // continuous track position 0(home)..1(cookie)
  renderPos: 0,           // smoothed position for the renderer
  facing: 1 as 1 | -1,
  moving: false,          // a direction is held this frame
  running: false,         // double-tap dash engaged
  hidden: true,           // frozen & safe (no input / at the hole)
  exposed: false,         // moving OR running OR recently chunking
  chunksCarried: 0,
  chunksInCookie: 6,
  chunksDeposited: 0,
  cookieTotal: 6,
  chunkProgress: 0,       // taps accrued toward breaking the next chunk
  awareness: 0,           // 0..100 suspicion meter
  catState: 'asleep' as CatState,
  stompT: 0,              // 0..1 progress of an in-flight arm stomp
  stompArm: 1 as 1 | -1,  // which arm is swinging (renderer only)
  frenzy: 0,              // 0..100 cookie devoured (Eating Frenzy)
  fx: [] as FxEvent[]
}

const pushFx = (kind: FxEvent['kind'], at: number, power = 1): void => {
  game.fx.push({ kind, at, power, t: performance.now() })
  if (game.fx.length > 64) game.fx.shift()
}

// ─── Reactive HUD surface (read by the scene) ────────────────────────────────
export const phase: Ref<Phase> = ref('idle')
export const lossCause: Ref<LossCause> = ref('')
export const lives: Ref<number> = ref(clamp(Number(getState<number>(LIVES_KEY, START_LIVES)) || START_LIVES, 0, START_LIVES))
export const score: Ref<number> = ref(0)
export const timeLeft: Ref<number> = ref(90)
export const awarenessPct: Ref<number> = ref(0)
export const catStateRef: Ref<CatState> = ref('asleep')
export const chunksCarried: Ref<number> = ref(0)
export const chunksRemaining: Ref<number> = ref(6)
export const chunksDeposited: Ref<number> = ref(0)
export const cookieTotal: Ref<number> = ref(6)
export const runsThisStage: Ref<number> = ref(0)
export const greedyMultSum: Ref<number> = ref(0)
// HUD-compat refs. `pendingKind`/`interactHint` drive the on-screen pad glyph;
// `expectedDir` is the gentle "go this way" suggestion (toward cookie/home).
export const pendingKind: Ref<PendingKind> = ref('none')
export const expectedDir: Ref<Dir | null> = ref(null)
export const promptSeq: Ref<Dir[]> = ref([])
export const promptPip: Ref<number> = ref(0)
export const interactHint: Ref<'grab' | 'deposit' | ''> = ref('')
export const frenzyPct: Ref<number> = ref(0)
export const frenzyTimeLeft: Ref<number> = ref(FRENZY_SECONDS)
/** True while the cat is awake and the Mouse must FREEZE — drives the warning. */
export const mustFreeze: Ref<boolean> = ref(false)

export interface ReviewData {
  chunkPoints: number
  greedyMult: number
  greedyFinish: number
  sneaky: number
  lucky: number
  speedy: number
  oneUp: boolean
  daringTotal: number
}
export const reviewData: Ref<ReviewData> = ref({
  chunkPoints: 0, greedyMult: 1, greedyFinish: 0, sneaky: 0, lucky: 0, speedy: 0, oneUp: false, daringTotal: 0
})

/** Final Daring Total banked when a stage is fully completed (after frenzy). */
export const lastDaringTotal: Ref<number> = ref(0)

// ─── Internal run bookkeeping (not reactive) ─────────────────────────────────
let elapsedMs = 0          // gameplay clock (excludes pauses; advanced in step)
let lastInputMs = 0
let lastChunkTapMs = -1e9
let minRunChunks = 99
let maxAwarenessSeen = 0
let pouncedAndEscaped = false
let frenzyStartElapsed = 0

// Cat state-machine timers (ms on the `elapsedMs` clock).
let catStateUntil = 0      // when the current asleep/awake phase ends
let stirEndMs = 0          // when a `stirring` tell flips to `awake`
let stompAtMs = 0          // when an in-flight stomp lands (0 = none)
let napTighten = 0         // 0..0.55 stage nap reduction
let diffFactor = 1         // difficulty travel/reaction factor

// Held-input tracking (driven by pressDir/releaseDir).
const heldDirs = new Set<Dir>()
let lastTapDir: Dir | null = null
let lastTapMs = -1e9

// Upgrade-derived run modifiers (recomputed each stage).
let upLightPaws = 0
let upHoleDecay = AW_DECAY_HOLE
let upPounceBonusMs = 0    // extra stomp wind-up (Sixth Sense)
let upExtraTime = 0
let awScale = 1            // suspicion-gain scale (Calm Nerves lowers it)

const progress = useEpicProgress()
const { triggerShake } = useScreenshake()
const { playSound } = useSounds()

// ─── Awareness helpers ───────────────────────────────────────────────────────
const addAwareness = (delta: number): void => {
  game.awareness = clamp(game.awareness + delta * (delta > 0 ? awScale : 1), 0, 100)
  if (game.awareness > maxAwarenessSeen) maxAwarenessSeen = game.awareness
}

/** Suspicious noise from an action (chunk mashing, hesitation, running). */
const noise = (base: number): void => {
  const amt = Math.max(1, base - upLightPaws)
  addAwareness(amt)
  pushFx('noise', game.pos, clamp(base / 16, 0.3, 1))
}

// ─── Cat state machine ─────────────────────────────────────────────────────────
const enterAsleep = (relax = true): void => {
  game.catState = 'asleep'
  catStateRef.value = 'asleep'
  mustFreeze.value = false
  game.stompT = 0
  stompAtMs = 0
  if (relax) game.awareness = Math.max(0, game.awareness - 20)
  const base = randRange(NAP_MIN, NAP_MAX) * (1 - napTighten) * diffFactor
  // A jittery, suspicious cat naps shorter.
  catStateUntil = elapsedMs + base * (1 - game.awareness / 160)
}

const enterStirring = (): void => {
  game.catState = 'stirring'
  catStateRef.value = 'stirring'
  stirEndMs = elapsedMs + STIR_MS * diffFactor
  playSound('obstacle-hit', 0.02, 1.4)
  pushFx('noise', 1, 0.5)
}

const enterAwake = (): void => {
  game.catState = 'awake'
  catStateRef.value = 'awake'
  mustFreeze.value = true
  catStateUntil = elapsedMs + randRange(WATCH_MIN, WATCH_MAX) * (1 - napTighten * 0.5)
  playSound('dodge', 0.03, 0.7)
}

/** The cat spots the moving Mouse → wind up an arm stomp. */
const armStomp = (): void => {
  if (game.catState === 'alert' || phase.value !== 'playing') return
  game.catState = 'alert'
  catStateRef.value = 'alert'
  game.stompArm = game.pos < 0.5 ? -1 : 1
  game.stompT = 0
  stompAtMs = elapsedMs + STOMP_WINDUP + upPounceBonusMs
  triggerShake('small')
  playSound('obstacle-hit', 0.05, 0.8)
}

/** Resolve a wind-up: stomp landed. Caught only if still exposed. */
const resolveStomp = (): void => {
  stompAtMs = 0
  game.stompT = 1
  if (game.exposed && game.pos > HOLE_R) {
    pushFx('pounce', game.pos, 1)
    triggerShake('big')
    playSound('explosion-1', 0.07)
    die('caught')
  } else {
    // Froze in time — the arm slams empty floor.
    pouncedAndEscaped = true
    pushFx('escape', game.pos, 1)
    playSound('celebration-3', 0.05)
    addAwareness(-25)
    game.catState = 'awake'
    catStateRef.value = 'awake'
  }
}

// ─── Movement input ──────────────────────────────────────────────────────────
/** Net forward intent from the held directions: +1 cookie, −1 home, 0 still. */
const netDir = (): number => {
  let fwd = 0
  for (const d of heldDirs) {
    if (FORWARD_DIRS.includes(d)) fwd += 1
    else if (BACK_DIRS.includes(d)) fwd -= 1
  }
  return Math.sign(fwd)
}

/** Begin sneaking in a direction (key-down / pad press). Double-tap → run. */
export const pressDir = (dir: Dir): void => {
  if (phase.value !== 'playing') return
  const now = elapsedMs
  if (lastTapDir === dir && now - lastTapMs < DOUBLE_TAP_MS) game.running = true
  lastTapDir = dir
  lastTapMs = now
  lastInputMs = now
  heldDirs.add(dir)
}

/** Stop sneaking in a direction (key-up / pad release). */
export const releaseDir = (dir: Dir): void => {
  heldDirs.delete(dir)
  if (heldDirs.size === 0) game.running = false
}

/** Release every held direction (blur / pause / phase change). */
export const releaseAllDirs = (): void => {
  heldDirs.clear()
  game.running = false
}

// ─── Chunking + depositing ─────────────────────────────────────────────────────
/** The interact / Space / tap button — break a chunk at the cookie, or devour
 *  during the frenzy. (Depositing at the hole is automatic.) */
export const pressInteract = (): void => {
  if (phase.value === 'frenzy') {
    frenzyTap()
    return
  }
  if (phase.value !== 'playing') return
  if (game.pos < COOKIE_R) return
  if (game.chunksCarried >= 6 || game.chunksInCookie <= 0) return

  const now = elapsedMs
  const fast = now - lastChunkTapMs < 130
  lastChunkTapMs = now
  lastInputMs = now
  if (fast) noise(AW_CHUNK_TAP)        // greedy mashing risks waking the cat

  game.chunkProgress += 1
  pushFx('grab', 1, 0.5)
  playSound('wood-cut', 0.04, 1 + Math.random() * 0.15)
  if (game.chunkProgress >= tapsForChunks(game.chunksCarried)) {
    game.chunkProgress = 0
    game.chunksInCookie -= 1
    game.chunksCarried += 1
    pushFx('crumb', 1, 0.8)
    playSound('coin-pickup', 0.035)
  }
  syncHud()
}

const depositHaul = (): void => {
  const carried = game.chunksCarried
  if (carried <= 0) return
  game.chunksDeposited += carried
  score.value = game.chunksDeposited * 100
  const gm = greedyMultForChunks(carried)
  if (gm > 0) greedyMultSum.value = Math.round((greedyMultSum.value + gm) * 100) / 100
  runsThisStage.value += 1
  minRunChunks = Math.min(minRunChunks, carried)
  game.chunksCarried = 0
  pushFx('deposit', 0, clamp(carried / 6, 0.4, 1))
  playSound('coin-pickup', 0.05)
  playSound('celebration-1', 0.04)
  triggerShake('small')
  syncHud()
  if (game.chunksDeposited >= game.cookieTotal) finishStageReview()
}

// ─── Death / revive ──────────────────────────────────────────────────────────
const die = (cause: LossCause): void => {
  if (phase.value !== 'playing') return
  lossCause.value = cause
  phase.value = 'dead'
  game.moving = false
  game.running = false
  mustFreeze.value = false
  releaseAllDirs()
}

/** Spend a life and report whether the player is now out (→ campaign reset). */
export const loseLife = (): boolean => {
  lives.value = Math.max(0, lives.value - 1)
  if (lives.value <= 0) {
    lives.value = START_LIVES
    setState(LIVES_KEY, lives.value)
    setState(STAGE_KEY, 1)
    return true
  }
  setState(LIVES_KEY, lives.value)
  return false
}

/** Award an extra life (1up), capped at START_LIVES + 2. */
export const gainLife = (): void => {
  lives.value = Math.min(START_LIVES + 2, lives.value + 1)
  setState(LIVES_KEY, lives.value)
}

/** Rewarded-ad revive: resume the run, calm the cat, keep the haul. */
export const revive = (): void => {
  if (phase.value !== 'dead') return
  game.awareness = 0
  game.stompT = 0
  stompAtMs = 0
  lossCause.value = ''
  phase.value = 'playing'
  lastInputMs = elapsedMs
  enterAsleep(true)
  syncHud()
}

// ─── Stage lifecycle ─────────────────────────────────────────────────────────
export const stageTarget = computed(() => cookieTotal.value)

/** Build a fresh stage from the current progress stage. */
export const resetForStage = (): void => {
  const stage = Math.max(1, progress.stage.value)
  game.stage = stage
  game.seg = zoneCountForStage(stage)
  game.cookieTotal = cookieChunksForStage(stage)
  game.chunksInCookie = game.cookieTotal
  game.chunksDeposited = 0
  game.chunksCarried = 0
  game.chunkProgress = 0
  game.pos = 0
  game.renderPos = 0
  game.facing = 1
  game.moving = false
  game.running = false
  game.hidden = true
  game.exposed = false
  game.awareness = 0
  game.catState = 'asleep'
  game.stompT = 0
  game.stompArm = 1
  game.frenzy = 0
  game.fx = []

  // Fold in permanent mouse upgrades for this kitchen.
  const calm = Math.max(0, Math.min(0.6, progress.upgradedValue('calmNerves')))
  awScale = 1 - calm
  upLightPaws = Math.max(0, progress.upgradedValue('lightPaws'))
  upHoleDecay = AW_DECAY_HOLE + Math.max(0, progress.upgradedValue('deepHole'))
  upPounceBonusMs = Math.max(0, progress.upgradedValue('sixthSense')) * 1000
  upExtraTime = Math.max(0, progress.upgradedValue('extraTime'))
  napTighten = napTightenForStage(stage)
  diffFactor = 1 / Math.max(0.6, difficultySpeedFactor()) // Easy → longer naps/windups

  heldDirs.clear()
  lastTapDir = null

  // Run/scoring bookkeeping.
  runsThisStage.value = 0
  greedyMultSum.value = 0
  score.value = 0
  minRunChunks = 99
  maxAwarenessSeen = 0
  pouncedAndEscaped = false
  elapsedMs = 0
  lastInputMs = 0
  lastChunkTapMs = -1e9
  stompAtMs = 0

  cookieTotal.value = game.cookieTotal
  chunksRemaining.value = game.chunksInCookie
  timeLeft.value = stageTimeForStage(stage) + upExtraTime
  lossCause.value = ''
  mustFreeze.value = false
  pendingKind.value = 'none'
  phase.value = 'idle'
  syncHud()
}

/** Begin the live run (first tap/click of the stage). */
export const begin = (): void => {
  if (phase.value !== 'idle') return
  phase.value = 'playing'
  elapsedMs = 0
  lastInputMs = 0
  game.hidden = true
  progress.recordGamePlayed()
  enterAsleep(false)
  syncHud()
}

const finishStageReview = (): void => {
  const clearedSeconds = elapsedMs / 1000
  const remaining = Math.max(0, timeLeft.value)

  const chunkPoints = game.cookieTotal * 100
  const greedyMult = greedyMultSum.value > 0 ? greedyMultSum.value : 1
  const greedyFinish = (clearedSeconds < 30 && minRunChunks >= 5) ? 5000 : 0
  const sneaky = maxAwarenessSeen < 40 ? 3000 : 0
  const lucky = pouncedAndEscaped ? 10_000 : 0
  const speedy = Math.round(10 * remaining)
  const daringTotal = Math.round(chunkPoints * greedyMult) + greedyFinish + sneaky + lucky + speedy

  reviewData.value = { chunkPoints, greedyMult, greedyFinish, sneaky, lucky, speedy, oneUp: false, daringTotal }
  phase.value = 'review'
  releaseAllDirs()
  playSound('win', 0.06)
  playSound('level-up', 0.05)
}

/** Leave the Level Review and start the Eating Frenzy mini-game. */
export const startFrenzy = (): void => {
  game.frenzy = 0
  frenzyPct.value = 0
  frenzyStartElapsed = elapsedMs
  frenzyTimeLeft.value = FRENZY_SECONDS
  phase.value = 'frenzy'
}

/** A frenzy tap — devour the cookie a little more. */
export const frenzyTap = (): void => {
  if (phase.value !== 'frenzy') return
  game.frenzy = clamp(game.frenzy + FRENZY_PER_TAP, 0, 100)
  frenzyPct.value = Math.round(game.frenzy)
  playSound('wood-cut', 0.04, 1.1 + Math.random() * 0.3)
  if (game.frenzy >= 100) endFrenzy(true)
}

const endFrenzy = (devoured: boolean): void => {
  const took = (elapsedMs - frenzyStartElapsed) / 1000
  const oneUp = devoured && took < FRENZY_1UP_UNDER
  if (oneUp) { gainLife(); playSound('celebration-3', 0.06) }
  reviewData.value = { ...reviewData.value, oneUp }
  lastDaringTotal.value = reviewData.value.daringTotal
  progress.recordScore(reviewData.value.daringTotal)
  progress.advanceStage()
  phase.value = 'won'
}

/** Confirm a loss and consume a life; returns true if out of lives. */
export const confirmLoss = (): boolean => loseLife()

export const clock = (): number => elapsedMs

// ─── HUD mirroring ───────────────────────────────────────────────────────────
const syncHud = (): void => {
  chunksCarried.value = game.chunksCarried
  chunksRemaining.value = game.chunksInCookie
  chunksDeposited.value = game.chunksDeposited
  cookieTotal.value = game.cookieTotal
  catStateRef.value = game.catState
  // On-screen pad cues: a paw glyph at the cookie / a gentle direction nudge.
  const atCookie = game.pos >= COOKIE_R
  interactHint.value = atCookie && game.chunksCarried < 6 && game.chunksInCookie > 0 ? 'grab' : ''
  pendingKind.value = interactHint.value === 'grab' ? 'interact' : 'none'
  // Suggest heading home once loaded (or cookie spent), else toward the cookie.
  expectedDir.value = (game.chunksCarried > 0 || game.chunksInCookie <= 0) ? 'left' : 'right'
}

// ─── Per-frame update ─────────────────────────────────────────────────────────
const HUD_AW = { v: -1 }
const HUD_T = { v: -1 }

export const step = (dt: number): void => {
  // Smooth the render position toward the logical one (exponential follow).
  const diff = game.pos - game.renderPos
  if (Math.abs(diff) > 0.0005) {
    game.renderPos = clamp(game.renderPos + diff * Math.min(1, (RENDER_LERP_PER_S * dt) / 1000), 0, 1)
  } else {
    game.renderPos = game.pos
  }

  if (phase.value === 'frenzy') {
    elapsedMs += dt
    const left = FRENZY_SECONDS - (elapsedMs - frenzyStartElapsed) / 1000
    frenzyTimeLeft.value = Math.max(0, Math.round(left * 10) / 10)
    if (left <= 0) endFrenzy(game.frenzy >= 100)
    return
  }

  if (phase.value !== 'playing') {
    game.moving = false
    return
  }
  elapsedMs += dt
  const ds = dt / 1000

  // Timer.
  timeLeft.value = Math.max(0, timeLeft.value - ds)

  // ── Movement ──
  const dir = netDir()
  game.moving = dir !== 0
  if (game.moving) {
    if (dir > 0) game.facing = 1
    else if (dir < 0) game.facing = -1
    let spd = BASE_SPEED * difficultySpeedFactor()
    if (game.running) spd *= RUN_MULT
    if (game.chunksCarried >= 4) spd *= HEAVY_SLOWDOWN
    game.pos = clamp(game.pos + dir * spd * ds, 0, 1)
    lastInputMs = elapsedMs
    if (Math.random() < dt / 90) pushFx('step', game.pos, 0.4)
  }

  // ── Exposure: moving / running / fresh chunk tap leaves you visible. ──
  const recentChunk = elapsedMs - lastChunkTapMs < CHUNK_EXPOSE_MS
  const atHole = game.pos <= HOLE_R
  game.exposed = !atHole && (game.moving || game.running || recentChunk)
  game.hidden = !game.exposed

  // Auto-deposit when home with a haul.
  if (atHole && game.chunksCarried > 0) depositHaul()

  // ── Suspicion accrual / decay. ──
  if (game.running && game.moving) addAwareness(AW_RUN_PER_S * ds)
  if (atHole) addAwareness(-upHoleDecay * ds)
  else if (game.hidden) addAwareness(-AW_DECAY_HIDDEN * ds)

  // Hesitation: idling too long away from the hole rouses the cat.
  if (!atHole && elapsedMs - lastInputMs > HESITATE_MS) {
    lastInputMs = elapsedMs
    noise(AW_HESITATE)
  }

  // ── Cat state machine. ──
  switch (game.catState) {
    case 'asleep':
      if (elapsedMs >= catStateUntil || game.awareness >= 100) enterStirring()
      break
    case 'stirring':
      if (elapsedMs >= stirEndMs) enterAwake()
      break
    case 'awake':
      if (game.exposed) armStomp()
      else if (elapsedMs >= catStateUntil) enterAsleep(true)
      break
    case 'alert':
      game.stompT = stompAtMs > 0 ? clamp(1 - (stompAtMs - elapsedMs) / (STOMP_WINDUP + upPounceBonusMs), 0, 1) : 1
      if (stompAtMs > 0 && elapsedMs >= stompAtMs) resolveStomp()
      break
  }
  mustFreeze.value = game.catState === 'awake' || game.catState === 'stirring' || game.catState === 'alert'

  // Timeout.
  if (timeLeft.value <= 0 && phase.value === 'playing') {
    playSound('lose', 0.06)
    die('timeout')
  }

  // Mirror HUD (rounded to avoid per-frame churn).
  const awBlend = game.catState === 'alert' ? 100
    : game.catState === 'awake' ? Math.max(82, game.awareness)
      : game.catState === 'stirring' ? Math.max(60, game.awareness)
        : game.awareness
  const awI = Math.round(awBlend)
  if (awI !== HUD_AW.v) {
    HUD_AW.v = awI
    awarenessPct.value = awI
  }
  catStateRef.value = game.catState
  const tI = Math.ceil(timeLeft.value)
  if (tI !== HUD_T.v) HUD_T.v = tI
  // Keep interact/suggestion cues fresh as the Mouse roams.
  const atCookie = game.pos >= COOKIE_R
  const wantGrab = atCookie && game.chunksCarried < 6 && game.chunksInCookie > 0
  if ((interactHint.value === 'grab') !== wantGrab) syncHud()
}

// ─── Cheat hooks (kept compatible with useCheats) ────────────────────────────
export const spawnTestItemBoxes = (): void => { gainLife() }
export const spawnTestCratePile = (): void => {
  game.awareness = 100
  addAwareness(0)
}

// Dev-only debug surface for e2e driving (Chrome DevTools MCP).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __cw?: unknown }).__cw = {
    game, phase, expectedDir, pendingKind, score, lives, timeLeft, awarenessPct,
    catState: catStateRef, chunksCarried, chunksDeposited, cookieTotal, mustFreeze,
    pressDir, releaseDir, pressInteract, begin, resetForStage, startFrenzy, frenzyTap
  }
}

const useCookieGame = () => ({
  phase, lossCause, lives, score, timeLeft, awarenessPct, catState: catStateRef,
  chunksCarried, chunksRemaining, chunksDeposited, cookieTotal, runsThisStage,
  greedyMultSum, pendingKind, expectedDir, promptSeq, promptPip, interactHint,
  frenzyPct, frenzyTimeLeft, mustFreeze, reviewData, lastDaringTotal, stageTarget,
  begin, resetForStage, pressDir, releaseDir, releaseAllDirs, pressInteract,
  startFrenzy, frenzyTap, revive, loseLife, gainLife, confirmLoss, step, clock
})

export default useCookieGame
