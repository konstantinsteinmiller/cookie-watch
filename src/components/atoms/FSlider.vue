<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue: number
  min?: number
  max?: number
  step?: number
  label?: string
  colorFrom?: string
  colorTo?: string
  trackColor?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: 50,
  min: 0,
  max: 100,
  step: 1,
  colorFrom: '#ffcd00', // Brawl Yellow
  colorTo: '#f7a000',
  trackColor: '#1a2b4b' // Dark Blue depth
})

const emit = defineEmits(['update:modelValue'])

const progress = computed(() => {
  return ((props.modelValue - props.min) / (props.max - props.min)) * 100
})

const updateValue = (event: Event) => {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', Number(target.value))
}
</script>

<template lang="pug">
  div(class="f-slider-container w-full py-4")
    //- Label (Optional)
    div(v-if="label" class="slider-label mb-2 text-white font-black uppercase italic text-lg tracking-wider") {{ label }}

    div(class="relative flex items-center h-8")
      //- Custom Track Background (The 3D "Well")
      div(
        class="absolute inset-0 h-6 my-auto rounded-full border-[3px] border-[#0f1a30] overflow-hidden bg-[#0a1425]"
      )
        //- Progress Fill
        div(
          class="h-full transition-all duration-75 relative"
          :style="{ \
            width: `${progress}%`, \
            backgroundImage: `linear-gradient(to bottom, ${colorFrom}, ${colorTo})` \
          }"
        )
          //- Inner Shine for the fill
          span(class="absolute inset-x-0 top-0 h-1/2 bg-white/20")

      //- Native Input (Invisible but functional)
      input(
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="modelValue"
        @input="updateValue"
        class="absolute inset-0 w-full h-8 opacity-0 cursor-pointer z-10 touch-manipulation"
      )

      //- Custom Thumb (Visual Only)
      div(
        class="thumb-visual pointer-events-none absolute h-10 w-10 flex items-center justify-center transition-transform active:scale-90"
        :style="{ left: `calc(${progress}% - 20px)` }"
      )
        //- The "3D Shadow" of the thumb
        span(class="absolute inset-0 translate-y-[3px] bg-[#102e7a] rounded-xl border-[3px] border-[#0f1a30]")
        //- The Main Thumb Body
        span(class="relative block inset-0 w-full h-full bg-[#50aaff] rounded-xl border-[3px] border-[#0f1a30] overflow-hidden")
          //- Thumb Shine
          span(class="absolute inset-x-0 top-0 h-1/2 bg-white/30")
          //- Little Detail (Vertical Line)
          span(class="absolute inset-0 flex items-center justify-center")
            span(class="w-1.5 h-4 bg-white/50 rounded-full")
</template>

<style scoped lang="sass">
.slider-label
  text-shadow: 2px 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000

.f-slider-container
  -webkit-tap-highlight-color: transparent

/* Ensure the native range covers the whole area for better hitboxes */
input[type="range"]
  -webkit-appearance: none
  background: transparent

  &::-webkit-slider-thumb
    -webkit-appearance: none
    width: 40px
    height: 40px
    cursor: pointer

  &::-moz-range-thumb
    width: 40px
    height: 40px
    cursor: pointer
    border: none
    background: transparent
</style>