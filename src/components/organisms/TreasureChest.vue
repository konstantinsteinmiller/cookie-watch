<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import useEpicConfig from '@/use/useEpicConfig'
import useSounds from '@/use/useSound.ts'
import { spawnCoinExplosion } from '@/use/useCoinExplosion'
import IconCoin from '@/components/icons/IconCoin.vue'
// Persist through the unified `cookie_state` blob — getState/setState write
// the chest's collected-at key into the single in-memory record that the
// SaveManager mirrors to localStorage AND the active platform SDK's cloud save.
import { getState, setState } from '@/use/useEpicState'

interface Props {
  /** Element where the coin explosion VFX flies to (the coin badge). */
  targetEl?: HTMLElement | null
}

const props = withDefaults(defineProps<Props>(), {
  targetEl: null
})

const { addCoins } = useEpicConfig()
const { playSound } = useSounds()

const SMALL_READY_AT_MS = 3 * 60 * 1000
const BIG_READY_AT_MS = 10 * 60 * 1000
const SMALL_REWARD = 25
const BIG_REWARD = 100

const STORAGE_KEY = 'spinner_chest_last_collected_at'

const readStoredAt = () => {
  const v = getState<unknown>(STORAGE_KEY)
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : 0
}

const lastCollectedAt = ref(readStoredAt())
const tickNow = ref(Date.now())
let tickIntervalId: number | null = null

const elapsedMs = computed(() => Math.max(0, tickNow.value - lastCollectedAt.value))

type Phase = 'cooldown' | 'small' | 'big'
const phase = computed<Phase>(() => {
  if (elapsedMs.value < SMALL_READY_AT_MS) return 'cooldown'
  if (elapsedMs.value < BIG_READY_AT_MS) return 'small'
  return 'big'
})

const isReady = computed(() => phase.value !== 'cooldown')
const currentReward = computed(() => (phase.value === 'big' ? BIG_REWARD : SMALL_REWARD))

const remainingMs = computed(() => {
  if (phase.value === 'cooldown') return SMALL_READY_AT_MS - elapsedMs.value
  if (phase.value === 'small') return BIG_READY_AT_MS - elapsedMs.value
  return 0
})

const timeDisplay = computed(() => {
  const totalSec = Math.ceil(remainingMs.value / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

const cooldownRingPct = computed(() => {
  if (phase.value !== 'cooldown') return 0
  return remainingMs.value / SMALL_READY_AT_MS
})

const auraColor = computed(() =>
  phase.value === 'big' ? 'rgba(255,160,0,0.95)' : 'rgba(192,210,225,0.8)'
)

const rootEl = ref<HTMLElement | null>(null)

const onClick = () => {
  if (!isReady.value) return
  const reward = currentReward.value
  addCoins(reward)
  playSound('reward-continue', 0.06)
  if (rootEl.value && props.targetEl) {
    spawnCoinExplosion({ sourceEl: rootEl.value, targetEl: props.targetEl })
  }
  lastCollectedAt.value = Date.now()
  setState(STORAGE_KEY, lastCollectedAt.value)
}

onMounted(() => {
  tickIntervalId = window.setInterval(() => {
    tickNow.value = Date.now()
    const stored = readStoredAt()
    if (stored !== lastCollectedAt.value) lastCollectedAt.value = stored
  }, 1000)
})
onUnmounted(() => {
  if (tickIntervalId !== null) clearInterval(tickIntervalId)
})
</script>

<template lang="pug">
  div.treasure-chest.pointer-events-auto.cursor-pointer.relative(
    ref="rootEl"
    :class="{ 'is-ready': isReady, 'is-big': phase === 'big' }"
    @click="onClick"
  )
    //- Programmatic chest art (SVG). The cooldown overlay sits inside the
    //- same SVG so a clipPath built from the chest body + lid can mask it
    //- to the icon's silhouette — the overlay shrinks within the chest
    //- outline rather than as a separate ring around it.
    svg(
      viewBox="0 0 64 64"
      class="block w-12 h-12 sm:w-14 sm:h-14 chest-svg"
    )
      defs
        linearGradient(id="chestBody" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#a05a2c")
          stop(offset="1" stop-color="#5a2e10")
        linearGradient(id="chestLid" x1="0" y1="0" x2="0" y2="1")
          stop(offset="0" stop-color="#c0732e")
          stop(offset="1" stop-color="#7d4017")
        clipPath(id="chestClip")
          rect(x="6" y="28" width="52" height="28" rx="3")
          path(d="M6 28 Q32 8 58 28 Z")
      rect(x="6" y="28" width="52" height="28" rx="3" fill="url(#chestBody)" stroke="#2a1607" stroke-width="2")
      path(d="M6 28 Q32 8 58 28 Z" fill="url(#chestLid)" stroke="#2a1607" stroke-width="2")
      rect(x="26" y="34" width="12" height="14" rx="2" fill="#fcd34d" stroke="#5a3408" stroke-width="1.5")
      circle(cx="32" cy="40" r="2" fill="#5a3408")
      rect(x="6" y="38" width="52" height="3" fill="#3a1d09" opacity="0.6")
      rect(x="6" y="50" width="52" height="3" fill="#3a1d09" opacity="0.6")

      //- Cooldown overlay: 0.5-opacity black, clipped to the chest outline
      //- via `chestClip`. The rect drains from the top down — at start it
      //- covers the whole chest, at full cooldown it's gone.
      rect(
        v-if="phase === 'cooldown'"
        x="0"
        :y="64 * (1 - cooldownRingPct)"
        width="64"
        :height="64 * cooldownRingPct"
        fill="rgba(0,0,0,0.5)"
        clip-path="url(#chestClip)"
        style="transition: y 0.3s linear, height 0.3s linear"
      )

    //- Status label
    div.absolute.text-center(class="-bottom-4 left-1/2 -translate-x-1/2")
      span.game-text.font-black.text-white.text-shadow-sm(
        v-if="!isReady"
        class="text-[9px] sm:text-[10px] tracking-wide"
      ) {{ timeDisplay }}
      div(
        v-else
        class="flex items-center gap-0.5 px-1 py-0.5 rounded-md"
        :style="{ background: auraColor, boxShadow: `0 0 14px ${auraColor}` }"
      )
        IconCoin(class="w-3 h-3 text-yellow-100")
        span.game-text.font-black.text-white.mr-4(class="text-[9px] sm:text-[10px]") +{{ currentReward }}
</template>

<style scoped lang="sass">
.treasure-chest
  width: 3rem
  height: 3rem
  position: relative

@media (min-width: 640px)
  .treasure-chest
    width: 3.5rem
    height: 3.5rem

.chest-svg
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6))

.is-ready .chest-svg
  animation: chest-bob 1s ease-in-out infinite alternate

@keyframes chest-bob
  from
    transform: translateY(0)
  to
    transform: translateY(-3px)

.is-big .chest-svg
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 8px rgba(255, 160, 0, 0.8))
</style>
