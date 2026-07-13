Revision 5
Crumb Rush – Minigame Design Doc
Title: Crumb Rush (formerly Cookie Watch)
Genres: Hypercasual, Stealth, Arcade
Platform: Desktop/Mobile Landscape
Perspective: 2D, side-view, fixed screen
Session Length: 30-60 seconds per level
Inspiration: WarioWare, Mario Party
Core Gameplay Loop
Start: Sneak > Take Bits of the Dessert > Avoid Detection > End: Stash Crumbs
A. Movement & Controls
Sneak: Press & Hold Left/Right Arrow (Desktop) or Left/Right Split Screen (Mobile).
Hide: Release all controls. (Mouse instantly plays “dead").
Dash: Double-tap and hold direction.
Harvest (Dessert): Hold Right Arrow (Desktop) or Right Split Screen (Mobile)
Drop a Dessert Chunk: Press Spacebar (Desktop) or Swipe-Up (Mobile)
B. Inventory, Weight & Risk
Max Inventory: 3 Slots Total
1 Regular/Burnt Chunk: Takes 1 Slot
1 Gold Nugget/2 Gold Pieces: Takes 3 Slots (Occupies full inventory)
Capacity Constraint: You cannot pick up a Gold Nugget if you are carrying 1 - 3 Chunks. You must empty your inventory
for the Gold Nugget.

Chunks Carried
Speed Penalty
Risk Level
Design Intent
0 Chunks
0% (Full Speed)
Very Low
Fast infiltration.
1 Chunk
15% Slower
Low
Safe, easy points. (100 pts)
2 Chunks OR 1 Gold Piece
30% Slower
Medium
Noticeable drag. (300 pts)
3 Chunks OR 1 Gold Nugget (MAX)
50% Slower
Extreme
High-risk greed; hard to outrun a laser blast. (600 pts) (Gold Nugget: 2,000 pts)

C. Cat-Eyes & Threat Loops
Cat-Eyes is a mechanical cat head and looks like a Felix the Cat clock.
State Machine & Audio Triggers
Asleep State (Green Light): The Cat snores and background music plays. The player can move, dash, and harvest freely
without restriction.
Awakened State (Red Light): The Cat wakes up and music cuts out completely.
Telegraphy: Before the Cat wakes up, he shakes.
Detection Leniency: Features a 0.3s grace buffer after the Cat wakes up. The player must cease all
directional/harvesting inputs within this window to avoid detection.
Laser Targeting & Kill Logic
Laser Charge Sequence: Any active movement detected after the 0.3s buffer triggers a 1.8s laser charge-up.
Evasion & Target RNG: If the player moves at all during the 1.8s charge, the laser picks a target coordinate upon
firing:
80% Chance (Close Call): Fires at an offset position behind the player's current path.
20% Chance (Direct Hit): Fires directly at the player's current coordinates.
Death Penalty: A direct hit vaporizes the mouse into a cartoony pile of ash and immediately restarts the level.
Survival & Escalation Loop
Evaded Blast Response: Successfully dodging a laser blast forces the Cat to immediately fire 2 additional RNG shots (
each featuring a standard 1.8s charge time).
Rage Mode: After firing 3 total shots in a single sequence:
The Cat enters a 5.0s cooldown period.
Then, the Cat enters an enraged state, firing rapid-fire laser blasts with reduced 0.5s charge times.
D. Harvesting Mechanics
UI & Proximity Triggers
Proximity UI: Approaching a Dessert displays two dynamic UI indicators directly above the Player and the Dessert:
Player Carry UI: Displays current inventory capacity (e.g., 0/3).
Dessert Node UI: Displays remaining available chunks (e.g., 6/6).
UI Persistence: Both UI elements automatically disappear as soon as the player walks away from the Dessert.
Harvesting Loop & Timers
Initiation: The player harvests by pressing and holding the directional arrow pointing into the Dessert.
Progress Ring: A green ring appears and completes a 1.5-second countdown while the direction is held.
Chunk Extraction: Upon timer completion:
The Dessert Node UI decreases by 1 chunk (e.g., 6/6 → 5/6).
The Player Carry UI increases by 1 chunk (e.g., 0/3 → 1/3).
Harvest Cancelling: The player can cancel a harvest any time by walking away from the Dessert. If the player walks away
before the progress ring is finished, it cancels the extraction.
Limits & Threat Loop Synergy
Carrying Cap: Harvesting stops automatically once the player reaches their maximum carrying limit (3/3).
Movement Risk: Holding the directional key to harvest counts as active input.
If the Cat enters the Awakened State, the player must release the directional key within the 0.3s grace period to avoid
triggering the Cat's 1.8s laser charge.
UI Footnotes
E. Stage Clear & Ratings
Stage Clear Sign UI & Requirements
Proximity Sign: A sign located next to the Mouse Door displays the level's minimum and maximum chunk requirements (e.g.,
1 / 3 🍪).
First Value (1): Represents the minimum chunk threshold for a standard "Pass".
Second Value (3): Represents the maximum chunk threshold for a "Perfect" completion.
Level Scaling: Stage Clear Requirements and Stage Timers may change per level.
Time Limits: 0:30s, 0:45s, or 0:60s.
Deposit Mechanics
Depositing Items: When the player is near or standing on the Mouse Door, items held in their inventory are automatically
deposited.
UI Feedback: The player’s carry UI node appears upon approaching the door and it drains to 0 as items transfer.
Deposit Rate: Each individual item transfer takes exactly 0.1s.
Clear Tiers & Rating Rewards
End-of-level performance is evaluated and awarded via a Star reward system:
Minimum Stage Clear (1 Star):
Condition: Deposit at least the minimum required chunks into the Mouse Door before time expires.
Perfect Stage Clear (3 Stars):
Condition: Deposit the maximum possible chunks into the Mouse Door before time expires.
Gold Stage Clear (3 Platinum Stars + Extra Coins):
Condition: Complete a Perfect Clear while also retrieving the hidden Gold Nugget.
Reward Bonus: Grants 3 Platinum Stars.
F. Desserts, Collectibles & Risk Mechanics
Dessert Types & Chunks
World Desserts: Each world features unique thematic treats (e.g., World 1 Cookie, World 2 Cheesecake).
Chunk Value: Standard Dessert Chunks count as 1 Chunk toward the Stage Clear requirement.
Dessert Scale:
Big Desserts: Multi-chunk nodes present in standard levels (e.g., Cookie, Cheesecake).
Mini Cookie Dessert: A simplified single/small node variant exclusive to Level 1.
Gold Nugget Mechanics (High-Risk Treasure)
Discovery: Hidden deep inside Big Desserts.
Value & Inventory Weight:
Counts as 2 Chunks toward the Stage Clear requirement.
Occupies all 3 Inventory Slots and applies a 50% movement speed penalty.
Cannot be obtained until the dessert has been harvested completely.
Shielding & Splitting:
Laser Shield: If hit by a laser while carrying the Gold Nugget, it absorbs the damage to save the player from death.
Fragmentation: Upon taking a hit, it splits into 2 Gold Pieces (each worth +1 chunk value) and blasts backward opposite
the player's facing direction.
Restoration: Collecting both scattered Gold Pieces restores the full Gold Nugget.
Despawn Timer:
Dislodged Gold Pieces and the Gold Nugget despawn after 8.0 seconds (flashing rapidly during the final 4.0 seconds) if
untouched by the player.
Failing to recover both pieces or the Gold Nugget permanently voids the Gold Stage Clear for that run (though a Perfect
Stage Clear remains attainable).
Design Intent: Introduces a high-risk, high-reward objective that tempts players to overextend under harsh weight
penalties.
Risk Mechanics & Panic Drops
Panic-Dropping Items: Players can manually drop carried items at any time to instantly remove speed penalties and regain
mobility.
Field Persistence: Chunks/Burnt Chunks remain on the floor indefinitely and can be re-looted.
Trajectory: Dropped items toss in a short arc opposite the player’s facing direction.
Laser Block Tech: Dropped items can physically block incoming laser blasts (a high-skill defensive tactic for
experienced players).
Burnt Chunks (Laser Collateral):
Any Chunks caught directly in a laser blast become charred.
Burnt Chunks suffer a 50% penalty to both their point score and Stage Clear value.
Design Intent: Creates tangible consequences during Red Light phases without completely wiping out player progress.
G. Gold Nugget Extraction & Cat Enrage Sequence
Discovery & Extraction Choice
Uncovering: The Gold Nugget is available after all surrounding Dessert Chunks have been completely harvested from the
node.
Player Choice: Once exposed, the player faces a tactical choice:
Safe Exit: Ignore the nugget and head directly to the Mouse Door to end the level safely.
Greed Objective: Grab the Gold Nugget to trigger high-reward scoring and the Gold Stage Clear path.
Cat Enrage & Red Light Frenzy
Trigger Event: The moment the player picks up the Gold Nugget, the stage immediately enters an escalated Red Light
Frenzy.
Visual Triggers: The screen fades red, and the Cat enters an agitated visual state—quivering and trembling in place.
Audio: Tense music plays.
Telegraphed State Changes: Right before the Cat changes states, it exhales a puff of smoke from its nostrils, providing
a brief visual warning for the player to prepare to stop or move.
Global Timer Reset: The level's remaining time limit is immediately reset and locked to a strict 0:50s countdown, giving
the player a tight, uniform window to escape regardless of how much time was left beforehand.
Unpredictable Red/Green Cycles:
Standard predictable sleep/wake timers are replaced by randomized stop-and-go intervals.
Green Light Interval Range: 1s to 5s
Red Light Interval Range: 1s to 8s
The Cat switches erratically between sleeping and awakened states without standard rhythm patterns.
Endurance Run: The player must endure these unpredictable red light cycles while encumbered by the Gold Nugget's 50%
speed penalty to safely reach the Mouse Door.
Design Intent: Creates a thrilling, high-tension finale that tests player patience and reaction time under heavy risk.
H. Mouse Hole Scoring
Base Delivery Scores
Points are awarded upon successfully depositing carried items into the Mouse Hole:
1 Chunk: 100 pts
2 Chunks: 300 pts
3 Chunks: 600 pts
Burnt Chunks (50% Value):
1 Burnt Chunk: 50 pts
2 Burnt Chunks: 150 pts
3 Burnt Chunks: 300 pts
Gold Nugget: 2,000 pts
Multipliers & Skill Bonuses
Greedy Bonus Multiplier: Applies a 1.2x score multiplier to total delivery values when depositing at maximum capacity or
carrying high-value loot.
Close Call Bonus (1,000 pts): Awarded for dodging a laser shot and surviving the immediate blast.
Insane Escape Bonus (3,000 pts): Awarded for successfully surviving a full 3-shot laser targeting sequence during a Red
Light phase.

