/**
 * Crumb Rush — core engine (Design Rev 5).
 *
 * A Game & Watch–style stealth arcade. The Mouse sneaks a single left↔right
 * track from its Mouse Door (`pos` 0) to the dessert (`pos` 1) guarded by
 * Cat-Eyes — a mechanical Felix-the-Cat clock head — harvests chunks, hauls them
 * home under a weight penalty and deposits them for points and stars.
 *
 * The threat is a Green Light / Red Light cat with exactly two states:
 *
 *   ASLEEP (green)  music plays, snoring; move, dash and harvest freely.
 *                   A shake telegraphs the wake-up.
 *   AWAKE  (red)    music cuts out. You get a 0.3s GRACE BUFFER to release every
 *                   input. Still holding anything after that and the eye-laser
 *                   starts a 1.8s charge — and once it's charging, standing still
 *                   is death. You must RUN: 80% of shots land behind you (Close
 *                   Call), 20% vaporize you. Dodge one and the Cat fires two more;
 *                   survive all three and it cools down, then RAGES with 0.5s
 *                   charges.
 *
 * Greed is the other axis: three inventory slots, a Gold Nugget worth 2 chunks
 * that eats all three and triggers a locked 0:50 Red Light Frenzy the moment you
 * touch it. Chunks caught in a blast char and lose half their value; you can
 * panic-drop your haul to regain speed and even use the debris as laser cover.
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
import { levelConfig, isFrenzyLevel, type LevelConfig } from '@/use/useCookieLevels'
import useEpicProgress from '@/use/useEpicProgress'
import useScreenshake from '@/use/useScreenshake'
import useSounds from '@/use/useSound'

// ─── Public types ───────────────────────────────────────────────────────────
export type Dir = 'up' | 'down' | 'left' | 'right'
export type Phase = 'idle' | 'playing' | 'dead' | 'review' | 'frenzy' | 'won'
/** Rev 5: the Cat has only two states. Charging/raging are laser sub-states. */
export type CatState = 'asleep' | 'awake'
export type LossCause = '' | 'caught' | 'timeout'
/** Everything the Mouse can carry, drop or deposit. */
export type ItemKind = 'chunk' | 'burnt' | 'gold' | 'goldPiece'

export const DIRS: ReadonlyArray<Dir> = ['left', 'right']
const FORWARD_DIRS: ReadonlyArray<Dir> = ['right']
const BACK_DIRS: ReadonlyArray<Dir> = ['left']

/** A transient visual event the renderer pops and animates. */
export interface FxEvent {
  kind: 'crumb' | 'deposit' | 'blast' | 'escape' | 'grab' | 'step' | 'poof'
    | 'ash' | 'smoke' | 'drop' | 'choke' | 'shield'
  /** Track position the fx originates at (0..1); renderer maps to screen. */
  at: number
  /** Magnitude 0..1 for size/intensity. */
  power: number
  t: number
}

/** An item lying on the kitchen floor — dropped, blasted loose, or dislodged. */
export interface GroundItem {
  id: number
  kind: ItemKind
  /** Track position 0..1. */
  pos: number
  /** Height above the floor (track units) while it arcs; 0 = resting. */
  y: number
  vx: number
  vy: number
  /** `elapsedMs` at which this despawns (gold only; Infinity for chunks). */
  despawnAt: number
  /** Brief no-pickup window so a panic-drop doesn't instantly re-collect. */
  armAt: number
}

const LIVES_KEY = 'cw_lives'
const STARS_KEY = 'cw_stars'
const START_LIVES = 3

// ─── Inventory & weight (Rev 5 §B) ───────────────────────────────────────────
export const MAX_SLOTS = 3
/** Slots each item occupies. Two Gold Pieces re-fill the Nugget's three slots. */
const SLOT_COST: Record<ItemKind, number> = { chunk: 1, burnt: 1, goldPiece: 1.5, gold: 3 }
/** Chunk value each item contributes toward the Stage Clear requirement. */
const CLEAR_VALUE: Record<ItemKind, number> = { chunk: 1, burnt: 0.5, goldPiece: 1, gold: 2 }

/** Movement penalty by slots filled (§B table): 0% / 15% / 25% / 45% slower.
 *  Rev 6 lightens the top of the table — a full sack should be a real cost, but
 *  not so heavy that hauling three chunks stops being worth the trip. */
export const carrySpeedFactor = (slots: number): number =>
  slots <= 0 ? 1 : slots <= 1 ? 0.85 : slots <= 2 ? 0.75 : 0.55

/** Base delivery score for a haul of N chunks (§H): 100 / 300 / 600. */
const CHUNK_TIER = [0, 100, 300, 600]
const GOLD_NUGGET_POINTS = 2000
const GOLD_PIECE_POINTS = 1000
const CLOSE_CALL_POINTS = 1000
const INSANE_ESCAPE_POINTS = 3000
/** §H: depositing at max capacity multiplies the delivery value. */
const GREEDY_MULT = 1.2

// ─── Movement tuning (Rev 6 §A) ──────────────────────────────────────────────
// Rev 5 slowed the sneak to 0.34 and handed the old top speed to the DASH. Rev 6
// walks that back: the Mouse felt sluggish, so BOTH speeds go up by +0.3. The
// dash keeps its full +0.20 margin over the sneak, so a double-tap is still a
// genuine burst — and still a noisy commitment — rather than the only way to
// cover ground.
//
// The sneak is now fast enough to clear a level on foot inside a Green Light
// rhythm alone (a Perfect on level 2 — two full round trips — costs ~24s of the
// 60s clock), which is the point: skilled dashing is REWARDED, never required.
const TOP_SPEED = 0.64           // sneak: the Rev 6 cruise
const DASH_SPEED = 0.84          // dash: the burst, +0.20 over the sneak
const ACCEL_TIME = 0.35          // s of holding to reach cruise
const DASH_ACCEL_TIME = 0.12     // a dash snaps up to speed
/** Second press of the same direction within this window = a dash. */
const DOUBLE_TAP_MS = 260
const HOLE_R = 0.05              // |pos| within this of the door = home/safe
const DESSERT_R = 0.9            // pos beyond this = at the dessert (can harvest)
const MOVE_EPS = 0.02            // |speed| above this counts as physically moving
const RENDER_LERP_PER_S = 16     // how fast renderPos chases pos
const PROXIMITY_R = 0.16         // how close to the dessert the node UI appears

// ─── Harvesting (Rev 5 §D) ───────────────────────────────────────────────────
/** Hold the direction INTO the dessert; a green ring runs this long per chunk. */
export const HARVEST_MS = 1500
/** Rev 6: the dessert jolts on this beat while it's being harvested — two visible
 *  shakes per chunk, so the node reads as "something is being torn off me". The
 *  renderer owns the animation; this is the tempo it runs on. */
