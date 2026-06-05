/**
 * Cookie Watch — core engine.
 *
 * A Game & Watch–style stealth arcade. The Mouse sneaks along a path of
 * `SEG` movement zones from its mouse hole (pos 0) to the giant cookie
 * (pos SEG) guarded by the Baker's dozing Cat, breaks off chunks, carries the
 * weight home, and deposits for points — all without spiking the Cat's hidden
 * 0–100 awareness meter.
 *
 * This module owns ALL game logic and the per-frame mutable render model
 * (`game`). The renderer (`useCookieArt`) reads `game.*` each frame and owns no
 * logic; the scene (`GameScene.vue`) reads the reactive HUD refs and drives the
 * input + phase transitions. Persisted progress lives inside the single
 * `cookie_watch_state` blob (via `getState`/`setState`).
 */
import { ref, computed, type Ref } from 'vue'
import { getState, setState } from '@/use/useEpicState'
import { STAGE_KEY } from '@/keys'
import useEpicProgress from '@/use/useEpicProgress'
import useScreenshake from '@/use/useScreenshake'
import useSounds from '@/use/useSound'

// ─── Public types ───────────────────────────────────────────────────────────
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Phase = 'idle' | 'playing' | 'dead' | 'review' | 'frenzy' | 'won'
export type CatState = 'asleep' | 'stirring' | 'awake' | 'alert' | 'pounce'
export type LossCause = '' | 'caught' | 'trap' | 'timeout'
export type PendingKind = 'move' | 'interact' | 'trap' | 'none'

export const DIRS: ReadonlyArray<Dir> = ['up', 'down', 'left', 'right']

/** A transient visual event the renderer pops and animates (noise rings at the
 *  cat, crumbs at the cookie, sparkles at the hole, the pounce slash, …). */
export interface FxEvent {
  kind: 'noise' | 'crumb' | 'deposit' | 'pounce' | 'escape' | 'grab' | 'step' | 'trap'
  /** Path position the fx originates at (0..SEG); renderer maps to screen. */
  at: number
  /** Magnitude 0..1 for size/intensity. */
  power: number
  t: number
}

const LIVES_KEY = 'cw_lives'
const START_LIVES = 3

// ─── Awareness tuning (GDD §"How to Build the Cat's Awareness Meter") ────────
const AW_MISSTEP = 4
const AW_MISSTEP_HEAVY = 8
const AW_HASTE = 10
const AW_HESITATE = 5
const AW_CLEAN_ASLEEP = -4
const AW_CLEAN_STIRRING = -2
const HOLE_DECAY_PER_S = 9      // awareness bled off while cooling down in the hole
const HIDE_DECAY_PER_S = 5      // …while tucked at a hiding spot (drawer leg)
const HASTE_MIN_INTERVAL_MS = 130
const HESITATE_MS = 10_000
const PASSIVE_DECAY_PER_S = 0.6 // a slow ambient calm so a careful player recovers

// State thresholds (0..100). Tunable per stage via `awScale`.
const T_STIR = 37
const T_AWAKE = 55
const T_ALERT = 75

const POUNCE_MIN_MS = 2000
const POUNCE_MAX_MS = 3000
const TRAP_CYCLE_MS = 520
const TRAP_GRACE_MS = 90

const MOVE_TWEEN_PER_S = 6.5    // path-units/sec the render position chases `pos`
const FRENZY_SECONDS = 20
const FRENZY_1UP_UNDER = 15
const FRENZY_PER_TAP = 3.6      // % of cookie devoured per frenzy tap

// ─── Stage configuration ─────────────────────────────────────────────────────
/** Zones (segments) from hole→cookie: 4 at stage 1–2, +1 every 2 stages, cap 6. */
export const zoneCountForStage = (stage: number): number =>
  Math.min(6, 4 + Math.floor((Math.max(1, stage) - 1) / 2))
/** Chunks in the cookie this stage: 6 at stage 1, +1/stage, cap 18. */
export const cookieChunksForStage = (stage: number): number =>
  Math.min(18, 6 + (Math.max(1, stage) - 1))
/** Cat-nap timer (seconds): 90 at stage 1, −5/stage, floor 45. */
export const stageTimeForStage = (stage: number): number =>
  Math.max(45, 90 - (Math.max(1, stage) - 1) * 5)
