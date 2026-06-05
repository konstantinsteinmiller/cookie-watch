// Unit tests for the central pause → audio + console-log orchestrator.
//
// This is the single audio-mute driver shared by EVERY build. It watches
// the unified `isGamePaused` gate (the OR of ad-showing / tab-hidden /
// platform-paused / app-modal) and:
//   • suspends audio on the false→true edge,
//   • resumes it on the true→false edge,
//   • owns exactly ONE ref-counted suspend slot (no drift on duplicate
//     pause emissions),
//   • logs both transitions with the active reasons.
//
// `suspendAllAudio` / `resumeAllAudio` are mocked (hoisted spies) so we can
// assert exact call counts — that's what proves the "single slot" property.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { suspendSpy, resumeSpy } = vi.hoisted(() => ({
  suspendSpy: vi.fn(),
  resumeSpy: vi.fn()
}))

vi.mock('@/use/useAssets', () => ({
  suspendAllAudio: suspendSpy,
  resumeAllAudio: resumeSpy
}))

import {
  installGamePauseAudio,
  uninstallGamePauseAudio,
  setPlatformAudioMuted,
  __isAudioSlotHeld,
  __isPlatformAudioMuted
} from '@/use/useGamePauseAudio'
import {
  isAdShowing,
  isVisibilityHidden,
  isGamePaused,
  pauseGame,
  resumeGame,
  acquireAppPause
} from '@/use/useGamePause'
import { isDebug } from '@/use/useMatch'

let infoSpy: ReturnType<typeof vi.spyOn>

const resetGate = () => {
  // Drive every flag back to the running state. resumeGame() clears the
  // platform flag; the ad / visibility refs are public.
  isAdShowing.value = false
  isVisibilityHidden.value = false
  resumeGame()
  expect(isGamePaused.value).toBe(false)
}

beforeEach(() => {
  isDebug.value = true // the pause/resume audit lines are gated behind isDebug
  resetGate()
  suspendSpy.mockClear()
  resumeSpy.mockClear()
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  installGamePauseAudio()
})

afterEach(() => {
  setPlatformAudioMuted(false) // clear the audio-only mute slot between tests
  uninstallGamePauseAudio()
  resetGate()
  infoSpy.mockRestore()
  isDebug.value = false
})

