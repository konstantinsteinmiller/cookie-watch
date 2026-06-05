# Cookie Watch — Game Implementation Plan

> A mobile-first **2D hypercasual stealth arcade** in the Game & Watch / WarioWare
> mould. You play a **Mouse** sneaking across a kitchen counter to steal a giant
> **cookie** guarded by the Baker's dozing **Cat**. Advance through movement
> **zones** by tapping the button(s) prompted under the next spot, break off
> chunks, carry the weight back to your **mouse hole**, and deposit for points —
> all without waking the Cat (a hidden 0–100 **awareness meter**). Built on the
> battle-tested Epicrolla/Spin&Mow multi-platform Vue 3 + Vite + TS + Pug +
> Tailwind + SASS stack.

This document is the **source of truth**. If a session is interrupted, resume
from the first unchecked item in "Execution Phases".

---

## 1. Reused infrastructure (DO NOT rebuild)

The repo ships a complete platform/meta layer. We **keep and reuse**:

| System | File(s) | Notes |
|---|---|---|
| Single-blob state | `use/useEpicState.ts` | One LS key. `STATE_KEY = 'cookie_watch_state'`. In-memory `Record<string, unknown>` mirror; debounced + pagehide flush. |
| Save / cloud sync | `utils/save/*`, `SaveManager`, `BlobStorage`, `SaveMergePolicy` | Mirrors the one state blob + `__save_meta__`. |
| Platform builds | `platforms/*`, `.env.*`, `main.ts` | CrazyGames, GameDistribution, Glitch, Itch, Wavedash, GamePix, Playgama, GameMonetize, Yandex. Keys/ids blanked. |
| Ads | `use/useAds.ts`, `use/ads/*`, `useRewardedThrottle` | `showRewardedAd`, `showMidgameAd`, readiness flags, `isAdsBlocked`. |
| Pause gate | `useGamePause`, `useGamePauseAudio` | `isGamePaused`. Render/step early-return on pause. |
| Sound | `useSound`, `useAssets`, `useSoundPreload` | `useMusic()`, `useSounds().playSound/playRandomVariant`. |
| Screenshake / coin VFX | `useScreenshake`, `useCoinExplosion` | `triggerShake`, `spawnCoinExplosion`. |
| Coins / progress | `useEpicConfig`, `useEpicProgress` | `coins/addCoins/spendCoins`; `stage`, `bestScore`, upgrades, `advanceStage`. Stage targets reinterpreted as cookie-chunk counts. |
| Battle Pass / Daily / Missions / Achievements | `useBattlePass`, `organisms/*` | Coin-only. Kept; content + metrics retuned to Cookie Watch. |
| i18n | `i18n/*` (24 locales) | `en` = source. Bodies replaced. |
| UI atoms | `FButton`, `FModal`, `FReward`, `FMuteButton`, `FIconButton`, `FTabs`, `FSlider`, `FSwitch`, `FSelect`, `FLogoProgress`, `FPerfMeter`, `CoinBadge`, `IconCoin`, `IconMovie`, `StageBadge`, `ScoreBadge`, `OptionsModal`, `AdsBlockedModal`, `SaveStatusBanner` | Responsive polish (no fixed `scale-*` magic, no 0-size collapse, FModal header no overlap). |
| App shell | `App.vue`, `router/index.ts` | Route `/` → `GameScene.vue`. Starts straight into stage 1 (no main menu). |

### Replace / delete (Epicrolla gameplay-specific)
- **Rewrite/replace** core: `use/useEpicGame.ts` → new `use/useCookieGame.ts`;
  `use/useEpicArt.ts` → new `use/useCookieArt.ts`; `use/usePowerups.ts`
  (Epicrolla powerups) → folded into engine.
- **Rewrite** `views/GameScene.vue` (rolling-ball scene → stealth scene).
- **Fix importers**: `useCheats.ts` (cookie cheats), `useAssets.ts` (lazy
  art-warm → `useCookieArt`), `useEpicSkins.ts` (ball skins → mouse skins).
- **Remove** `mawCampaignOverridesPlugin` in `vite.config.ts` + delete
  `data/campaign-overrides.json` (2.2 MB level-editor leftover).

---

## 2. Game design spec (from game-design.md)

### Board / coordinate model
- **Fixed-screen 2D** (Game & Watch). A single **path** of `N` zones runs from
  the **mouse hole** (home) to the **cookie + sleeping cat**. `N = 4–6` by stage.