I. Mini-Game: Eating Frenzy
Overview & Objective
Occurrence: Triggers automatically after completing every 5 levels.
Objective: The player is given a 15-second countdown to completely devour a giant dessert.
Victory State: Upon clearing the dessert, the mouse turns cartoonishly round, exhales a sigh of relief, and the player
earns bonus rewards.
Visual Style: The mouse eats frantically, zipping around like an attacking anime character. The dessert visually
degrades every 5 button presses.
Core Controls & Choke Risk
Eating Input: Rapidly mash the Spacebar (or the mobile screen) to bite the dessert.
With every tap, the mouse instantly zips to a different side of the treat to take another bite.
Choke Hazard: Mashing continuously increases a hidden/visible Choke Meter.
Choke Penalty: If the Choke Meter reaches 100%, the mouse enters a coughing fit and is paralyzed for 2.5 seconds,
incurring a severe time penalty.
Choke Meter Mechanics
Elastic Surge (Visual Juice): Each button mash spikes the meter visually by +12%, then rapidly settles down to its +10%
true value, giving the meter UI a dynamic, bouncy feel.
Passive Decay: The meter continuously drains at a rate of -11% per second when not being increased.
Rhythm Strategy: Allows skilled players to find a precise tapping tempo—balancing fast inputs with micro-pauses to keep
the meter near maximum capacity without triggering a choke.

