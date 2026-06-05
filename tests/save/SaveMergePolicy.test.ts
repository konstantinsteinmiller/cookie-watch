import { describe, expect, it } from 'vitest'
import {
  applyBonusCoins,
  computeMeta,
  decideMerge,
  parseMeta,
  SAVE_KEYS,
  SCHEMA_VERSION,
  serializeMeta,
  type SaveMeta
} from '@/utils/save/SaveMergePolicy'

// Tiny in-memory snapshot reader used by every test below. Lets each
// scenario describe its localStorage state as a plain object literal.
const reader = (snap: Record<string, string>): { get: (k: string) => string | null } => ({
  get: (k: string) => (k in snap ? snap[k]! : null)
})

const upgradesJson = (levels: Record<string, number> = {}): string =>
  JSON.stringify({ levels })

describe('SaveMergePolicy.computeMeta', () => {
  it('returns score=500 for a fresh-defaults snapshot (stage 1, nothing else)', () => {
    const meta = computeMeta(reader({}), '2026-04-27T10:00:00Z')
    expect(meta).toEqual({
      savedAt: '2026-04-27T10:00:00Z',
      progressScore: 500,
      schemaVersion: SCHEMA_VERSION,
      maxStage: 1
    })
  })

  it('counts stage * 500', () => {
    const meta = computeMeta(reader({ [SAVE_KEYS.STAGE]: '7' }))
    expect(meta.progressScore).toBe(7 * 500)
    expect(meta.maxStage).toBe(7)
  })

  it('clamps stage at 1 when storage has 0 / negative / garbage', () => {
    expect(computeMeta(reader({ [SAVE_KEYS.STAGE]: '0' })).progressScore).toBe(500)
    expect(computeMeta(reader({ [SAVE_KEYS.STAGE]: '-3' })).progressScore).toBe(500)
    expect(computeMeta(reader({ [SAVE_KEYS.STAGE]: 'abc' })).progressScore).toBe(500)
  })

  it('counts every upgrade level at 150 each', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.STAGE]: '1',
      [SAVE_KEYS.UPGRADES]: upgradesJson({ maxLife: 3, chainLength: 2, sawDamage: 5 })
    }))
    // stage 1*500 + 10 levels * 150 = 500 + 1500 = 2000
    expect(meta.progressScore).toBe(2000)
  })

  it('ignores negative / non-numeric upgrade values defensively', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.UPGRADES]: JSON.stringify({
        levels: { maxLife: -2, chainLength: 'broken', sawDamage: 4, coinMagnetMs: NaN, rotationSpeed: 3 }
      })
    }))
    // Only `sawDamage: 4` and `rotationSpeed: 3` count → 7 * 150 = 1050; +500 stage = 1550
    expect(meta.progressScore).toBe(1550)
  })

  it('combines stage + upgrades per the formula', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.STAGE]: '12',
      [SAVE_KEYS.UPGRADES]: upgradesJson({ maxLife: 5, chainLength: 5 })
    }))
    // 12*500 + 10*150
    expect(meta.progressScore).toBe(6000 + 1500)
    expect(meta.maxStage).toBe(12)
  })

  it('survives malformed JSON in upgrades key', () => {
    const meta = computeMeta(reader({
      [SAVE_KEYS.STAGE]: '3',
      [SAVE_KEYS.UPGRADES]: '{not json'
    }))
    expect(meta.progressScore).toBe(3 * 500)
  })
})

describe('SaveMergePolicy.parseMeta / serializeMeta', () => {
  it('round-trips a valid meta blob', () => {
    const meta: SaveMeta = {
      savedAt: '2026-04-27T18:30:00Z',
      progressScore: 1234,
      schemaVersion: SCHEMA_VERSION,
      maxStage: 4
    }
    expect(parseMeta(serializeMeta(meta))).toEqual(meta)
  })

  it('returns null for null / empty / non-string inputs', () => {
    expect(parseMeta(null)).toBeNull()
    expect(parseMeta(undefined)).toBeNull()
    expect(parseMeta('')).toBeNull()
  })

  it('returns null for malformed JSON', () => {
    expect(parseMeta('{nope')).toBeNull()
  })

  it('returns null when required fields are missing or wrong-typed', () => {
    expect(parseMeta(JSON.stringify({}))).toBeNull()
    expect(parseMeta(JSON.stringify({ savedAt: 'x', progressScore: 'oops', schemaVersion: 1, maxStage: 1 }))).toBeNull()
    expect(parseMeta(JSON.stringify({ savedAt: 'x', progressScore: NaN, schemaVersion: 1, maxStage: 1 }))).toBeNull()
  })
})

