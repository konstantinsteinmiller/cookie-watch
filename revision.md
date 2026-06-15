Cookie Watch — Mini GDD
Game Overview
Title: Cookie Watch
Genre: Hypercasual Stealth Arcade
Platform: Desktop/Mobile Landscape Mode
Perspective: 2D fixed screen
Play Session Length: 2-4 minutes
Inspiration: Game & Watch, WarioWare, Mario Party
(See Visual Direction for a quick pointer)

Player Objective
Play as Mouse. Steal the cookie within the time limit as quickly as possible, and without being stomped if you’re
spotted.
Core Gameplay Loop
Sneak toward the cookie
Hide to avoid being spotted
Take chunks of the cookie
Sneak back undetected
If detected, avoid the Cat-Eye’s mechanical arms from stomping you.
Earn points at the mouse den
Play the Eating Frenzy minigame
Enter the next level
Mechanics
Hide and Sneak
To move Mouse, press the arrow keys to sneak.
To hide Mouse, release the arrow keys to hide.

To collect cookie chunks, tap the action button (mobile) or space bar.
To hide while chunking, stop tapping the action button (mobile) or space bar.

To run, double tap the arrow keys.

Stage Time Limits
1:30min

The Cookie Bait and Sacking the Chunks
Stealing the cookie is the primary objective of the game. The player must reach the cookie and break off chunks to be
eligible for points and stage completion. Each cookie contains 6 to 18 chunks depending on level difficulty. The player
must tap the action button multiple times to break a single chunk off the cookie. Mouse will store the chunks into his
sack automatically. Tapping too much will alert the Cat-Eyes, but hiding will prevent Mouse from being caught.

Grabbing Chunks and Carrying Weight
The player can carry up to six chunks at a time. However, the more chunks Mouse carries, the slower he moves.

Chunk-to-Speed Ratio
Carrying 4 - 6 chunks will slow Mouse down by 15%.

Players who are feeling bold can attempt to grab as many cookie chunks as possible and make a mad dash back to the mouse
hole, but be careful, running will alert Cat-Eyes.

Mouse Hole Scoring
Cookie chunks are scored when the player successfully deposits them into his mouse hole. Mouse will dump all the carried
cookie chunks into the den, automatically. Each deposited chunk is counted individually and converted into points on the
score counter in the UI bar and visually in front of the hole.

Cookie Chunk Points
1 chunk = 100 points
6 chunks = 600 points

Bonuses
Will be implemented in later versions

Stage Completion and Level Review
At the end of each stage, the player will visit a Level Review screen. It tallies up the score.

Total Cookie Chunks Collected - 1800 pts

Total: (sequence: numbers flash randomly, then the Total appears) 15,500 pts

Eating Frenzy - Bonus Mini Game
After every level, the mouse must eat the stolen cookie in a 20-second countdown.

To devour the cookie quickly, the player must tap the screen or press the interaction button as fast as possible. The
mouse will cartoonishly and ravenously zip around the cookie as it gets smaller and smaller. Once devoured, Mouse is
fat. The player earns a 1up if completed in under 15 seconds.
Cat-Eyes and Other Obstacles
Cat-Eyes is the mouse’s greatest threat. Luckily, it begins every stage asleep.

Cat Awareness States (subject to playtest)
Cat-Eyes moves between three awareness states: Asleep, Awake, and Alerted (this doesn't occur unless the player has been
spotted).

Asleep and Awake states are based entirely on a random timer countdown. When Cat-Eyes is awake, the system must check if
the player is hiding. If the player isn’t, Cat-Eyes’ eyes will turn red and his giant pillars will try to stomp the
player before they reach the mouse den.

Failure States
The player loses the level if:
Cat-Eye’s stomps the player
The timer reaches zero

Failure Penalties
When the player fails:
All points earned during the current level are lost.
The current level restarts.
Previously completed levels will remain cleared.
