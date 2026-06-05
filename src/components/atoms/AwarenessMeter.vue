<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { CatState } from '@/use/useCookieGame'

// The Cat's hidden 0–100 awareness, surfaced as a colour-coded bar with the
// current state label. Green (asleep) → amber (stirring) → orange (awake) →
// red, flashing, at Alert. Sits at the top of the HUD, clear of gameplay.
const props = defineProps<{ value: number; state: CatState }>()
const { t } = useI18n()

const pct = computed(() => Math.max(0, Math.min(100, props.value)))
const barColor = computed(() => {
  switch (props.state) {
    case 'alert':
    case 'pounce': return 'linear-gradient(90deg,#ff7a3c,#ff2d2d)'
    case 'awake': return 'linear-gradient(90deg,#ffcd00,#ff7a3c)'
    case 'stirring': return 'linear-gradient(90deg,#a8e05f,#ffcd00)'
    default: return 'linear-gradient(90deg,#5cd16d,#a8e05f)'
  }
})
const label = computed(() => t('cat.' + props.state))
const danger = computed(() => props.state === 'alert' || props.state === 'pounce')
</script>

<template lang="pug">
  div.awareness.flex.flex-col.items-center.gap-1(class="w-[44vw] max-w-[280px] min-w-[140px]")
    div.flex.items-center.gap-1.justify-center
      //- tiny cat glyph
      svg(viewBox="0 0 24 24" class="w-4 h-4 shrink-0" :class="danger ? 'text-red-400' : 'text-white/80'" fill="currentColor")
        path(d="M4 4 L8 8 H16 L20 4 V14 a8 6 0 0 1 -16 0 Z")
      span.game-text.font-black.uppercase.tracking-wider.leading-none(
        class="text-[10px] sm:text-xs"
        :class="danger ? 'text-red-300 animate-pulse' : 'text-white/90'"
      ) {{ label }}
    div.relative.w-full.rounded-full.overflow-hidden.border-2(
      class="h-2.5 sm:h-3 bg-black/40 border-[#0f1a30]"
      :class="danger ? 'animate-pulse' : ''"
    )
      div.absolute.inset-y-0.left-0.rounded-full(
        :style="{ width: pct + '%', background: barColor, transition: 'width 0.15s linear' }"
      )
</template>
