import { ref, watch, type Ref } from 'vue'
import { saveDataVersion } from '@/use/useSaveStatus'
import { COINS_KEY } from '@/keys'
import { getState, setState, cookieState } from '@/use/useEpicState'

// Coins are stored as a plain number inside the blob. `Number(v)` falls back
// to 0 for any malformed leftover.
const readNumber = (key: string, fallback: number): number => {
  const v = getState<unknown>(key)
  if (v === undefined || v === null) return fallback
  const n = typeof v === 'number' ? v : parseInt(String(v), 10)
  return Number.isFinite(n) ? n : fallback
}

const coins: Ref<number> = ref(readNumber(COINS_KEY, 0))

// Re-read on hydrate-success bump AND on any blob-identity change (cloud sync
// writes back into the blob) so the wallet ref stays in sync.
watch(saveDataVersion, () => {
  coins.value = readNumber(COINS_KEY, coins.value)
})
watch(cookieState, () => {
  coins.value = readNumber(COINS_KEY, coins.value)
}, { deep: false })

const useEpicConfig = () => {
  const addCoins = (amount: number): void => {
    if (!Number.isFinite(amount)) return
    coins.value = Math.max(0, Math.floor(coins.value + amount))
    setState(COINS_KEY, coins.value)
  }

  const spendCoins = (amount: number): boolean => {
    if (amount < 0 || coins.value < amount) return false
    coins.value -= amount
    setState(COINS_KEY, coins.value)
    return true
  }

  return {
    coins,
    addCoins,
    spendCoins
  }
}

export default useEpicConfig