const trapsEnabled = (stage: number): boolean => stage >= 3
const fakeSleepEnabled = (stage: number): boolean => stage >= 5
/** Awareness gains scale up gently as the Cat grows harder. */
const awScaleForStage = (stage: number): number => 1 + (Math.max(1, stage) - 1) * 0.05

/** Taps required to advance one zone given the carried weight (GDD ratio). */
export const tapsForChunks = (chunks: number): number =>
  chunks >= 5 ? 3 : chunks >= 3 ? 2 : 1
/** Per-run greedy multiplier contribution by chunks deposited (GDD table). */
export const greedyMultForChunks = (chunks: number): number =>
  chunks >= 6 ? 1.5 : chunks >= 5 ? 1.4 : chunks >= 4 ? 1.3 : chunks >= 3 ? 1.25 : 0

const randDir = (): Dir => DIRS[Math.floor(Math.random() * 4)]!
const genSeq = (taps: number): Dir[] => Array.from({ length: taps }, randDir)
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

// ─── Per-frame mutable render model (read by the renderer; NOT reactive) ─────
interface PendingInput {
  kind: PendingKind
  seq: Dir[]
  pip: number
  /** true while clearing this zone with zero missteps (clean-advance bonus). */
  clean: boolean
  /** trap-only: the dir currently displayed; cycles every TRAP_CYCLE_MS. */
  trapDir: Dir
  trapSwitchedAt: number
}

export const game = {
  stage: 1,
  seg: 4,                 // zones from hole(0) → cookie(seg)
  pos: 0,                 // integer logical position
  renderPos: 0,           // tweened position for the renderer
  outbound: true,         // heading toward the cookie?
  facing: 1 as 1 | -1,
  chunksCarried: 0,
  chunksInCookie: 6,
  chunksDeposited: 0,
  cookieTotal: 6,
  awareness: 0,
  catState: 'asleep' as CatState,
  fakeSleep: false,
  pouncePoseAt: 0,        // timestamp the pounce will land (0 = none)
  hidden: false,          // tucked safe (in hole or hiding spot)
  hideZones: new Set<number>(),  // path positions that are hiding spots
  trapZones: new Set<number>(),  // path positions guarded by a mousetrap
  pending: { kind: 'none', seq: [], pip: 0, clean: true, trapDir: 'up', trapSwitchedAt: 0 } as PendingInput,
  frenzy: 0,              // 0..100 cookie devoured
  fx: [] as FxEvent[],
  /** moving flag so the renderer can pick a walk pose while tweening. */
  moving: false
}

const pushFx = (kind: FxEvent['kind'], at: number, power = 1): void => {
  game.fx.push({ kind, at, power, t: performance.now() })
  if (game.fx.length > 64) game.fx.shift()
}

// ─── Reactive HUD surface (read by the scene) ────────────────────────────────
export const phase: Ref<Phase> = ref('idle')
export const lossCause: Ref<LossCause> = ref('')
export const lives: Ref<number> = ref(clamp(Number(getState<number>(LIVES_KEY, START_LIVES)) || START_LIVES, 0, START_LIVES))
export const score: Ref<number> = ref(0)             // live chunk points this stage
export const timeLeft: Ref<number> = ref(90)         // seconds (1 decimal)
export const awarenessPct: Ref<number> = ref(0)
export const catStateRef: Ref<CatState> = ref('asleep')
export const chunksCarried: Ref<number> = ref(0)
export const chunksRemaining: Ref<number> = ref(6)   // left in cookie
export const chunksDeposited: Ref<number> = ref(0)
export const cookieTotal: Ref<number> = ref(6)
export const runsThisStage: Ref<number> = ref(0)
export const greedyMultSum: Ref<number> = ref(0)
export const pendingKind: Ref<PendingKind> = ref('none')
export const expectedDir: Ref<Dir | null> = ref(null)
export const promptSeq: Ref<Dir[]> = ref([])
export const promptPip: Ref<number> = ref(0)
export const interactHint: Ref<'grab' | 'deposit' | ''> = ref('')
export const frenzyPct: Ref<number> = ref(0)
export const frenzyTimeLeft: Ref<number> = ref(FRENZY_SECONDS)

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
let stageStartMs = 0
let elapsedMs = 0          // gameplay clock (excludes pauses; advanced in step)
let lastInputMs = 0
let lastPressMs = 0
let runChunkAtPickup = 0   // chunks the mouse left the cookie carrying this run
let minRunChunks = 99
let maxAwarenessSeen = 0
let pouncedAndEscaped = false
let frenzyStartElapsed = 0
let awScale = 1

