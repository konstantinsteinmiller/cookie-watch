<script setup lang="ts">
import { computed } from 'vue'

// Lives as a row of cheese-wedge hearts. Lit wedges = lives remaining; the rest
// dimmed. Capped display at 5 so a 1up streak never overflows the HUD.
const props = defineProps<{ value: number; max?: number }>()
const slots = computed(() => {
  const cap = Math.max(props.max ?? 3, props.value, 3)
  return Array.from({ length: Math.min(cap, 5) }, (_, i) => i < props.value)
})
</script>

<template lang="pug">
  div.lives.flex.items-center(class="gap-0.5")
    svg(
      v-for="(lit, i) in slots"
      :key="i"
      viewBox="0 0 24 24"
      class="w-5 h-5 sm:w-6 sm:h-6 drop-shadow"
      :class="lit ? 'text-yellow-300' : 'text-white/20'"
      fill="currentColor"
    )
      //- cheese-wedge heart
      path(d="M12 4 C9 1 3 2 3 8 a4 4 0 0 0 0.5 2 L12 21 L20.5 10 A4 4 0 0 0 21 8 C21 2 15 1 12 4 Z" stroke="black" stroke-width="0.8")
</template>
