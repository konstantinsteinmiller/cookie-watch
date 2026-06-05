<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { registerChordTap } from '@/use/useVConsole'
import { isMobilePortrait } from '@/use/useUser'

const { t } = useI18n()

interface Props {
  stageId: number
  /** Tiles cleared so far this run. */
  cleared?: number
  /** Tiles required to clear the current stage. */
  target?: number
  /** Endless mode: no finite goal — show the simple endless badge + count,
   *  and no progress bar. */
  endless?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  cleared: 0,
  target: 0,
  endless: false
})

// Cycle through a few cool palettes so consecutive stages feel distinct
// without needing per-stage art. Deterministic by stage id.
interface StageTheme {
  from: string
  to: string
  border: string
  shadowBase: string
  number: string
  numberShadow: string
  accent: string
  glow: string
}

const THEMES: StageTheme[] = [
  { from: 'from-sky-500', to: 'to-blue-800', border: 'border-sky-200', shadowBase: 'bg-blue-950', number: 'text-sky-50', numberShadow: 'bg-blue-950/70', accent: 'text-sky-100', glow: 'shadow-sky-400/60' },
  { from: 'from-violet-500', to: 'to-purple-900', border: 'border-violet-200', shadowBase: 'bg-purple-950', number: 'text-violet-50', numberShadow: 'bg-purple-950/70', accent: 'text-violet-100', glow: 'shadow-violet-400/60' },
  { from: 'from-emerald-500', to: 'to-green-900', border: 'border-emerald-200', shadowBase: 'bg-green-950', number: 'text-emerald-50', numberShadow: 'bg-green-950/70', accent: 'text-emerald-100', glow: 'shadow-emerald-400/60' },
  { from: 'from-amber-400', to: 'to-orange-800', border: 'border-amber-200', shadowBase: 'bg-orange-950', number: 'text-amber-50', numberShadow: 'bg-orange-950/70', accent: 'text-amber-100', glow: 'shadow-amber-400/60' },
  { from: 'from-rose-500', to: 'to-pink-900', border: 'border-rose-200', shadowBase: 'bg-pink-950', number: 'text-rose-50', numberShadow: 'bg-pink-950/70', accent: 'text-rose-100', glow: 'shadow-rose-400/60' }
]

const stageTheme = computed<StageTheme>(() => THEMES[(props.stageId - 1) % THEMES.length]!)

const progress = computed(() => {
  if (props.target <= 0) return 0
  return Math.max(0, Math.min(1, props.cleared / props.target))
})
</script>

<template lang="pug">
  //- Cross-WebView reliable chord detection (vConsole). `pointer-events-auto`
  //- re-enables taps because the parent HUD container is `pointer-events-none`.
  div.stage-badge.relative.pointer-events-auto(
    @pointerdown="registerChordTap"
    @touchstart="registerChordTap"
    @click="registerChordTap"
    class="cursor-pointer"
    style="touch-action: manipulation; -webkit-tap-highlight-color: transparent;"
  )
    //- Endless mode: the simple blue badge + run count, no progress bar.
    template(v-if="endless")
      div.relative.inline-flex.items-center.gap-2
        div.rounded-xl.border-2.px-3.py-1.font-black.game-text.text-white.shadow-lg(
          class="bg-gradient-to-b from-[#50aaff] to-[#2266ff] border-[#0f1a30]"
        )
          span.uppercase(class="text-xs sm:text-sm") {{ t('endless.badge') }}
        span.text-white.game-text.font-black(class="text-xs sm:text-sm opacity-80") {{ cleared }}

    //- Campaign mode: themed number chip + label + slim progress bar.
    template(v-else)
      div.absolute.inset-0.translate-y-1.rounded-xl.opacity-80(
        :class="stageTheme.shadowBase"
        class="pointer-events-none"
      )
      div.relative.flex.items-center.gap-2.rounded-xl.border-2.shadow-lg.overflow-hidden(
        :class="['bg-gradient-to-b', stageTheme.from, stageTheme.to, stageTheme.border, stageTheme.glow, isMobilePortrait ? 'pr-2' : 'pr-3']"
        class="pl-1.5 py-1"
      )
        //- Stage number chip
        div.relative.flex.items-center.justify-center.rounded-lg.border(
          :class="[stageTheme.numberShadow, stageTheme.border]"
          class="min-w-7 h-7 sm:min-w-8 sm:h-8 px-1"
        )
          span.font-black.game-text.leading-none(
            :class="stageTheme.number"
            class="text-sm sm:text-base"
          ) {{ stageId }}
        //- Label + progress. On mobile portrait the column sizes to the (short)
        //- label so the badge stays compact; the bar matches that width. On wider
        //- screens a min width keeps the bar a comfortable length.
        div.flex.flex-col.leading-tight(:class="isMobilePortrait ? 'min-w-0' : 'min-w-16'")
          span.font-black.uppercase.tracking-wider.game-text.text-white.whitespace-nowrap(
            class="text-[9px] sm:text-[11px] opacity-90"
          ) {{ t('stage') + ' ' + stageId }}
          //- Slim progress bar toward the stage's clear target.
          div.relative.rounded-full.overflow-hidden(
            v-if="target > 0"
            class="h-1.5 mt-0.5 bg-black/40"
          )
            div.h-full.rounded-full.bg-white.transition-all(
              :style="{ width: progress * 100 + '%' }"
            )
</template>
