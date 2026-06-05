<script setup lang="ts">
import { computed } from 'vue'
import type { Dir } from '@/use/useCookieGame'

// A single on-screen control: one of the four directional pads or the central
// Interact button. Fires on `pointerdown` (not click) so taps register with no
// 300ms delay and feel instant on mobile. `active` highlights the pad the game
// is currently prompting; `interact` swaps the glyph for the chunk/devour action.
const props = defineProps<{
  dir?: Dir
  interact?: boolean
  active?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ (e: 'press'): void }>()

const onDown = (e: PointerEvent): void => {
  e.preventDefault()
  if (props.disabled) return
  emit('press')
}

// SVG arrow rotation per direction (base points up).
const rotation = computed(() => {
  switch (props.dir) {
    case 'down': return 180
    case 'left': return -90
    case 'right': return 90
    default: return 0
  }
})
</script>

<template lang="pug">
  button.dir-button.relative.cursor-pointer.select-none.touch-none(
    type="button"
    :class="[active ? 'is-active' : '', disabled ? 'opacity-40' : '']"
    @pointerdown="onDown"
    @contextmenu.prevent
  )
    //- raised shadow base
    div.absolute.inset-0.translate-y-1.rounded-2xl(class="bg-[#102e7a]")
    div.relative.rounded-2xl.border-2.flex.items-center.justify-center(
      class="w-full h-full bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
      :class="active ? 'ring-4 ring-yellow-300/80' : ''"
    )
      //- Interact glyph (paw/grab) or directional arrow
      svg(v-if="interact" viewBox="0 0 24 24" class="w-3/5 h-3/5 text-white" fill="currentColor")
        path(d="M12 3 a3 3 0 0 1 3 3 v5 h1.5 a2.5 2.5 0 0 1 2.5 2.5 v3 a5 5 0 0 1 -5 5 h-3 a6 6 0 0 1 -6 -6 v-4 a2 2 0 0 1 4 0 V6 a3 3 0 0 1 3 -3 Z")
      svg(v-else viewBox="0 0 24 24" class="w-3/5 h-3/5 text-white" fill="currentColor" :style="{ transform: 'rotate(' + rotation + 'deg)' }")
        path(d="M12 4 L20 14 H15 V20 H9 V14 H4 Z")
</template>

<style scoped lang="sass">
.dir-button
  transition: transform 0.08s ease
  &:active
    transform: scale(0.9) translateY(2px)
.is-active
  animation: dir-pulse 0.7s ease-in-out infinite
@keyframes dir-pulse
  0%, 100%
    transform: scale(1)
  50%
    transform: scale(1.06)
</style>
