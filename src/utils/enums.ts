import type { ENUM } from '@/types'

export const DIFFICULTY = {
  EASY: 'easy',
  MEDIUM: 'medium',
  HARD: 'hard'
} as const

export type Difficulties = (typeof DIFFICULTY)[keyof typeof DIFFICULTY]

// Languages enabled in the OptionsModal picker. Each entry MUST have a
// matching `src/i18n/locales/<code>.ts` file — the Vite glob in
// `i18n/index.ts` registers each one as its own dynamic-import chunk so
// they only ship when the player actually switches to that language.
// English is statically bundled (fallback locale); every other code is
// fetched on demand. To add a 9th language: drop a new file under
// `locales/`, append the code here.
export const LANGUAGES: Array<string> = [
  'en',
  'ar',
  'zh',
  'de',
  'nl',
  'es',
  'fr',
  'hi',
  'id',
  'it',
  'ja',
  'ko',
  'kk',
  'pl',
  'pt',
  'ru',
  'th',
  'tr',
  'uk',
  'uz',
  'vi'
]

// Native name (autonym) for each language, shown in the picker so every option
// is legible regardless of the active UI language — the standard for language
// switchers, and it avoids translating 21 language names into 21 languages.
export const LANGUAGE_AUTONYMS: Record<string, string> = {
  en: 'English',
  ar: 'العربية',
  zh: '中文',
  de: 'Deutsch',
  nl: 'Nederlands',
  es: 'Español',
  fr: 'Français',
  hi: 'हिन्दी',
  id: 'Bahasa Indonesia',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  kk: 'Қазақша',
  pl: 'Polski',
  pt: 'Português',
  ru: 'Русский',
  th: 'ไทย',
  tr: 'Türkçe',
  uk: 'Українська',
  uz: 'Oʻzbekcha',
  vi: 'Tiếng Việt'
}