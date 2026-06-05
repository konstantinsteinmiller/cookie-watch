import { ref } from 'vue'

const safeParseBool = (v: string | null): boolean => {
  try { return !!JSON.parse(v || 'false') } catch { return false }
}
const debugSaved = safeParseBool(localStorage.getItem('debug'))
const envDebug = import.meta.env.VITE_APP_DEBUG === 'true'
const isProductionBuild = import.meta.env.VITE_NODE_ENV === 'production'
// The explicit `cheat` opt-in (set by QA / dev) unlocks saved-debug on ANY
// build — without it, a `production` platform build (Playgama, GamePix, …)
// ignored a persisted `debug=true` at boot, so debug mode silently reset to
// off on every reload and `cmarc`'s toggle "didn't stick".
const cheatEnabled = safeParseBool(localStorage.getItem('cheat'))
export const isDebug = ref(envDebug || cheatEnabled || (!isProductionBuild && debugSaved))
export const isCrazyGamesFullRelease = import.meta.env.VITE_APP_CRAZY_GAMES_FULL_RELEASE === 'true'

/** Flip `isDebug` and persist the new value under the bare `debug` key.
 *  The "cmarc" cheat sequence calls this so the dev can pop into debug
 *  mode mid-session without a reload — every consumer that binds to
 *  `isDebug` (editor button, perf meter, etc.) reacts immediately. */
export const toggleDebug = (): boolean => {
  const next = !isDebug.value
  isDebug.value = next
  try { localStorage.setItem('debug', JSON.stringify(next)) } catch { /* harmless */ }
  console.warn(`[cheat] Debug mode ${next ? 'ENABLED' : 'DISABLED'}.`)
  return next
}

export const isSplashScreenVisible = ref<boolean>(false)
export const isDbInitialized = ref<boolean>(false)

export const useMatch = () => {
  const turn = ref<'player' | 'npc'>('player')
  const isThinking = ref(false)

  const resetGame = () => {}

  return {
    turn,
    resetGame,
    isThinking
  }
}

export default useMatch
