# Art TODO

Every visual in this project is currently drawn programmatically (Canvas2D
for gameplay, inline SVG for HUD). Drop replacement art into `public/images/`
and swap the call sites listed below.

## Robot (3 layers — drawn in `src/use/useMawArt.ts`)

| ID | What | Replace in | Notes |
| --- | --- | --- | --- |
| `gear-anchor` | Orange gear (anchor / rooted) | `drawGear(...)` orange branch | 2× radius PNG @ 64px renders crisply at 1× zoom |
| `gear-swing`  | Teal gear (swinging gear)     | `drawGear(...)` teal branch   | Should rotate visibly so the sprite needs animation frames or shader-style spin |
| `chain`       | Spike chain segments          | `drawChainSegment(...)`       | Repeats along the gear-to-gear chord; ship as a tiled strip so the sprite stretches |

## World tiles

- `island-grass-round` and `island-grass-square` (forest biome) — `drawIsland`
- `island-wheat`, `island-flower`, `island-rocky` — biome variants
- `water-tile` — `drawWater`, currently a procedural cell pattern
- `water-foam-edge` — programmatic dashes around each island shore

## Mawables

- `grass-blade` (forest) — `drawGrassBlade` 'forest' branch
- `wheat-stalk` (wheat biome)
- `flower` (flower biome) — needs petal + stem sprites
- `rocky-tussock` — sparse grass for the rocky biome

## Obstacles

- `tree-stump` (small / medium / large) — `drawObstacle` 'stump'
- `boulder` (variants) — `drawObstacle` 'boulder'
- `cracked-stump` art (after sawDamage upgrade clears it) — needed for the upgrade reveal

## VFX

- `coin-pop`        — replace inline coin SVG in `drawCoin` & `useCoinExplosion`
- `meteor-trail`    — `drawMeteor`
- `meteor-impact`   — `drawMeteor` impact ring
- `chain-saw-spark` — chain hit feedback (currently just a screenshake)

## HUD icons (inline SVG today)

- `wrench-active`, `wrench-dead` — life slots in `MawScene.vue`
- `gear-settings` — settings button
- `trophy` — Achievements + BattlePass icon
- `up-arrow` — Upgrades icon
- `calendar` — DailyRewards icon
- `chest-closed` / `chest-open` — TreasureChest

## Logo

- `logo-256` and `logo-512` — `FLogoProgress.vue` + `index.html` static splash + `manifest.json`
- `parchment-ribbon` — `FReward.vue` ribbon banner (currently CSS gradient)