// Upgrade-derived run modifiers (recomputed each stage from useEpicProgress).
let upLightPaws = 0          // alert shaved off each misstep
let upHoleDecay = HOLE_DECAY_PER_S
let upPounceBonusMs = 0      // extra pounce wind-up (Sixth Sense)
let upExtraTime = 0          // bonus seconds on the timer (Night Owl)

const progress = useEpicProgress()
const { triggerShake } = useScreenshake()
const { playSound } = useSounds()

// ─── Awareness helpers ───────────────────────────────────────────────────────
const deriveCatState = (aw: number): CatState => {
  if (aw >= T_ALERT) return game.pouncePoseAt > 0 ? 'pounce' : 'alert'
  if (aw >= T_AWAKE) return 'awake'
  if (aw >= T_STIR) return 'stirring'
  return 'asleep'
}

const addAwareness = (delta: number): void => {
  const before = game.awareness
  game.awareness = clamp(game.awareness + delta * (delta > 0 ? awScale : 1), 0, 100)
  if (game.awareness > maxAwarenessSeen) maxAwarenessSeen = game.awareness
  // Crossing up into Alert arms the pounce timer.
  if (game.awareness >= T_ALERT && before < T_ALERT) armPounce()
  // Dropping out of Alert while a pounce was winding up = a lucky cancel.
  if (game.awareness < T_ALERT && game.pouncePoseAt > 0) {
    game.pouncePoseAt = 0
    pouncedAndEscaped = true
    pushFx('escape', game.pos, 1)
    playSound('celebration-3', 0.05)
  }
  game.catState = deriveCatState(game.awareness)
}

const armPounce = (): void => {
  if (game.pouncePoseAt > 0) return
  game.pouncePoseAt = elapsedMs + POUNCE_MIN_MS + upPounceBonusMs + Math.random() * (POUNCE_MAX_MS - POUNCE_MIN_MS)
  game.catState = 'pounce'
}

/** Noise from an action, scaled up if the mouse is heavily loaded. Missteps are
 *  softened by the Light Paws upgrade (`upLightPaws`). */
const noise = (base: number): void => {
  const heavy = game.chunksCarried >= 3
  let amt = base === AW_MISSTEP && heavy ? AW_MISSTEP_HEAVY : base
  if (base === AW_MISSTEP) amt = Math.max(1, amt - upLightPaws)
  addAwareness(amt)
  pushFx('noise', game.pos, clamp(base / 10, 0.3, 1))
}

// ─── Prompt / pending-input generation ───────────────────────────────────────
const startMovePending = (): void => {
  const targetPos = game.pos + (game.outbound ? 1 : -1)
  const isTrap = game.trapZones.has(targetPos)
  const taps = isTrap ? 1 : tapsForChunks(game.chunksCarried)
  game.pending = {
    kind: isTrap ? 'trap' : 'move',
    seq: genSeq(taps),
    pip: 0,
    clean: true,
    trapDir: randDir(),
    trapSwitchedAt: elapsedMs
  }
  syncPromptRefs()
}

const startInteractPending = (): void => {
  game.pending = { kind: 'interact', seq: [], pip: 0, clean: true, trapDir: 'up', trapSwitchedAt: 0 }
  interactHint.value = game.pos === 0 ? 'deposit' : 'grab'
  syncPromptRefs()
}

const syncPromptRefs = (): void => {
  const p = game.pending
  pendingKind.value = p.kind
  if (p.kind === 'move') {
    promptSeq.value = p.seq.slice()
    promptPip.value = p.pip
    expectedDir.value = p.seq[p.pip] ?? null
    interactHint.value = ''
  } else if (p.kind === 'trap') {
    promptSeq.value = [p.trapDir]
    promptPip.value = 0
    expectedDir.value = p.trapDir
    interactHint.value = ''
  } else if (p.kind === 'interact') {
    promptSeq.value = []
    promptPip.value = 0
    expectedDir.value = null
  } else {
    promptSeq.value = []
    expectedDir.value = null
    interactHint.value = ''
  }
}

