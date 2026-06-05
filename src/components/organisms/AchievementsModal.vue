<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import useAchievements from '@/use/useAchievements'
import useSounds from '@/use/useSound'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { t } = useI18n()
const { playSound } = useSounds()
const { list, claim } = useAchievements()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const onClaim = (id: string, event: MouseEvent): void => {
  const reward = claim(id)
  if (reward > 0) {
    emit('coins-awarded', event.currentTarget as HTMLElement)
    playSound('reward-continue', 0.06)
  } else {
    playSound('barricade', 0.04)
  }
}
</script>

<template lang="pug">
  FModal(v-model="isOpen" :title="t('achievements.title')")
    div.flex.flex-col.gap-2.p-2
      p.text-center.text-white.game-text.opacity-80(class="text-xs sm:text-sm") {{ t('achievements.subtitle') }}
      div.flex.flex-col.gap-2
        div.flex.items-center.gap-3.rounded-xl.border-2.p-2.text-left(
          v-for="a in list"
          :key="a.id"
          class="bg-black/30"
          :class="a.claimable ? 'border-yellow-300' : (a.claimed ? 'border-emerald-400/50' : 'border-white/15')"
        )
          div.shrink-0.flex.items-center.justify-center.rounded-lg.border-2(
            class="w-10 h-10 bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
            :class="a.complete ? '' : 'opacity-40 grayscale'"
          )
            svg(viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round")
              path(d="M7 4 h10 v3 a5 5 0 0 1 -10 0 Z")
              path(d="M7 5 H4 v1 a3 3 0 0 0 3 3")
              path(d="M17 5 h3 v1 a3 3 0 0 1 -3 3")
              path(d="M12 12 v4")
              path(d="M9 20 h6 l-1 -4 h-4 Z")
          div.flex-1.min-w-0
            div.font-black.game-text.text-white(class="text-sm sm:text-base") {{ t('achievements.items.' + a.id + '.name') }}
            div.text-white.game-text.opacity-70.leading-tight(class="text-[10px] sm:text-xs") {{ t('achievements.items.' + a.id + '.desc') }}
            div.mt-1.relative.h-2.rounded-full.overflow-hidden.border(class="bg-black/40 border-white/20")
              div.h-full.bg-gradient-to-r.from-yellow-300.to-amber-500.transition-all(
                :style="{ width: Math.min(100, (a.current / a.target) * 100) + '%' }"
              )
            div.text-white.game-text.opacity-60(class="text-[9px] sm:text-[10px] mt-0.5") {{ t('achievements.progress', { c: Math.min(a.current, a.target), t: a.target }) }}
          div.shrink-0.flex.flex-col.items-end.gap-1
            div.text-center.text-emerald-300.font-black.game-text(v-if="a.claimed" class="text-[10px] sm:text-xs") {{ t('achievements.claimed') }}
            button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-1.rounded-lg.border-2.px-3(
              v-else-if="a.claimable"
              class="py-1.5 active:scale-95 hover:scale-[103%] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
              @click="onClaim(a.id, $event)"
            )
              IconCoin(class="w-4 h-4 text-yellow-100")
              span.font-black.game-text.text-white(class="text-xs") {{ t('achievements.claim') }}
            div.flex.items-center.gap-1.opacity-70(v-else)
              IconCoin(class="w-4 h-4 text-yellow-300")
              span.font-black.game-text.text-yellow-100(class="text-xs") +{{ a.reward }}
</template>

<style scoped lang="sass">
div.rounded-xl
  transition: all 0.15s ease
</style>
