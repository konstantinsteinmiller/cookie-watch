// @/use/useHint.ts
import { ref, onUnmounted } from 'vue'

export function useHint(delay: number = 5000) {
  const showHint = ref(false)
  const isHintDisabled = ref(false)
  let hintTimeout: ReturnType<typeof setTimeout> | null = null

  const clearHint = () => {
    if (hintTimeout) {
      clearTimeout(hintTimeout)
      hintTimeout = null
    }
    showHint.value = false
  }

  const startHintTimer = () => {
    clearHint()
    // Don't start if user already interacted or hint is manually disabled
    if (isHintDisabled.value) return

    hintTimeout = setTimeout(() => {
      showHint.value = true
    }, delay)
  }

  const disableHintPermanently = () => {
    isHintDisabled.value = true
    clearHint()
  }

  onUnmounted(() => {
    clearHint()
  })

  return {
    showHint,
    isHintDisabled,
    startHintTimer,
    clearHint,
    disableHintPermanently
  }
}