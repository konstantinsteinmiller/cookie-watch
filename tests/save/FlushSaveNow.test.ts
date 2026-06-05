import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── flushSaveNow — immediate checkpoint flush (the CG "stage lost on reload"
// regression) ──────────────────────────────────────────────────────────────
//
// On the CrazyGames cloud-only build, a stage advance writes the new stage into
// `maw_state` but the push to `sdk.data` only fires after the persist (~200ms)
// + strategy-flush (~250ms) debounces, and the async cloud write then takes
// time to land. A player who clears a stage and reloads a moment later beat
// that pipeline → reload restored the OLD stage.
//
// `flushSaveNow()` (called from `persistStage`) forces the whole pipeline to
// drain synchronously-as-possible: write `maw_state` now → SaveManager proxy →
// strategy dirty → `manager.flush()` → backend. This test proves a stage write
// reaches the (fake) backend right after `flushSaveNow()` WITHOUT advancing any
// timers — i.e. it does not wait for either debounce.

const STATE_KEY = 'cookie_watch_state'

const makeFakeData = (seed: Record<string, string> = {}) => {
  const store = new Map<string, string>(Object.entries(seed))
  return {
    store,
    getItem: vi.fn(async (key: string) => store.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    removeItem: vi.fn(async (key: string) => { store.delete(key) })
  }
}

const bootCloudOnly = async (data: ReturnType<typeof makeFakeData>) => {
  const { SaveManager } = await import('@/utils/save/SaveManager')
  const { CrazyGamesStrategy } = await import('@/utils/save/CrazyGamesStrategy')
  const { installSaveStatus } = await import('@/use/useSaveStatus')
  const manager = new SaveManager(
    new CrazyGamesStrategy(() => data),
    window.localStorage,
    { blob: { persistToRaw: false } }
  )
  installSaveStatus(manager)
  await manager.init()
  return manager
}

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('flushSaveNow — immediate flush on a hard checkpoint', () => {
  it('pushes a pending stage write to the backend without waiting for the debounce', async () => {
    const data = makeFakeData()
    await bootCloudOnly(data)

    const { setState } = await import('@/use/useEpicState')
    const { flushSaveNow } = await import('@/use/useSaveStatus')

    // A level change writes the new stage into maw_state (still on the debounce
    // timers — nothing has reached the cloud yet).
    setState('spinner_campaign_stage', 2)
    expect(data.store.get(STATE_KEY)).toBeUndefined()

    // The checkpoint flush drains everything immediately — no fake timers.
    await flushSaveNow()

    const cloudBlob = JSON.parse(data.store.get(STATE_KEY) || '{}')
    expect(cloudBlob.spinner_campaign_stage).toBe(2)
  })

  it('also carries coexisting progress (coins) written in the same checkpoint', async () => {
    const data = makeFakeData()
    await bootCloudOnly(data)

    const { setState } = await import('@/use/useEpicState')
    const { flushSaveNow } = await import('@/use/useSaveStatus')

    setState('spinner_coins', 250)
    setState('spinner_campaign_stage', 3)
    await flushSaveNow()

    const cloudBlob = JSON.parse(data.store.get(STATE_KEY) || '{}')
    expect(cloudBlob.spinner_campaign_stage).toBe(3)
    expect(cloudBlob.spinner_coins).toBe(250)
  })
})

// A short tick that lets a fire-and-forget `void flushSaveNow()` async chain
// settle WITHOUT advancing far enough to trip the 200ms persist debounce — so
// anything in the cloud after it got there via the immediate checkpoint flush,
// not the throttle.
const settle = () => new Promise((r) => setTimeout(r, 0))

describe('discrete progression events flush to the backend immediately', () => {
  it('buying an upgrade flushes without waiting for the debounce', async () => {
    const data = makeFakeData()
    await bootCloudOnly(data)
    const { default: useEpicProgress } = await import('@/use/useEpicProgress')
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const prog = useEpicProgress()
    useEpicConfig().addCoins(10_000)

    expect(prog.buyUpgrade('calmNerves')).toBe(true)
    await settle()

    const blob = JSON.parse(data.store.get(STATE_KEY) || '{}')
    expect(blob.epic_upgrades?.levels?.calmNerves).toBe(1)
  })

  it('advancing a stage flushes immediately', async () => {
    const data = makeFakeData()
    await bootCloudOnly(data)
    const { default: useEpicProgress } = await import('@/use/useEpicProgress')
    const prog = useEpicProgress()

    prog.advanceStage()
    await settle()

    const blob = JSON.parse(data.store.get(STATE_KEY) || '{}')
    expect(blob.epic_stage).toBe(2)
  })

  it('a coin change does NOT flush immediately — it stays throttled', async () => {
    const data = makeFakeData()
    await bootCloudOnly(data)
    const { default: useEpicConfig } = await import('@/use/useEpicConfig')
    const { flushSaveNow } = await import('@/use/useSaveStatus')
    const cfg = useEpicConfig()

    cfg.addCoins(123)
    await settle()
    // Still on the throttle — nothing reached the cloud within a tick.
    expect(data.store.get(STATE_KEY)).toBeUndefined()

    // …but a later checkpoint (or the next discrete event) carries it.
    await flushSaveNow()
    const blob = JSON.parse(data.store.get(STATE_KEY) || '{}')
    expect(blob.epic_coins).toBe(123)
  })
})

describe('coin persist throttle — 2.5s max-wait', () => {
  it('forces a localStorage write within ~2.5s of a continuous change stream', async () => {
    vi.useFakeTimers()
    try {
      const { setState } = await import('@/use/useEpicState')
      // Coins tick every 100ms — faster than the 200ms trailing debounce, so a
      // pure debounce would never fire. The max-wait must force a write by 2.5s.
      for (let t = 100; t <= 2000; t += 100) {
        setState('spinner_coins', t)
        vi.advanceTimersByTime(100)
      }
      expect(window.localStorage.getItem(STATE_KEY)).toBeNull() // not yet (under 2.5s)

      setState('spinner_coins', 2100)
      vi.advanceTimersByTime(600) // cross the 2.5s cap
      expect(window.localStorage.getItem(STATE_KEY)).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