// ─── Movement execution ──────────────────────────────────────────────────────
const completeMove = (wasClean: boolean): void => {
  game.pos += game.outbound ? 1 : -1
  game.facing = game.outbound ? 1 : -1
  game.moving = true
  pushFx('step', game.pos, 0.5)
  playSound('dodge', 0.018, 0.9 + Math.random() * 0.2)

  // Clean-advance awareness reduction (only meaningful when the Cat is light).
  if (wasClean) {
    if (game.catState === 'asleep') addAwareness(AW_CLEAN_ASLEEP)
    else if (game.catState === 'stirring') addAwareness(AW_CLEAN_STIRRING)
  }

  game.hidden = game.hideZones.has(game.pos)

  if (game.pos >= game.seg) {
    // Arrived at the cookie.
    game.pos = game.seg
    game.outbound = true
    startInteractPending()
  } else if (game.pos <= 0) {
    // Arrived home — deposit the haul.
    game.pos = 0
    depositHaul()
  } else {
    startMovePending()
  }
  syncHud()
}

const depositHaul = (): void => {
  const carried = game.chunksCarried
  if (carried <= 0) {
    game.outbound = true
    startMovePending()
    return
  }
  game.chunksDeposited += carried
  score.value = game.chunksDeposited * 100
  // Greedy multiplier accrues per qualifying run (3–6 chunks).
  const gm = greedyMultForChunks(carried)
  if (gm > 0) greedyMultSum.value = Math.round((greedyMultSum.value + gm) * 100) / 100
  runsThisStage.value += 1
  minRunChunks = Math.min(minRunChunks, carried)
  game.chunksCarried = 0
  pushFx('deposit', 0, clamp(carried / 6, 0.4, 1))
  playSound('coin-pickup', 0.05)
  playSound('celebration-1', 0.04)
  triggerShake('small')
  game.outbound = true
  syncHud()

  if (game.chunksDeposited >= game.cookieTotal) {
    finishStageReview()
  } else {
    startMovePending()
  }
}

// ─── Public input handlers ───────────────────────────────────────────────────
/** A directional button / WASD / arrow press. */
export const pressDir = (dir: Dir): void => {
  if (phase.value !== 'playing') return
  const now = elapsedMs
  const fast = now - lastPressMs < HASTE_MIN_INTERVAL_MS
  lastPressMs = now
  lastInputMs = now
  const p = game.pending

  if (p.kind === 'trap') {
    const current = (now - p.trapSwitchedAt < TRAP_GRACE_MS) ? p.trapDir : p.trapDir
    if (dir === current) {
      pushFx('trap', game.pos + (game.outbound ? 1 : -1), 1)
      playSound('dodge', 0.04, 1.2)
      completeMove(true)
    } else {
      // Mistimed the trap — snap! (GDD: an early slumber party.)
      pushFx('trap', game.pos + (game.outbound ? 1 : -1), 1)
      triggerShake('big')
      playSound('explosion-1', 0.06)
      die('trap')
    }
    return
  }

  if (p.kind !== 'move') {
    // Pressing a direction at the cookie means "leave & head home" — only if
    // we have something worth carrying.
    if (game.pos >= game.seg && game.chunksCarried > 0) {
      game.outbound = false
      startMovePending()
      // fall through: treat this very press as the first input of the move
    } else {
      return
    }
  }

  const pend = game.pending
  if (pend.kind !== 'move') return
  const want = pend.seq[pend.pip]
  if (dir === want) {
    if (fast) { noise(AW_HASTE) }       // mashing too fast wakes the cat
    pend.pip += 1
    if (pend.pip >= pend.seq.length) {
      completeMove(pend.clean && !fast)
    } else {
      syncPromptRefs()
    }
  } else {
    // Misstep → noise, pip stays.
    pend.clean = false
    noise(AW_MISSTEP)
    triggerShake('small')
    playSound('obstacle-hit', 0.03)
  }
}