- Layout is **orientation-aware**: portrait = vertical path (hole bottom, cookie
  top); landscape/desktop = horizontal (hole left, cookie right). Zones placed by
  `%`/`vw`/`vh`; the renderer maps a normalized path param to screen coords.

### Movement system
- Each **zone** shows a **button prompt** (▲▼◀▶ on mobile; WASD/arrows desktop)
  under the next spot. Prompts are **randomized per zone per run** (except fixed
  **interact** at the cookie and fixed **enter** at the hole).
- Advance one zone by pressing the prompted button(s). **Weight → taps/zone**:
  1–2 chunks = **1 tap** (Light), 3–4 = **2 taps** (Medium), 5–6 = **3 taps**
  (Heavy). Multi-tap zones show a sequence; each correct press fills a pip.
- **Misstep** (wrong button) → noise `+4` (`+8` if carrying 3–6).
- **Hastiness** (taps faster than min interval) → `+10`.
- **Hesitation** (no input 10 s) → `+5`.
- **Clean advance** reduces awareness: Asleep `−4`, Stirring `−2`, Awake/Alert `0`.

### Cookie / chunks / weight
- Cookie holds **6–18 chunks** by stage. At the cookie zone, **interact** breaks a
  chunk (auto-stored). Tapping too fast = hastiness. Carry up to **6**.
- Deposit by entering the **mouse hole** → all carried chunks banked,
  **100 pts/chunk**, front-of-hole popup + VFX. A hole→cookie→hole lap = a **run**.
- Stage clears when **all** chunks are deposited before time runs out.

### Cat awareness (0–100; four states, tunable per stage)
- **Asleep (0–36)** Zzz bubble; **Stirring (37–54)** bubble pops, ears flick;
  **Awake (55–74)** eyes open; **Alert (75–100)** tracks, pounce pose → pounces
  after 2–3 s. **Fake Sleep** (later): may skip states; one eye cracks open.
- Awake/Alert: clean inputs don't reduce; player must **hide** (hole or drawer
  leg) until cat gets **bored** (10–15 s in hole). Hiding blocks pounce but the
  cat **searches** if you hesitate 10 s.

### Obstacles
- **Mousetraps** (later): a zone whose prompt **rapidly switches**; press on the
  right frame to pass, wrong frame = fail.
- **Hiding spots**: mouse hole + drawer leg; reduce awareness, block pounce.

### Bonuses & scoring
- Chunk = **100**. **Greedy Finish** +5,000 (clear < 30 s carrying 5–6/run).
- **Greedy Multiplier**/run: 3=1.25×,4=1.3×,5=1.4×,6=1.5×; **accumulate** across
  runs, applied to total chunk points. **Sneaky** +3,000 (Cat never stirred).
- **Lucky Escape** +10,000 (pounced but escaped). **Speedy** `10 × secsRemaining`.
- **Big Back Bonus** +1 life (fully eat cookie in Eating Frenzy).

### Stage time limit: **1:30** (cat nap), reduced/tuned later.

### Eating Frenzy (post-stage): 20 s; tap/interact ASAP to devour; 1up if < 15 s.

### Level Review: animated tally — Total Chunk Points → Greedy Finish → Greedy
Multiplier sequence → Sneaky/Lucky/Speedy → flashing **Daring Total**.

### Lives / fail / win
- **Lives** (start 3). Fail = catch / wrong mousetrap / timer 0 → lose stage
  points, **−1 life**, restart stage (cleared stages stay cleared).
- **Out of lives** → fresh-run framing (progress/best kept).
- **Second Chance**: rewarded-ad revive on a catch (reuses existing flow).

---

## 3. State object — `cookie_watch_state` (single in-memory Record, one LS key)
```
cw_stage cw_max_stage cw_coins cw_best_score cw_lives
cw_upgrades { levels } | cw_skins { owned, selected } | cw_games_played
cw_missions | cw_achievements | cw_daily_bonus_day | cw_skins_seen | ...
spinner_user_*  spinner_battle_pass  spinner_daily_rewards  spinner_ad_button_ready_at
__save_internal__rewarded_history   __save_meta__
```
> settings/battlepass/daily keep `spinner_` names so reused composables work
> unchanged — they're just fields inside the one blob.

---