J. World 1: Crumb Rush Levels (Levels 1–6: Cookie)
Level 1 — Tutorial
Level Start Sequence: Mouse enters lab → Cat appears asleep in background → BGM starts → "START!" prompt → Player
control enabled.
Level Timers & Cycles:
Time Limit: 0:45s
Green Light (Eyes Closed): 3.0s
Red Light (Eyes Open): 2.3s
Clear Requirements:
Pass (1 Star): 1 Chunk
Perfect (3 Stars): 3 Chunks
Learning Objectives:
Master the fundamental stop-and-go movement loop.
Learn to play dead / cancel inputs while harvesting.
Recognize background music shifts as audio cues for safety and danger.
Level 2 — Bigger Cookie & Gold Nugget
Level Start Sequence: Mouse enters lab → Cat appears asleep in background → BGM starts → "START!" prompt → Player
control enabled.
Level Timers & Cycles:
Time Limit: 0:45s
Green Light (Eyes Closed): 3.0s
Red Light (Eyes Open): 2.3s
Clear Requirements:
Pass (1 Star): 2 Chunks
Perfect (3 Stars): 6 Chunks
Platinum Perfect (3 Platinum Stars): 8 Chunks (Requires Gold Nugget)
Learning Objectives:
Introduce Big Cookie multi-harvest nodes.
Introduce Gold Nugget extraction, weight penalties, and the Enrage Sequence.

