<script setup lang="ts">

export interface TabOption {
  label: string
  value: string | number
}

interface Props {
  modelValue: string | number
  options: TabOption[]
}

const props = defineProps<Props>()
const emit = defineEmits(['update:modelValue'])

const selectTab = (value: string | number) => {
  emit('update:modelValue', value)
}
</script>

<template lang="pug">
  div(class="flex items-end justify-center gap-0 px-4")
    button.cursor-pointer(
      v-for="tab in options"
      :key="tab.value"
      @click="selectTab(tab.value)"
      :class="[\
        'relative group transition-all duration-150 active:scale-90',\
        modelValue === tab.value ? 'z-10 -translate-y-1' : 'z-0 opacity-80 hover:opacity-100'\
      ]"
    )
      //- Shadow/Bottom Border
      div(
        class="absolute inset-0 translate-y-1 rounded-t-xl sm:rounded-t-2xl bg-[#0f1a30]"
      )

      //- Tab Body
      div(
        :class="[\
          'relative px-3 py-1 sm:px-5 sm:py-1.5 border-x-4 border-t-4 border-[#0f1a30] rounded-t-xl sm:rounded-t-2xl font-black uppercase italic tracking-wider transition-colors',\
          tab.icon ? 'cursor-pointer': '', \
            modelValue === tab.value \
            ? 'bg-gradient-to-b from-[#ffcd00] to-[#f7a000] text-white shadow-[inset_0_4px_0_rgba(255,255,255,0.4)]'\
            : 'bg-[#2a4372] opacity-80 text-[#8fa7d1] hover:bg-[#34538d]'\
        ]"
      )
        div.w-7.h-7.object-fill(v-if="tab.icon")
          img.object-fill(:src="tab.icon" class="")
        span(v-else class="brawl-text text-xs sm:text-base") {{ tab.label }}
</template>

<style lang="sass" scoped>
.brawl-text
  text-shadow: 2px 2px 0 #000

@media (orientation: landscape) and (max-height: 500px)
  .brawl-text
    font-size: 0.7rem
</style>