/** The interact / Space / Enter button — grab a chunk at the cookie, deposit
 *  at the hole (auto), or devour during the frenzy. */
export const pressInteract = (): void => {
  if (phase.value === 'frenzy') { frenzyTap(); return }
  if (phase.value !== 'playing') return
  const now = elapsedMs
  const fast = now - lastPressMs < HASTE_MIN_INTERVAL_MS
  lastPressMs = now
  lastInputMs = now

  if (game.pos >= game.seg) {
    // At the cookie — break off a chunk.
    if (game.chunksCarried >= 6 || game.chunksInCookie <= 0) return
    if (fast) noise(AW_HASTE)           // greedy mashing risks waking the cat
    game.chunksInCookie -= 1
    game.chunksCarried += 1
    pushFx('crumb', game.seg, 0.8)
    pushFx('grab', game.seg, 0.6)
    playSound('wood-cut', 0.045, 1 + Math.random() * 0.15)
    startInteractPending()
    syncHud()
  }
}

// ─── Pounce / death / hiding ─────────────────────────────────────────────────
const resolvePounce = (): void => {
  game.pouncePoseAt = 0
  if (game.hidden || game.pos <= 0) {
    // Tucked safe — the cat lunges at nothing.
    pouncedAndEscaped = true
    addAwareness(-30)
    pushFx('escape', game.pos, 1)
    playSound('celebration-3', 0.06)
  } else {
    pushFx('pounce', game.pos, 1)
    triggerShake('big')
    playSound('explosion-1', 0.07)
    die('caught')
  }
}

const die = (cause: LossCause): void => {
  if (phase.value !== 'playing') return
  lossCause.value = cause
  phase.value = 'dead'
  game.moving = false
}

/** Spend a life and report whether the player is now out (→ fresh-run reset). */
export const loseLife = (): boolean => {
  lives.value = Math.max(0, lives.value - 1)
  if (lives.value <= 0) {
    lives.value = START_LIVES
    setState(LIVES_KEY, lives.value)
    setState(STAGE_KEY, 1)              // out of lives → restart the campaign
    return true
  }
  setState(LIVES_KEY, lives.value)
  return false
}

/** Award an extra life (Big Back Bonus / 1up), capped at START_LIVES + 2. */
export const gainLife = (): void => {
  lives.value = Math.min(START_LIVES + 2, lives.value + 1)
  setState(LIVES_KEY, lives.value)
}

/** Rewarded-ad revive: resume the run, calm the cat, keep the haul. */
export const revive = (): void => {
  if (phase.value !== 'dead') return
  game.awareness = 30
  game.pouncePoseAt = 0
  game.catState = deriveCatState(game.awareness)
  lossCause.value = ''
  phase.value = 'playing'
  lastInputMs = elapsedMs
  if (game.pending.kind === 'none') startMovePending()
  syncHud()
}

// ─── Stage lifecycle ─────────────────────────────────────────────────────────
export const stageTarget = computed(() => cookieTotal.value)

