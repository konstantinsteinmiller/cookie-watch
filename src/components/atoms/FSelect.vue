<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

interface Option {
  value: string | number
  label: string
}

interface Props {
  modelValue: string | number
  options: Option[]
  placeholder?: string
  label?: string
  maxHeight?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'SELECT...',
  maxHeight: '200px'
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)
const dropdownRef = ref<HTMLElement | null>(null)

const selectedLabel = computed(() => {
  const option = props.options.find(opt => opt.value === props.modelValue)
  return option ? option.label : props.placeholder
})

const toggle = () => (isOpen.value = !isOpen.value)

const selectOption = (value: string | number) => {
  emit('update:modelValue', value)
  isOpen.value = false
}

// Close when clicking outside
const handleClickOutside = (event: MouseEvent) => {
  if (dropdownRef.value && !dropdownRef.value.contains(event.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template lang="pug">
  div(class="relative w-full font-black" ref="dropdownRef")
    //- Label (Optional)
    div(v-if="label" class="label-text mb-1 ml-1 text-white uppercase italic text-lg tracking-wider") {{ label }}

    //- The Trigger (Styled like FButton)
    button(
      type="button"
      @click="toggle"
      class="group relative w-full inline-block cursor-pointer select-none transition-all duration-75 active:scale-[0.98] hover:scale-[1.02] touch-manipulation focus:outline-none"
    )
      //- 3D Shadow
      span(class="absolute inset-0 translate-y-[4px] rounded-2xl bg-[#1a2b4b]")

      //- Main Button Body
      span(class="relative flex items-center justify-between min-w-[140px] rounded-2xl border-[3px] border-[#0f1a30] px-4 py-3 bg-gradient-to-b from-[#ffcd00] to-[#f7a000]")
        //- Inner Top Shine
        span(class="absolute inset-x-0 top-0 h-1/2 rounded-t-xl bg-white/25")

        //- Selected Text
        span(class="text relative block text-sm md:text-lg tracking-wide text-white uppercase truncate mr-2") {{ selectedLabel }}

        //- Arrow Icon
        span(
          class="relative transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
        )
          svg(width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" class="text-white drop-shadow-[2px_2px_0px_rgba(0,0,0,1)]")
            path(d="m6 9 6 6 6-6")

    //- The Dropdown Menu
    transition(name="pop")
      div(
        v-if="isOpen"
        class="absolute z-1 left-0 right-0 mt-3 rounded-2xl border-[3px] border-[#0f1a30] bg-[#1a2b4b] shadow-2xl overflow-hidden"
      )
        //- Scrollable Area
        div(
          class="custom-scrollbar overflow-y-auto p-2"
          :style="{ maxHeight: maxHeight }"
        )
          div(
            v-for="option in options"
            :key="option.value"
            @click="selectOption(option.value)"
            class="group/item relative mb-1 last:mb-0 cursor-pointer p-3 rounded-xl transition-all duration-75 active:scale-[0.97]"
            :class="modelValue === option.value ? 'bg-[#50aaff]' : 'hover:bg-[#2266ff]'"
          )
            //- Option Shine (only for selected/hover)
            span(class="absolute inset-x-0 top-0 h-1/2 rounded-t-xl bg-white/10")

            span(class="text relative block text-white uppercase text-md tracking-wide") {{ option.label }}
</template>

<style scoped lang="sass">
.text, .label-text
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

/* Custom Scrollbar for that game feel */
.custom-scrollbar
  &::-webkit-scrollbar
    width: 12px

  &::-webkit-scrollbar-track
    background: #0a1425
    border-radius: 10px
    margin: 8px

  &::-webkit-scrollbar-thumb
    background: #50aaff
    border: 3px solid #0f1a30
    border-radius: 10px

    &:hover
      background: #2266ff

/* Transition Animations */
.pop-enter-active, .pop-leave-active
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.1s

.pop-enter-from, .pop-leave-to
  opacity: 0
  transform: translateY(-10px) scale(0.95)
</style>