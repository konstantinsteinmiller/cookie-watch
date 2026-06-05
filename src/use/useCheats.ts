import { onMounted, onUnmounted, ref, nextTick } from 'vue'
import useEpicConfig from '@/use/useEpicConfig'
import { spawnTestItemBoxes, spawnTestCratePile, resetForStage } from '@/use/useCookieGame'
import { setState } from '@/use/useEpicState'
import { toggleDebug } from '@/use/useMatch'
import { STAGE_KEY } from '@/keys'

// `cheat` stays a top-level localStorage flag — it's an explicit dev toggle
// that gates the whole keyboard-shortcut module, so we don't want it living
// inside the gameplay save blob (where a cloud restore could re-enable
// cheats on a clean device).
const storedCheat = localStorage.getItem('cheat') || 'false'
const isCheat = ref<boolean>(JSON.parse(storedCheat))

// ─── Always-on key-sequence cheat: type "cmarc" to flip debug mode. ──────
//
// Sits OUTSIDE the `useCheats` factory so it works even when the regular
// cheat module is gated off — flipping `isDebug` is itself the entry point
// to dev tooling (editor button, perf meter, etc.).
//
// Exported + idempotent so a boot-time caller (App.vue setup) can guarantee
// it installs at app start. The old module-level `installDebugUnlock()` call
// only ran when this file's side-effects were retained — but App.vue's bare
// `import useCheats` is tree-shaken in production (the default export is never
// called there), and the only other importer is the LAZY game scene, so on a
// built bundle the sequence listener wasn't attached until the player was
// already in-game (and never at all if they typed it on the menu). Calling
// the exported initialiser from executed setup code can't be tree-shaken.
let debugUnlockInstalled = false
export const installDebugUnlock = (): void => {
  if (typeof window === 'undefined' || debugUnlockInstalled) return
  debugUnlockInstalled = true
  const target = 'cmarc'
  let buf = ''
  const isTypingTarget = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    return el.isContentEditable
  }
  window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e.target)) { buf = ''; return }
    const k = e.key.toLowerCase()
    // Non-character keys (Shift, Tab, arrow keys) don't reset the buffer
    // outright — they just don't extend it — so the cheat survives a stray
    // modifier press. Anything else of length 1 gets appended.
    if (k.length !== 1) return
    buf = (buf + k).slice(-target.length)
    if (buf === target) {
      buf = ''
      toggleDebug()
    }
  })
}
// Best-effort module-level install for dev (vite serve keeps side-effects);
// App.vue also calls installDebugUnlock() in setup so production builds — where
// this bare side-effect can be tree-shaken — still attach the listener at boot.
installDebugUnlock()

const useCheats = () => {
  if (!isCheat.value) return {}

  const { addCoins } = useEpicConfig()

  // Cookie Watch has open-ended stages (tilesToClear scales with stage), so just
  // write the stage into the save blob. `useEpicProgress` watches the blob and
  // refreshes its `stage` ref — but that refresh is a reactive effect that flushes
  // on the next tick, so we `nextTick` before `resetForStage()` (which reads
  // `progress.stage`). That regenerates the field at the new stage IMMEDIATELY
  // (the old behaviour only applied on the next run, so the cheat looked dead).
  const setStage = (stageId: number) => {
    if (stageId < 1) {
      console.warn(`[CHEAT] Invalid stage ${stageId}. Must be >= 1.`)
      return
    }
    setState(STAGE_KEY, stageId)
    void nextTick(() => {
      resetForStage()
      console.warn(`[CHEAT] Stage set to ${stageId} (applied now).`)
    })
  }

  const cheatsMap: Record<string, () => void> = {
    'ctrl+shift+1': () => setStage(1),
    'ctrl+shift+2': () => setStage(2),
    'ctrl+shift+3': () => setStage(3),
    'ctrl+shift+4': () => setStage(4),
    'ctrl+shift+5': () => setStage(5),
    'ctrl+shift+6': () => setStage(6),
    'ctrl+shift+7': () => setStage(7),
    'ctrl+shift+8': () => setStage(8),
    'ctrl+shift+9': () => setStage(9),
    'ctrl+shift+alt+0': () => setStage(10),
    'ctrl+shift+alt+1': () => setStage(11),
    'ctrl+shift+alt+2': () => setStage(12),
    'ctrl+shift+alt+3': () => setStage(13),
    'ctrl+shift+alt+4': () => setStage(14),
    'ctrl+shift+alt+k': () => addCoins(3000),
    // Jump to the stage-10 difficulty test level (the old, dense "stage 1").
    'ctrl+shift+alt+t': () => setStage(10),
    // Spawn a normal item box 1 tile ahead + a GOLDEN box 4 tiles ahead on the
    // ball's path — for testing the Racer dash (golden = 40-tile dash).
    'ctrl+shift+alt+i': () => {
      spawnTestItemBoxes()
      console.warn('[CHEAT] Spawned 1 item box + 1 golden box ahead.')
    },
    // Spawn a 2×2 crate-pile a few tiles ahead — to eyeball the new cluster.
    'ctrl+shift+alt+c': () => {
      spawnTestCratePile()
      console.warn('[CHEAT] Spawned a 2×2 crate-pile ahead.')
    }
  }

  const heldKeys = new Set<string>()
  const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta'])

  const normalizeKey = (e: KeyboardEvent): string | null => {
    const codeMatch = e.code.match(/^Digit(\d)$/)
    if (codeMatch) return codeMatch[1]!
    const k = e.key.toLowerCase()
    return MODIFIER_KEYS.has(k) ? null : k
  }

  const buildShortcut = (e: KeyboardEvent): string => {
    const parts: string[] = []
    if (e.ctrlKey || e.metaKey) parts.push('ctrl')
    if (e.shiftKey) parts.push('shift')
    if (e.altKey) parts.push('alt')
    const sorted = [...heldKeys].sort()
    parts.push(...sorted)
    return parts.join('+')
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.add(key)
    const shortcut = buildShortcut(e)
    if (cheatsMap[shortcut]) {
      e.preventDefault()
      cheatsMap[shortcut]!()
    }
  }

  const handleKeyUp = (e: KeyboardEvent) => {
    const key = normalizeKey(e)
    if (key) heldKeys.delete(key)
  }

  const handleBlur = () => {
    heldKeys.clear()
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown, { passive: false })
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', handleBlur)
  })

  return { isCheat }
}

export default useCheats