export const HARVEST_SHAKE_MS = 750
/** Each item transfers into the Mouse Door in exactly 0.1s (§E). */
const DEPOSIT_MS = 100

// ─── Cat-Eyes & threat loop (Rev 5 §C) ───────────────────────────────────────
/** The Cat shakes for this long at the tail of its nap — the wake-up telegraph.
 *  Rev 6 stretches it to a full second: with the Mouse now moving at Rev 6 speed,
 *  0.45s of warning wasn't enough time to stop and drop everything. */
const SHAKE_MS = 1000
/** Detection leniency: release everything within this of the wake or you're seen. */
const GRACE_MS = 300
/** The eye-laser's charge-up. This IS the dodge window — freezing here is fatal. */
const CHARGE_MS = 1800
/** Rage mode's rapid-fire charge. */
const RAGE_CHARGE_MS = 500
/** Evading a shot forces the Cat to fire this many in the sequence, total. */
const SHOTS_PER_SEQUENCE = 3
/** After a full evaded sequence the Cat cools down, then rages. */
const RAGE_COOLDOWN_MS = 5000
/** How long the enraged rapid-fire lasts before the Cat tires out and naps. The
 *  Mouse can cross the whole floor on a dash in ~2s, so a rage is survivable —
 *  but only by bolting for the door, which is exactly the intent. */
const RAGE_MS = 4000
/** 80% of shots land behind you (Close Call); 20% are a Direct Hit. */
const DIRECT_HIT_CHANCE = 0.2
/** A Close Call lands this far behind the Mouse's path. */
const MISS_OFFSET = 0.1
/** Blast radius: what the beam vaporizes / chars / is blocked by. */
const BLAST_R = 0.045
/** Holding "away from the dessert" at the door this long ends the level early —
 *  the §G Safe Exit, offered the moment the haul on the books already clears the
 *  level. (With nothing left out there the door just closes on its own.) */
const EXIT_HOLD_MS = 800

// ─── Gold Nugget (Rev 5 §F/§G) ───────────────────────────────────────────────
/** Loose gold vanishes after this long (flashing over the last 4s). */
const GOLD_DESPAWN_MS = 8000
export const GOLD_FLASH_MS = 4000
/** Grabbing the Nugget locks the clock to a strict, uniform escape window. */
const ENRAGE_SECONDS = 50
const ENRAGE_GREEN_MIN = 1000
const ENRAGE_GREEN_MAX = 5000
const ENRAGE_RED_MIN = 1000
const ENRAGE_RED_MAX = 8000

// ─── Eating Frenzy (Rev 5 §I) ────────────────────────────────────────────────
const FRENZY_SECONDS = 15
/**
 * The doc pins the choke curve (+10%/tap, −11%/s) and the 15s clock, which caps
 * a flawless rhythm player at ~26 mashes: burst ~9 "free" taps off an empty
 * meter, then hold the 1.1 taps/s the decay sustains. Clearing therefore has to
 * cost meaningfully FEWER than 26 taps or the mini-game would be unwinnable —
 * so the dessert takes 20, leaving room to make mistakes but not to mash blindly.
 */
const FRENZY_TAPS_TO_CLEAR = 20
const FRENZY_PER_TAP = 100 / FRENZY_TAPS_TO_CLEAR
/** The dessert visually degrades every 5 button presses. */
export const FRENZY_TAPS_PER_STAGE = 5
/** …which is this many visible degradation steps before it's gone. */
export const FRENZY_STAGES = FRENZY_TAPS_TO_CLEAR / FRENZY_TAPS_PER_STAGE
/** The Mouse zips between five bite positions, in order, resetting at 1. */
export const FRENZY_ZIPS = 5
/** Each mash adds this much true choke… */
const CHOKE_PER_TAP = 10
/** …but spikes the meter to this visually before settling (Elastic Surge). */
const CHOKE_SPIKE = 12
/** Passive decay, %/s. */
const CHOKE_DECAY_PER_S = 11
/** How fast the visual spike settles back down to the true value. */
const CHOKE_SETTLE_PER_S = 40
/** Choke out and the Mouse is paralyzed by a coughing fit. */
const CHOKE_PARALYSIS_MS = 2500
/** Devour the whole dessert faster than this and it's a 1up. */
const FRENZY_1UP_UNDER = 11

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))
const randRange = (lo: number, hi: number): number => lo + Math.random() * (hi - lo)
const pick = <T, >(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)] ?? xs[0]!

