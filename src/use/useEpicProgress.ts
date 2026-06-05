import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { getState, setState, cookieState } from '@/use/useEpicState'
import { STAGE_KEY, BEST_SCORE_KEY, UPGRADES_KEY, START_SECOND_CHANCE_KEY } from '@/keys'
import useEpicConfig from '@/use/useEpicConfig'

// ─── Stage / progression model ──────────────────────────────────────────────
//
// Stage 1 is a short, gentle tutorial (20 tiles); stage 2 jumps to 40 and
// stage 3 to 55, after which every subsequent stage adds +10 tiles
// (65, 75, …). Reaching the target = a win; the player advances to the next
// stage on their next run. Stage, best score, lifetime games and max-stage all
// live as fields inside the single `cookie_state` blob.

const GAMES_PLAYED_KEY = 'epic_games_played'
const MAX_STAGE_KEY = 'epic_max_stage'

/** Tiles required to clear a given stage: 20, 40, 55, 65, 75, … */
export const tilesToClear = (stage: number): number => {
  const s = Math.max(1, stage)
  if (s === 1) return 20
  if (s === 2) return 40
  return 55 + (s - 3) * 10
}

// ─── Upgrade catalogue ────────────────────────────────────────────────────
//
// Permanent, coin-bought boosts that deepen the meta loop. Each value is read
// via `upgradedValue(id)` = base + level * perLevel.

export interface UpgradeDef {
  id: string
  maxLevel: number
  base: number
  perLevel: number
  costBase: number
  costGrowth: number
  /** Stage the upgrade unlocks at (1 = available from the start). */
  unlockStage: number
}

// Costs are tuned for the new, slower coin economy (~40 coins on a good early
// run): modest bases and a gentle growth curve, with the FIRST level of every
// upgrade discounted 50% (see `upgradeCost`) so a brand-new player can afford a
// meaningful first boost after a run or two.
// ─── Cookie Watch upgrade catalogue ─────────────────────────────────────────
// Each value is read by the engine (`useCookieGame`) via `upgradedValue(id)`
// = base + level * perLevel, applied at the start of every kitchen.
export const UPGRADES: ReadonlyArray<UpgradeDef> = [
  // Calm Nerves: scales DOWN the cat's awareness gain from your noise. Stored
  // as the per-level reduction fraction (0.06 → −6% per level, capped engine-side).
  { id: 'calmNerves', maxLevel: 5, base: 0, perLevel: 0.06, costBase: 80, costGrowth: 1.4, unlockStage: 1 },
  // Light Paws: a misstep adds less alert (−0.5 per level off the +4 base).
  { id: 'lightPaws', maxLevel: 5, base: 0, perLevel: 0.5, costBase: 100, costGrowth: 1.4, unlockStage: 1 },
  // Night Owl: extra seconds on the cat-nap timer (+5s per level).
  { id: 'extraTime', maxLevel: 5, base: 0, perLevel: 5, costBase: 120, costGrowth: 1.45, unlockStage: 2 },
  // Cozy Burrow: faster awareness cool-down while hiding in the hole (+2/s per level).
  { id: 'deepHole', maxLevel: 5, base: 0, perLevel: 2, costBase: 110, costGrowth: 1.4, unlockStage: 2 },
  // Sixth Sense: a longer pounce wind-up gives you more time to flee (+0.15s/level).
  { id: 'sixthSense', maxLevel: 5, base: 0, perLevel: 0.15, costBase: 140, costGrowth: 1.45, unlockStage: 3 }
] as const

/** Upgrades the player can sell back (downgrade) for a partial coin refund. */
export const SELLABLE_UPGRADES: ReadonlyArray<string> = []
/** Fraction of the paid price returned when selling one level back. */
export const SELL_REFUND_RATE = 0.75

interface UpgradeState { levels: Record<string, number> }

/** Coin price of one pre-bought Second Chance (alternative to a rewarded ad). */
export const SECOND_CHANCE_COST = 200

const readNumber = (key: string, fallback: number): number => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}

