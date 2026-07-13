import { describe, it, expect, beforeEach } from 'vitest'
import * as G from '@/use/useCookieGame'
import { levelConfig, isFrenzyLevel } from '@/use/useCookieLevels'
import useEpicProgress from '@/use/useEpicProgress'

// Pure-logic + simulated-run coverage for the Crumb Rush engine (Design Rev 5).
// The module is a singleton; `resetForStage()` re-seeds the run state between
// tests, reading the level to build from the campaign stage.

const TICK = 50
const progress = useEpicProgress()

/** Advance the clock while holding nothing (the Mouse plays dead — always safe). */
const idle = (ms: number): void => {
  G.releaseAllDirs()
  for (let t = 0; t < ms; t += TICK) G.step(TICK)
}

/**
 * Re-seed the engine on a specific level and play dead through the Cat's opening
 * Red Light (Rev 6 §C: the cycle now OPENS on a watch, not a nap).
 *
 * Waiting it out leaves every test where it used to start — on the first frame of
 * the Cat's first full Green Light — so they still assert their mechanic inside a
 * clean, cat-free window instead of racing an eye-laser.
 */
const startLevel = (level: number): void => {
  progress.stage.value = level
  G.resetForStage()
  G.begin()
  expect(G.catStateRef.value).toBe('awake')            // the opening Red Light
  for (let t = 0; t < 10_000 && G.catStateRef.value !== 'asleep'; t += TICK) idle(TICK)
  expect(G.catStateRef.value).toBe('asleep')
}

/**
 * Run the sim until `done()` or the guard trips. Returns true if `done()` hit.
 *
 * `dash` makes the sim play the way a good player does: engaging a direction with
 * a double-tap so the Mouse bursts at DASH_SPEED instead of the sneak cruise. Two
 * `pressDir` calls inside the engine's double-tap window is exactly what a
 * real double-tap-and-hold delivers.
 */
const until = (
  done: () => boolean, hold: () => G.Dir | null, maxMs = 60_000, dash = false
): boolean => {
  let held: G.Dir | null = null
  for (let t = 0; t < maxMs; t += TICK) {
    if (done()) break
    const want = hold()
    if (want !== held) {
      if (held) G.releaseDir(held)
      if (want) {
        G.pressDir(want)
        if (dash) G.pressDir(want)   // …and again: that's the dash
      }
      held = want
    }
    G.step(TICK)
  }
  // Always hand the engine back with nothing held. Leaking a hold across calls
  // would let a later `until` press the OPPOSITE direction on top of it, and the
  // two would silently cancel to a net-zero input.
  G.releaseAllDirs()
  return done()
}

/**
 * Drive a perfect-reflex run: only ever move or harvest while the Cat is asleep,
 * and release everything the instant it opens its eyes. Ferry chunks home until
 * the dessert is stripped and the sack is empty, then hold left at the door to
 * take the Safe Exit.
 */
const playSmartRun = (maxMs = 120_000): void => {
  until(
    () => G.phase.value !== 'playing',
    () => {
      const g = G.game
      if (G.catStateRef.value !== 'asleep') return null   // freeze — play dead
      const sackFull = g.slots >= G.MAX_SLOTS
      const nodeEmpty = g.chunksInDessert === 0
      // Head home to bank the haul (and to leave once there's nothing left).
      if (sackFull || (nodeEmpty && !g.goldExposed)) return 'left'
      return 'right'   // walk to the dessert — and, on arrival, harvest it
    },
    maxMs,
    true
  )
}

beforeEach(() => {
  localStorage.clear()
  progress.stage.value = 1
  G.resetForStage()
})

