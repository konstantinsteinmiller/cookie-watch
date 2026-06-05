---
name: safe-area-responsive
description: Ensure full mobile responsiveness with safe-area support for iOS PWA, Android, and desktop
---

When building mobile-responsive game UI:

1. **index.html** must have:
    - `viewport-fit=cover` in viewport meta
    - `apple-mobile-web-app-capable` and `mobile-web-app-capable`
    - `black-translucent` status bar style

2. **Global CSS**: Fixed html/body, no overflow, touch-action manipulation, no user-select.

3. **Every fixed/absolute HUD element** must include safe-area insets:
   ```pug
   div(
     :style="{\
       paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))',\
       paddingLeft: 'calc(0.5rem + env(safe-area-inset-left, 0px))',\
       paddingRight: 'calc(0.5rem + env(safe-area-inset-right, 0px))'\
     }"
   )
   ```

4. **Bottom elements** need the `useBottomSafe` composable gap on top of env():
   ```pug
   div(:style="{ bottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px) + ${bottomGapPx}px)` }")
   ```

5. **Canvas sizing** must use `visualViewport` dimensions, not `window.innerHeight`.

6. **Orientation handling**: Track via `matchMedia('(orientation: portrait)')` + reactive refs.

7. **Touch prevention**: Block multitouch, gesture zoom, context menu, tap highlight.

8. **Responsive breakpoints**: Use `sm:` prefix for desktop, base for mobile. Common patterns:
    - Text: `text-xs sm:text-sm`, `text-sm sm:text-base`
    - Spacing: `p-1 sm:p-2`, `gap-1 sm:gap-2`
    - Scale: `scale-80 sm:scale-100`
    - Landscape mobile: special handling with `isMobileLandscape` computed
