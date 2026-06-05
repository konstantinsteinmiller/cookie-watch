import { ref, computed, watch, type Ref } from 'vue'
import { getState, setState, cookieState } from '@/use/useEpicState'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { ACHIEVEMENTS_KEY } from '@/keys'
import useEpicConfig from '@/use/useEpicConfig'
import useEpicProgress from '@/use/useEpicProgress'

// ─── Achievements / milestone quests (roadmap #13) ──────────────────────────
//
// Lifetime milestones that turn incidental play into goals. Each grants a
// one-time coin payout, scaled to how hard it is to reach — small for the early
// ones, fat for the grindy "100,000 tiles" capstone. State lives in the single
// `cookie_state` blob under `ACHIEVEMENTS_KEY`:
//   { claimed: string[], stats: { tiles, coins, items, clears, bestRun } }
// Lifetime stats accumulate on every finished run via `recordRun`; the
// "highest stage reached" metric reads `progress.maxStage` directly.

/** Which counter an achievement measures. `stage` reads progress.maxStage; the
 *  rest read the persisted lifetime stats. */
export type AchievementMetric = 'tiles' | 'coins' | 'items' | 'clears' | 'bestRun' | 'stage'

export interface AchievementDef {
  id: string
  metric: AchievementMetric
  /** Goal value for `metric`. */
  target: number
  /** Coins granted on claim — scaled to difficulty. */
  reward: number
}

interface AchievementStats {
  tiles: number
  coins: number
  items: number
  clears: number
  bestRun: number
}

interface AchievementState {
  claimed: string[]
  stats: AchievementStats
}

// Ordered roughly easy → hard. Rewards intentionally modest and back-loaded so
// achievements feel earned, not like a coin faucet.
export const ACHIEVEMENTS: ReadonlyArray<AchievementDef> = [
  // Lifetime tiles travelled — the headline ladder (1k / 5k / 10k / 100k).
  { id: 'tiles1k', metric: 'tiles', target: 1000, reward: 100 },
  { id: 'tiles5k', metric: 'tiles', target: 5000, reward: 300 },
  { id: 'tiles10k', metric: 'tiles', target: 10000, reward: 600 },
  { id: 'tiles100k', metric: 'tiles', target: 100000, reward: 3000 },
  // Highest stage ever reached.
  { id: 'stage5', metric: 'stage', target: 5, reward: 200 },
  { id: 'stage10', metric: 'stage', target: 10, reward: 500 },
  { id: 'stage20', metric: 'stage', target: 20, reward: 1500 },
  // Lifetime stage clears.
  { id: 'clears25', metric: 'clears', target: 25, reward: 250 },
  { id: 'clears100', metric: 'clears', target: 100, reward: 1000 },
  // Best single-run distance.
  { id: 'bestRun100', metric: 'bestRun', target: 100, reward: 150 },
  { id: 'bestRun250', metric: 'bestRun', target: 250, reward: 500 },
  // Lifetime coins collected (run tallies, before the result-screen banking).
  { id: 'coins5k', metric: 'coins', target: 5000, reward: 200 },
  { id: 'coins50k', metric: 'coins', target: 50000, reward: 1000 },
  // Lifetime item boxes grabbed.
  { id: 'items50', metric: 'items', target: 50, reward: 150 },
  { id: 'items250', metric: 'items', target: 250, reward: 600 }
] as const

const emptyStats = (): AchievementStats => ({ tiles: 0, coins: 0, items: 0, clears: 0, bestRun: 0 })

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const loadState = (): AchievementState => {
  const v = getState<Partial<AchievementState> | null>(ACHIEVEMENTS_KEY, null)
  const stats = emptyStats()
  if (v && v.stats && typeof v.stats === 'object') {
    const s = v.stats as Partial<AchievementStats>
    stats.tiles = num(s.tiles)
    stats.coins = num(s.coins)
    stats.items = num(s.items)
    stats.clears = num(s.clears)
    stats.bestRun = num(s.bestRun)
  }
  const validIds = new Set(ACHIEVEMENTS.map((a) => a.id))
  const claimed = Array.isArray(v?.claimed)
    ? v!.claimed.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : []
  return { claimed, stats }
}

const state: Ref<AchievementState> = ref(loadState())

const refresh = (): void => { state.value = loadState() }
watch(saveDataVersion, refresh)
watch(cookieState, refresh, { deep: false })

const persist = (): void => {
  setState(ACHIEVEMENTS_KEY, state.value)
  void flushSaveNow()
}

/** Lifetime value backing a given metric (stage reads live max-stage). */
const metricValue = (metric: AchievementMetric, maxStage: number): number => {
  if (metric === 'stage') return maxStage
  return state.value.stats[metric]
}

/** Count of completed-but-unclaimed achievements — drives the HUD badge. We
 *  can't read maxStage at module scope, so this only counts the stat-backed
 *  metrics here; the composable's `pendingCount` includes stage too. */
export const claimableAchievementCount = (maxStage: number): number =>
  ACHIEVEMENTS.filter(
    (a) => !state.value.claimed.includes(a.id) && metricValue(a.metric, maxStage) >= a.target
  ).length

export interface AchievementView extends AchievementDef {
  current: number
  claimed: boolean
  complete: boolean
  claimable: boolean
}

const useAchievements = () => {
  const { addCoins } = useEpicConfig()
  const progress = useEpicProgress()

  const list = computed<AchievementView[]>(() =>
    ACHIEVEMENTS.map((a) => {
      const current = metricValue(a.metric, progress.maxStage.value)
      const complete = current >= a.target
      const claimed = state.value.claimed.includes(a.id)
      return { ...a, current, complete, claimed, claimable: complete && !claimed }
    })
  )

  const pendingCount = computed(() => list.value.filter((a) => a.claimable).length)
  const hasUnclaimed = computed(() => pendingCount.value > 0)

  /** Accumulate one finished run's stats into the lifetime counters. */
  const recordRun = (run: { tiles: number; coins: number; items: number; cleared: boolean }): void => {
    const tiles = num(run.tiles)
    const coins = num(run.coins)
    const items = num(run.items)
    const s = state.value.stats
    state.value = {
      claimed: state.value.claimed,
      stats: {
        tiles: s.tiles + tiles,
        coins: s.coins + coins,
        items: s.items + items,
        clears: s.clears + (run.cleared ? 1 : 0),
        bestRun: Math.max(s.bestRun, tiles)
      }
    }
    persist()
  }

  /** Claim a completed achievement's coins. Returns the amount, or 0 if it
   *  wasn't claimable. */
  const claim = (id: string): number => {
    const a = ACHIEVEMENTS.find((x) => x.id === id)
    if (!a) return 0
    if (state.value.claimed.includes(id)) return 0
    if (metricValue(a.metric, progress.maxStage.value) < a.target) return 0
    state.value = { ...state.value, claimed: [...state.value.claimed, id] }
    addCoins(a.reward)
    persist()
    return a.reward
  }

  return { list, pendingCount, hasUnclaimed, recordRun, claim }
}

export default useAchievements