describe('the World 1 level table (§J)', () => {
  it('matches the authored levels 1–6', () => {
    expect(levelConfig(1)).toMatchObject({
      time: 60,
      red: 2300,
      chunks: 3,
      pass: 1,
      perfect: 3,
      gold: false,
      mini: true
    })
    expect(levelConfig(1).green).toEqual([3000])
    expect(levelConfig(2)).toMatchObject({ time: 60, chunks: 6, pass: 2, perfect: 6, platinum: 8, gold: true })
    expect(levelConfig(3)).toMatchObject({ time: 60, red: 1800 })
    expect(levelConfig(3).green).toEqual([2000])
    expect(levelConfig(4)).toMatchObject({ time: 60, red: 3000 })
    // Rev 6: the whole opening run (1–4) gets the full 60s clock.
    expect([1, 2, 3, 4].every((n) => levelConfig(n).time === 60)).toBe(true)
    expect(levelConfig(5).green).toEqual([4300])
    // Level 6, "The Trickster": a 1.2s fakeout or a 3.2s long window, at random.
    expect(levelConfig(6).green).toEqual([1200, 3200])
  })

  it('keeps extrapolating past the authored table', () => {
    const l9 = levelConfig(9)
    expect(l9.chunks).toBeGreaterThanOrEqual(6)
    expect(l9.perfect).toBe(l9.chunks)
    expect(l9.gold).toBe(true)
  })

  it('runs the Eating Frenzy after every 5th level (§I)', () => {
    expect(isFrenzyLevel(5)).toBe(true)
    expect(isFrenzyLevel(10)).toBe(true)
    expect([1, 2, 3, 4, 6, 7].every((n) => !isFrenzyLevel(n))).toBe(true)
  })
})

describe('inventory weight (§B)', () => {
  it('maps filled slots → the Rev 6 speed penalty table', () => {
    expect(G.carrySpeedFactor(0)).toBe(1)       // 0%  — full speed
    expect(G.carrySpeedFactor(1)).toBe(0.85)    // 15% slower
    expect(G.carrySpeedFactor(2)).toBe(0.75)    // 25% slower
    expect(G.carrySpeedFactor(3)).toBe(0.55)    // 45% slower — max load
    expect(G.carrySpeedFactor(1.5)).toBe(0.75)  // a lone Gold Piece
  })
})

describe('the opening Red Light (Rev 6 §C)', () => {
  it('begins the run on a watch, not a nap — and the doorway makes it free', () => {
    progress.stage.value = 1
    G.resetForStage()
    G.begin()
    expect(G.catStateRef.value).toBe('awake')
    expect(G.mustFreeze.value).toBe(true)

    // The Mouse opens the level tucked in its door, so the watch costs nothing:
    // sit it out and the Cat naps without ever having charged.
    idle(levelConfig(1).red + 500)
    expect(G.catStateRef.value).toBe('asleep')
    expect(G.phase.value).toBe('playing')
    expect(G.game.charging).toBe(false)
  })
})

/** Drop the Mouse straight onto the plate. The Cat's first nap is the level's
 *  full Green Light, so a freshly-begun level gives a clean, cat-free window to
 *  assert the harvest mechanics in isolation. */
const teleportToDessert = (): void => {
  G.game.pos = 0.95
  G.step(0)
}

