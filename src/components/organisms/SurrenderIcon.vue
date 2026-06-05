<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{
  (e: 'surrender'): void
  (e: 'open-change', open: boolean): void
}>()

const { t } = useI18n()
const showConfirm = ref(false)

watch(showConfirm, (open) => emit('open-change', open))

const onIconClick = () => {
  showConfirm.value = true
}

const onConfirm = () => {
  showConfirm.value = false
  emit('surrender')
}

const onCancel = () => {
  showConfirm.value = false
}
</script>

<template lang="pug">
  //- Surrender button — white flag icon
  button.pointer-events-auto.group.cursor-pointer.z-10(
    class="hover:scale-[103%] transition-transform active:scale-90 scale-80 sm:scale-100"
    @click="onIconClick"
  )
    div.relative
      //- Shadow
      div.absolute.inset-0.translate-y-1.rounded-lg(class="bg-[#4a1a1a]")
      //- Body
      div.relative.rounded-lg.border-2(
        class="p-1.5 bg-gradient-to-b from-[#ff5555] to-[#cc2222] border-[#0f1a30]"
      )
        //- White flag SVG — a pole with a triangular pennant
        svg(
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          class="h-5 w-5 sm:h-6 sm:w-6 text-white ml-2"
        )
          //- Pole
          line(x1="5" y1="2" x2="5" y2="22" stroke-width="2" stroke-linecap="round")
          //- Flag waving
          path(
            d="M5 3 C8 2 10 5 14 4 L14 4 C14 4 14 12 14 12 C10 13 8 10 5 11"
            stroke-width="1.5"
            fill="rgba(255,255,255,0.3)"
            stroke-linejoin="round"
          )

  //- Confirmation modal
  Teleport(to="body")
    Transition(
      enter-active-class="transition-all duration-200 ease-out"
      leave-active-class="transition-all duration-150 ease-in"
      enter-from-class="opacity-0 scale-90"
      leave-to-class="opacity-0 scale-90"
    )
      div(
        v-if="showConfirm"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4"
        :style="{\
          paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',\
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',\
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        //- Backdrop
        div(class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="onCancel")

        //- Dialog
        div(class="relative bg-gradient-to-b from-[#1a2340] to-[#0f1520] border-2 border-[#2a3a5a] rounded-xl p-6 max-w-xs w-full text-center")
          //- Flag icon
          div.flex.justify-center.mb-3
            svg(
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              class="h-10 w-10 text-red-400"
            )
              line(x1="5" y1="2" x2="5" y2="22" stroke-width="2" stroke-linecap="round")
              path(
                d="M5 3 C8 2 10 5 14 4 L14 4 C14 4 14 12 14 12 C10 13 8 10 5 11"
                stroke-width="1.5"
                fill="rgba(248,113,113,0.2)"
                stroke-linejoin="round"
              )

          //- Title
          div.text-white.font-black.uppercase.tracking-wider.game-text(class="text-lg sm:text-xl mb-2")
            | {{ t('spinner.surrender') }}

          //- Subtitle
          div.text-gray-400.game-text(class="text-xs sm:text-sm mb-5")
            | {{ t('spinner.surrenderConfirm') }}

          //- Buttons
          div.flex.gap-3.justify-center
            button(
              class="px-5 py-2 rounded-lg border-2 border-[#2a3a5a] bg-[#1a2540] text-gray-300 font-bold game-text uppercase text-sm hover:bg-[#243050] transition-colors cursor-pointer"
              @click="onCancel"
            ) {{ t('spinner.surrenderCancel') }}
            button(
              class="px-5 py-2 rounded-lg border-2 border-[#6b1212] bg-gradient-to-b from-[#ff4444] to-[#cc2222] text-white font-bold game-text uppercase text-sm hover:from-[#ff5555] hover:to-[#dd3333] transition-colors cursor-pointer"
              @click="onConfirm"
            ) {{ t('spinner.surrenderQuit') }}
</template>