Level 3 — Speed Test
Level Start Sequence: Mouse enters lab → Cat appears asleep in background → BGM starts → "START!" prompt → Player
control enabled.
Level Timers & Cycles:
Time Limit: 0:45s
Green Light (Eyes Closed): 2.0s
Red Light (Eyes Open): 1.8s
Clear Requirements:
Pass (1 Star): 3 Chunks
Perfect (3 Stars): 6 Chunks
Platinum Perfect (3 Platinum Stars): 8 Chunks
Level 4 — Balanced Rhythm
Level Start Sequence: Same as before.
Level Timers & Cycles:
Time Limit: 0:30s
Green Light (Eyes Closed): 3.0s
Red Light (Eyes Open): 3.0s
Clear Requirements:
Pass (1 Star): 3 Chunks
Perfect (3 Stars): 6 Chunks
Platinum Perfect (3 Platinum Stars): 8 Chunks
Level 5 — Suspense
Level Start Sequence: Same as before.
Level Timers & Cycles:
Time Limit: 0:45s
Green Light (Eyes Closed): 4.3s
Red Light (Eyes Open): 2.3s
Clear Requirements:
Pass (1 Star): 3 Chunks
Perfect (3 Stars): 6 Chunks
Platinum Perfect (3 Platinum Stars): 8 Chunks
Post-Level Trigger: Triggers Bonus Game: Eating Frenzy Minigame upon completion.
Level 6 — The Trickster
Level Start Sequence: Same as before.
Level Timers & Cycles:
Time Limit: 0:45s
Randomized Green Light (Eyes Closed): Cat dynamically chooses either 1.2s (Fakeout) or 3.2s (Long Window).
Red Light (Eyes Open): 3.0s
Clear Requirements:
Pass (1 Star): 3 Chunks
Perfect (3 Stars): 6 Chunks
Platinum Perfect (3 Platinum Stars): 8 Chunks
Learning Objective: Introduces variable/unpredictable timing loops to break rigid player pacing.
Design Footnotes
Eating Frenzy
“Zip” Coordinates for the Mouse
Coordinate 1: Start Position
Coordinates Follow Numerical Order, then Reset at 1.
Eating Frenzy UI Layout

Player Harvest and Dessert UI

Timeline:
Remove Cat states except Awake/Asleep.
Slow mouse’s top speed
Add back in dash, use current top speed as dash velocity.
Keep “play dead”
Make moving right while at the cookie activate harvesting
Player and Dessert UI
Cat kill state
0.3s Grace buffer 
