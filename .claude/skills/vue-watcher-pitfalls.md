---
name: vue-watcher-pitfalls
description: Avoid common Vue 3 watcher bugs including TDZ errors with immediate watchers and reactive timing issues
---

### `watch(..., { immediate: true })` + `const stop` = TDZ crash

**Never** assign a watcher's stop handle with `const` when using `{ immediate: true }`:

```ts
// BUG: TDZ error if callback fires synchronously
const stop = watch(someRef, (val) => {
  stop()  // ← ReferenceError: Cannot access 'stop' before initialization
}, { immediate: true })
```

When the watched source is already truthy, the callback runs **during** the `watch()` call —
before the return value is assigned to `const stop`. Since `const` variables are in the
Temporal Dead Zone until their initializer completes, `stop()` throws.

This bug is invisible in dev (where the ref might not be ready yet) and only surfaces in
production/obfuscated builds where timing differs (e.g., after `await` calls that give
async initialization time to complete).

**Fix**: Use `let` with a pre-initialized value:

```ts
let stop: (() => void) | null = null
stop = watch(someRef, (val) => {
  stop?.()  // safe — stop is null if called during watch(), function after
}, { immediate: true })
```

### When this typically bites

- Watchers on `isDbInitialized`, `isLoaded`, or similar flags that may already be `true`
  by the time the watcher is created (e.g., after an `await` earlier in the function).
- CrazyGames SDK init, IndexedDB hydration, or asset preloading that completes before
  Vue components mount.
- Obfuscated/minified builds where the error reads like `Cannot access 'i' before initialization`
  (minifier renamed the variable).
