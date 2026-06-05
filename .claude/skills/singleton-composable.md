---
name: singleton-composable
description: Create Vue 3 singleton composables for shared state without Pinia/Vuex
---

Pattern for creating singleton composables (shared state without a store library):

```ts
// src/use/useFeature.ts
import { ref, computed } from 'vue'
import type { Ref } from 'vue'

// --- Persistence ---
const STORAGE_KEY = 'game_feature_state'

interface FeatureState { /* ... */ }

const loadState = (): FeatureState => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) { /* parse and validate */ }
  } catch { /* fall through */ }
  return defaultState()
}

// Module-level refs = singleton (shared across all component instances)
const state: Ref<FeatureState> = ref(loadState())

const saveState = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
}

// --- Derived ---
const derivedValue = computed(() => /* ... */)

// --- Actions ---
const doSomething = () => {
  state.value = { ...state.value, /* changes */ }
  saveState()
}

// --- Public API ---
export default function useFeature() {
  return { state, derivedValue, doSomething }
}
```

Key rules:

1. `ref()` and `computed()` at module level (outside the function) = singleton.
2. Always validate localStorage data with type guards.
3. Save after every mutation.
4. Export named composable function that returns the shared refs.
5. Never use reactive() for the root state — use ref() so `.value` assignment replaces atomically.
