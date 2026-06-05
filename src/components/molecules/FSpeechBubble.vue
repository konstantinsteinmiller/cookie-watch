//- @/components/molecules/FSpeechBubble.vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface Props {
  modelValue: boolean
  text: string
  speakerName?: string
}

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  text: { type: String, required: false },
  speakerName: { type: String, required: false }
})
const emit = defineEmits(['update:modelValue', 'complete'])

const close = () => {
  emit('update:modelValue', false)
  emit('complete')
}
</script>

<template lang="pug">
  Transition(name="pop")
    div(v-if="modelValue" class="fixed left-0 right-0 inset-0 z-[100] flex items-center justify-center p-6")
      //- Backdrop (Lightly darkens board to focus on text)
      div(class="absolute inset-0 bg-black/40 backdrop-blur-[2px]" @click="close")

      div(class="relative max-w-sm w-full cursor-pointer" @click="close")
        //- The Bubble Container
        div(class="relative bg-[#1a2b4b] border-[4px] border-[#0f1a30] rounded-2xl p-5 shadow-2xl")

          //- Speaker Name Ribbon (Brawl Stars Style)
          div(v-if="speakerName" class="absolute -top-5 left-6 bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-2 border-[#0f1a30] px-3 py-0.5 rounded-lg shadow-md")
            span(class="brawl-text text-sm text-white uppercase font-bold") {{ speakerName }}

          //- Dialogue Text
          div(class="text-white text-lg font-medium leading-tight pt-1")
            | {{ text }}

          //- Tap to Continue indicator
          div(class="mt-3 flex justify-end items-center gap-2 opacity-70")
            span(class="text-[10px] uppercase font-bold text-amber-400") {{ t('spinner.tapToStart') }}
            div(class="w-2 h-2 bg-amber-400 rounded-full animate-ping")

          //- The Bubble Tail
          div(class="absolute -bottom-3 left-10 w-6 h-6 bg-[#1a2b4b] border-r-[4px] border-b-[4px] border-[#0f1a30] rotate-45")

</template>

<style scoped lang="sass">
.brawl-text
  text-shadow: 2px 2px 0 #000

.pop-enter-active
  animation: bounce-in 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28)

.pop-leave-active
  animation: bounce-in 0.2s ease-in reverse

@keyframes bounce-in
  0%
    transform: scale(0.3) translateY(20px)
    opacity: 0
  100%
    transform: scale(1) translateY(0)
    opacity: 1
</style>