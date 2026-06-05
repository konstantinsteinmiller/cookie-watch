import { ref, computed, watch, type Ref } from 'vue'
import { getState, setState, cookieState } from '@/use/useEpicState'
import { saveDataVersion, flushSaveNow } from '@/use/useSaveStatus'
import { MISSIONS_KEY } from '@/keys'
import useEpicConfig from '@/use/useEpicConfig'
import useBattlePass from '@/use/useBattlePass'

// ─── Daily mission triplet (roadmap #2) ─────────────────────────────────────
//
// Three rotating goals, regenerated each local day, that give a reason to open
// the app daily beyond the login chest. Progress is fed by `recordRun()` at the
// end of every run; completing a mission lets the player claim coins + a chunk
// of battle-pass XP. State persists in the single `cookie_state` blob under
// `MISSIONS_KEY` as `{ day, missions }`, so it round-trips through cloud save.

export type MissionType = 'coins' | 'tiles' | 'items' | 'clears'

export interface Mission {
  type: MissionType
  /** Goal value; semantics depend on `type` (see MISSION_DEFS). */
  target: number
  /** Current progress toward `target`. */
  progress: number
  /** Coins granted on claim. */
  reward: number
  claimed: boolean
}

interface MissionState { day: string; missions: Mission[] }

/** Per-type config: a few candidate targets (a daily seed picks one) and the
 *  matching coin reward. `tiles` is a best-single-run goal; the rest accumulate
 *  across the day's runs. */
const MISSION_DEFS: Record<MissionType, { targets: number[]; reward: number }> = {
  coins: { targets: [80, 120, 160], reward: 60 },
  tiles: { targets: [25, 40, 55], reward: 70 },
  items: { targets: [3, 5, 7], reward: 50 },
  clears: { targets: [1, 2, 3], reward: 80 }
}
const ALL_TYPES: MissionType[] = ['coins', 'tiles', 'items', 'clears']

const todayKey = (): string => new Date().toISOString().slice(0, 10)

/** Deterministic 32-bit hash of a string (so a given day yields stable goals). */
const hashStr = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Build the day's three missions deterministically from the date string, so
 *  the same day always shows the same goals (even across reloads / devices). */
const generateMissions = (day: string): Mission[] => {
  const seed = hashStr(day)
  // Pick 3 distinct types: drop one type based on the seed.
  const dropped = ALL_TYPES[seed % ALL_TYPES.length]!
  const types = ALL_TYPES.filter((t) => t !== dropped)
  return types.map((type, i) => {
    const def = MISSION_DEFS[type]
    const target = def.targets[(seed >> (i * 3)) % def.targets.length]!
    return { type, target, progress: 0, reward: def.reward, claimed: false }
  })
}

const loadState = (): MissionState => {
  const v = getState<Partial<MissionState> | null>(MISSIONS_KEY, null)
  const day = todayKey()
  if (!v || v.day !== day || !Array.isArray(v.missions) || v.missions.length === 0) {
    return { day, missions: generateMissions(day) }
  }
  // Sanitize persisted missions against the current defs.
  const missions = v.missions
    .filter((m): m is Mission => !!m && ALL_TYPES.includes(m.type as MissionType))
    .map((m) => ({
      type: m.type,
      target: Number(m.target) > 0 ? Number(m.target) : (MISSION_DEFS[m.type].targets[0] ?? 1),
      progress: Number.isFinite(Number(m.progress)) ? Math.max(0, Number(m.progress)) : 0,
      reward: Number(m.reward) || MISSION_DEFS[m.type].reward,
      claimed: m.claimed === true
    }))
  return { day, missions: missions.length ? missions : generateMissions(day) }
}

const state: Ref<MissionState> = ref(loadState())

const refresh = (): void => {
  const next = loadState()
  // Only replace when the day rolled over or the blob changed identity, so we
  // don't clobber in-memory progress mid-session on unrelated state bumps.
  if (next.day !== state.value.day) state.value = next
}
watch(saveDataVersion, refresh)
watch(cookieState, refresh, { deep: false })

const persist = (): void => {
  setState(MISSIONS_KEY, state.value)
  void flushSaveNow()
}

/** Count of completed-but-unclaimed missions — drives the HUD button badge. */
export const claimableMissionCount = computed(
  () => state.value.missions.filter((m) => !m.claimed && m.progress >= m.target).length
)

const useMissions = () => {
  const { addCoins } = useEpicConfig()
  const { awardXp } = useBattlePass()

  // Roll the day over if needed (e.g. the app was left open past midnight).
  const ensureToday = (): void => {
    if (state.value.day !== todayKey()) state.value = loadState()
  }

  const missions = computed(() => state.value.missions)

  /** Feed one finished run's stats into the daily missions. `coins`/`items`
   *  accumulate across the day; `tiles` keeps the best single run; `cleared`
   *  increments the stage-clear counter. */
  const recordRun = (run: { tiles: number; coins: number; items: number; cleared: boolean }): void => {
    ensureToday()
    // Coerce every input to a finite, non-negative number. A stale field
    // (undefined) or a NaN that crept into the persisted blob would otherwise
    // poison `progress` permanently via `+=`, surfacing as "NaN /" in the UI.
    const tiles = Math.max(0, Number(run.tiles) || 0)
    const coins = Math.max(0, Number(run.coins) || 0)
    const items = Math.max(0, Number(run.items) || 0)
    let changed = false
    for (const m of state.value.missions) {
      if (m.claimed) continue
      // Self-heal any already-corrupt progress before accumulating.
      const cur = Number.isFinite(m.progress) ? m.progress : 0
      const before = cur
      if (m.type === 'coins') m.progress = cur + coins
      else if (m.type === 'items') m.progress = cur + items
      else if (m.type === 'clears') m.progress = cur + (run.cleared ? 1 : 0)
      else if (m.type === 'tiles') m.progress = Math.max(cur, tiles)
      if (m.progress !== before) changed = true
    }
    if (changed) {
      state.value = { ...state.value } // trigger reactivity
      persist()
    }
  }

  /** Claim a completed mission's reward (coins + battle-pass XP). */
  const claim = (index: number): boolean => {
    ensureToday()
    const m = state.value.missions[index]
    if (!m || m.claimed || m.progress < m.target) return false
    m.claimed = true
    addCoins(m.reward)
    awardXp(20)
    state.value = { ...state.value }
    persist()
    return true
  }

  return { missions, recordRun, claim, claimableMissionCount }
}

export default useMissions