describe('useGamePauseAudio orchestrator', () => {
  it('suspends audio when an ad starts and resumes when it ends', () => {
    isAdShowing.value = true
    expect(suspendSpy).toHaveBeenCalledTimes(1)
    expect(__isAudioSlotHeld()).toBe(true)

    isAdShowing.value = false
    expect(resumeSpy).toHaveBeenCalledTimes(1)
    expect(__isAudioSlotHeld()).toBe(false)
  })

  it('fires synchronously on the flag flip (no microtask gap under the ad)', () => {
    // The flip and the suspend must happen in the same call stack — this is
    // what stops music playing under a synchronously-opened ad overlay.
    isAdShowing.value = true
    expect(suspendSpy).toHaveBeenCalledTimes(1) // no await / nextTick needed
  })

  it('suspends for tab-hidden and platform pauses too (all builds)', () => {
    isVisibilityHidden.value = true
    expect(suspendSpy).toHaveBeenCalledTimes(1)
    isVisibilityHidden.value = false
    expect(resumeSpy).toHaveBeenCalledTimes(1)

    pauseGame()
    expect(suspendSpy).toHaveBeenCalledTimes(2)
    resumeGame()
    expect(resumeSpy).toHaveBeenCalledTimes(2)
  })

  it('holds a SINGLE slot across overlapping pause reasons (no double-count)', () => {
    isAdShowing.value = true // reason 1
    expect(suspendSpy).toHaveBeenCalledTimes(1)

    isVisibilityHidden.value = true // reason 2 while still paused
    pauseGame() // reason 3 while still paused
    // Still exactly one suspend — overlapping reasons must not stack.
    expect(suspendSpy).toHaveBeenCalledTimes(1)
    expect(resumeSpy).not.toHaveBeenCalled()

    // Drop two of three reasons — still paused, so still no resume.
    isAdShowing.value = false
    isVisibilityHidden.value = false
    expect(resumeSpy).not.toHaveBeenCalled()
    expect(__isAudioSlotHeld()).toBe(true)

    // Drop the last reason — now exactly one resume.
    resumeGame()
    expect(resumeSpy).toHaveBeenCalledTimes(1)
    expect(__isAudioSlotHeld()).toBe(false)
  })

  it('stays muted while a modal opens during an ad (refcounted app pause)', () => {
    isAdShowing.value = true
    const releaseModal = acquireAppPause()
    expect(suspendSpy).toHaveBeenCalledTimes(1) // modal added no extra suspend

    isAdShowing.value = false // ad ends but modal still holds the pause
    expect(resumeSpy).not.toHaveBeenCalled()

    releaseModal()
    expect(resumeSpy).toHaveBeenCalledTimes(1)
  })

  it('logs a structured PAUSE line naming the active reasons', () => {
    isAdShowing.value = true
    const line = infoSpy.mock.calls.map(c => String(c[0])).find(s => s.includes('PAUSE'))
    expect(line).toBeTruthy()
    expect(line).toContain('[pause]')
    expect(line).toContain('reasons=[ad]')
    expect(line).toContain('suspended')
  })

  it('logs a structured RESUME line', () => {
    isAdShowing.value = true
    infoSpy.mockClear()
    isAdShowing.value = false
    const line = infoSpy.mock.calls.map(c => String(c[0])).find(s => s.includes('RESUME'))
    expect(line).toBeTruthy()
    expect(line).toContain('[pause]')
    expect(line).toContain('resumed')
  })

  it('is idempotent — a second install does not add a second subscriber', () => {
    installGamePauseAudio() // already installed in beforeEach
    isAdShowing.value = true
    expect(suspendSpy).toHaveBeenCalledTimes(1) // still one, not two
    isAdShowing.value = false
    expect(resumeSpy).toHaveBeenCalledTimes(1)
  })

  it('applies the current gate state at install time (boot into a paused state)', () => {
    // Tear down the beforeEach install, assert a pre-existing pause is
    // honoured the moment we re-install.
    uninstallGamePauseAudio()
    suspendSpy.mockClear()
    resumeSpy.mockClear()

    isAdShowing.value = true // gate already paused before install
    installGamePauseAudio()
    expect(suspendSpy).toHaveBeenCalledTimes(1)
    expect(__isAudioSlotHeld()).toBe(true)
  })
})

describe('setPlatformAudioMuted — portal sound-toggle (audio-only)', () => {
  it('suspends audio on soundOff and resumes on soundOn, without touching the pause gate', () => {
    expect(__isPlatformAudioMuted()).toBe(false)

    setPlatformAudioMuted(true)
    expect(suspendSpy).toHaveBeenCalledTimes(1)
    expect(__isPlatformAudioMuted()).toBe(true)
    // Audio-only: it must NOT pause gameplay (render loop keeps running).
    expect(isGamePaused.value).toBe(false)

    setPlatformAudioMuted(false)
    expect(resumeSpy).toHaveBeenCalledTimes(1)
    expect(__isPlatformAudioMuted()).toBe(false)
  })

  it('is edge-triggered — a duplicate soundOff does not double-suspend', () => {
    setPlatformAudioMuted(true)
    setPlatformAudioMuted(true) // duplicate emission from the SDK
    expect(suspendSpy).toHaveBeenCalledTimes(1)

    setPlatformAudioMuted(false)
    setPlatformAudioMuted(false) // duplicate resume
    expect(resumeSpy).toHaveBeenCalledTimes(1)
  })

  it('composes with the pause gate via the ref-counted stack (both must clear)', () => {
    // Ad pause + portal mute overlap. Each holds its own slot; audio resumes
    // only after BOTH release — proven by suspend/resume call counts.
    isAdShowing.value = true        // pause-gate slot
    setPlatformAudioMuted(true)     // audio-only slot
    expect(suspendSpy).toHaveBeenCalledTimes(2)

    isAdShowing.value = false       // drop the gate; mute still held
    expect(resumeSpy).toHaveBeenCalledTimes(1)

    setPlatformAudioMuted(false)    // drop the mute
    expect(resumeSpy).toHaveBeenCalledTimes(2)
  })
})
