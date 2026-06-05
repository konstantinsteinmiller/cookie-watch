<script setup lang="ts">
// Tiny on-device debug HUD for LevelPlay state. Mobile builds have no
// JS console accessible to the developer (no Mac → no Console.app, no
// Safari Web Inspector available without a paired Mac), so this overlay
// is the only diagnostic surface for sideloaded / TestFlight builds.
//
// Mounted from App.vue when `isNative === true`. Tap anywhere on the
// overlay to collapse it down to a single status pill so it stops
// covering gameplay. Tap again to expand.
import { computed, ref } from 'vue'
import { levelPlayDebug, launchLevelPlayTestSuite } from '@/use/ads/LevelPlayProvider'
import { isAdsReady, isRewardedReady, isInterstitialReady } from '@/use/useAds'

const launchingTestSuite = ref(false)
const onLaunchTestSuite = async (e: Event) => {
  // Stop propagation so the overlay's outer click-to-collapse handler
  // doesn't fire while the user is trying to tap the button.
  e.stopPropagation()
  if (launchingTestSuite.value) return
  launchingTestSuite.value = true
  try {
    await launchLevelPlayTestSuite()
  } finally {
    launchingTestSuite.value = false
  }
}

const collapsed = ref(false)

const initBadgeColor = computed(() => {
  switch (levelPlayDebug.value.initState) {
    case 'ready':
      return 'bg-green-600'
    case 'failed':
      return 'bg-red-600'
    case 'no-app-key':
      return 'bg-orange-600'
    case 'starting':
      return 'bg-amber-500'
    default:
      return 'bg-zinc-600'
  }
})

const dot = (b: boolean): string => b ? '●' : '○'
const dotColor = (b: boolean): string => b ? 'text-green-400' : 'text-red-400'
</script>

<template lang="pug">
  div.fixed.top-2.right-2.z-50.text-xs.font-mono.select-none.pointer-events-auto(
    @click="collapsed = !collapsed"
    style="text-shadow: 0 1px 2px rgba(0,0,0,0.9)"
  )
    //- Collapsed: single pill with init state + readiness
    div.px-2.py-1.rounded.text-white(
      v-if="collapsed"
      :class="initBadgeColor"
    )
      | LP {{ levelPlayDebug.initState }} · ads={{ isAdsReady ? '1' : '0' }}/r={{ isRewardedReady ? '1' : '0' }}/i={{ isInterstitialReady ? '1' : '0' }}

    //- Expanded: full table
    div(v-else class="bg-black/85 text-white rounded p-2 max-w-[80vw] w-[260px] space-y-1")
      div.flex.items-center.justify-between
        span.font-bold LevelPlay debug
        span.px-2.rounded.text-xs(class="py-0.5" :class="initBadgeColor") {{ levelPlayDebug.initState }}

      div.text-zinc-300
        | platform: {{ levelPlayDebug.platform }}
      div(:class="dotColor(levelPlayDebug.appKeyConfigured)")
        | {{ dot(levelPlayDebug.appKeyConfigured) }} app key
      div(:class="dotColor(levelPlayDebug.rewardedIdConfigured)")
        | {{ dot(levelPlayDebug.rewardedIdConfigured) }} rewarded id
      div(:class="dotColor(levelPlayDebug.interstitialIdConfigured)")
        | {{ dot(levelPlayDebug.interstitialIdConfigured) }} interstitial id

      div.border-t.border-zinc-700.pt-1.mt-1
        div(:class="dotColor(isAdsReady)") {{ dot(isAdsReady) }} sdk ready
        div(:class="dotColor(isRewardedReady)") {{ dot(isRewardedReady) }} rewarded loaded
        div(:class="dotColor(isInterstitialReady)") {{ dot(isInterstitialReady) }} interstitial loaded

      //- LevelPlay Test Suite launcher — pre-launch diagnostic that
      //- bypasses account-approval / store-publication gates and shows
      //- test ads from every configured network.
      button.w-full.text-white.text-xs.rounded.px-2.py-1.mt-1(
        v-if="isAdsReady"
        :disabled="launchingTestSuite"
        :class="launchingTestSuite ? 'bg-zinc-600' : 'bg-blue-600'"
        @click="onLaunchTestSuite"
      ) {{ launchingTestSuite ? 'launching…' : 'Open LevelPlay Test Suite' }}

      div.text-red-300.break-all(v-if="levelPlayDebug.initError")
        | init err: {{ levelPlayDebug.initError }}
      div.text-red-300.break-all(v-if="levelPlayDebug.lastRewardedShowError")
        | rew err: {{ levelPlayDebug.lastRewardedShowError }}
      div.text-red-300.break-all(v-if="levelPlayDebug.lastInterstitialShowError")
        | int err: {{ levelPlayDebug.lastInterstitialShowError }}

      div.border-t.border-zinc-700.pt-1.mt-1(class="space-y-0.5")
        div.text-zinc-400(class="text-[10px]") events (newest last)
        div.text-zinc-100.leading-tight.break-words(
          v-for="(e, i) in levelPlayDebug.events"
          :key="i"
          class="text-[10px]"
        ) {{ e }}
        div.text-zinc-500(v-if="!levelPlayDebug.events.length" class="text-[10px]") (none yet)

      div.text-zinc-500.pt-1(class="text-[10px]") tap to collapse
</template>
