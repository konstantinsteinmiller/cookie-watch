<script setup lang="ts" generic="T extends string | number">
// Fancy multi-option pill switch with the same gold gradient + 3D drop-shadow
// look as the rest of the arena UI. Renders one button per option; the active
// one is highlighted. Click events bubble up via `click` so the parent can
// decide whether to actually change the model value (e.g. gating a choice
// behind a rewarded video).

interface Option {
  value: T
}

interface Props {
  modelValue: T
  options: Option[]
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void
  (e: 'click', value: T): void
}>()

const onClick = (value: T) => {
  emit('click', value)
  emit('update:modelValue', value)
}
</script>

<template lang="pug">
  div.button-switch.relative.inline-block
    //- 3D drop-shadow base
    div.absolute.inset-0.translate-y-1.rounded-xl(class="bg-[#1a2b4b]")
    //- Pill body
    div.relative.flex.rounded-xl.border-2.overflow-hidden.shadow-lg(
      class="bg-gradient-to-b from-[#0f1a30] to-[#1a2b4b] border-[#0f1a30]"
    )
      div.relative.button-wrap(v-for="option in options" :key="option.value")
        button.relative.cursor-pointer.transition-all.font-black.game-text.leading-none(
          class="px-3 py-1.5 text-xs sm:text-sm active:scale-95"
          :class="modelValue === option.value \
            ? 'bg-gradient-to-b from-[#ffcd00] to-[#f7a000] text-white shadow-inner' \
            : 'text-white/60 hover:text-white'"
          @click="onClick(option.value)"
        )
          slot(name="default" :option="option" :is-active="modelValue === option.value") {{ option.value }}
        slot(name="hint" :option="option" :is-active="modelValue === option.value")
</template>
