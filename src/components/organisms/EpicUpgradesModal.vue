<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import FModal from '@/components/molecules/FModal.vue'
import IconCoin from '@/components/icons/IconCoin.vue'
import IconMovie from '@/components/icons/IconMovie.vue'
import useEpicProgress, { UPGRADES, levelOf, upgradeCost, sellRefund, SELLABLE_UPGRADES, SECOND_CHANCE_COST } from '@/use/useEpicProgress'
import useEpicConfig from '@/use/useEpicConfig'
import { isRewardedReady, showRewardedAd } from '@/use/useAds'
import { isMobilePortrait } from '@/use/useUser'
import { prependBaseUrl } from '@/utils/function'
import useSounds from '@/use/useSound'

const wingsSrc = prependBaseUrl('images/props/wings_260x108.webp')

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const { t } = useI18n()
const { playSound } = useSounds()
const progress = useEpicProgress()
const { coins } = useEpicConfig()

const isOpen = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

interface CardView {
  id: string
  level: number
  maxLevel: number
  cost: number
  unlocked: boolean
  canBuy: boolean
  maxed: boolean
  unlockStage: number
  sellable: boolean
  canSell: boolean
  refund: number
}

const cards = computed<CardView[]>(() =>
  UPGRADES.map((u) => {
    const level = levelOf(u.id)
    return {
      id: u.id,
      level,
      maxLevel: u.maxLevel,
      cost: upgradeCost(u.id),
      unlocked: progress.isUnlocked(u.id),
      canBuy: progress.canBuy(u.id),
      maxed: level >= u.maxLevel,
      unlockStage: u.unlockStage,
      sellable: SELLABLE_UPGRADES.includes(u.id),
      canSell: progress.canSell(u.id),
      refund: sellRefund(u.id)
    }
  })
)

const buy = (id: string): void => {
  if (progress.buyUpgrade(id)) {
    playSound('level-up', 0.06)
  } else {
    playSound('barricade', 0.04)
  }
}

const sell = (id: string): void => {
  if (progress.sellUpgrade(id)) {
    playSound('coin-pickup', 0.05)
  } else {
    playSound('barricade', 0.04)
  }
}

// ─── Second Chance (repeatable, ad-or-coins) ────────────────────────────────
const scActive = computed(() => progress.startSecondChance.value)
const scCost = SECOND_CHANCE_COST
const scAdInFlight = ref(false)
const canBuySc = computed(() => !scActive.value && coins.value >= scCost)
const canWatchSc = computed(() => !scActive.value && isRewardedReady.value && !scAdInFlight.value)
// Only SHOW the rewarded "Free" option when a rewarded ad is actually
// available (loaded / filled / off cooldown) — or while one is mid-watch — so
// the button never appears as a dead, disabled stub. Hidden entirely otherwise.
const showWatchSc = computed(() => !scActive.value && (isRewardedReady.value || scAdInFlight.value))

const buySecondChance = (): void => {
  if (progress.buyStartSecondChance()) playSound('level-up', 0.06)
  else playSound('barricade', 0.04)
}

const watchForSecondChance = async (): Promise<void> => {
  if (!canWatchSc.value) return
  scAdInFlight.value = true
  try {
    const ok = await showRewardedAd()
    if (ok) { progress.armStartSecondChance(); playSound('level-up', 0.06) }
  } finally {
    scAdInFlight.value = false
  }
}
</script>

