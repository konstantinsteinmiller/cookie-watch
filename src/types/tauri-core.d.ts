// Ambient stub for the OPTIONAL native-only Tauri runtime.
//
// `@tauri-apps/api` is intentionally NOT a web dependency: `LevelPlayProvider`
// dynamic-imports it behind a build-time `VITE_APP_NATIVE === 'true'` gate, so
// Rollup eliminates both the call and the package on every web target
// (CrazyGames / GameDistribution / itch / Glitch / GamePix / …). Without the
// package installed, `vue-tsc` can't resolve the `import type` / dynamic import
// in the provider. This pure ambient declaration (no top-level import/export,
// so the file is a global script) makes the module resolvable for type-checking
// only; on a real native build the package's own types take precedence.
declare module '@tauri-apps/api/core' {
  export function invoke<T = unknown>(cmd: string, args?: Record<string, unknown>): Promise<T>
  export function addPluginListener<T = unknown>(
    plugin: string,
    event: string,
    cb: (payload: T) => void
  ): Promise<{ unregister: () => void }>
}