const loadUpgrades = (): UpgradeState => {
  const v = getState<Partial<UpgradeState> | null>(UPGRADES_KEY, null)
  const levels: Record<string, number> = {}
  if (v && v.levels && typeof v.levels === 'object') {
    for (const def of UPGRADES) {
      const lvl = (v.levels as Record<string, unknown>)[def.id]
      if (typeof lvl === 'number' && Number.isFinite(lvl)) {
        levels[def.id] = Math.max(0, Math.min(def.maxLevel, Math.floor(lvl)))
      }
    }
  }
  return { levels }
}

const readBool = (key: string, fallback: boolean): boolean => {
  const v = getState<unknown>(key)
  return typeof v === 'boolean' ? v : fallback
}

const stage: Ref<number> = ref(Math.max(1, readNumber(STAGE_KEY, 1)))
const bestScore: Ref<number> = ref(readNumber(BEST_SCORE_KEY, 0))
const gamesPlayed: Ref<number> = ref(readNumber(GAMES_PLAYED_KEY, 0))
const maxStage: Ref<number> = ref(Math.max(1, readNumber(MAX_STAGE_KEY, stage.value)))
const upgrades: Ref<UpgradeState> = ref(loadUpgrades())
// Sticky pre-bought Second Chance; true once purchased, cleared when consumed.
const startSecondChance: Ref<boolean> = ref(readBool(START_SECOND_CHANCE_KEY, false))

const refresh = (): void => {
  stage.value = Math.max(1, readNumber(STAGE_KEY, stage.value))
  bestScore.value = readNumber(BEST_SCORE_KEY, bestScore.value)
  gamesPlayed.value = readNumber(GAMES_PLAYED_KEY, gamesPlayed.value)
  maxStage.value = Math.max(1, readNumber(MAX_STAGE_KEY, maxStage.value))
  upgrades.value = loadUpgrades()
  startSecondChance.value = readBool(START_SECOND_CHANCE_KEY, startSecondChance.value)
}
watch(saveDataVersion, refresh)
watch(cookieState, refresh, { deep: false })

// ─── Public reactive surface (also consumed by gamepixPlugin) ───────────────

/** Lifetime number of runs started. Used for the GamePix happy-moment cadence
 *  and leaderboard score posting. */
export const gamesPlayedTotal: ComputedRef<number> = computed(() => gamesPlayed.value)
/** Highest stage the player has ever reached — GamePix level metric. */
export const maxStageReached: ComputedRef<number> = computed(() => maxStage.value)

export const levelOf = (id: string): number => upgrades.value.levels[id] ?? 0

export const upgradedValue = (id: string): number => {
  const def = UPGRADES.find((u) => u.id === id)
  if (!def) return 0
  return def.base + levelOf(id) * def.perLevel
}

/** Raw coin price to buy the level `lvl → lvl+1` (before rounding). The first
 *  level (0 → 1) of a MULTI-level upgrade is half-price (an easy first boost for
 *  new players); single-level capstones (e.g. Rolling Boulder) pay full price. */
const rawLevelCost = (def: UpgradeDef, lvl: number): number => {
  const raw = def.costBase * Math.pow(def.costGrowth, lvl)
  return lvl === 0 && def.maxLevel > 1 ? raw * 0.5 : raw
}

export const upgradeCost = (id: string): number => {
  const def = UPGRADES.find((u) => u.id === id)
  if (!def) return Infinity
  const lvl = levelOf(id)
  if (lvl >= def.maxLevel) return Infinity
  return Math.round(rawLevelCost(def, lvl))
}

/** Coins refunded for selling the current top level back (75% of what it cost
 *  to buy). Returns 0 when there's nothing to sell or the upgrade isn't sellable. */
export const sellRefund = (id: string): number => {
  const def = UPGRADES.find((u) => u.id === id)
  if (!def || !SELLABLE_UPGRADES.includes(id)) return 0
  const lvl = levelOf(id)
  if (lvl <= 0) return 0
  return Math.round(rawLevelCost(def, lvl - 1) * SELL_REFUND_RATE)
}

