import { beforeEach, describe, expect, it, vi } from 'vitest'

// The audio-layer guarantee behind the GamePix "music under interstitial" fix.
//
// `useAds.showMidgameAd` hard-stops the bg music (forceStopMusic → pause)
// BEFORE the ad's pause-gate runs. This proves the consequence: the
// suspend/resume gate never re-starts a track that was already paused when the
// suspend began — so even if the GamePix SDK resolves its interstitial promise
// early and the gate drops mid-ad, the music stays silent.

interface FakeAudio { paused: boolean; loop: boolean; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }
const fakeAudio = (paused: boolean, loop = false): FakeAudio => {
  const el = {
    paused,
    loop,
    pause: vi.fn(() => { el.paused = true }),
    play: vi.fn(() => { el.paused = false; return Promise.resolve() })
  }
  return el
}

interface FakeSource { stop: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> }
const fakeSource = (): FakeSource => ({ stop: vi.fn(), addEventListener: vi.fn() })

beforeEach(() => {
  vi.resetModules()
})

describe('suspend/resume gate — interstitial music guarantee', () => {
  it('does NOT restart a track that was hard-stopped before the ad (the fix)', async () => {
    const { registerHtmlAudio, suspendAllAudio, resumeAllAudio } = await import('@/use/useAssets')
    const music = fakeAudio(true) // forceStopMusic already paused it before the ad
    registerHtmlAudio(music as unknown as HTMLAudioElement)

    suspendAllAudio()  // ad begins (isAdShowing → gate suspend)
    resumeAllAudio()   // GamePix promise resolves early → gate drops mid-ad

    // Music must stay silent — the gate never queued an already-paused track.
    expect(music.play).not.toHaveBeenCalled()
    expect(music.paused).toBe(true)
  })

  it('still suspends + resumes a track that WAS playing (tab-hide / rewarded path)', async () => {
    const { registerHtmlAudio, suspendAllAudio, resumeAllAudio } = await import('@/use/useAssets')
    const music = fakeAudio(false) // playing when the suspend hits
    registerHtmlAudio(music as unknown as HTMLAudioElement)

    suspendAllAudio()
    expect(music.pause).toHaveBeenCalledTimes(1)

    resumeAllAudio()
    expect(music.play).toHaveBeenCalledTimes(1) // restored once the gate clears
  })
})

describe('killOneShotSfx — stop every in-flight one-shot before an ad', () => {
  it('stops in-flight one-shot Web Audio sources', async () => {
    const { registerOneShotSource, killOneShotSfx } = await import('@/use/useAssets')
    const a = fakeSource()
    const b = fakeSource()
    registerOneShotSource(a as unknown as AudioBufferSourceNode)
    registerOneShotSource(b as unknown as AudioBufferSourceNode)

    killOneShotSfx()

    expect(a.stop).toHaveBeenCalledTimes(1)
    expect(b.stop).toHaveBeenCalledTimes(1)
  })

  it('pauses non-looping HTMLAudio one-shots but leaves the bg music (loop=true) to forceStopMusic', async () => {
    const { registerHtmlAudio, killOneShotSfx } = await import('@/use/useAssets')
    const sfx = fakeAudio(false, false)   // decode-fallback one-shot, playing
    const music = fakeAudio(false, true)  // bg music (loop)
    registerHtmlAudio(sfx as unknown as HTMLAudioElement)
    registerHtmlAudio(music as unknown as HTMLAudioElement)

    killOneShotSfx()

    expect(sfx.pause).toHaveBeenCalledTimes(1)   // one-shot killed
    expect(music.pause).not.toHaveBeenCalled()   // music untouched here
  })

  it('drops killed one-shots from the auto-resume set so the gate cannot restart them', async () => {
    const { registerHtmlAudio, killOneShotSfx, suspendAllAudio, resumeAllAudio } = await import('@/use/useAssets')
    const sfx = fakeAudio(false, false)
    registerHtmlAudio(sfx as unknown as HTMLAudioElement)

    killOneShotSfx()      // ad about to show → kill the one-shot
    suspendAllAudio()     // ad gate suspends
    resumeAllAudio()      // gate drops (early)

    expect(sfx.play).not.toHaveBeenCalled() // never restarted under/after the ad
  })
})

describe('forceStopMusic', () => {
  it('clears isPlaying so the next round restarts music instead of skipping', async () => {
    const { useMusic, forceStopMusic } = await import('@/use/useSound')
    const { isPlaying } = useMusic()
    isPlaying.value = true // pretend a battle track is playing
    forceStopMusic()
    // startBattleMusic() bails early when `isPlaying` is still true, so clearing
    // it is what lets the post-ad round bring the music back.
    expect(isPlaying.value).toBe(false)
  })
})
