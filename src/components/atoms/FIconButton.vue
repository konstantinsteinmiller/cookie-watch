<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  icon?: 'close' | 'left' | 'right'
  imgSrc?: string
  type?: 'danger' | 'primary' | 'secondary'
  size?: 'sm' | 'md' | 'lg'
}

const props = withDefaults(defineProps<Props>(), {
  icon: 'close',
  type: 'danger',
  size: 'md'
})

const emit = defineEmits(['click'])

const selectedIcon = computed(() => {
  switch (props.icon) {
    case 'left':
      return { viewBox: '0 0 24 24', path: 'M15 19l-7-7 7-7' }
    case 'right':
      return { viewBox: '0 0 24 24', path: 'M9 5l7 7-7 7' }
    case 'close':
    default:
      return { viewBox: '0 0 24 24', path: 'M6 18L18 6M6 6l12 12' }
  }
})

const theme = computed(() => {
  switch (props.type) {
    case 'secondary':
      return {
        bg: 'bg-gradient-to-b from-[#50aaff] to-[#2266ff]',
        shadow: 'bg-[#102e7a]',
        border: 'border-[#0f1a30]'
      }
    case 'primary':
      return {
        bg: 'bg-gradient-to-b from-[#ffcd00] to-[#f7a000]',
        shadow: 'bg-[#1a2b4b]',
        border: 'border-[#0f1a30]'
      }
    case 'danger':
    default:
      return {
        bg: 'bg-[#ff3e3e]',
        shadow: 'bg-[#6b1212]',
        border: 'border-[#0f1a30]'
      }
  }
})

const sizeClasses = computed(() => {
  switch (props.size) {
    case 'sm':
      return { btn: 'p-1.5', icon: 'h-4 w-4', img: 'h-5 w-5', scale: 'scale-70 sm:scale-80' }
    case 'lg':
      return { btn: 'p-3', icon: 'h-6 w-6', img: 'h-9 w-9', scale: 'scale-80 sm:scale-110' }
    case 'md':
    default:
      return { btn: 'p-2', icon: 'h-4 w-4', img: 'h-7 w-7', scale: 'scale-80 sm:scale-100' }
  }
})
</script>

<template lang="pug">
  button(
    @click="emit('click')"
    :class="[\
      'group cursor-pointer z-10 hover:scale-[103%] transition-transform active:scale-90',\
      sizeClasses.scale\
    ]"
  )
    div.relative
      div.f-icon-button-shadow.absolute.inset-0.translate-y-1.rounded-lg(
        class=""
        :class="theme.shadow"
      )
      div.relative.rounded-lg.border-2.text-white.font-bold(
        :class="[theme.bg, theme.border, sizeClasses.btn]"
      )
        //- Image icon
        img(
          v-if="imgSrc"
          :src="imgSrc"
          :class="sizeClasses.img"
          class="object-contain"
        )
        //- SVG icon
        svg(
          v-else
          xmlns="http://www.w3.org/2000/svg"
          :class="sizeClasses.icon"
          fill="none"
          :viewBox="selectedIcon.viewBox"
          stroke="currentColor"
        )
          path(
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="4"
            :d="selectedIcon.path"
          )
</template>
