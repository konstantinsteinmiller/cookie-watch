<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import useEpicConfig from '@/use/useEpicConfig'
import { getState, setState } from '@/use/useEpicState'

interface Props {
  coins?: number
}

const props = withDefaults(defineProps<Props>(), {
  coins: 125
})

const emit = defineEmits<{
  (e: 'coins-awarded', sourceEl: HTMLElement): void
}>()

const { addCoins } = useEpicConfig()
const rootEl = ref<HTMLElement | null>(null)

const COOLDOWN_MS = 30_000
const COOLDOWN_KEY = 'spinner_ad_button_ready_at'

const readReadyAt = (): number => {
  const v = getState<unknown>(COOLDOWN_KEY)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : 0
}
const adReadyAt = ref(readReadyAt())
const tickNow = ref(Date.now())
let tickIntervalId: number | null = null

const cooldownActive = computed(() => tickNow.value < adReadyAt.value)
const isVisible = computed(() => isRewardedReady.value && !cooldownActive.value)

onMounted(() => {
  tickIntervalId = window.setInterval(() => {
    tickNow.value = Date.now()
  }, 1000)
})
onUnmounted(() => {
  if (tickIntervalId !== null) clearInterval(tickIntervalId)
})

const triggerAdReward = async () => {
  if (cooldownActive.value) return
  const ok = await showRewardedAd()
  if (ok) {
    addCoins(props.coins)
    if (rootEl.value) emit('coins-awarded', rootEl.value)
    adReadyAt.value = Date.now() + COOLDOWN_MS
    setState(COOLDOWN_KEY, adReadyAt.value)
  }
}
</script>

<template lang="pug">
  //- Sized to match the rest of the bottom-row HUD buttons (DailyRewards,
  //- BattlePass, Settings): square `p-2` inner box, single 7x7 icon,
  //- `scale-80 sm:scale-100` outer scale. The reward amount is surfaced
  //- via a small pill badge at the top-right instead of a stacked row,
  //- so the footprint stays uniform with its neighbours.
  button.adReward.cursor-pointer.pointer-events-auto.transition-transform(
    ref="rootEl"
    v-if="isVisible"
    class="active:scale-95 hover:scale-[103%] scale-80 sm:scale-100"
    @click="triggerAdReward"
  )
    div.relative
      div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
      div.relative.rounded-lg.border-2.flex.items-center.justify-center.p-2(
        class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]"
      )
        //- Shared "play / movie" icon — sized like the gear / trophy siblings.
        IconMovie(class="w-7 h-7")
      //- Reward badge — small pill at the top-right corner. Matches the
      //- `pendingClaimCount` and "is-collectable" indicators on the other
      //- bottom-row buttons so the visual language stays consistent.
      div.absolute.flex.items-center.rounded-full.border-2.shadow-md(
        class="gap-0.5 -translate-y-1 translate-x-1 top-0 right-0 px-1 py-0.5 bg-[#102e7a] border-white"
      )
        span.font-black.game-text.text-yellow-100.leading-none(class="text-[9px]") +{{ coins }}
        IconCoin(class="w-2.5 h-2.5 text-yellow-300")
</template>
