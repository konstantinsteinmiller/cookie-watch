<script setup lang="ts">
import { prependBaseUrl } from '@/utils/function'

// The art lives at `images/props/coin_128x128.webp`. The base-prefix
// helper routes the path through Vite's BASE_URL so the icon resolves
// on builds that ship from a non-root path (wavedash CDN, etc.).
const coinSrc = prependBaseUrl('images/props/coin_128x128.webp')
</script>

<template lang="pug">
  //- Sized by the caller (e.g. `class="w-4 h-4"`) — the img element picks
  //- up width/height utilities the same way the previous inline SVG did.
  img(
    :src="coinSrc"
    alt=""
    draggable="false"
  )
</template>