describe('harvesting (§D)', () => {
  it('takes 1.5s of holding into the dessert to free one chunk', () => {
    startLevel(1)
    teleportToDessert()
    expect(G.game.atDessert).toBe(true)
    expect(G.game.slots).toBe(0)

    // Hold INTO the dessert: the ring fills, and the chunk pops at 1.5s.
    G.pressDir('right')
    for (let t = 0; t < 1400; t += TICK) G.step(TICK)
    expect(G.game.harvestT).toBeGreaterThan(0.8)
    expect(G.game.slots).toBe(0)                 // not yet — the ring is still running

    for (let t = 0; t < 200; t += TICK) G.step(TICK)
    expect(G.game.slots).toBe(1)                 // 0/3 → 1/3
    expect(G.game.chunksInDessert).toBe(2)       // 3/3 → 2/3
  })

  it('cancels the ring when the player walks away', () => {
    startLevel(1)
    teleportToDessert()
    G.pressDir('right')
    for (let t = 0; t < 900; t += TICK) G.step(TICK)
    expect(G.game.harvestT).toBeGreaterThan(0.4)

    G.releaseDir('right')
    G.pressDir('left')                            // walk off the plate
    for (let t = 0; t < 600; t += TICK) G.step(TICK)
    expect(G.game.atDessert).toBe(false)
    expect(G.game.harvestT).toBe(0)
    expect(G.game.slots).toBe(0)                  // nothing was extracted
  })

  it('PAUSES the ring — it does not cancel it — when the input is just released', () => {
    startLevel(1)
    teleportToDessert()
    G.pressDir('right')
    for (let t = 0; t < 900; t += TICK) G.step(TICK)
    const banked = G.game.harvestT
    expect(banked).toBeGreaterThan(0.4)

    // Letting go is how you play dead through a Red Light. If that wiped the
    // ring, a 1.5s harvest could never straddle the Cat's 2.3s watch and the
    // whole harvest loop would collapse. Standing still holds your progress.
    idle(2500)
    expect(G.game.atDessert).toBe(true)
    expect(G.game.harvestT).toBeCloseTo(banked, 5)

    // Resume, and the remainder of the countdown finishes the chunk off.
    G.pressDir('right')
    for (let t = 0; t < 700; t += TICK) G.step(TICK)
    expect(G.game.slots).toBe(1)
  })

  it('stops harvesting at the 3-slot carry cap', () => {
    startLevel(2)                                 // a 6-chunk cookie
    const harvest = () => (G.catStateRef.value === 'asleep' ? ('right' as G.Dir) : null)
    until(() => G.game.slots >= G.MAX_SLOTS, harvest, 30_000)
    expect(G.game.slots).toBe(G.MAX_SLOTS)
    expect(G.game.chunksInDessert).toBe(3)        // only 3 came out — the sack is full

    // Keep holding into it: the cap refuses to let a fourth chunk loose.
    until(() => false, harvest, 6000)
    expect(G.game.slots).toBe(G.MAX_SLOTS)
    expect(G.game.chunksInDessert).toBe(3)
  })
})

describe('the Cat: grace buffer, laser and kill (§C)', () => {
  it('lets the Mouse off if every input is released inside the 0.3s buffer', () => {
    startLevel(1)
    G.game.pos = 0.5
    G.pressDir('right')
    // Wake the Cat, then drop the input immediately — inside the grace window.
    G.spawnTestCratePile()
    expect(G.catStateRef.value).toBe('awake')
    G.releaseAllDirs()

    idle(4000)
    expect(G.phase.value).toBe('playing')          // never even charged
    expect(G.game.charging).toBe(false)
  })

  it('charges the laser at a Mouse still moving after the buffer', () => {
    startLevel(1)
    G.game.pos = 0.5
    G.spawnTestCratePile()
    G.pressDir('right')
    // Hold straight through the 0.3s buffer.
    for (let t = 0; t < 500; t += TICK) G.step(TICK)
    expect(G.game.charging).toBe(true)
    expect(G.mustRun.value).toBe(true)
  })

  it('vaporizes a Mouse that freezes during the charge (a locked-on direct hit)', () => {
    startLevel(1)
    G.game.pos = 0.5
    G.spawnTestCratePile()
    // Trip the charge, then go completely still for the whole 1.8s wind-up. With
    // a motionless target the beam has a locked coordinate — a guaranteed hit,
    // no 80/20 roll. Freezing is NOT a hiding place once the cannon is warm.
    until(() => G.game.charging, () => 'right', 2000)
    expect(G.game.charging).toBe(true)

    idle(4000)
    expect(G.phase.value).toBe('dead')
    expect(G.lossCause.value).toBe('caught')
  })

  it('never fires on a Mouse safe in the doorway', () => {
    startLevel(1)
    G.game.pos = 0                                 // sitting in the Mouse Door
    G.spawnTestCratePile()
    // Scrabble against the back of the hole for three full seconds. Under the
    // open eyes of the Cat this would be a death sentence anywhere else.
    until(() => false, () => 'left', 3000)
    expect(G.game.charging).toBe(false)
    expect(G.phase.value).toBe('playing')
  })
})

