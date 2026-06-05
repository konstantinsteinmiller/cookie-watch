---
name: translation-i18n
description: Add internationalization with vue-i18n, supporting 8 languages with global and SFC translations
---

When adding translations:

1. **Global strings** go in `src/i18n/translations.ts` as a nested object:
   ```ts
   export default {
     en: { cancel: 'Cancel', ... },
     de: { cancel: 'Abbrechen', ... },
   }
   ```

2. **Component-specific strings** use SFC `<i18n>` blocks (YAML syntax):
   ```vue
   <i18n>
   en:
     dailyRewards: "Daily Rewards"
   de:
     dailyRewards: "Tägliche Belohnungen"
   </i18n>
   ```

3. **Always support 8 languages**: en, de, fr, es, jp, kr, zh, ru.

4. **Usage in templates**: `{{ t('key') }}` or `{{ t('nested.key') }}`.

5. **Pluralization**: Use `{n}` interpolation: `t('rewardsReady', { n: count })`.

6. **Setup**:
   ```ts
   import { createI18n } from 'vue-i18n'
   const i18n = createI18n({
     locale: 'en',
     fallbackLocale: 'en',
     messages: translations,
     missingWarn: false,
     fallbackWarn: false
   })
   ```

7. **Locale detection**: Check CrazyGames SDK locale -> sessionStorage -> navigator.language -> 'en'.
