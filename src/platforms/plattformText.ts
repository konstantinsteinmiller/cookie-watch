// ─── Per-build "available on <hostname>" display string ──────────────────────
//
// Tiny helper that maps the active build's env flags → the hostname string
// shown by the gate UI when the game is loaded outside its target portal.
// Each `if`-return is gated on `import.meta.env.VITE_APP_X === 'true'`, which
// Vite replaces with a string literal at parse time and esbuild constant-folds
// to a single live branch per build.
//
// CRITICAL: this file is in the obfuscator's EXCLUDE list (see
// `vite.config.ts`). If it weren't, the obfuscator's `stringArray` transform
// would extract every hostname literal into a centralized indirection table
// BEFORE esbuild's dead-code elimination could fire — baking every platform's
// hostname into the bundle of every build regardless of flag. That's exactly
// what trips Yandex's moderation "Service storage URL detected" check on
// non-Yandex hostname strings. With the exclude in place, esbuild's DCE
// runs cleanly and only the active build's hostname survives in the chunk.
//
// Why a separate file (not just inline in App.vue): App.vue is a large
// component that benefits from obfuscation. Excluding only this small
// hostname-mapping helper keeps the rest of App.vue obfuscated while
// guaranteeing the per-platform hostnames aren't leaked.

export const getPlattformText = (): string => {
  if (import.meta.env.VITE_APP_YANDEX === 'true') return 'yandex.com/games'
  if (import.meta.env.VITE_APP_CRAZY_WEB === 'true') return 'crazygames.com'
  if (import.meta.env.VITE_APP_WAVEDASH === 'true') return 'wavedash.com'
  if (import.meta.env.VITE_APP_ITCH === 'true') return 'itch.io'
  if (import.meta.env.VITE_APP_GLITCH === 'true') return 'glitch.fun'
  if (import.meta.env.VITE_APP_GAME_DISTRIBUTION === 'true') return 'gamedistribution.com'
  if (import.meta.env.VITE_APP_PLAYGAMA === 'true') return 'playgama.com'
  if (import.meta.env.VITE_APP_GAMEPIX === 'true') return 'gamepix.com'
  if (import.meta.env.VITE_APP_GAME_MONETIZE === 'true') return 'gamemonetize.com'
  return ''
}