const persistUpgrades = (): void => setState(UPGRADES_KEY, upgrades.value)

export default function useEpicProgress() {
  const { coins, spendCoins, addCoins } = useEpicConfig()

  const isUnlocked = (id: string): boolean => {
    const def = UPGRADES.find((u) => u.id === id)
    return !!def && maxStage.value >= def.unlockStage
  }

  const canBuy = (id: string): boolean => {
    const def = UPGRADES.find((u) => u.id === id)
    if (!def) return false
    if (!isUnlocked(id)) return false
    if (levelOf(id) >= def.maxLevel) return false
    return coins.value >= upgradeCost(id)
  }

  const buyUpgrade = (id: string): boolean => {
    if (!canBuy(id)) return false
    const cost = upgradeCost(id)
    if (!spendCoins(cost)) return false
    const next: UpgradeState = { levels: { ...upgrades.value.levels } }
    next.levels[id] = levelOf(id) + 1
    upgrades.value = next
    persistUpgrades()
    void flushSaveNow()
    return true
  }

  /** Whether one level of `id` can be sold back right now. */
  const canSell = (id: string): boolean =>
    SELLABLE_UPGRADES.includes(id) && levelOf(id) > 0

  /** Sell one level of a sellable upgrade back for a partial refund. */
  const sellUpgrade = (id: string): boolean => {
    if (!canSell(id)) return false
    const refund = sellRefund(id)
    const next: UpgradeState = { levels: { ...upgrades.value.levels } }
    next.levels[id] = levelOf(id) - 1
    upgrades.value = next
    persistUpgrades()
    addCoins(refund)
    void flushSaveNow()
    return true
  }

  /** Arm the sticky pre-bought Second Chance (idempotent). Persists at once. */
  const armStartSecondChance = (): void => {
    if (startSecondChance.value) return
    startSecondChance.value = true
    setState(START_SECOND_CHANCE_KEY, true)
    void flushSaveNow()
  }

  /** Buy one Second Chance for coins. Fails if already armed or short on coins. */
  const buyStartSecondChance = (): boolean => {
    if (startSecondChance.value) return false
    if (!spendCoins(SECOND_CHANCE_COST)) return false
    armStartSecondChance()
    return true
  }

  /** Spend the armed Second Chance (called when the run's shield is consumed). */
  const consumeStartSecondChance = (): void => {
    if (!startSecondChance.value) return
    startSecondChance.value = false
    setState(START_SECOND_CHANCE_KEY, false)
    void flushSaveNow()
  }

  /** Advance to the next stage (on a win). Persists immediately. */
  const advanceStage = (): void => {
    stage.value += 1
    setState(STAGE_KEY, stage.value)
    if (stage.value > maxStage.value) {
      maxStage.value = stage.value
      setState(MAX_STAGE_KEY, maxStage.value)
    }
    void flushSaveNow()
  }

  /** Count a started run (battle-pass + happy-moment cadence). */
  const recordGamePlayed = (): void => {
    gamesPlayed.value += 1
    setState(GAMES_PLAYED_KEY, gamesPlayed.value)
  }

  /** Record a finished run's score; updates the personal best. */
  const recordScore = (score: number): boolean => {
    if (!Number.isFinite(score) || score <= bestScore.value) return false
    bestScore.value = Math.floor(score)
    setState(BEST_SCORE_KEY, bestScore.value)
    void flushSaveNow()
    return true
  }

  return {
    stage,
    bestScore,
    gamesPlayed,
    maxStage,
    upgrades,
    coins,
    startSecondChance,
    tilesToClear,
    isUnlocked,
    canBuy,
    buyUpgrade,
    canSell,
    sellUpgrade,
    sellRefund,
    armStartSecondChance,
    buyStartSecondChance,
    consumeStartSecondChance,
    advanceStage,
    recordGamePlayed,
    recordScore,
    levelOf,
    upgradedValue,
    upgradeCost,
    UPGRADES
  }
}
