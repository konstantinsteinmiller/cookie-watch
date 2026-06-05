<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  label?: string
  type?: 'primary' | 'secondary'
  variant?: 'default' | 'brawl'
  isDisabled?: boolean
  colorFrom?: string
  colorTo?: string
  shadowColor?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  attention?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  label: 'NO LABEL DEFINED!',
  type: 'primary',
  variant: 'default',
  attention: false
})

defineEmits(['click'])

// Map the theme colors based on the type prop
const theme = computed(() => {
  if (props.type === 'secondary') {
    return {
      from: props.colorFrom ?? '#50aaff', // Light Blue
      to: props.colorTo ?? '#2266ff',     // Darker Blue
      shadow: props.shadowColor ?? '#102e7a'
    }
  }
  // Default Primary (Brawl Stars Yellow)
  return {
    from: props.colorFrom ?? '#ffcd00',
    to: props.colorTo ?? '#f7a000',
    shadow: props.shadowColor ?? '#1a2b4b'
  }
})

// Compute container scaling and layout
const containerClasses = computed(() => {
  const isBrawl = props.variant === 'brawl'
  return {
    'w-full': true,
    'flex justify-center': isBrawl,
    // Brawl specific scaling
    'scale-75': isBrawl && props.size === 'sm',
    'scale-90': isBrawl && props.size === 'md',
    'scale-125': isBrawl && props.size === 'xl',
    // Default specific scaling
    'scale-60': !isBrawl && props.size === 'sm',
    'scale-80': !isBrawl && props.size === 'md',
    'scale-110': props.size === 'lg',
    'scale-120': !isBrawl && props.size === 'xl',
    'attention-bounce': props.attention,
    'opacity-50 grayscale pointer-events-none': props.isDisabled
  }
})
</script>

<template lang="pug">
  div(:class="containerClasses")
    button(
      type="button"
      @click="$emit('click')"
      :class="[\
        variant === 'brawl' \
          ? 'inline-block skew-x-[-12deg] active:scale-95' \
          : 'w-full inline-block active:scale-x-[95%] active:scale-y-[90%] hover:scale-[103%]',\
        'group relative cursor-pointer select-none transition-all duration-75 hover:brightness-110 touch-manipulation'\
      ]"
    )
      //- The "Bottom Shadow" / 3D Depth
      span.f-button-shadow(
        :style="{ backgroundColor: theme.shadow }"
        :class="[\
          variant === 'brawl' \
            ? 'translate-y-[3px] w-full h-full rounded-xl' \
            : 'absolute inset-0 translate-y-[3px] md:translate-y-[3px] rounded-2xl'\
        ]"
        class="absolute inset-0"
      )

      //- The Main Button Body
      span.f-button-body(
        :style="{ backgroundImage: `linear-gradient(to bottom, ${theme.from}, ${theme.to})` }"
        :class="[\
          variant === 'brawl' \
            ? 'min-w-[120px] md:min-w-[180px] border-b-[3px] border-black/20 px-8 py-3 md:py-4 rounded-lg' \
            : 'min-w-[80px] md:min-w-[140px] rounded-xl md:rounded-2xl border-[2px] border-[#0f1a30] px-4 md:px-6 py-2 md:py-3'\
        ]"
        class="relative block"
      )
        //- Inner Top Shine (The classic game shine)
        span(
          :class="[\
            variant === 'brawl' \
              ? 'h-[50%] bg-white/30 rounded-t-lg' \
              : 'h-1/2 rounded-t-xl bg-white/25'\
          ]"
          class="absolute inset-x-0 top-0"
        )

        //- Button Text / Content
        span(:class="{ 'skew-x-[12deg]': variant === 'brawl' }" class="relative block")
          span.text(
            :class="[\
              variant === 'brawl' \
                ? 'text-lg md:text-2xl tracking-tighter italic' \
                : 'text-sm md:text-xl tracking-wide'\
            ]"
            class="relative block text-white uppercase font-black"
          )
            slot Button
</template>

<style scoped lang="sass">
button
  -webkit-tap-highlight-color: transparent

.text
  // Thick gaming-style text outline
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

.attention-bounce
  animation: bounce 0.6s infinite alternate

@keyframes bounce
  from
    transform: translateY(0)
  to
    transform: translateY(-5px)
</style>