describe('SaveMergePolicy.decideMerge', () => {
  const meta = (overrides: Partial<SaveMeta>): SaveMeta => ({
    savedAt: '2026-04-27T12:00:00Z',
    progressScore: 0,
    schemaVersion: SCHEMA_VERSION,
    maxStage: 1,
    ...overrides
  })

  it('returns \'local-only\' when remote is null (network unreachable etc.)', () => {
    expect(decideMerge(meta({ progressScore: 5000 }), null)).toEqual({ kind: 'local-only' })
  })

  it('returns \'remote-only\' when local is null (truly fresh device)', () => {
    expect(decideMerge(null, meta({ progressScore: 5000 }))).toEqual({ kind: 'remote-only' })
  })

  it('returns \'remote-wins\' with bonus when remote score > local score AND local had progress', () => {
    const local = meta({ progressScore: 2000, maxStage: 4 })
    const remote = meta({ progressScore: 8000, maxStage: 12 })
    // bonus = remote.maxStage * 50 = 12 * 50 = 600
    expect(decideMerge(local, remote)).toEqual({ kind: 'remote-wins', bonusCoins: 600 })
  })

  it('returns \'remote-wins\' with NO bonus when local was completely empty (score 0)', () => {
    const local = meta({ progressScore: 0, maxStage: 1 })
    const remote = meta({ progressScore: 8000, maxStage: 12 })
    expect(decideMerge(local, remote)).toEqual({ kind: 'remote-wins', bonusCoins: 0 })
  })

  it('returns \'local-wins\' when local score > remote (player advanced offline)', () => {
    const local = meta({ progressScore: 8000 })
    const remote = meta({ progressScore: 2000 })
    expect(decideMerge(local, remote)).toEqual({ kind: 'local-wins' })
  })

  it('returns \'remote-wins\' (bonus 0) when scores tie but remote savedAt is newer', () => {
    const local = meta({ progressScore: 5000, savedAt: '2026-04-27T10:00:00Z' })
    const remote = meta({ progressScore: 5000, savedAt: '2026-04-27T11:00:00Z' })
    expect(decideMerge(local, remote)).toEqual({ kind: 'remote-wins', bonusCoins: 0 })
  })

  it('returns \'tie-keep-local\' when scores AND timestamps match', () => {
    const local = meta({ progressScore: 5000, savedAt: '2026-04-27T10:00:00Z' })
    const remote = meta({ progressScore: 5000, savedAt: '2026-04-27T10:00:00Z' })
    expect(decideMerge(local, remote)).toEqual({ kind: 'tie-keep-local' })
  })

  it('returns \'tie-keep-local\' when scores match and local savedAt is newer', () => {
    const local = meta({ progressScore: 5000, savedAt: '2026-04-27T11:00:00Z' })
    const remote = meta({ progressScore: 5000, savedAt: '2026-04-27T10:00:00Z' })
    expect(decideMerge(local, remote)).toEqual({ kind: 'tie-keep-local' })
  })

  it('falls back to \'tie-keep-local\' when timestamps are unparseable on a score tie', () => {
    const local = meta({ progressScore: 5000, savedAt: 'garbage' })
    const remote = meta({ progressScore: 5000, savedAt: 'also garbage' })
    expect(decideMerge(local, remote)).toEqual({ kind: 'tie-keep-local' })
  })
})

describe('SaveMergePolicy.applyBonusCoins', () => {
  it('adds the bonus to whatever coin total is in storage', () => {
    expect(applyBonusCoins(reader({ [SAVE_KEYS.COINS]: '300' }), 100)).toBe('400')
  })

  it('treats missing / unparseable coin storage as zero', () => {
    expect(applyBonusCoins(reader({}), 250)).toBe('250')
    expect(applyBonusCoins(reader({ [SAVE_KEYS.COINS]: 'oops' }), 250)).toBe('250')
  })

  it('clamps negative bonuses to zero (defensive)', () => {
    expect(applyBonusCoins(reader({ [SAVE_KEYS.COINS]: '500' }), -100)).toBe('500')
  })
})
