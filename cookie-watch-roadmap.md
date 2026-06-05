# Cookie Watch — Retention & Growth Roadmap

A prioritized backlog of features that lift **Day‑1 retention**, **average
playtime**, the **easy‑to‑pick‑up / hard‑to‑put‑down** loop, and **new‑player
conversion**. Each item lists the *why* (metric it moves) and an *actionable*
implementation note grounded in the current codebase
(`useCookieGame`, `useCookieArt`, `GameScene.vue`, `useEpicProgress`, the reused
meta layer, and the single `cookie_watch_state` blob).

Legend — **Impact**: ⭐ (nice) → ⭐⭐⭐ (needle‑mover). **Effort**: S / M / L.

---

## A. First‑session hook (Day‑1 retention + conversion)

1. **Interactive 30‑second tutorial kitchen** — ⭐⭐⭐ · M
   *Why:* the biggest Day‑1 drop is "I don't get it." A guided Kitchen 0 that
   forces one clean step, one grab, one deposit teaches the loop with zero risk.
   *How:* add a `phase: 'tutorial'` variant in `useCookieGame` that scripts the
   prompt sequence and gates the cat at Asleep; overlay coach‑marks in
   `GameScene` pointing at the glowing pad. Persist `cw_tutorial_done`.

2. **"First Heist" win is guaranteed** — ⭐⭐⭐ · S
   *Why:* a guaranteed early win + reward spikes Day‑1 return.
   *How:* stage 1 already has a generous 90s/6‑chunk budget; add a one‑time
   `cw_first_clear` bonus (+250 coins, confetti) handled in `onWin`.

3. **Streak‑aware "Welcome back"** — ⭐⭐ · S
   *Why:* re‑entry reward conditions the return habit.
   *How:* `DailyRewards` already streaks; surface a returning‑player toast on
   boot via `useSaveStatus` when `lastSeen` > 12h, granting a small coin nudge.

4. **Pre‑permission audio/notify nudge** — ⭐⭐ · S
   *Why:* sound dramatically increases perceived juice → session length.
   *How:* the first tap already unlocks audio; add a tiny "tap for sound on"
   chip on the idle screen so muted‑autoplay users opt in immediately.

## B. Core‑loop depth (avg playtime + hard‑to‑put‑down)

5. **Risk/Reward "Greedy Run" call‑to‑action** — ⭐⭐⭐ · S
   *Why:* the greedy multiplier is the game's depth; players don't discover it.
   *How:* when carrying ≥3 chunks, flash a "GREEDY ×1.25 →" banner near the
   score (data already in `greedyMultSum`); escalate color at 5–6 chunks.

6. **Combo "clean streak" meter** — ⭐⭐ · M
   *Why:* a visible streak of clean steps creates a "don't break it" tension.
   *How:* track consecutive misstep‑free advances in `useCookieGame`; award a
   small score multiplier + a rising whoosh SFX; reset on any misstep.

7. **Daily Cookie (one special kitchen/day)** — ⭐⭐⭐ · M
   *Why:* a fixed daily objective is a proven retention anchor.
   *How:* seed a deterministic stage from the date (reuse `useDeterministicRng`);
   a leaderboard‑style "Daring Total" target with a once‑a‑day bonus chest.

8. **Mutators / modifiers per kitchen** — ⭐⭐ · M
   *Why:* variety extends the campaign's perceived length.
   *How:* add stage flags in `cookieChunksForStage`‑style config: "Light
   Sleeper" (faster awareness), "Greedy Night" (2× greedy), "Trap House" (extra
   mousetraps). Show the modifier on the StageBadge.

9. **Boss kitchens every 5 stages** — ⭐⭐ · L
   *Why:* milestone spikes give players a reason to push "one more."
   *How:* a Fake‑Sleep cat that skips awareness states (`fakeSleepEnabled`
   already exists) plus a two‑cookie layout; bigger reward + a cosmetic drop.

## C. Progression & reward cadence (return triggers)

10. **Cookie Pass seasonal track polish** — ⭐⭐⭐ · M
    *Why:* a visible reward ladder is the strongest long‑term retainer.
    *How:* `BattlePass` is wired; tune XP (run + clear), add cosmetic mouse‑skin
    rewards at milestones, and a "next reward in N XP" nudge on the result screen.

11. **Mouse‑skin cosmetics shop** — ⭐⭐ · M
    *Why:* identity/cosmetics drive spend + long‑term play.
    *How:* `setMouseSkin(fur, fur2)` is already plumbed into the renderer; add a
    `cw_skins` catalog (fur palettes, hats drawn as extra vector layers) and a
    SkinModal mirroring the old shop component.

12. **Achievements with coin payouts** — ⭐⭐ · S
    *Why:* completionists extend lifetime sessions.
    *How:* `useAchievements` is live; the new metrics (chunks deposited, kitchens
    cleared, sneaky clears, lucky escapes) just need `recordRun` plumbing.

13. **Per‑run "Daring Total" personal best chase** — ⭐⭐ · S
    *Why:* a ghost target turns each run into a self‑competition.
    *How:* `bestScore` already persists; show "Best: N" on the idle screen and a
    "NEW BEST!" stinger on the review screen when beaten.

## D. Conversion & monetization (respectful)

14. **Second‑Chance escape (rewarded)** — ⭐⭐⭐ · S *(shipped, tune)*
    *Why:* rewarded revive is the highest‑intent ad placement.
    *How:* already wired (`onAcceptContinue`); A/B the 30s cooldown and the
    "keep your haul" framing to maximize watch‑through without nagging.

15. **2× Daring coins on the result screen** — ⭐⭐ · S *(shipped, tune)*
    *Why:* opt‑in doubling converts well and feels generous.
    *How:* `twoXAvailable` is live; add the first‑run‑of‑day always‑on offer
    (already flagged via `firstRunBonusActive`) and a coin‑rain payoff.

16. **Interstitial cadence governor** — ⭐⭐ · S
    *Why:* over‑showing ads tanks retention; under‑showing tanks revenue.
    *How:* loses already throttle to 1‑in‑3 (`LOSE_AD_EVERY`); add a session‑
    minimum gap and a "no ad before stage 3" grace to protect onboarding.

## E. Polish & feel (juice = stickiness)

17. **Haptics on key beats** — ⭐⭐ · S
    *Why:* tactile feedback massively boosts mobile "feel."
    *How:* `navigator.vibrate` on grab/deposit/misstep/pounce, gated behind a
    settings toggle; pair with the existing screenshake tiers.

18. **Cat "tells" telegraph system** — ⭐⭐ · M
    *Why:* fair warning before a pounce makes Alert moments thrilling, not cheap.
    *How:* `useCookieArt` already draws ears/eyes/pose; add a pre‑pounce wind‑up
    flash + a heartbeat audio loop that intensifies with `awareness`.

19. **Replay share card** — ⭐⭐ · M
    *Why:* social loops are free user acquisition.
    *How:* render the review screen + Daring Total to an offscreen canvas and
    expose a Web‑Share/`toBlob` "share your heist" button.

20. **Art swap‑in pipeline** — ⭐ · S
    *Why:* upgrading from vectors to art is the single biggest visual lift.
    *How:* `imageFor()` already auto‑swaps `/public/images/props/{mouse,cat,
    cookie,mousetrap}.webp` when present — drop final art in and it's live, no
    code change.

---

### Suggested sequencing
**Sprint 1 (retention floor):** #1, #2, #5, #14/#15 tuning, #16.
**Sprint 2 (depth):** #6, #7, #10, #13, #17.
**Sprint 3 (breadth & growth):** #8, #9, #11, #18, #19, #20.
