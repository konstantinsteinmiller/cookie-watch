import { beforeEach, describe, expect, it, vi } from 'vitest'

// The modal-open signal that drives the CrazyGames gameplayStart/gameplayStop
// lifecycle: `MawScene` treats gameplay as active only while a match is
// running (`phase === 'playing'`) AND no modal is open. This covers the
// refcount semantics that let stacked modals compose correctly.

beforeEach(() => {
  vi.resetModules()
})

describe('useModalState', () => {
  it('tracks open modals and only clears once the LAST one closes (stacked)', async () => {
    const { isAnyModalOpen, acquireModalOpen } = await import('@/use/useModalState')
    expect(isAnyModalOpen.value).toBe(false)

    const releaseA = acquireModalOpen()
    expect(isAnyModalOpen.value).toBe(true)

    const releaseB = acquireModalOpen() // a second modal stacks on top
    expect(isAnyModalOpen.value).toBe(true)

    releaseA()
    expect(isAnyModalOpen.value).toBe(true) // B still open → gameplay stays stopped

    releaseB()
    expect(isAnyModalOpen.value).toBe(false) // last one closed → gameplay can resume
  })

  it('release is idempotent and never drives the count negative', async () => {
    const { isAnyModalOpen, acquireModalOpen } = await import('@/use/useModalState')

    const release = acquireModalOpen()
    release()
    release() // double release must not underflow
    expect(isAnyModalOpen.value).toBe(false)

    // A fresh acquire after an over-release still flips the signal correctly.
    const release2 = acquireModalOpen()
    expect(isAnyModalOpen.value).toBe(true)
    release2()
    expect(isAnyModalOpen.value).toBe(false)
  })
})
