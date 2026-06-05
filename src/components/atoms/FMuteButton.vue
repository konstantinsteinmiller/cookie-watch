<script setup lang="ts">
import { mobileCheck } from '@/utils/function'
import { isMobilePortrait, isMobileLandscape } from '@/use/useUser'
import { isMuted, toggleMute } from '@/use/useCrazyMuteSync'
import { isMobileAudioMuted, toggleMobileAudioMute } from '@/use/useMobileAudioMute'
</script>

<template lang="pug">
  div.flex.flex-col.items-end.gap-1
    //- Desktop: volume-based mute (Web Audio gain works here).
    button.p-2.rounded-full.backdrop-blur-sm.transition-all.cursor-pointer(
      v-if="!mobileCheck()"
      class="bg-black/20 hover:bg-black/40 active:scale-95 pointer-events-auto"
      @click="toggleMute"
    )
      span.text-2xl {{ isMuted ? '🔇': '🔊' }}
    //- Mobile: hard silence toggle. The OS volume rocker owns the device level,
    //- so this suspends all engine audio + blocks new music/SFX instead of
    //- changing volume — letting players run their own music app.
    button.p-2.rounded-full.backdrop-blur-sm.transition-all.cursor-pointer(
      v-else-if="isMobilePortrait || isMobileLandscape"
      class="bg-black/20 hover:bg-black/40 active:scale-95 pointer-events-auto"
      @click="toggleMobileAudioMute"
    )
      span.text-2xl {{ isMobileAudioMuted ? '🔇': '🔊' }}
</template>

<style scoped lang="sass">

</style>
