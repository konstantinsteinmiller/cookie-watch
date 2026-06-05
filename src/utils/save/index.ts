export type { SaveStrategy, LocalStorageAccessor } from './types'
export { isInternalKey, INTERNAL_KEY_PREFIX } from './types'
export { LocalStorageStrategy } from './LocalStorageStrategy'
export { CrazyGamesStrategy } from './CrazyGamesStrategy'
export type { CrazySdkDataGetter } from './CrazyGamesStrategy'
export { GlitchStrategy } from './GlitchStrategy'
export { GameDistributionStrategy } from './GameDistributionStrategy'
export type {
  GlitchStrategyConfig,
  ConflictChoice,
  ConflictResolver,
  GuestBlockedHandler
} from './GlitchStrategy'
export { SaveManager } from './SaveManager'
