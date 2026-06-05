<script setup lang="ts">
import { watch, ref } from 'vue'
import { isMobileLandscape } from '@/use/useUser'

interface Props {
  score: number
}
const props = defineProps<Props>()

// Pop the number on every increment for tactile feedback.
const popping = ref(false)
let raf = 0
watch(() => props.score, () => {
  popping.value = false
  cancelAnimationFrame(raf)
  raf = requestAnimationFrame(() => { popping.value = true })
})
</script>

<template lang="pug">
  div.score-badge.pointer-events-none.flex.flex-col.items-center.select-none
    span.score-num.font-black.game-text.leading-none(
      :class="{ pop: popping, 'is-landscape': isMobileLandscape }"
    ) {{ score }}
</template>

<style scoped lang="sass">
.score-num
  color: #ffffff
  // Width-scaled on tall viewports (portrait/desktop). On a SHORT landscape
  // viewport the `13vw` term blows up (844px wide → ~110px tall glyphs) and the
  // number eats the screen + collides with the combo badge below it — so cap it
  // hard by viewport HEIGHT there (see the landscape override below).
  font-size: clamp(2.75rem, 13vw, 6rem)
  text-shadow: 0 4px 0 #1a2b4b, 0 0 18px rgba(0,0,0,0.45), 3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000
  letter-spacing: 0.02em
  transition: transform 0.08s ease-out

// Mobile landscape (phone held sideways): the `13vw` term blows the score up to
// ~110px on an 844px-wide viewport, eating the screen and colliding with the
// combo badge below it. Driven by the SAME `isMobileLandscape` flag the combo /
// racer badges use (a CSS media query disagreed with the flag under device
// emulation) — cap it small so it stays compact and clears those badges.
.score-num.is-landscape
  font-size: 2rem

.pop
  animation: score-pop 0.18s ease-out

@keyframes score-pop
  0%
    transform: scale(1)
  40%
    transform: scale(1.18)
  100%
    transform: scale(1)
</style>