/** Build a fresh stage layout from the current progress stage. */
export const resetForStage = (): void => {
  const stage = Math.max(1, progress.stage.value)
  game.stage = stage
  game.seg = zoneCountForStage(stage)
  game.cookieTotal = cookieChunksForStage(stage)
  game.chunksInCookie = game.cookieTotal
  game.chunksDeposited = 0
  game.chunksCarried = 0
  game.pos = 0
  game.renderPos = 0
  game.outbound = true
  game.facing = 1
  game.awareness = 0
  game.pouncePoseAt = 0
  game.fakeSleep = false
  game.catState = 'asleep'
  game.moving = false
  game.frenzy = 0
  game.hidden = true
  // Fold in permanent mouse upgrades for this kitchen.
  const calm = Math.max(0, Math.min(0.6, progress.upgradedValue('calmNerves')))
  awScale = awScaleForStage(stage) * (1 - calm)
  upLightPaws = Math.max(0, progress.upgradedValue('lightPaws'))
  upHoleDecay = HOLE_DECAY_PER_S + Math.max(0, progress.upgradedValue('deepHole'))
  upPounceBonusMs = Math.max(0, progress.upgradedValue('sixthSense')) * 1000
  upExtraTime = Math.max(0, progress.upgradedValue('extraTime'))

  // Hiding spots: the hole (0) always; a drawer leg around the middle from
  // stage 2 on. Mousetraps occupy 1–2 interior zones from stage 3.
  game.hideZones = new Set<number>([0])
  if (stage >= 2 && game.seg >= 3) game.hideZones.add(Math.max(1, Math.floor(game.seg / 2)))
  game.trapZones = new Set<number>()
  if (trapsEnabled(stage)) {
    const interior = Array.from({ length: game.seg - 1 }, (_, i) => i + 1)
      .filter((z) => !game.hideZones.has(z))
    const count = stage >= 6 ? 2 : 1
    for (let k = 0; k < count && interior.length; k++) {
      const idx = Math.floor(Math.random() * interior.length)
      game.trapZones.add(interior.splice(idx, 1)[0]!)
    }
  }

  game.pending = { kind: 'none', seq: [], pip: 0, clean: true, trapDir: 'up', trapSwitchedAt: 0 }
  game.fx = []

  // Run/scoring bookkeeping.
  runsThisStage.value = 0
  greedyMultSum.value = 0
  score.value = 0
  minRunChunks = 99
  maxAwarenessSeen = 0
  pouncedAndEscaped = false
  elapsedMs = 0
  lastInputMs = 0
  lastPressMs = 0

  cookieTotal.value = game.cookieTotal
  chunksRemaining.value = game.chunksInCookie
  timeLeft.value = stageTimeForStage(stage) + upExtraTime
  lossCause.value = ''
  phase.value = 'idle'
  syncHud()
}

/** Begin the live run (called on the first tap/click of the stage). */
export const begin = (): void => {
  if (phase.value !== 'idle') return
  phase.value = 'playing'
  stageStartMs = performance.now()
  elapsedMs = 0
  lastInputMs = 0
  game.hidden = true
  progress.recordGamePlayed()
  startMovePending()
  syncHud()
}

const finishStageReview = (): void => {
  const stage = game.stage
  const clearedSeconds = elapsedMs / 1000
  const remaining = Math.max(0, timeLeft.value)

  const chunkPoints = game.cookieTotal * 100
  const greedyMult = greedyMultSum.value > 0 ? greedyMultSum.value : 1
  // Greedy Finish: cleared <30s and every run was heavy (5–6 chunks).
  const greedyFinish = (clearedSeconds < 30 && minRunChunks >= 5) ? 5000 : 0
  const sneaky = maxAwarenessSeen < T_STIR ? 3000 : 0
  const lucky = pouncedAndEscaped ? 10_000 : 0
  const speedy = Math.round(10 * remaining)
  const daringTotal = Math.round(chunkPoints * greedyMult) + greedyFinish + sneaky + lucky + speedy

  reviewData.value = { chunkPoints, greedyMult, greedyFinish, sneaky, lucky, speedy, oneUp: false, daringTotal }
  phase.value = 'review'
  playSound('win', 0.06)
  playSound('level-up', 0.05)
  void stage
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
  // Bank the Daring Total + advance the stage.
  lastDaringTotal.value = reviewData.value.daringTotal
  progress.recordScore(reviewData.value.daringTotal)
  progress.advanceStage()
  phase.value = 'won'
}

/** Called by the scene to confirm a loss and consume a life; returns true if
 *  the player is out of lives (campaign reset). */
export const confirmLoss = (): boolean => loseLife()

export const clock = (): number => elapsedMs

// ─── HUD mirroring ───────────────────────────────────────────────────────────
let hudAwInt = -1
let hudTimeInt = -1
const syncHud = (): void => {
  chunksCarried.value = game.chunksCarried
  chunksRemaining.value = game.chunksInCookie
  chunksDeposited.value = game.chunksDeposited
  cookieTotal.value = game.cookieTotal
  catStateRef.value = game.catState
  syncPromptRefs()
}