describe('depositing, ratings and scoring (§E/§H)', () => {
  it('clears level 1 with 3 stars for a perfect haul', () => {
    startLevel(1)
    playSmartRun()

    expect(G.phase.value).toBe('review')
    expect(G.depositedValue.value).toBe(3)         // the whole mini cookie
    const r = G.reviewData.value
    expect(r.stars).toBe(3)
    expect(r.platinum).toBe(false)                 // level 1 has no Gold Nugget
    // A 3-chunk haul is the 600pt tier, and a full sack pays the 1.2× greedy bonus.
    expect(r.delivery).toBe(720)
    expect(r.greedyBonus).toBe(120)
    expect(r.daringTotal).toBe(720)
  })

  it('fails the level when the clock beats the minimum requirement', () => {
    startLevel(1)
    idle(levelConfig(1).time * 1000 + 2000)        // never leave the door
    expect(G.phase.value).toBe('dead')
    expect(G.lossCause.value).toBe('timeout')
    expect(G.reviewData.value.stars).toBe(0)
  })
})

describe('the Gold Nugget (§F/§G)', () => {
  it('will not be picked up unless the sack is completely empty', () => {
    startLevel(2)
    // Strip the cookie bare, ferrying 3 chunks at a time.
    until(() => G.game.chunksInDessert === 0 && G.game.slots > 0,
      () => (G.catStateRef.value !== 'asleep' ? null
        : G.game.slots >= G.MAX_SLOTS ? 'left' : 'right'),
      60_000, true)
    expect(G.game.goldExposed).toBe(true)
    expect(G.game.slots).toBeGreaterThan(0)

    // Standing at the exposed Nugget with a loaded sack extracts nothing (§B).
    until(() => false, () => (G.catStateRef.value === 'asleep' ? 'right' : null), 4000)
    expect(G.game.items.includes('gold')).toBe(false)
  })

  it('triggers the Red Light Frenzy the moment it is taken', () => {
    startLevel(2)
    playSmartRunUntilGoldReady()
    expect(G.game.goldExposed).toBe(true)
    expect(G.game.slots).toBe(0)
    expect(G.enraged.value).toBe(false)

    // Now go prise it out with an empty sack.
    until(() => G.game.items.includes('gold'),
      () => (G.catStateRef.value === 'asleep' ? 'right' : null), 40_000, true)

    expect(G.game.items).toContain('gold')
    expect(G.game.slots).toBe(3)                   // it eats the whole inventory
    expect(G.enraged.value).toBe(true)
    // The clock resets and locks to a strict, uniform 0:50 escape window (§G).
    expect(G.timeLeft.value).toBeGreaterThan(49)
    expect(G.timeLeft.value).toBeLessThanOrEqual(50)
  })
})

/** Strip level 2's cookie and bank every chunk, stopping with the Nugget exposed
 *  and the sack empty — the exact state the §G "player choice" hinges on. */
const playSmartRunUntilGoldReady = (): void => {
  until(
    () => G.game.chunksInDessert === 0 && G.game.slots === 0 && G.game.atDoor,
    () => {
      if (G.catStateRef.value !== 'asleep') return null
      if (G.game.slots >= G.MAX_SLOTS) return 'left'
      if (G.game.chunksInDessert === 0) return 'left'   // bank what's left
      return 'right'
    },
    60_000,
    true
  )
}

