<script setup lang="ts">
import { watch, onMounted, onUnmounted } from 'vue'
import FTabs, { type TabOption } from '@/components/atoms/FTabs.vue'
import { isMobileLandscape, isMobilePortrait } from '@/use/useUser'
import useSounds from '@/use/useSound'
import { acquireModalOpen } from '@/use/useModalState'

interface Props {
  modelValue: boolean | any
  title?: string
  isClosable?: boolean
  tabs?: TabOption[]
  activeTab?: string | number
}

const props = withDefaults(defineProps<Props>(), {
  isClosable: true,
  tabs: () => []
})

const emit = defineEmits(['update:modelValue', 'update:activeTab'])

// Root is a <Teleport>, so class/style passed by parents can't auto-inherit
// and Vue warns about extraneous attrs. Opt out of auto-inherit and forward
// $attrs explicitly onto the actual modal container below.
defineOptions({ inheritAttrs: false })

// Single audio cue every time the modal flips from closed → open.
// Living in FModal means every consumer (Upgrades, Achievements, Daily,
// Options, etc.) inherits it for free without each one wiring its own
// playSound call.
const { playSound } = useSounds()

// Signal "a modal is open" so the CrazyGames gameplay-lifecycle driver fires
// `gameplayStop()` on open and `gameplayStart()` on close. Centralised here so
// every FModal consumer participates without wiring it per-modal. Refcounted
// release; held once per open and dropped on close or unmount.
let releaseModalOpen: (() => void) | null = null
const markOpen = (): void => { if (!releaseModalOpen) releaseModalOpen = acquireModalOpen() }
const markClosed = (): void => { releaseModalOpen?.(); releaseModalOpen = null }

watch(() => props.modelValue, (open, prev) => {
  if (open && !prev) playSound('modal-open', 0.07)
  if (open) markOpen()
  else markClosed()
})

// Catch a modal that mounts already-open, and always release on teardown so a
// modal destroyed while open can't strand the gameplay-stopped state.
onMounted(() => { if (props.modelValue) markOpen() })
onUnmounted(() => markClosed())

const close = () => {
  emit('update:modelValue', false)
}

const handleTabChange = (val: string | number) => {
  emit('update:activeTab', val)
}
</script>