// ─── Per-frame update ─────────────────────────────────────────────────────────
export const step = (dt: number): void => {
  // Tween the render position toward the logical position every frame, even
  // when not advancing the clock (keeps the mouse smooth on the menu / pause).
  const diff = game.pos - game.renderPos
  if (Math.abs(diff) > 0.001) {
    const move = Math.sign(diff) * Math.min(Math.abs(diff), (MOVE_TWEEN_PER_S * dt) / 1000)
    game.renderPos += move
    game.moving = true
  } else {
    game.renderPos = game.pos
    game.moving = false
  }

  if (phase.value === 'frenzy') {
    elapsedMs += dt
    const left = FRENZY_SECONDS - (elapsedMs - frenzyStartElapsed) / 1000
    frenzyTimeLeft.value = Math.max(0, Math.round(left * 10) / 10)
    // Cookie slowly "regrows" pressure: nothing punishing, just the clock.
    if (left <= 0) endFrenzy(game.frenzy >= 100)
    return
  }

  if (phase.value !== 'playing') return
  elapsedMs += dt
  const ds = dt / 1000

  // Timer.
  timeLeft.value = Math.max(0, timeLeft.value - ds)

  // Hiding / cooldown awareness decay.
  game.hidden = game.hideZones.has(game.pos)
  if (game.pos <= 0) addAwareness(-upHoleDecay * ds)
  else if (game.hidden) addAwareness(-HIDE_DECAY_PER_S * ds)
  else addAwareness(-PASSIVE_DECAY_PER_S * ds)

  // Hesitation: no input for 10s spikes the meter (and the cat may search).
  if (elapsedMs - lastInputMs > HESITATE_MS) {
    lastInputMs = elapsedMs
    noise(AW_HESITATE)
  }

  // Fake sleep: later stages occasionally crack an eye and ramp faster.
  if (fakeSleepEnabled(game.stage) && !game.fakeSleep && game.catState === 'asleep') {
    if (Math.random() < 0.0008 * dt) game.fakeSleep = true
  }
  if (game.fakeSleep && game.catState === 'asleep') addAwareness(2 * ds)

  // Trap prompt cycling.
  if (game.pending.kind === 'trap') {
    if (elapsedMs - game.pending.trapSwitchedAt > TRAP_CYCLE_MS) {
      game.pending.trapDir = randDir()
      game.pending.trapSwitchedAt = elapsedMs
      expectedDir.value = game.pending.trapDir
      promptSeq.value = [game.pending.trapDir]
    }
  }

  // Pounce resolution.
  if (game.pouncePoseAt > 0 && elapsedMs >= game.pouncePoseAt) resolvePounce()

  // Timeout.
  if (timeLeft.value <= 0 && phase.value === 'playing') {
    playSound('lose', 0.06)
    die('timeout')
  }

  // Mirror HUD (rounded to avoid per-frame re-renders).
  const awI = Math.round(game.awareness)
  if (awI !== hudAwInt) { hudAwInt = awI; awarenessPct.value = awI }
  catStateRef.value = game.catState
  const tI = Math.ceil(timeLeft.value)
  if (tI !== hudTimeInt) { hudTimeInt = tI }
}

// ─── Cheat hooks (kept compatible with useCheats) ────────────────────────────
export const spawnTestItemBoxes = (): void => { gainLife() }
export const spawnTestCratePile = (): void => { game.awareness = 80; addAwareness(0) }

// Dev-only debug surface for e2e driving (Chrome DevTools MCP) — never shipped
// to production (gated on import.meta.env.DEV).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __cw?: unknown }).__cw = {
    game, phase, expectedDir, pendingKind, score, lives, timeLeft, awarenessPct,
    catState: catStateRef, chunksCarried, chunksDeposited, cookieTotal,
    pressDir, pressInteract, begin, resetForStage, startFrenzy, frenzyTap
  }
}

const useCookieGame = () => ({
  phase, lossCause, lives, score, timeLeft, awarenessPct, catState: catStateRef,
  chunksCarried, chunksRemaining, chunksDeposited, cookieTotal, runsThisStage,
  greedyMultSum, pendingKind, expectedDir, promptSeq, promptPip, interactHint,
  frenzyPct, frenzyTimeLeft, reviewData, lastDaringTotal, stageTarget,
  begin, resetForStage, pressDir, pressInteract, startFrenzy, frenzyTap,
  revive, loseLife, gainLife, confirmLoss, step, clock
})

export default useCookieGame
