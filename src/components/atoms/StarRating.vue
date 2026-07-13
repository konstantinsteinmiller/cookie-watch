<script setup lang="ts">
import { computed } from 'vue'

// Rev 5 §E clear tiers: 1 star for the minimum Pass, 3 for a Perfect Clear, and
// 3 PLATINUM stars for a Perfect Clear that also brought the Gold Nugget home.
const props = withDefaults(defineProps<{
  stars: number
  platinum?: boolean
}>(), { platinum: false })

const filled = computed(() => Math.max(0, Math.min(3, Math.round(props.stars))))
const slots = [0, 1, 2]
</script>

<template lang="pug">
  div.flex.items-center.justify-center(class="gap-1.5 sm:gap-2")
    div.star(
      v-for="i in slots"
      :key="i"
      :class="[i < filled ? (platinum ? 'is-platinum' : 'is-filled') : 'is-empty']"
      :style="{ animationDelay: (i * 0.16) + 's' }"
    )
      svg(viewBox="0 0 24 24" class="w-9 h-9 sm:w-12 sm:h-12" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round")
        path(d="M12 2.5 l2.9 6.1 6.6 0.9 -4.8 4.6 1.2 6.6 -5.9 -3.2 -5.9 3.2 1.2 -6.6 -4.8 -4.6 6.6 -0.9 Z")
</template>

<style scoped lang="sass">
.star
  animation: star-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both

.is-empty
  color: rgba(255, 255, 255, 0.16)

.is-filled
  color: #ffcd00
  filter: drop-shadow(0 0 8px rgba(255, 205, 0, 0.7))

.is-platinum
  color: #b9f2ff
  filter: drop-shadow(0 0 10px rgba(185, 242, 255, 0.9))

@keyframes star-pop
  from
    opacity: 0
    transform: scale(0.2) rotate(-45deg)
  to
    opacity: 1
    transform: scale(1) rotate(0)
</style>