<template lang="pug">
  //- Teleport to body so the modal's `position: fixed` isn't trapped by
  //- any ancestor `transform` (e.g. the scaled bottom-row button stacks),
  //- which would otherwise promote the stack to a containing block and
  //- pin the modal inside it.
  Teleport(to="body")
    Transition(
      name="pop"
      appear
      enter-active-class="transition-all duration-[400ms] ease-[cubic-bezier(0.18,0.89,0.32,1.28)]"
      leave-active-class="transition-all duration-[200ms] ease-[cubic-bezier(0.6,-0.28,0.735,0.045)]"
      enter-from-class="opacity-0 scale-50 translate-y-12"
      leave-to-class="opacity-0 scale-50 translate-y-12"
    )
      div(
        v-if="modelValue"
        v-bind="$attrs"
        class="modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
        :class="{ 'fmodal-landscape': isMobileLandscape }"
        :style="{\
          paddingTop: 'calc(1rem + env(safe-area-inset-top, 0px))',\
          paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',\
          paddingLeft: 'calc(1rem + env(safe-area-inset-left, 0px))',\
          paddingRight: 'calc(1rem + env(safe-area-inset-right, 0px))'\
        }"
      )
        //- Backdrop
        div(class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="close")

        //- Modal Container — a flex column capped at the available viewport
        //- height so the inner content scrolls instead of pushing the
        //- header off-screen or clipping the bottom edge.
        div(class="model-container relative w-full max-w-2xl flex flex-col max-h-full")

          //- Header (Title or Tabs). Lives IN the layout flow (not absolute),
          //- so the ribbon / tab bar can never sit above the modal-overlay
          //- top edge — its top is always inside the viewport. The negative
          //- bottom margin lets the ribbon visually overlap the frame top
          //- without consuming layout space below it.
          div(
            v-if="(tabs && tabs.length > 0) || title"
            class="modal-header flex justify-center shrink-0 relative z-20 -mb-1 sm:-mb-2 translate-y-2"
            :class="{ 'scale-80 origin-bottom !mb-0': isMobileLandscape }"
            @click="close"
          )
            FTabs(
              v-if="tabs && tabs.length > 0"
              :model-value="activeTab"
              @update:model-value="handleTabChange"
              @click.stop
              :options="tabs"
              class="mx-auto w-max !px-0"
            )
            div(
              v-else-if="title"
              class="ribbon-header relative scale-70 sm:scale-100"
              @click.stop
            )
              div(class="absolute inset-0 translate-y-1 rounded-lg bg-[#1a2b4b]")
              div(class="relative flex items-center justify-center bg-gradient-to-b from-[#ffcd00] to-[#f7a000] border-4 border-[#0f1a30] px-10 py-2 rounded-xl")
                span(class="brawl-text text-2xl md:text-3xl text-white uppercase tracking-wider whitespace-nowrap")
                  | {{ title }}

          //- The Main Frame — fills the remaining vertical space inside the
          //- container. `min-h-0` lets the inner overflow-y-auto actually
          //- scroll instead of expanding the frame to fit its content.
          div(class="relative flex-1 min-h-0 flex flex-col")
            div(class="absolute inset-0 translate-y-2 rounded-[1.5rem] sm:rounded-[2.5rem] bg-[#0c1626]")

            div(class="modal-frame relative flex-1 min-h-0 flex flex-col bg-[#1a2b4b] border-[5px] border-[#0f1a30] rounded-[1.25rem] sm:rounded-[2rem]")

              //- Close Button (X) — absolutely positioned at the top-right
              //- corner, overhanging slightly. Sits in the same z-stack as
              //- the header so the ribbon's negative margin doesn't bury it.
              button(
                v-if="isClosable"
                @click="close"
                class="hover:scale-[103%] -mt-4 -mr-4 absolute top-0 right-0 z-30 group cursor-pointer transition-transform \
                       active:scale-40 sm:active:scale-90 scale-70 sm:scale-100 sm:top-2 sm:right-2 md:top-3 md:right-3"
                :class="{ 'scale-100': isMobilePortrait,  '-mt-6 -mr-5': isMobileLandscape,  '-mt-6 -mr-6': !isMobileLandscape && !isMobilePortrait }"
              )
                div(class="relative")
                  div(class="absolute inset-0 translate-y-1 rounded-lg bg-[#6b1212]")
                  div(class="relative custom-red-bg border-2 border-[#0f1a30] rounded-lg p-2 text-white font-bold")
                    svg(xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor")
                      path(stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M6 18L18 6M6 6l12 12")

              //- Scrollable content. The top padding clears the ribbon's
              //- overlap (the bottom of the ribbon sits ~0.75-1rem inside
              //- the frame); right padding keeps content clear of the X
              //- close button.
              div(class="modal-content-slot flex-1 min-h-0 overflow-y-auto text-white text-center pt-6 sm:pt-7 pb-2 px-2 sm:px-4 md:pt-9 md:px-6")
                slot

              //- Footer — sits at the bottom, doesn't scroll with content.
              //- Empty footer collapses out of layout.
              div(class="modal-footer-slot shrink-0 flex justify-center gap-4 pb-2")
                slot(name="footer")
</template>

<style scoped lang="sass">
.pop-enter-active
  animation: bounce-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)

.pop-leave-active
  animation: bounce-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1) reverse

@keyframes bounce-in
  0%
    transform: scale(0.5)
    opacity: 0
  100%
    transform: scale(1)
    opacity: 1

.brawl-text
  text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000

// Hide the empty footer wrapper entirely so it doesn't reserve a row.
.modal-footer-slot:empty
  display: none

// ─── Landscape mobile: tighter chrome ────────────────────────────────────────
//
// Driven by the JS `isMobileLandscape` flag (mobileCheck + landscape) applied
// as `.fmodal-landscape` on the overlay — NOT a `max-height` media query, which
// disagreed with the flag on tall landscape phones and left the modal centred
// with a big empty gap above the header (issue in the report screenshots).
//
// `align-items: stretch` + `max-height: 100%` make the modal claim the full
// short-axis height so the header/tabs are never pushed off-screen and the top
// dead-space collapses. The flex-column inside still scrolls on overflow.
.fmodal-landscape
  padding: 0.3rem !important
  align-items: stretch

  .model-container
    max-width: 46rem
    max-height: 100%

  .modal-frame
    border-width: 3px
    border-radius: 1rem

  // Pull the content slot's padding back so the smaller header (scale-80)
  // doesn't leave a gaping margin under the ribbon, and so more rows fit.
  .modal-content-slot
    padding-top: 0.4rem
    padding-bottom: 0.2rem
    padding-left: 0.6rem
    padding-right: 0.6rem

  .modal-footer-slot
    padding-bottom: 0.2rem
    gap: 0.25rem
</style>