## 4. New files
```
src/use/useCookieGame.ts     // engine
src/use/useCookieArt.ts      // canvas renderer + VFX
src/views/GameScene.vue      // rewritten scene
src/components/atoms/AwarenessMeter.vue
src/components/atoms/DirButton.vue
src/components/atoms/LivesBadge.vue
cookie-watch-roadmap.md      // 15+ retention features
```

---

## 5. Execution Phases (checklist)

- [x] **P1 Plan** (this doc).
- [x] **P2 Rebrand**: `STATE_KEY='cookie_watch_state'`, removed
  `mawCampaignOverridesPlugin` + deleted campaign JSON (2.2MB), Angry-only font
  (deleted unused TTF/woff2), package.json/index.html already branded.
- [x] **P3 Engine** `useCookieGame.ts` — zones, prompt randomizer, weight/taps,
  chunk grab+sack, deposit/scoring, awareness 4-state + fake-sleep + pounce +
  escape + hole/hide cooldown, mousetraps, timer, lives, all bonuses, frenzy.
- [x] **P4 Renderer** `useCookieArt.ts` — board, hole, zones+prompts, vector
  mouse/cat/cookie, drawer-leg, mousetrap, awareness vignette, VFX pools,
  frenzy view, `/public/images/...` override hooks.
- [x] **P5 Scene/HUD** `GameScene.vue` — d-pad + interact, WASD/arrows, control
  hint, awareness/score/timer/lives/chunk HUD, review tally, frenzy, win/lose,
  second-chance, 2×, meta buttons. Responsive + safe-area, no fixed px.
- [x] **P6 Meta** — UPGRADES retuned to 5 Cookie Watch boosts wired into the
  engine (Calm Nerves / Light Paws / Night Owl / Cozy Burrow / Sixth Sense);
  missions/achievements reworded; BattlePass kept. (Mouse-skin shop → roadmap #11.)
- [~] **P7 F-component responsive pass** — scene fully responsive (vw/vh/%/clamp,
  safe-area); FModal/FReward reused as-is. Dedicated F-atom audit not yet done.
- [~] **P8 i18n** — `en.ts` fully rewritten (complete source of truth, live).
  23 locale files still in old structure → vue-i18n falls back to `en` (all
  languages playable); translation pass is the remaining finish-line task.
- [x] **P9** type-check **green**, production build **green** (24 locale chunks).
- [x] **P10 Tests** — pruned Spin&Mow-only tests (usePowerups, useBattleRules,
  healValues, useBattlePassSkinClaim); added `useCookieGame.test.ts`; updated
  `useEpicProgress`/save tests to new ids+key. 284 pass; 28 failures are
  PRE-EXISTING at first-commit (platform Y8/GamePix gating, unrelated).
- [x] **P11 Chrome e2e** — drove a full run in a real browser (collect→deposit
  →review→frenzy→win→stage-advance) + **reload hydration proven** (loads Kitchen
  2 + coins from the single blob, no fresh-user fallback).
- [x] **P12 Roadmap** — `cookie-watch-roadmap.md`, 20 retention features.

### Remaining finish-line work
- Propagate the new gameplay keys from `en.ts` into the 23 other locale files
  (translation pass; runtime English fallback keeps all languages playable now).
- Dedicated F-component responsive audit (FModal header overlap, fixed scales).
- Blank platform keys/ids in `.env.*` before deployment builds.
- Driven-browser SDK cloud-save e2e (`verify-cloud-save-hydration`) on a
  platform build (the localStorage hydration path is browser-verified).

## 6. Performance / mobile rules
DPR-capped canvas (≤2); RAF-only redraw; early-return on `isGamePaused`; cache
path geometry per layout; VFX object pools; defer audio + non-critical decode to
idle; no fixed px (vw/vh/%); `env(safe-area-inset-*)`; `touch-none`,
non-selectable images; min portrait 320×658, tablet+desktop both orientations.

## 7. Chosen defaults
State key `cookie_watch_state` (prompt's `epiciancer_state` is a template
placeholder; cookie-named single blob fulfils intent). Zones: 4 at stage 1, +1
every 2 stages up to 6. Chunks `6 + stage` capped 18. Time 90 s, −5 s/stage floor
45 s. Buttons ▲▼◀▶ + central Interact; desktop WASD/arrows + Space/Enter.
Vector art now; auto-swap to `/public/images/...` when assets land.