// ─── Per-frame mutable render model (read by the renderer; NOT reactive) ─────
export const game = {
  level: 1,
  pos: 0,                 // continuous track position 0(door)..1(dessert)
  renderPos: 0,           // smoothed position for the renderer
  facing: 1 as 1 | -1,
  vel: 0,                 // signed velocity along the track (units/sec)
  speed: 0,               // |vel|
  moving: false,          // physically in motion this frame
  dashing: false,         // double-tapped → burst speed
  playingDead: true,      // released every control → belly-up "play dead"
  atDessert: false,       // standing at the dessert (within DESSERT_R)
  atDoor: false,          // standing at the Mouse Door
  nearDessert: false,     // close enough for the Dessert/Carry UI to show
  exposed: false,         // holding an input the Cat can catch (post-grace)

  // Cat.
  catState: 'asleep' as CatState,
  catShaking: false,      // telegraphing a wake-up
  catSmoke: false,        // enraged puff-of-smoke tell before a state change
  catGazeX: 0.5,          // 0..1 track position the Cat's eyes look toward
  grace: 0,               // 1→0 across the 0.3s grace buffer (0 = expired)
  charging: false,        // eye-laser winding up
  chargeT: 0,             // 0..1 charge progress
  raging: false,          // rapid-fire mode
  enraged: false,         // Gold Nugget taken → Red Light Frenzy
  laserAt: -1,            // track pos of the beam this frame (-1 = not firing)
  laserFlash: 0,          // 1→0 fade of the fired beam

  // Inventory + world.
  items: [] as ItemKind[],
  slots: 0,               // slots filled (0..3)
  chunksInDessert: 6,
  dessertTotal: 6,
  goldExposed: false,     // dessert fully harvested → the Nugget is showing
  goldTaken: false,       // the Nugget has been picked up at least once
  goldVoided: false,      // it despawned on the floor → Platinum is off the table
  harvestT: 0,            // 0..1 progress ring while holding into the dessert
  depositT: 0,            // 0..1 progress of the item currently draining home
  exitT: 0,               // 0..1 Safe Exit hold at the door
  canExit: false,         // the door will take a Safe Exit hold right now
  ground: [] as GroundItem[],
  depositedValue: 0,      // chunk value banked at the door

  // Eating Frenzy.
  frenzy: 0,              // 0..100 dessert devoured
  frenzyZip: 0,           // 0..FRENZY_ZIPS-1 bite position
  frenzyStage: 0,         // visual degradation step (every 5 taps)
  choke: 0,               // 0..100 true choke
  chokeShown: 0,          // 0..100 elastic display value
  choking: false,         // coughing fit — inputs ignored
  round: false,           // devoured it all → cartoonishly round mouse

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
export const timeLeft: Ref<number> = ref(45)
export const catStateRef: Ref<CatState> = ref('asleep')
export const slotsUsed: Ref<number> = ref(0)
export const chunksRemaining: Ref<number> = ref(6)
export const dessertTotal: Ref<number> = ref(6)
export const depositedValue: Ref<number> = ref(0)
/** Chunk value needed for the 1-star Pass / 3-star Perfect (the door sign). */
export const passTarget: Ref<number> = ref(1)
export const perfectTarget: Ref<number> = ref(3)
/** True while the Cat is awake and the Mouse must FREEZE — drives the warning. */
export const mustFreeze: Ref<boolean> = ref(false)
/** True while the eye-laser is charging — the "RUN!" warning (freezing is fatal). */
export const mustRun: Ref<boolean> = ref(false)
/** True while the Gold Nugget's Red Light Frenzy is running. */
export const enraged: Ref<boolean> = ref(false)
/** True while the Mouse stands at the dessert (the scene routes right-hold here). */
export const atDessertRef: Ref<boolean> = ref(false)
export const frenzyPct: Ref<number> = ref(0)
export const frenzyTimeLeft: Ref<number> = ref(FRENZY_SECONDS)
export const chokePct: Ref<number> = ref(0)
export const chokingRef: Ref<boolean> = ref(false)

export interface ReviewData {
  /** Points banked at the door (already includes the greedy multiplier). */
  delivery: number
  /** The extra points the 1.2× greedy multiplier contributed. */
  greedyBonus: number
  closeCall: number
  insaneEscape: number
  /** 0 = failed the minimum, 1 = Pass, 3 = Perfect. */
  stars: number
  /** Perfect clear WITH the Gold Nugget → 3 Platinum Stars. */
  platinum: boolean
  daringTotal: number
  oneUp: boolean
}
export const reviewData: Ref<ReviewData> = ref({
  delivery: 0, greedyBonus: 0, closeCall: 0, insaneEscape: 0,
  stars: 0, platinum: false, daringTotal: 0, oneUp: false
})
/** Final Daring Total banked when a level is fully completed. */
export const lastDaringTotal: Ref<number> = ref(0)
/** True when the completed level is followed by the Eating Frenzy (every 5th). */
export const frenzyNext: Ref<boolean> = ref(false)

// ─── Internal run bookkeeping (not reactive) ─────────────────────────────────
let cfg: LevelConfig = levelConfig(1)
let elapsedMs = 0          // gameplay clock (excludes pauses; advanced in step)
let nextItemId = 1
let closeCalls = 0
let insaneEscapes = 0
let deliveryPoints = 0
let greedyBonusPoints = 0
let leftDoor = false       // has the Mouse set out at all this run?

// Cat timers (ms on the `elapsedMs` clock).
let catStateUntil = 0      // when the current asleep/awake window ends
let graceUntil = 0         // end of the 0.3s buffer after a wake-up
let chargeUntil = 0        // when the charging laser fires (0 = not charging)
let chargeMs = CHARGE_MS   // this shot's charge length (rage shortens it)
let movedDuringCharge = false
let shotsInSequence = 0
let rageAt = 0             // when the post-sequence cooldown flips into rage
let rageUntil = 0          // when rage burns out
let diffFactor = 1         // difficulty scale on naps + charge windows

// Deposit drain.
let depositUntil = 0

// Frenzy.
let frenzyStartElapsed = 0
let frenzyTaps = 0
let chokeEndsAt = 0

// Held-input tracking (driven by pressDir/releaseDir).
const heldDirs = new Set<Dir>()
let lastTapAt: Partial<Record<Dir, number>> = {}
let dashDir: Dir | null = null
/** True only for a back-press that was made AFTER the door opened for a Safe
 *  Exit — see `pressDir`. The hold that carries the Mouse home can therefore
 *  never cash the level in by itself. */
let exitArmed = false

// Deposit tiering: chunks banked in the CURRENT trip drive the 100/300/600
// delivery tiers, and `depositWasFull` locks in the greedy multiplier from the
// sack's state at the moment the drain began.
let depositRunChunks = 0
let depositWasFull = false

// Upgrade-derived run modifiers (recomputed each level).
let upChargeBonusMs = 0    // Sixth Sense: a longer charge = a longer dodge window
let upExtraTime = 0        // Night Owl: seconds on the clock
let upGraceMs = GRACE_MS   // Calm Nerves: a longer detection grace buffer
let upNapMult = 1          // Light Paws: the Cat naps longer
let upDepositSpeed = 1     // Cozy Burrow: multiplier on the 0.1s/item drain

const progress = useEpicProgress()
const { triggerShake } = useScreenshake()
const { playSound } = useSounds()

// ─── Inventory helpers ───────────────────────────────────────────────────────
const slotsOf = (items: readonly ItemKind[]): number =>
  items.reduce((s, k) => s + SLOT_COST[k], 0)
const freeSlots = (): number => MAX_SLOTS - game.slots

/** Two loose Gold Pieces in the sack fuse back into the full Nugget (§F). */
const fuseGoldPieces = (): void => {
  const pieces = game.items.filter((k) => k === 'goldPiece').length
  if (pieces < 2) return
  const rest = game.items.filter((k) => k !== 'goldPiece')
  game.items = [...rest, 'gold', ...Array<ItemKind>(pieces - 2).fill('goldPiece')]
  playSound('celebration-3', 0.05)
}

const syncInventory = (): void => {
  fuseGoldPieces()
  game.slots = slotsOf(game.items)
  slotsUsed.value = game.slots
}

/** Can the Mouse take this item right now? The Nugget demands an empty sack. */
const canTake = (kind: ItemKind): boolean =>
  kind === 'gold' ? game.slots === 0 : SLOT_COST[kind] <= freeSlots() + 1e-6

const take = (kind: ItemKind): boolean => {
  if (!canTake(kind)) return false
  game.items.push(kind)
  syncInventory()
  if (kind === 'gold') onGoldTaken()
  return true
}

// ─── Ground items ────────────────────────────────────────────────────────────
/** Toss an item onto the floor in a short arc, opposite the Mouse's facing. */
const spawnGround = (kind: ItemKind, at: number, awayFrom: 1 | -1, power = 1): void => {
  const gold = kind === 'gold' || kind === 'goldPiece'
  game.ground.push({
    id: nextItemId++,
    kind,
    pos: clamp(at, 0, 1),
    y: 0.02,
    vx: -awayFrom * (0.18 + Math.random() * 0.16) * power,
    vy: 0.5 + Math.random() * 0.25,
    despawnAt: gold ? elapsedMs + GOLD_DESPAWN_MS : Infinity,
    armAt: elapsedMs + 420
  })
  pushFx('drop', at, 0.6)
}

/** Loose gold that times out permanently voids the Platinum clear for this run. */
const voidGold = (): void => {
  if (game.goldVoided) return
  game.goldVoided = true
  playSound('lose', 0.03)
}

const stepGround = (ds: number): void => {
  if (!game.ground.length) return
  const next: GroundItem[] = []
  for (const it of game.ground) {
    // Arc: simple gravity in track-space until it settles on the floor.
    if (it.y > 0 || it.vy > 0) {
      it.vy -= 3.2 * ds
      it.y += it.vy * ds
      it.pos = clamp(it.pos + it.vx * ds, 0, 1)
      if (it.y <= 0) {
        it.y = 0
        it.vy = 0
        it.vx = 0
      }
    }
    if (elapsedMs >= it.despawnAt) {
      // Gold left on the floor too long is gone for good.
      if (it.kind === 'gold' || it.kind === 'goldPiece') voidGold()
      pushFx('poof', it.pos, 0.5)
      continue
    }
    // Auto-pickup by walking over it (once the toss arc has armed).
    if (phase.value === 'playing' && elapsedMs >= it.armAt && it.y <= 0.001 &&
      Math.abs(it.pos - game.pos) < 0.05 && canTake(it.kind)) {
      take(it.kind)
      playSound('coin-pickup', 0.04)
      pushFx('grab', it.pos, 0.6)
      continue
    }
    next.push(it)
  }
  game.ground = next
}

/** Any loose gold still recoverable on the floor? (Blocks the "level done" check.) */
const goldOnFloor = (): boolean =>
  game.ground.some((it) => it.kind === 'gold' || it.kind === 'goldPiece')

// ─── Panic drop (§F) ─────────────────────────────────────────────────────────
/** Spacebar / swipe-up: throw the last item carried to instantly shed weight.
 *  Field debris is re-lootable forever — and physically blocks laser blasts. */
export const dropItem = (): void => {
  if (phase.value !== 'playing' || !game.items.length) return
  const kind = game.items.pop()!
  syncInventory()
  spawnGround(kind, game.pos, game.facing)
  playSound('wood-cut', 0.04, 0.8)
}

// ─── Cat state machine (§C) ──────────────────────────────────────────────────
/** Pick the next nap length: the authored Green Light, or a random enrage gap. */
const nextGreenMs = (): number => game.enraged
  ? randRange(ENRAGE_GREEN_MIN, ENRAGE_GREEN_MAX)
  : pick(cfg.green) * diffFactor * upNapMult

const nextRedMs = (): number => game.enraged
  ? randRange(ENRAGE_RED_MIN, ENRAGE_RED_MAX)
  : cfg.red

const enterAsleep = (): void => {
  game.catState = 'asleep'
  catStateRef.value = 'asleep'
  game.catShaking = false
  game.charging = false
  game.chargeT = 0
  game.raging = false
  chargeUntil = 0
  rageAt = 0
  rageUntil = 0
  shotsInSequence = 0
  mustFreeze.value = false
  mustRun.value = false
  catStateUntil = elapsedMs + nextGreenMs()
}

const enterAwake = (): void => {
  game.catState = 'awake'
  catStateRef.value = 'awake'
  game.catShaking = false
  mustFreeze.value = true
  // The 0.3s Detection Leniency: drop every input inside it and you're invisible.
  graceUntil = elapsedMs + upGraceMs
  catStateUntil = elapsedMs + nextRedMs()
  playSound('dodge', 0.03, 0.7)
  pushFx('smoke', 1, 0.5)
}

/** Movement seen past the grace buffer → the eye-laser starts winding up. */
const beginCharge = (rage = false): void => {
  chargeMs = (rage ? RAGE_CHARGE_MS : CHARGE_MS) * diffFactor + (rage ? 0 : upChargeBonusMs)
  chargeUntil = elapsedMs + chargeMs
  movedDuringCharge = false
  game.charging = true
  game.chargeT = 0
  mustRun.value = true
  triggerShake('small')
  playSound('obstacle-hit', 0.05, 1.2)
}

/** Resolve the blast against the debris field (§F). Dropped chunks physically eat
 *  the beam — the Laser Block tech — but pay for it: a fresh chunk chars, and a
 *  chunk that's already burnt is vaporized outright. Gold is inert; it neither
 *  blocks nor burns. */
const charGroundAt = (at: number): boolean => {
  let blocked = false
  const survivors: GroundItem[] = []
  for (const it of game.ground) {
    const inBlast = Math.abs(it.pos - at) <= BLAST_R + 0.02 &&
      (it.kind === 'chunk' || it.kind === 'burnt')
    if (!inBlast) {
      survivors.push(it)
      continue
    }
    blocked = true
    if (it.kind === 'chunk') {
      it.kind = 'burnt'               // charred, worth half — but it saved you
      survivors.push(it)
    } else {
      pushFx('ash', it.pos, 0.5)      // a burnt chunk takes the second hit and is gone
    }
  }
  game.ground = survivors
  return blocked
}

/** The Nugget absorbs one blast, then bursts into two Gold Pieces (§F). */
const shieldWithGold = (): boolean => {
  const i = game.items.indexOf('gold')
  if (i < 0) return false
  game.items.splice(i, 1)
  syncInventory()
  spawnGround('goldPiece', game.pos, game.facing, 1)
  spawnGround('goldPiece', game.pos, game.facing, 1.5)
  pushFx('shield', game.pos, 1)
  triggerShake('big')
  playSound('celebration-1', 0.05)
  return true
}

/** Break off the current laser sequence — the Cat has lost its target. */
const endSequence = (): void => {
  shotsInSequence = 0
  rageAt = 0
  game.raging = false
  game.charging = false
  chargeUntil = 0
  mustRun.value = false
}

/** Resolve a charged shot: pick the target coordinate and see what it hits. */
const fireLaser = (): void => {
  chargeUntil = 0
  game.charging = false
  game.chargeT = 1

  // Target RNG (§C). Standing still through the charge means the beam had a
  // locked, motionless coordinate to aim at — that is always a Direct Hit. Once
  // the cannon is warming up, freezing is no longer a hiding place: you RUN.
  const direct = !movedDuringCharge || Math.random() < DIRECT_HIT_CHANCE
  const target = direct
    ? game.pos
    : clamp(game.pos - game.facing * MISS_OFFSET, 0, 1)   // fires behind your path

  game.laserAt = target
  game.laserFlash = 1
  pushFx('blast', target, 1)
  playSound('explosion-1', 0.06)

  const safe = game.pos <= HOLE_R              // ducked into the Mouse Door
  const blocked = charGroundAt(target)
  const hit = !safe && !blocked && Math.abs(target - game.pos) <= BLAST_R
  triggerShake(hit ? 'big' : 'small')

  if (hit && !shieldWithGold()) {
    // Vaporized into a cartoony pile of ash — the level restarts (§C).
    pushFx('ash', game.pos, 1)
    die('caught')
    return
  }

  if (safe) {
    // The beam scorches the floor where the Mouse used to be. No prize for
    // standing in the doorway — and the Cat gives up on the sequence.
    endSequence()
    return
  }

  // Survived a blast that could have killed — a Close Call (§H), and the Cat is
  // not finished with you.
  closeCalls += 1
  shotsInSequence += 1
  pushFx('escape', game.pos, 1)
  playSound('celebration-3', 0.04)

  if (game.raging) {
    beginCharge(true)                          // rapid-fire keeps coming
  } else if (shotsInSequence < SHOTS_PER_SEQUENCE) {
    beginCharge()                              // evaded → 2 more RNG shots
  } else {
    insaneEscapes += 1                         // survived the full 3-shot sequence
    playSound('celebration-2', 0.06)
    shotsInSequence = 0
    mustRun.value = false
    rageAt = elapsedMs + RAGE_COOLDOWN_MS      // …then it comes back enraged
  }
}

// ─── Movement input (§A) ─────────────────────────────────────────────────────
/** Net forward intent from the held directions: +1 dessert, −1 home, 0 still. */
const netDir = (): number => {
  let fwd = 0
  for (const d of heldDirs) {
    if (FORWARD_DIRS.includes(d)) fwd += 1
    else if (BACK_DIRS.includes(d)) fwd -= 1
  }
  return Math.sign(fwd)
}

/** Any input the Cat can catch: a held direction (which is also a harvest hold). */
const hasActiveInput = (): boolean => heldDirs.size > 0

/** Press & hold to sneak. A second press within DOUBLE_TAP_MS dashes (§A). */
export const pressDir = (dir: Dir): void => {
  if (phase.value !== 'playing') return
  const prev = lastTapAt[dir] ?? -1e9
  if (elapsedMs - prev <= DOUBLE_TAP_MS) dashDir = dir
  lastTapAt[dir] = elapsedMs
  heldDirs.add(dir)
  // The Safe Exit answers to a back-press made while the door is ALREADY open —
  // never to the one that walked the Mouse home. Banking your last chunks must
  // leave you standing in the doorway with the choice still in your hands.
  if (BACK_DIRS.includes(dir) && game.canExit) exitArmed = true
}

export const releaseDir = (dir: Dir): void => {
  heldDirs.delete(dir)
  if (dashDir === dir) dashDir = null
  if (BACK_DIRS.includes(dir)) exitArmed = false
}

/** Release every held direction (blur / pause / phase change). */
export const releaseAllDirs = (): void => {
  heldDirs.clear()
  dashDir = null
  exitArmed = false
}

/** The Eating Frenzy mash + the tap-to-start both route through here. */
export const pressInteract = (): void => {
  if (phase.value === 'frenzy') frenzyTap()
}

// ─── Harvesting (§D) ─────────────────────────────────────────────────────────
/** Is there anything at this dessert the Mouse could still take, with room for
 *  it? (Independent of whether he's currently holding the direction.) */
const harvestable = (): boolean => {
  if (!game.atDessert) return false
  if (game.chunksInDessert > 0) return freeSlots() >= SLOT_COST.chunk
  // Dessert stripped bare: the same hold now prises out the Gold Nugget — but
  // only with a completely empty sack (§B capacity constraint).
  return game.goldExposed && game.slots === 0
}

/** The ring only ADVANCES while the direction into the dessert is actually held. */
const canHarvest = (): boolean => harvestable() && netDir() > 0

const finishHarvest = (): void => {
  if (game.chunksInDessert > 0) {
    game.chunksInDessert -= 1
    take('chunk')
    chunksRemaining.value = game.chunksInDessert
    pushFx('crumb', 1, 0.7)
    playSound('coin-pickup', 0.04)
    // Completely crumbed → the dessert poofs and the Nugget is left sitting there.
    if (game.chunksInDessert === 0) {
      pushFx('poof', 1, 1)
      playSound('wood-cut', 0.05, 1.5)
      if (cfg.gold && !game.goldTaken) game.goldExposed = true
    }
    return
  }
  // Prising the Nugget free.
  if (game.goldExposed && take('gold')) {
    game.goldExposed = false
    pushFx('grab', 1, 1)
  }
}

/** Picking up the Nugget flips the level into its Red Light Frenzy finale (§G). */
function onGoldTaken(): void {
  game.goldTaken = true
  if (game.enraged) return
  game.enraged = true
  enraged.value = true
  // The clock resets and locks to a strict, uniform escape window.
  timeLeft.value = ENRAGE_SECONDS
  triggerShake('big')
  playSound('level-up', 0.06)
  pushFx('smoke', 1, 1)
  // Erratic stop-and-go from here on: re-roll the current window immediately.
  catStateUntil = elapsedMs + (game.catState === 'asleep' ? nextGreenMs() : nextRedMs())
}

// ─── Depositing (§E) ─────────────────────────────────────────────────────────
/** Bank one item into the Mouse Door and score it (§H). Runs one item per 0.1s. */
const depositOne = (): void => {
  const kind = game.items.shift()
  if (!kind) return
  syncInventory()

  game.depositedValue += CLEAR_VALUE[kind]
  depositedValue.value = Math.round(game.depositedValue * 10) / 10

  // Base delivery value. Chunks score by how many land in this haul (100/300/600,
  // burnt at half); gold scores flat.
  let pts: number
  if (kind === 'gold') pts = GOLD_NUGGET_POINTS
  else if (kind === 'goldPiece') pts = GOLD_PIECE_POINTS
  else {
    depositRunChunks += 1
    const tier = CHUNK_TIER[Math.min(depositRunChunks, 3)] ?? 0
    const prev = CHUNK_TIER[Math.min(depositRunChunks - 1, 3)] ?? 0
    pts = (tier - prev) * (kind === 'burnt' ? 0.5 : 1)
  }
  // Greedy Bonus: a full sack pays 1.2× on the whole delivery (§H).
  const bonus = depositWasFull ? Math.round(pts * (GREEDY_MULT - 1)) : 0
  deliveryPoints += pts + bonus
  greedyBonusPoints += bonus
  score.value = deliveryPoints

  pushFx('deposit', 0, 0.5)
  playSound('coin-pickup', 0.05)
}

// ─── Death / revive ──────────────────────────────────────────────────────────
const die = (cause: LossCause): void => {
  if (phase.value !== 'playing') return
  lossCause.value = cause
  phase.value = 'dead'
  game.moving = false
  game.dashing = false
  game.vel = 0
  game.speed = 0
  game.exposed = false
  game.charging = false
  mustFreeze.value = false
  mustRun.value = false
  releaseAllDirs()
  triggerShake('big')
  playSound('explosion-1', 0.07)
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

/** Seconds handed back when reviving out of a run the CLOCK killed — without
 *  them the run would just re-expire on the very next frame. */
const REVIVE_SECONDS = 15

/** Rewarded-ad revive: put the Mouse back on its feet and calm the Cat. */
export const revive = (): void => {
  if (phase.value !== 'dead') return
  game.harvestT = 0
  game.exitT = 0
  game.laserAt = -1
  game.laserFlash = 0
  if (timeLeft.value <= 0.5) timeLeft.value = REVIVE_SECONDS
  lossCause.value = ''
  phase.value = 'playing'
  releaseAllDirs()
  endSequence()
  enterAsleep()
  syncHud()
}

// ─── Stars ───────────────────────────────────────────────────────────────────
/** Best stars earned per level (4 = the Platinum tier). Persisted in the blob. */
const readStars = (): Record<string, number> =>
  (getState<Record<string, number>>(STARS_KEY, {}) ?? {}) as Record<string, number>

export const starsForLevel = (level: number): number => readStars()[String(level)] ?? 0

const bankStars = (level: number, stars: number, platinum: boolean): void => {
  const rank = platinum ? 4 : stars
  const all = readStars()
  if ((all[String(level)] ?? 0) >= rank) return
  all[String(level)] = rank
  setState(STARS_KEY, all)
}

// ─── Level lifecycle ─────────────────────────────────────────────────────────
export const stageTarget = computed(() => perfectTarget.value)

/** Build a fresh level from the current campaign stage. */
export const resetForStage = (): void => {
  const level = Math.max(1, progress.stage.value)
  cfg = levelConfig(level)

  game.level = level
  game.pos = 0
  game.renderPos = 0
  game.facing = 1
  game.vel = 0
  game.speed = 0
  game.moving = false
  game.dashing = false
  game.playingDead = true
  game.atDessert = false
  game.atDoor = true
  game.nearDessert = false
  game.exposed = false

  game.catState = 'asleep'
  game.catShaking = false
  game.catSmoke = false
  game.catGazeX = 0.5
  game.grace = 0
  game.charging = false
  game.chargeT = 0
  game.raging = false
  game.enraged = false
  game.laserAt = -1
  game.laserFlash = 0

  game.items = []
  game.slots = 0
  game.chunksInDessert = cfg.chunks
  game.dessertTotal = cfg.chunks
  game.goldExposed = false
  game.goldTaken = false
  game.goldVoided = false
  game.harvestT = 0
  game.depositT = 0
  game.exitT = 0
  game.canExit = false
  game.ground = []
  game.depositedValue = 0

  game.frenzy = 0
  game.frenzyZip = 0
  game.frenzyStage = 0
  game.choke = 0
  game.chokeShown = 0
  game.choking = false
  game.round = false
  game.fx = []

  // Fold in permanent mouse upgrades for this kitchen (§ upgrade catalogue).
  upChargeBonusMs = Math.max(0, progress.upgradedValue('sixthSense')) * 1000
  upExtraTime = Math.max(0, progress.upgradedValue('extraTime'))
  upGraceMs = GRACE_MS + Math.max(0, progress.upgradedValue('calmNerves')) * 1000
  upNapMult = 1 + Math.max(0, progress.upgradedValue('lightPaws'))
  upDepositSpeed = 1 / (1 + Math.max(0, progress.upgradedValue('deepHole')))
  diffFactor = 1 / Math.max(0.6, difficultySpeedFactor())  // Easy → longer naps

  releaseAllDirs()
  lastTapAt = {}
  exitArmed = false

  elapsedMs = 0
  nextItemId = 1
  closeCalls = 0
  insaneEscapes = 0
  deliveryPoints = 0
  greedyBonusPoints = 0
  depositRunChunks = 0
  depositWasFull = false
  depositUntil = 0
  leftDoor = false
  catStateUntil = 0
  graceUntil = 0
  chargeUntil = 0
  shotsInSequence = 0
  rageAt = 0
  rageUntil = 0
  frenzyTaps = 0
  chokeEndsAt = 0

  score.value = 0
  timeLeft.value = cfg.time + upExtraTime
  passTarget.value = cfg.pass
  perfectTarget.value = cfg.perfect
  chunksRemaining.value = game.chunksInDessert
  dessertTotal.value = game.dessertTotal
  depositedValue.value = 0
  slotsUsed.value = 0
  frenzyPct.value = 0
  frenzyTimeLeft.value = FRENZY_SECONDS
  chokePct.value = 0
  chokingRef.value = false
  enraged.value = false
  mustFreeze.value = false
  mustRun.value = false
  lossCause.value = ''
  frenzyNext.value = isFrenzyLevel(level)
  phase.value = 'idle'
  syncHud()
}

/** Begin the live run.
 *
 *  Rev 6: the cycle OPENS on a Red Light. The Mouse starts tucked in its door
 *  playing dead, so the opening watch costs nothing — it just hands the player
 *  the Cat's rhythm before they take a single step, instead of dropping them
 *  into a nap whose clock they never saw start. */
export const begin = (): void => {
  if (phase.value !== 'idle') return
  phase.value = 'playing'
  elapsedMs = 0
  progress.recordGamePlayed()
  enterAwake()
  syncHud()
}

/** End the level and tally it up (§E ratings + §H scoring). */
const finishLevel = (): void => {
  const value = game.depositedValue
  const platinum = value >= cfg.perfect && cfg.platinum > 0 && value >= cfg.platinum
  const stars = value >= cfg.perfect ? 3 : value >= cfg.pass ? 1 : 0

  const closeCall = closeCalls * CLOSE_CALL_POINTS
  const insaneEscape = insaneEscapes * INSANE_ESCAPE_POINTS
  const daringTotal = deliveryPoints + closeCall + insaneEscape

  reviewData.value = {
    delivery: deliveryPoints,
    greedyBonus: greedyBonusPoints,
    closeCall,
    insaneEscape,
    stars,
    platinum,
    daringTotal,
    oneUp: false
  }
  lastDaringTotal.value = daringTotal
  releaseAllDirs()

  if (stars === 0) {
    // Didn't make the minimum before the clock ran out — the level is a loss.
    lossCause.value = 'timeout'
    phase.value = 'dead'
    playSound('lose', 0.06)
    return
  }

  bankStars(game.level, stars, platinum)
  frenzyNext.value = isFrenzyLevel(game.level)
  phase.value = 'review'
  playSound('win', 0.06)
  playSound('level-up', 0.05)
}

/** Leave the Level Review: either the Eating Frenzy, or straight to the win. */
export const startFrenzy = (): void => {
  if (!frenzyNext.value) {
    bankLevel()
    return
  }
  game.frenzy = 0
  game.frenzyZip = 0
  game.frenzyStage = 0
  game.choke = 0
  game.chokeShown = 0
  game.choking = false
  game.round = false
  frenzyTaps = 0
  chokeEndsAt = 0
  frenzyPct.value = 0
  chokePct.value = 0
  chokingRef.value = false
  frenzyStartElapsed = elapsedMs
  frenzyTimeLeft.value = FRENZY_SECONDS
  phase.value = 'frenzy'
}

/** A frenzy mash: bite, zip to the next coordinate, and stack up the choke (§I). */
export const frenzyTap = (): void => {
  if (phase.value !== 'frenzy' || game.choking) return
  frenzyTaps += 1
  game.frenzy = clamp(game.frenzy + FRENZY_PER_TAP, 0, 100)
  frenzyPct.value = Math.round(game.frenzy)
  // Zip to the next bite position, in numerical order, resetting at 1.
  game.frenzyZip = (game.frenzyZip + 1) % FRENZY_ZIPS
  game.frenzyStage = Math.floor(frenzyTaps / FRENZY_TAPS_PER_STAGE)
  // Elastic Surge: the meter kicks past its true value, then settles back down.
  game.choke = clamp(game.choke + CHOKE_PER_TAP, 0, 100)
  game.chokeShown = clamp(Math.max(game.chokeShown, game.choke) + (CHOKE_SPIKE - CHOKE_PER_TAP), 0, 100)
  playSound('wood-cut', 0.04, 1.1 + Math.random() * 0.3)

  if (game.choke >= 100) {
    // Choked: a coughing fit paralyzes the Mouse and burns 2.5 precious seconds.
    game.choking = true
    chokingRef.value = true
    chokeEndsAt = elapsedMs + CHOKE_PARALYSIS_MS
    game.choke = 0
    pushFx('choke', 0.5, 1)
    playSound('obstacle-hit', 0.06, 0.7)
    triggerShake('small')
    return
  }
  if (game.frenzy >= 100) endFrenzy(true)
}

const endFrenzy = (devoured: boolean): void => {
  const took = (elapsedMs - frenzyStartElapsed) / 1000
  const oneUp = devoured && took < FRENZY_1UP_UNDER
  game.round = devoured
  if (devoured) playSound('happy', 0.07)
  if (oneUp) { gainLife(); playSound('celebration-3', 0.06) }
  reviewData.value = { ...reviewData.value, oneUp }
  bankLevel()
}

/** Bank the level: score, stage advance, win screen. */
const bankLevel = (): void => {
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
  slotsUsed.value = game.slots
  chunksRemaining.value = game.chunksInDessert
  dessertTotal.value = game.dessertTotal
  depositedValue.value = Math.round(game.depositedValue * 10) / 10
  catStateRef.value = game.catState
  atDessertRef.value = game.atDessert
}

// ─── Per-frame update ────────────────────────────────────────────────────────
export const step = (dt: number): void => {
  // Smooth the render position toward the logical one (exponential follow).
  const diff = game.pos - game.renderPos
  if (Math.abs(diff) > 0.0005) {
    game.renderPos = clamp(game.renderPos + diff * Math.min(1, (RENDER_LERP_PER_S * dt) / 1000), 0, 1)
  } else {
    game.renderPos = game.pos
  }
  if (game.laserFlash > 0) game.laserFlash = Math.max(0, game.laserFlash - dt / 260)

  if (phase.value === 'frenzy') {
    stepFrenzy(dt)
    return
  }
  if (phase.value !== 'playing') {
    game.moving = false
    return
  }

  elapsedMs += dt
  const ds = dt / 1000

  timeLeft.value = Math.max(0, timeLeft.value - ds)

  // ── Movement (§A). Hold = sneak up to a slow cruise; double-tap+hold = dash at
  //    the old top speed; release EVERYTHING and the Mouse instantly plays dead. ──
  const dir = netDir()
  const carry = carrySpeedFactor(game.slots)
  game.dashing = dir !== 0 && dashDir != null && heldDirs.has(dashDir) &&
    ((dashDir === 'right' && dir > 0) || (dashDir === 'left' && dir < 0))
  const top = (game.dashing ? DASH_SPEED : TOP_SPEED) * difficultySpeedFactor() * carry
  const accel = top / (game.dashing ? DASH_ACCEL_TIME : ACCEL_TIME)

  if (dir !== 0) {
    const target = dir * top
    if (game.vel < target) game.vel = Math.min(target, game.vel + accel * ds)
    else if (game.vel > target) game.vel = Math.max(target, game.vel - accel * ds)
  } else {
    game.vel = 0            // "Hide: release all controls" — an instant dead stop
  }
  game.speed = Math.abs(game.vel)
  if (game.vel > 0) game.facing = 1
  else if (game.vel < 0) game.facing = -1
  game.pos = clamp(game.pos + game.vel * ds, 0, 1)

  const atDoor = game.pos <= HOLE_R
  const atDessert = game.pos >= DESSERT_R
  if (!atDoor) leftDoor = true
  // Standing AT the dessert, a forward hold harvests rather than walks — so pin
  // him beside the plate instead of letting him grind into the wall.
  if (atDessert && dir >= 0) {
    game.vel = 0
    game.speed = 0
    game.pos = Math.min(game.pos, DESSERT_R)
  }
  game.moving = game.speed > MOVE_EPS
  game.atDoor = atDoor
  game.atDessert = atDessert
  game.nearDessert = game.pos >= DESSERT_R - PROXIMITY_R
  game.playingDead = !hasActiveInput() && !atDoor
  if (game.moving && Math.random() < dt / 110) pushFx('step', game.pos, 0.4)

  stepGround(ds)

  // ── Harvesting (§D): a green ring runs a 1.5s countdown while the direction
  //    into the dessert is held. Per the doc, the ONLY thing that cancels it is
  //    WALKING AWAY — so simply letting go PAUSES the ring where it is. That
  //    distinction is the whole reason the loop works: the Cat forces you to
  //    release every few seconds, and a 1.5s harvest has to be allowed to
  //    straddle a Red Light instead of being wiped by it. ──
  if (canHarvest()) {
    game.harvestT = clamp(game.harvestT + dt / HARVEST_MS, 0, 1)
    if (game.harvestT >= 1) {
      game.harvestT = 0
      finishHarvest()
    }
  } else if (!harvestable()) {
    game.harvestT = 0
  }

  // ── Depositing (§E): standing at the door drains the sack, one item per 0.1s. ──
  const depositMs = DEPOSIT_MS * upDepositSpeed
  if (atDoor && game.items.length > 0) {
    if (depositUntil === 0) {
      depositUntil = elapsedMs + depositMs
      depositRunChunks = 0
      depositWasFull = game.slots >= MAX_SLOTS
    }
    game.depositT = clamp(1 - (depositUntil - elapsedMs) / depositMs, 0, 1)
    if (elapsedMs >= depositUntil) {
      depositOne()
      depositUntil = game.items.length > 0 ? elapsedMs + depositMs : 0
      if (game.items.length === 0) game.depositT = 0
    }
  } else {
    depositUntil = 0
    game.depositT = 0
  }

  // ── The Cat (§C). ──
  stepCat()

  // Cat gaze: it watches the Mouse whenever its eyes are open.
  const gazeTarget = game.catState === 'awake' ? game.pos : 0.5
  game.catGazeX += (gazeTarget - game.catGazeX) * Math.min(1, 6 * ds)

  // ── End of level. ──
  if (timeLeft.value <= 0) {
    finishLevel()
    return
  }

  const settled = game.items.length === 0 && depositUntil === 0 && leftDoor && atDoor
  const stripped = game.chunksInDessert === 0
  // Nothing is left out there to carry home — no decision to make, so the door
  // simply closes behind him.
  if (settled && stripped && !game.goldExposed && !goldOnFloor()) {
    finishLevel()
    return
  }

  // §G Safe Exit. The door opens as soon as the Mouse is standing in it with an
  // empty sack and a haul that already clears the level (or with a dessert that
  // has nothing left to give). So banking the last chunks never ends the run FOR
  // you: you're left in the doorway choosing between turning around for the Gold
  // Nugget and going home. Leaving takes a fresh, deliberate back-press (see
  // `pressDir`) held for EXIT_HOLD_MS.
  game.canExit = settled && (stripped || game.depositedValue >= cfg.pass)
  if (game.canExit && exitArmed && dir < 0) {
    game.exitT = clamp(game.exitT + dt / EXIT_HOLD_MS, 0, 1)
    if (game.exitT >= 1) {
      finishLevel()
      return
    }
  } else {
    game.exitT = 0
  }

  syncHud()
}

/** The Cat's whole threat loop: nap → shake → wake → grace → charge → fire. */
const stepCat = (): void => {
  const active = hasActiveInput()
  const safe = game.pos <= HOLE_R             // tucked in the Mouse Door

  if (game.catState === 'asleep') {
    game.grace = 0
    game.exposed = false
    // The wake-up telegraph: he shakes over the tail end of the nap (§C).
    game.catShaking = elapsedMs >= catStateUntil - SHAKE_MS
    // Enraged, the tell is a puff of smoke from the nostrils (§G).
    game.catSmoke = game.enraged && game.catShaking
    if (elapsedMs >= catStateUntil) enterAwake()
    return
  }

  // ── AWAKE ──
  const inGrace = elapsedMs < graceUntil
  game.grace = inGrace ? clamp((graceUntil - elapsedMs) / upGraceMs, 0, 1) : 0
  // Detection Leniency (§C): inputs still held once the buffer lapses give you away.
  game.exposed = active && !inGrace && !safe
  game.catSmoke = game.enraged && elapsedMs >= catStateUntil - SHAKE_MS

  if (game.charging) {
    if (active) movedDuringCharge = true
    game.chargeT = clamp(1 - (chargeUntil - elapsedMs) / chargeMs, 0, 1)
    if (elapsedMs >= chargeUntil) fireLaser()
    return
  }

  // Reaching the door mid-sequence calls the Cat off — no free Close Calls for
  // parking in the doorway while it empties the magazine.
  if (safe && (game.raging || rageAt > 0)) {
    endSequence()
    enterAsleep()
    return
  }

  // Post-sequence cooldown → the enraged, rapid-fire state (§C, Rage Mode).
  if (rageAt > 0 && elapsedMs >= rageAt) {
    rageAt = 0
    game.raging = true
    rageUntil = elapsedMs + RAGE_MS
    shotsInSequence = 0
    playSound('obstacle-hit', 0.06, 0.6)
    beginCharge(true)
    return
  }
  // Rage keeps firing whether or not you move — the only way out is the door.
  if (game.raging) {
    if (elapsedMs >= rageUntil) {
      game.raging = false
      enterAsleep()
    } else beginCharge(true)
    return
  }

  // Any active movement past the grace buffer starts the 1.8s charge (§C).
  if (game.exposed) {
    shotsInSequence = 0
    beginCharge()
    return
  }
  mustRun.value = false

  // The watch window ends — but never while a sequence is still cooling down.
  if (rageAt === 0 && elapsedMs >= catStateUntil) enterAsleep()
}

/** The Eating Frenzy clock: the choke meter's decay, the elastic settle, and the
 *  2.5s coughing fit (§I). */
const stepFrenzy = (dt: number): void => {
  elapsedMs += dt
  const ds = dt / 1000

  if (game.choking && elapsedMs >= chokeEndsAt) {
    game.choking = false
    chokingRef.value = false
  }
  // Passive decay, and the visual spike easing back onto the true value.
  if (!game.choking) game.choke = clamp(game.choke - CHOKE_DECAY_PER_S * ds, 0, 100)
  else game.choke = 0
  const settle = CHOKE_SETTLE_PER_S * ds
  if (game.chokeShown > game.choke) game.chokeShown = Math.max(game.choke, game.chokeShown - settle)
  else game.chokeShown = game.choke
  const c = Math.round(game.chokeShown)
  if (c !== chokePct.value) chokePct.value = c

  const left = FRENZY_SECONDS - (elapsedMs - frenzyStartElapsed) / 1000
  frenzyTimeLeft.value = Math.max(0, Math.round(left * 10) / 10)
  if (left <= 0) endFrenzy(game.frenzy >= 100)
}

// ─── Cheat hooks (kept compatible with useCheats) ────────────────────────────
export const spawnTestItemBoxes = (): void => { gainLife() }
/** Slam the Cat awake right now (used by the cheat pad + the test suite). */
export const spawnTestCratePile = (): void => {
  if (phase.value !== 'playing') return
  catStateUntil = elapsedMs
  if (game.catState === 'asleep') enterAwake()
}

// Dev-only debug surface for e2e driving (Chrome DevTools MCP).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __cw?: unknown }).__cw = {
    game, phase, score, lives, timeLeft, catState: catStateRef, slotsUsed,
    chunksRemaining, dessertTotal, depositedValue, passTarget, perfectTarget,
    mustFreeze, mustRun, enraged, atDessert: atDessertRef, frenzyPct, chokePct,
    pressDir, releaseDir, releaseAllDirs, dropItem, pressInteract, begin,
    resetForStage, startFrenzy, frenzyTap, revive
  }
}

const useCookieGame = () => ({
  phase, lossCause, lives, score, timeLeft, catState: catStateRef,
  slotsUsed, chunksRemaining, dessertTotal, depositedValue,
  passTarget, perfectTarget, stageTarget,
  mustFreeze, mustRun, enraged, atDessert: atDessertRef,
  frenzyPct, frenzyTimeLeft, chokePct, choking: chokingRef, frenzyNext,
  reviewData, lastDaringTotal,
  begin, resetForStage, pressDir, releaseDir, releaseAllDirs, dropItem,
  pressInteract, startFrenzy, frenzyTap, revive, loseLife, gainLife,
  confirmLoss, starsForLevel, step, clock
})

export default useCookieGame
