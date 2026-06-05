// Deterministic RNG for gameplay. Uses mulberry32 — 32-bit seed, ~2^32
// period, a handful of ns per call. Non-crypto, which is exactly right
// for physics/spawn decisions where both PvP peers must compute the same
// sequence.
//
// Rules of thumb for callers:
//   - Use `matchRng()` everywhere inside the physics tick and any RNG-
//     driven state mutation that affects gameplay (powerup spawns, stat
//     picks, anything hashed for state-check).
//   - Plain `Math.random()` stays for presentation-only rolls (particle
//     angles, sound-variant pick, ghost-NPC generation outside a match).
//   - The host seeds the RNG when starting a PvP match and broadcasts
//     the seed so both peers reproduce the same sequence.

let _state = 1

/** Reseed with an explicit 32-bit value. Host→guest seed broadcast uses this. */
export const seedMatchRng = (seed: number): void => {
  // 0 is a fixed point for mulberry32; coerce to 1 so the sequence isn't stuck.
  _state = (seed >>> 0) || 1
}

/** Reseed with a fresh random seed and return it (so the host can broadcast). */
export const seedMatchRngRandom = (): number => {
  const seed = (Math.random() * 0x100000000) >>> 0 || 1
  _state = seed
  return seed
}

/** [0, 1) — drop-in replacement for Math.random() in gameplay paths. */
export const matchRng = (): number => {
  let t = (_state = (_state + 0x6d2b79f5) >>> 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
