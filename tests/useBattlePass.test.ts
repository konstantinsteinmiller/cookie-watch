import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

describe('useBattlePass', () => {
  it('seasons start at stage 0 with no claimed rewards', async () => {
    const { default: useBattlePass } = await import('@/use/useBattlePass')
    const bp = useBattlePass()
    expect(bp.unlockedStages.value).toBe(0)
    expect(bp.claimedStages.value).toEqual([])
  })

  it('campaign wins accrue xp and unlock stages', async () => {
    const { default: useBattlePass, BP_XP_PER_STAGE, BP_XP_CAMPAIGN_WIN } = await import('@/use/useBattlePass')
    const bp = useBattlePass()
    const wins = Math.ceil(BP_XP_PER_STAGE / BP_XP_CAMPAIGN_WIN)
    for (let i = 0; i < wins; i++) bp.awardCampaignWin()
    expect(bp.unlockedStages.value).toBeGreaterThanOrEqual(1)
  })

  it('claimStage refuses unlocked-but-already-claimed stages', async () => {
    const { default: useBattlePass, BP_XP_PER_STAGE, BP_XP_CAMPAIGN_WIN } = await import('@/use/useBattlePass')
    const bp = useBattlePass()
    const wins = Math.ceil(BP_XP_PER_STAGE / BP_XP_CAMPAIGN_WIN)
    for (let i = 0; i < wins; i++) bp.awardCampaignWin()
    const result = bp.claimStage(1)
    expect(result).not.toBeNull()
    expect(bp.claimStage(1)).toBeNull()
  })

  it('coin reward grows monotonically across the season', async () => {
    const { bpCoinReward, BP_TOTAL_STAGES } = await import('@/use/useBattlePass')
    let prev = bpCoinReward(1)
    for (let s = 2; s <= BP_TOTAL_STAGES; s++) {
      const cur = bpCoinReward(s)
      expect(cur).toBeGreaterThanOrEqual(prev)
      prev = cur
    }
  })
})
