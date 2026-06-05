import { ref, computed } from 'vue'

// ─── UI modal-open signal ────────────────────────────────────────────────────
//
// Tracks how many blocking FModal dialogs (Upgrades, Options, Daily, Battle
// Pass, Achievements, …) are currently open. Its only consumer today is the
// CrazyGames gameplay-lifecycle driver in `MawScene` — gameplay counts as
// "interrupted" while a menu is up, so we fire `gameplayStop()` on open and
// `gameplayStart()` on close (see CG SDK requirements).
//
// Intentionally SIDE-EFFECT-FREE: this does NOT pause the render loop or
// suspend audio (that's the separate `useGamePause` gate, which would also
// mute the modal-open cue). It's a pure signal for SDK event timing.
//
// Refcounted so overlapping / stacked modals compose: gameplay only resumes
// once the LAST modal closes. `acquireModalOpen()` returns a release function
// the caller (FModal) invokes on close / unmount.

const openCount = ref(0)

/** True while at least one blocking modal is open. */
export const isAnyModalOpen = computed(() => openCount.value > 0)

/** Mark a modal as open. Returns a release fn — call once on close/unmount.
 *  Idempotent release so wrapping in cleanup hooks is safe. */
export const acquireModalOpen = (): (() => void) => {
  openCount.value += 1
  let released = false
  return (): void => {
    if (released) return
    released = true
    openCount.value = Math.max(0, openCount.value - 1)
  }
}