<template lang="pug">
  FModal(v-model="isOpen" :title="t('upgrades.title')")
    div.flex.flex-col.gap-2.p-2
      p.text-center.text-white.game-text.opacity-80(class="text-xs sm:text-sm") {{ t('upgrades.subtitle') }}
      div.flex.flex-col.gap-2
        //- Second Chance — repeatable, bought with a rewarded ad OR coins. While
        //- one is armed both actions show as disabled and an ACTIVE badge appears.
        //- Portrait: the wings sit on the title row and the actions stack below,
        //- so the description gets the full card width. Landscape: classic row.
        div.upgrade-card.flex.gap-3.rounded-xl.border-2.p-2.text-left(
          class="bg-black/30 border-yellow-300/50"
          :class="isMobilePortrait ? 'flex-col' : 'items-center'"
        )
          //- Header (wings + title). On portrait this is the top row; the
          //- description follows full-width beneath it.
          div.flex.items-center.gap-3(:class="isMobilePortrait ? '' : 'flex-1 min-w-0'")
            img.shrink-0.object-contain(:src="wingsSrc" alt="" class="w-12 h-auto")
            div.flex-1.min-w-0
              div.font-black.game-text.text-white(class="text-sm sm:text-base") {{ t('upgrades.secondChance.name') }}
              //- Landscape keeps the description under the title inside the header.
              div.text-white.game-text.opacity-70.leading-tight(
                v-if="!isMobilePortrait"
                class="text-[10px] sm:text-xs"
              ) {{ t('upgrades.secondChance.description') }}
          //- Portrait-only full-width description (more room than the squeezed column).
          div.text-white.game-text.opacity-70.leading-tight(
            v-if="isMobilePortrait"
            class="text-xs"
          ) {{ t('upgrades.secondChance.description') }}
          //- Actions: stacked (coins buy on top, Free ad below).
          div.shrink-0.flex.flex-col.gap-1(:class="isMobilePortrait ? 'items-stretch' : 'items-end'")
            div.text-center.text-emerald-300.font-black.game-text(v-if="scActive" class="text-xs") {{ t('upgrades.secondChance.active') }}
            //- Coins option (primary buy)
            button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-1.rounded-lg.border-2.px-3(
              class="py-1.5 active:scale-95 hover:scale-[103%] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] disabled:opacity-50 disabled:grayscale"
              :disabled="!canBuySc"
              @click="buySecondChance"
            )
              IconCoin(class="w-4 h-4 text-yellow-100")
              span.font-black.game-text.text-white(class="text-sm") {{ scCost }}
            //- Rewarded-ad option (below the buy button). Only shown when a
            //- rewarded ad is actually available — no dead disabled stub.
            button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-1.rounded-lg.border-2.px-3(
              v-if="showWatchSc"
              class="py-1.5 active:scale-95 hover:scale-[103%] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] disabled:opacity-50 disabled:grayscale"
              :disabled="!canWatchSc"
              @click="watchForSecondChance"
            )
              IconMovie(class="w-4 h-4 text-yellow-100")
              span.font-black.game-text.text-white(class="text-xs") {{ t('upgrades.secondChance.watch') }}
        div.upgrade-card.flex.items-center.gap-3.rounded-xl.border-2.p-2.text-left(
          v-for="card in cards"
          :key="card.id"
          class="bg-black/30 border-white/15"
          :class="{ 'opacity-60': !card.unlocked }"
        )
          //- Level pips — wrap at 5 per row (a 10-level upgrade stacks 2 rows).
          div.flex.flex-col.items-center.gap-1.shrink-0(class="w-12")
            span.font-black.game-text.text-yellow-200(class="text-xs") {{ t('upgrades.level', { n: card.level }) }}
            div.flex.flex-wrap.justify-center(class="gap-0.5 max-w-[3rem]")
              span.rounded-full(
                v-for="i in card.maxLevel"
                :key="i"
                class="w-1.5 h-1.5"
                :class="i <= card.level ? 'bg-yellow-300' : 'bg-white/25'"
              )
          //- Name + description
          div.flex-1.min-w-0
            div.font-black.game-text.text-white(class="text-sm sm:text-base") {{ t('upgrades.names.' + card.id) }}
            div.text-white.game-text.opacity-70.leading-tight(class="text-[10px] sm:text-xs") {{ t('upgrades.descriptions.' + card.id) }}
          //- Action
          div.shrink-0.flex.flex-col.items-end.gap-1
            div.text-center.text-white.game-text.opacity-70(v-if="!card.unlocked" class="text-[10px]") {{ t('upgrades.unlocksAtStage', { n: card.unlockStage }) }}
            template(v-else)
              div.text-center.text-emerald-300.font-black.game-text(v-if="card.maxed" class="text-xs") {{ t('upgrades.maxedOut') }}
              button.cursor-pointer.transition-transform.flex.items-center.gap-1.rounded-lg.border-2.px-3(
                v-else
                class="py-1.5 active:scale-95 hover:scale-[103%] bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30] disabled:opacity-50 disabled:grayscale"
                :disabled="!card.canBuy"
                @click="buy(card.id)"
              )
                IconCoin(class="w-4 h-4 text-yellow-100")
                span.font-black.game-text.text-white(class="text-sm") {{ card.cost }}
              //- Downgrade / sell-back — a red button matching the buy button's
              //- size so the two align in the right-hand action column.
              button.cursor-pointer.transition-transform.flex.items-center.justify-center.gap-1.rounded-lg.border-2.px-3(
                v-if="card.sellable && card.canSell"
                class="py-1.5 active:scale-95 hover:scale-[103%] bg-gradient-to-b from-[#ff5a5a] to-[#c01f1f] border-[#5e0d0d]"
                @click="sell(card.id)"
              )
                span.font-black.game-text.text-white(class="text-xs") {{ t('upgrades.sellBack', { n: card.refund }) }}
</template>

<style scoped lang="sass">
.upgrade-card
  transition: all 0.15s ease
</style>
