<template lang="pug">
  //- "Watch ad" movie/film icon. Two-tone (white body + dark navy outline) so
  //- it reads on the yellow / green / emerald ad buttons. Sized by the caller
  //- via a `class="w-N h-N"` utility, same convention as the other icon
  //- components. Extracted from the inline SVG that used to live in
  //- AdRewardButton.vue so every "watch ad" affordance shares one glyph.
  svg(
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
  )
    rect(x="3" y="6" width="14" height="12" rx="1.5" fill="#fff" stroke="#1a2b4b" stroke-width="1.5")
    path(d="M17 10 L21 7 L21 17 L17 14 Z" fill="#fff" stroke="#1a2b4b" stroke-width="1.5" stroke-linejoin="round")
    path(d="M9 10 L13 12 L9 14 Z" fill="#1a2b4b")
</template>
