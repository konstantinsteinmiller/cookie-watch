---
name: pug-tailwind-component
description: Create Vue 3 SFC components using Pug template syntax with Tailwind CSS v4
---

When creating Vue components in this project, follow these patterns:

1. **Template syntax**: Always use `<template lang="pug">`.
2. **Styling**: Use `<style scoped lang="sass">` for component styles.
3. **Tailwind classes in Pug**: Use parenthesized `class=""` attribute for complex classes:
   ```pug
   div.flex.items-center(class="gap-2 sm:gap-4 text-sm sm:text-base")
   ```

4. **Dynamic classes**: Use `:class` with array or object syntax, escape line breaks with `\`:
   ```pug
   div(
     :class="[\
       isActive ? 'bg-yellow-500' : 'bg-slate-700',\
       'rounded-lg border-2'\
     ]"
   )
   ```
5. **Dynamic styles with safe-area**: Use `:style` with template literals:
   ```pug
   div(
     :style="{\
       bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)`,\
       left: 'calc(0.5rem + env(safe-area-inset-left, 0px))'\
     }"
   )
   ```
6. **Responsive sizing**: Always mobile-first: `text-sm sm:text-base`, `scale-80 sm:scale-100`.
7. **3D button pattern**: Shadow div underneath + gradient body:
   ```pug
   div.relative
     div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#1a2b4b]")
     div.relative.rounded-lg.border-2(class="bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-[#0f1a30]")
   ```
8. **Game text**: Use `.game-text` class for text-shadow on game UI text.
9. **Transitions**: Use Vue `<Transition>` with Tailwind utility classes for enter/leave.
10. **Modals**: Always use `FModal` molecule with v-model, safe-area padding, and optional `#footer` slot.
