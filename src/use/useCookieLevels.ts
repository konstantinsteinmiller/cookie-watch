/**
 * Crumb Rush — level table (Design Rev 5 §J, "World 1: Levels 1–6 (Cookie)").
 *
 * Every level is a 30–60s stealth sprint whose difficulty lives entirely in two
 * numbers: how long the Cat sleeps (Green Light) and how long it watches (Red
 * Light). Levels 1–6 are hand-authored from the design doc; past level 6 the
 * table extrapolates so the campaign keeps going.
 *
 * Rev 6 gives the whole opening run (levels 1–4) the full 60s clock — the Cat's
 * rhythm, not the stopwatch, is what should be teaching the player here.
 *
 * `pass` / `perfect` / `platinum` are CHUNK VALUES (not item counts) — a burnt
 * chunk is worth 0.5, a Gold Piece 1, a Gold Nugget 2 — so level 2's "8" is the
 * six cookie chunks plus the nugget's 2.
 */
export interface LevelConfig {
  /** Stage time limit, seconds. */
  time: number
  /** Asleep (Green Light) window(s), ms. More than one entry = the Cat picks
   *  one at random each nap (level 6, "The Trickster"). */
  green: number[]
  /** Awake (Red Light) window, ms. */
  red: number
  /** Chunks the dessert node holds (the "6/6" on the Dessert Node UI). */
  chunks: number
  /** Chunk value to deposit for a 1-star Pass. */
  pass: number
  /** Chunk value to deposit for a 3-star Perfect. */
  perfect: number
  /** Chunk value for the Platinum clear. 0 = unreachable (no nugget here). */
  platinum: number
  /** A Gold Nugget hides under the dessert, exposed once it's fully harvested. */
  gold: boolean
  /** Level 1's simplified small node (the "Mini Cookie Dessert"). */
  mini: boolean
}

const WORLD_1: readonly LevelConfig[] = [
  // 1 — Tutorial. A mini cookie: three chunks, one trip, no nugget.
  { time: 60, green: [3000], red: 2300, chunks: 3, pass: 1, perfect: 3, platinum: 0, gold: false, mini: true },
  // 2 — Bigger Cookie & Gold Nugget.
  { time: 60, green: [3000], red: 2300, chunks: 6, pass: 2, perfect: 6, platinum: 8, gold: true, mini: false },
  // 3 — Speed Test.
  { time: 60, green: [2000], red: 1800, chunks: 6, pass: 3, perfect: 6, platinum: 8, gold: true, mini: false },
  // 4 — Balanced Rhythm.
  { time: 60, green: [3000], red: 3000, chunks: 6, pass: 3, perfect: 6, platinum: 8, gold: true, mini: false },
  // 5 — Suspense (then the Eating Frenzy).
  { time: 45, green: [4300], red: 2300, chunks: 6, pass: 3, perfect: 6, platinum: 8, gold: true, mini: false },
  // 6 — The Trickster: a 1.2s fakeout nap or a 3.2s long window, at random.
  { time: 45, green: [1200, 3200], red: 3000, chunks: 6, pass: 3, perfect: 6, platinum: 8, gold: true, mini: false }
]

/** Time limits past the authored levels cycle the doc's allowed values. */
const EXTRA_TIMES = [45, 30, 60, 45]

/** Config for a level. Levels 1–6 are authored; 7+ extrapolate the curve. */
export const levelConfig = (level: number): LevelConfig => {
  const n = Math.max(1, Math.floor(level))
  const authored = WORLD_1[n - 1]
  if (authored) return authored

  // Past World 1 the Cat naps shorter and watches longer, and the desserts grow.
  const over = n - 6
  const green = Math.max(1200, 3000 - over * 120)
  const red = Math.min(4000, 2600 + over * 100)
  const chunks = Math.min(12, 6 + Math.floor(over / 3))
  return {
    time: EXTRA_TIMES[over % EXTRA_TIMES.length]!,
    green: [green, Math.round(green * 0.55)],   // every later level is a trickster
    red,
    chunks,
    pass: Math.max(1, Math.ceil(chunks / 2)),
    perfect: chunks,
    platinum: chunks + 2,
    gold: true,
    mini: false
  }
}

/** The Eating Frenzy mini-game triggers after completing every 5th level (§I). */
export const isFrenzyLevel = (level: number): boolean => Math.max(1, Math.floor(level)) % 5 === 0
