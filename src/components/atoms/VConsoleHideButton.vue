<template lang="pug">
  button.fixed.rounded-full.shadow-lg.font-bold.text-white(
    v-if="isVConsoleVisible"
    class="bottom-4 left-4 z-[10000] bg-rose-600 px-3 py-1 text-xs"
    style="pointer-events: auto;"
    @click="onClick"
    aria-label="Hide vConsole"
  ) Hide vConsole
</template>

<script setup lang="ts">
// Floating button that tears down vConsole when tapped. Sibling to
// vConsole's own bottom-right toggle — placed bottom-left so it doesn't
// overlap. Visible only while vConsole is mounted; hidden otherwise.
//
// Tapping calls `disableVConsole()` which destroys the vConsole instance
// AND clears the chord-tap counter so the developer has to re-trigger the
// 50-tap chord to bring it back. Treat this as the "exit debug mode"
// equivalent of closing DevTools.

import { isVConsoleVisible, disableVConsole } from '@/use/useVConsole'

const onClick = (): void => {
  disableVConsole()
}
</script>
