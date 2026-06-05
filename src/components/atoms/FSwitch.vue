<template lang="pug">
  div(
    class="flex items-center gap-3 cursor-pointer select-none group"
    @click="toggle"
  )
    span(class="brawl-text text-white text-sm uppercase tracking-wide")
      slot
    div(
      class="relative w-14 h-8 rounded-full border-4 border-[#0f1a30] transition-colors duration-200"
      :class="modelValue ? 'bg-[#4ade80]' : 'bg-[#1e293b]'"
    )
      //- Inner Shadow/Track
      div(class="absolute inset-0 rounded-full bg-black/20")
      //- Knob
      div(
        class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full border-2 border-[#0f1a30] transition-all duration-200 shadow-md"
        :class="modelValue ? 'translate-x-6 bg-white' : 'translate-x-0 bg-slate-400'"
      )
        //- Knob Shine
        div(class="absolute top-0.5 left-1 w-2 h-1 bg-white/50 rounded-full")
</template>

<script setup lang="ts">
interface Props {
  modelValue: boolean
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const toggle = () => {
  emit('update:modelValue', !props.modelValue)
}
</script>

<style lang="sass" scoped>
.brawl-text
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000
</style>