describe('the Safe Exit (§G)', () => {
  it('leaves the level in the player\'s hands once the last chunks are banked', () => {
    startLevel(2)
    playSmartRunUntilGoldReady()
    expect(G.game.canExit).toBe(true)          // the door is open…
    expect(G.phase.value).toBe('playing')      // …but it does NOT close by itself

    // Sneak a little way back out, change your mind, and walk home on a single
    // unbroken hold — the hold that CARRIES him home must never cash the level in.
    until(() => G.game.pos > 0.12,
      () => (G.catStateRef.value === 'asleep' ? 'right' : null), 20_000)
    G.releaseAllDirs()
    G.pressDir('left')
    for (let t = 0; t < 6000; t += TICK) G.step(TICK)

    expect(G.game.atDoor).toBe(true)
    expect(G.game.exitT).toBe(0)               // the hold predates the open door
    expect(G.phase.value).toBe('playing')      // the Nugget is still his to take
    expect(G.game.goldExposed).toBe(true)
  })

  it('ends the level on a fresh back-press held in the doorway', () => {
    startLevel(2)
    playSmartRunUntilGoldReady()

    G.pressDir('left')                         // a deliberate "I'm done" — 0.8s
    for (let t = 0; t < 1200; t += TICK) G.step(TICK)
    expect(G.phase.value).toBe('review')
    expect(G.reviewData.value.stars).toBe(3)   // all six chunks banked, no Nugget
    expect(G.reviewData.value.platinum).toBe(false)
  })

  it('opens the door as soon as the haul already clears the Pass target', () => {
    startLevel(2)                              // pass 2 · perfect 6 · 6 chunks
    const asleep = (): boolean => G.catStateRef.value === 'asleep'
    until(() => G.game.slots >= G.MAX_SLOTS, () => (asleep() ? 'right' : null), 60_000, true)
    until(() => G.depositedValue.value >= 3, () => (asleep() ? 'left' : null), 60_000, true)

    expect(G.game.chunksInDessert).toBe(3)     // half the cookie is still out there
    expect(G.game.canExit).toBe(true)          // …and the player may leave anyway

    G.pressDir('left')
    for (let t = 0; t < 1200; t += TICK) G.step(TICK)
    expect(G.phase.value).toBe('review')
    expect(G.reviewData.value.stars).toBe(1)   // a Pass — greed left on the table
  })
})

describe('panic drops and burnt chunks (§F)', () => {
  it('drops the last carried item onto the floor and re-loots it', () => {
    startLevel(1)
    until(() => G.game.slots > 0,
      () => (G.catStateRef.value === 'asleep' ? 'right' : null))
    expect(G.game.slots).toBe(1)

    G.dropItem()
    expect(G.game.slots).toBe(0)
    expect(G.game.ground.length).toBe(1)
    expect(G.game.ground[0]!.kind).toBe('chunk')

    // Field debris persists and can be walked back over.
    idle(3000)
    expect(G.game.ground.length).toBe(1)           // chunks never despawn
  })
})

describe('the Eating Frenzy (§I)', () => {
  it('chokes the Mouse out after ten unbroken mashes', () => {
    startLevel(5)
    G.startFrenzy()
    expect(G.phase.value).toBe('frenzy')

    // +10% true choke per mash, with no time to decay between them.
    for (let i = 0; i < 10; i++) G.frenzyTap()
    expect(G.chokingRef.value).toBe(true)

    // A coughing fit paralyzes him for 2.5s — taps in that window do nothing.
    const devoured = G.frenzyPct.value
    G.frenzyTap()
    expect(G.frenzyPct.value).toBe(devoured)

    for (let t = 0; t < 2600; t += TICK) G.step(TICK)
    expect(G.chokingRef.value).toBe(false)
    G.frenzyTap()
    expect(G.frenzyPct.value).toBeGreaterThan(devoured)
  })

  it('zips the Mouse between the five bite coordinates, then resets at 1', () => {
    startLevel(5)
    G.startFrenzy()
    const seen: number[] = []
    for (let i = 0; i < G.FRENZY_ZIPS + 1; i++) {
      G.frenzyTap()
      seen.push(G.game.frenzyZip)
      for (let t = 0; t < 700; t += TICK) G.step(TICK)   // let the choke decay
    }
    expect(seen.slice(0, G.FRENZY_ZIPS)).toEqual([1, 2, 3, 4, 0])
    expect(seen[G.FRENZY_ZIPS]).toBe(1)                  // wrapped back around
  })

  it('devours the dessert and banks the level under rhythm play', () => {
    startLevel(5)
    G.reviewData.value = { ...G.reviewData.value, daringTotal: 1000, stars: 3 }
    G.startFrenzy()
    // A skilled player: burst off the empty meter, then ride just under the
    // choke ceiling, letting the −11%/s decay make room for the next bite.
    for (let t = 0; t < 15_000 && G.phase.value === 'frenzy'; t += TICK) {
      if (!G.chokingRef.value && G.chokePct.value <= 85) G.frenzyTap()
      G.step(TICK)
    }
    expect(G.phase.value).toBe('won')
    expect(G.game.round).toBe(true)                 // cartoonishly round mouse
  })
})
