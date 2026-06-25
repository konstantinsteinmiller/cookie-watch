import { describe, it, expect, beforeEach } from 'vitest'
import * as G from '@/use/useCookieGame'

// Pure-logic + simulated-run coverage for the Cookie Watch engine. The module
// is a singleton; `resetForStage()` re-seeds the run state between tests.

const TICK = 60

/** Drive a careful, perfect-reflex run (Rev 3): sneak toward the goal only while
 *  the cat is asleep, freeze the instant it stirs/wakes, TAP the cookie to crack
 *  a full haul free, then carry it home. At the cookie, hiding means dropping
 *  into the play-dead crouch (`playDeadAtCookie`) since you can't freeze-by-
 *  stopping up close. Mirrors how the controls feed the engine. */
const playSmartRun = (): void => {
  let current: G.Dir | null = null
  const hold = (dir: G.Dir | null): void => {
    if (current === dir) return
    if (current) G.releaseDir(current)
    if (dir) G.pressDir(dir)
    current = dir
  }
  let guard = 0
  while (G.phase.value === 'playing' && guard++ < 20_000) {
    const g = G.game
    const asleep = G.catStateRef.value === 'asleep'
    const atCookie = g.pos >= 0.93
    const sackFull = g.chunksCarried >= 6 || g.chunksInCookie <= 0
    if (!asleep) {
      hold(null)
      if (atCookie) G.playDeadAtCookie()   // crouch to hide right at the cookie
      G.step(TICK)
      continue
    }
    if (sackFull && g.chunksCarried > 0) {
      hold('left')
      G.step(TICK)                              // carry the full haul home
    } else if (atCookie) {
      hold(null)
      G.tapCookie()             // tap to crack a chunk free, one tap at a time
      G.step(TICK)
    } else {
      hold('right')
      G.step(TICK)                            // sneak to the cookie
    }
  }
  hold(null)
}

beforeEach(() => {
  localStorage.clear()
  G.resetForStage()
})

describe('stage configuration', () => {
  it('scales the legacy zone hint 4 → 6 every two stages', () => {
    expect(G.zoneCountForStage(1)).toBe(4)
    expect(G.zoneCountForStage(2)).toBe(4)
    expect(G.zoneCountForStage(3)).toBe(5)
    expect(G.zoneCountForStage(5)).toBe(6)
    expect(G.zoneCountForStage(12)).toBe(6)
  })

  it('scales cookie chunks 6 → 18 and caps', () => {
    expect(G.cookieChunksForStage(1)).toBe(6)
    expect(G.cookieChunksForStage(7)).toBe(12)
    expect(G.cookieChunksForStage(13)).toBe(18)
    expect(G.cookieChunksForStage(30)).toBe(18)
  })

  it('shrinks the time limit with a floor of 45s', () => {
    expect(G.stageTimeForStage(1)).toBe(90)
    expect(G.stageTimeForStage(2)).toBe(85)
    expect(G.stageTimeForStage(20)).toBe(45)
  })
})

describe('weight + greedy tables (GDD)', () => {
  it('maps run chunks → greedy multiplier contribution', () => {
    expect(G.greedyMultForChunks(2)).toBe(0)
    expect(G.greedyMultForChunks(3)).toBe(1.25)
    expect(G.greedyMultForChunks(4)).toBe(1.3)
    expect(G.greedyMultForChunks(5)).toBe(1.4)
    expect(G.greedyMultForChunks(6)).toBe(1.5)
  })
})

describe('a full clean run', () => {
  it('deposits every chunk and reaches the Level Review with scored bonuses', () => {
    G.resetForStage()
    G.begin()
    expect(G.phase.value).toBe('playing')

    playSmartRun()

    expect(G.phase.value).toBe('review')
    expect(G.chunksDeposited.value).toBe(G.cookieTotal.value)
    const r = G.reviewData.value
    expect(r.chunkPoints).toBe(G.cookieTotal.value * 100)
    // A single heavy haul (6 chunks) earns the 1.5× greedy multiplier.
    expect(r.greedyMult).toBeCloseTo(1.5)
    expect(r.daringTotal).toBeGreaterThan(r.chunkPoints)
  })

  it('never gets caught when freezing the moment the cat wakes', () => {
    G.resetForStage()
    G.begin()
    playSmartRun()
    expect(G.phase.value).toBe('review')
  })
})

describe('the cat catches a careless mouse', () => {
  it('stomps the Mouse caught running while awake', () => {
    G.resetForStage()
    G.begin()
    // Force the cat awake, then keep sneaking regardless → spotted & stomped.
    G.game.pos = 0.5
    G.spawnTestCratePile()        // slam awareness to 100 so the cat wakes now
    let guard = 0
    while (G.phase.value === 'playing' && guard++ < 400) {
      G.pressDir('right')         // keep moving into the open
      G.step(TICK)
    }
    expect(G.phase.value).toBe('dead')
    expect(G.lossCause.value).toBe('caught')
  })
})

describe('frenzy → win advances the stage', () => {
  it('devours the cookie and flips to won', () => {
    G.resetForStage()
    G.begin()
    playSmartRun()
    expect(G.phase.value).toBe('review')
    G.startFrenzy()
    expect(G.phase.value).toBe('frenzy')
    for (let i = 0; i < 40 && G.phase.value === 'frenzy'; i++) {
      G.frenzyTap()
      G.step(40)
    }
    expect(G.phase.value).toBe('won')
  })
})
