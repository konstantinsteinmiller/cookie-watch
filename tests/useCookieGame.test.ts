import { describe, it, expect, beforeEach } from 'vitest'
import * as G from '@/use/useCookieGame'

// Pure-logic + simulated-run coverage for the Cookie Watch engine. The module
// is a singleton; `resetForStage()` re-seeds the run state between tests.

const advance = (ms = 200): void => G.step(ms)

/** Drive one input toward clearing the stage: press the prompted direction, or
 *  grab/leave at the cookie. `advance` first so presses aren't flagged hasty. */
const playOneInput = (): void => {
  const kind = G.pendingKind.value
  advance()
  if (kind === 'move' || kind === 'trap') {
    const d = G.expectedDir.value
    if (d) G.pressDir(d)
  } else if (kind === 'interact') {
    if (G.chunksCarried.value < 6 && G.game.chunksInCookie > 0) G.pressInteract()
    else G.pressDir('up') // initiate the return trip
  }
}

beforeEach(() => {
  localStorage.clear()
  G.resetForStage()
})

describe('stage configuration', () => {
  it('scales zones 4 → 6 every two stages', () => {
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

  it('shrinks the cat-nap timer with a floor of 45s', () => {
    expect(G.stageTimeForStage(1)).toBe(90)
    expect(G.stageTimeForStage(2)).toBe(85)
    expect(G.stageTimeForStage(20)).toBe(45)
  })
})

describe('weight + greedy tables (GDD)', () => {
  it('maps carried chunks → taps per zone', () => {
    expect(G.tapsForChunks(0)).toBe(1)
    expect(G.tapsForChunks(2)).toBe(1)
    expect(G.tapsForChunks(3)).toBe(2)
    expect(G.tapsForChunks(4)).toBe(2)
    expect(G.tapsForChunks(5)).toBe(3)
    expect(G.tapsForChunks(6)).toBe(3)
  })

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

    let guard = 0
    while (G.phase.value === 'playing' && guard++ < 400) playOneInput()

    expect(G.phase.value).toBe('review')
    expect(G.chunksDeposited.value).toBe(G.cookieTotal.value)
    const r = G.reviewData.value
    expect(r.chunkPoints).toBe(G.cookieTotal.value * 100)
    // A single heavy haul (6 chunks) earns the 1.5× greedy multiplier.
    expect(r.greedyMult).toBeCloseTo(1.5)
    expect(r.daringTotal).toBeGreaterThan(r.chunkPoints)
  })

  it('keeps the cat calm enough to never fail a clean run', () => {
    G.resetForStage()
    G.begin()
    let guard = 0
    while (G.phase.value === 'playing' && guard++ < 400) playOneInput()
    // Reached review (not 'dead') → the cat never caught the mouse.
    expect(G.phase.value).toBe('review')
  })
})

describe('frenzy → win advances the stage', () => {
  it('devours the cookie and flips to won', () => {
    G.resetForStage()
    G.begin()
    let guard = 0
    while (G.phase.value === 'playing' && guard++ < 400) playOneInput()
    expect(G.phase.value).toBe('review')
    G.startFrenzy()
    expect(G.phase.value).toBe('frenzy')
    for (let i = 0; i < 40 && G.phase.value === 'frenzy'; i++) { G.frenzyTap(); advance(40) }
    expect(G.phase.value).toBe('won')
  })
})
