# Cookie Watch — Mini GDD

## Game Overview
Title: **Cookie Watch**
Genre: **Hypercasual Stealth Arcade**
Platform: Desktop/Mobile (landscape mode - current iOS/Android resolution)
Perspective: 2D fixed screen
Play Session Length: 2-4 minutes
Inspiration: Game & Watch, WarioWare
(See Visual Direction for a quick pointer)
The Story
The Baker thinks you’re stealing his cookies, so he’s put his cat out on Cookie Watch. But it’s getting late, and the Baker’s cat is dozing off. Sneak past the furball and steal the cookie without being caught!
Player Objective
Play as Mouse. Steal the cookie within the time limit as quickly as possible.
Core Gameplay Loop
Leave the mouse hole
Sneak toward the bait
Break off chunks (up to 6)
Carry them back
Avoid waking the Baker’s cat from missteps or moving too quickly
Deposit food for points
Repeat until the cookie is gone
Risk bigger hauls for higher scores
“Eating Frenzy” bonus game
Enter the next level

## Controls
Mobile
Tap one of the four designated buttons in a sequence to advance the mouse.
Desktop
Press WASD or Arrow Keys in a sequence to advance the mouse.
Mechanics
Movement System
To move Mouse, you must tap specific buttons to advance him forward. Every advancement occurs along a designated path divided into zones. Each zone displays an input beneath the spot Mouse will move to. Think of it like a space on a board game. When prompted, the Player must press the corresponding button correctly in order to advance Mouse forward.

Pressing an incorrect input is considered a misstep which creates “noise”, this noise increases the Baker Cat’s hidden awareness meter. Similarly, if Mouse is too fast along the path, his footsteps will also make too much noise and wake up the cat.
When carrying heavier loads, more button inputs are required to move to the next zone, making escape more difficult as the chance for player error is higher.
Interactions
The Player will use four buttons to advance, collect cookie chunks, and return safely to the mouse hole. The button configuration is randomized per zone, except for collecting cookie chunks and depositing them into the mouse hole.

Stage Time Limits
1:30min (cat nap)

Zones
Each stage is divided into 4–6 movement zones (or spaces) depending on level difficulty. Mouse must travel through these zones to reach the cookie and return to the mouse hole. The lap to the cookie and back to the mouse hole is defined as a cookie run, or run.

Cookie Runs and Stage Completion
To complete a stage, Mouse must collect every chunk of the big cookie before time runs out. Fewer runs earn higher scores because they require Mouse to carry more chunks back to the mouse hole and complete the stage quicker. Faster times and daring runs are the key to the most rewarded player in Cookie Watch.

The Cookie Bait and Sacking the Chunks
Stealing the cookie is the primary objective of the game. The player must reach the cookie and break off chunks to be eligible for points and stage completion. Each cookie contains 6 to 18 chunks depending on level difficulty. The player must tap the interaction button to break chunks off the cookie. Then, Mouse will store the chunks into his sack automatically. Remember, the cat sleeps behind the cookie. Tapping too fast will alert the cat and jeopardize a good run.

Grabbing Chunks and Carrying Weight
The player can carry up to six chunks at a time. However, the more chunks Mouse carries, the slower he moves.
In this game, weight is represented by the number of button taps required to move forward.

Button-Tap-to-Chunk Ratio
1 tap per zone when carrying 1 - 2 chunks (Light)
2 taps per zone when carrying 3 - 4 chunks (Medium)
3 taps per zone when carrying 5 - 6 chunks (Heavy)

Players who are feeling bold can attempt to grab as many cookie chunks as possible and make a mad dash back to the mouse hole to earn a Greedy Finish and Greedy Bonus (when a stage is completed quickly–in under 15-30 seconds–and when a run has 3-6 chunks deposited at a time. Could be quantified as Heavy or Medium in code.)

Mouse Hole Scoring
Cookie chunks are scored when the player successfully deposits them into his mouse hole. In order to do this, the player must enter the mouse hole first and then Mouse will deposit all carried cookie chunks into the den, automatically. Each deposited chunk is counted individually and converted into points on the score counter in the UI bar and visually in front of the hole.

Cookie Chunk Points
1 chunk = 100 points
6 chunks = 600 points

Bonuses
Greedy Finish – 5,000 points for finishing a stage in under 30 seconds carrying 5-6 chunks per run. For example, if the player carries 6 chunks twice to the mouse hole in under 30 seconds, they’ll earn this Greedy Finish bonus.
Greedy Bonus Multiplier – 1.25x to 1.5x score multiplier if the player returns 3-6 chunks within an x amount of seconds in a single run. These multipliers can add up if the player is fast enough to do so.
3 chunks = 1.25x score multiplier
4 chunks = 1.3x score multiplier
5 chunks = 1.4x score multiplier
6 chunks = 1.5x score multiplier
Say it’s an 18 chunk game. If the player carries 3 chunks back twice and 6 chunks back twice, their multiplier will grow from 1.25 to 5.5x. Multiply this to the Total Cookie Chunks Collected and the player has earned 9,900 pts.
Sneaky Bonus – 3,000 points is awarded if the Baker’s Cat never stirs.
Lucky Escape – 10,000 points is awarded if the cat pounces but the player escapes.
Speedy Bonus – Remaining time converted into bonus points.
Speedy Bonus Points = 10 x (seconds remaining)
30 seconds remaining = 300 bonus points
60 seconds remaining = 600 bonus points
Example in Level Review: Speedy Bonus - 600 pts
Big Back Bonus – A 1up is awarded for completely consuming the cookie before the countdown expires in the Eating Frenzy minigame.

Stage Completion and Level Review
At the end of each stage, the player will visit a Level Review screen. It tallies up the score.

Total Cookie Chunks Collected - 1800 pts
Greedy Finish - 5,000 pts
Greedy Bonus Multiplier - (sequence) 1.25x > 1.5x > 3x > 5.5x
Once finished, it multiplies the Total Chunks Collected
Speedy Bonus - 600 pts

Daring Total: (sequence: numbers flash randomly, then the Total appears) 15,500 pts

Eating Frenzy - Bonus Mini Game
After every level, the mouse must eat the stolen cookie in a 20-second countdown.

To devour the cookie quickly, the player must tap the screen or press the interaction button as fast as possible. The mouse will cartoonishly and ravenously zip around the cookie as it gets smaller and smaller. Once devoured, Mouse is fat. The player earns a 1up if completed in under 15 seconds.
The Baker’s Cat and Other Obstacles
The Baker’s Cat is the mouse’s greatest threat. Luckily, the cat begins every stage asleep.

Cat Awareness States (subject to playtest)
The Baker’s Cat has four awareness states and each state is measured from 0 – 100 alert points:

Asleep (0 – 36)
A speech bubble containing “Zzz” appears.
The cat is completely unaware.
Stirring (37 – 54)
The “Zzz” bubble pops.
The cat’s ears flick.
The cat is not fully aware (but can snap into Awake or Alert in later levels).
Awake (55 – 74)
The cat opens its eyes.
It actively watches.
Alert (75 – 100)
The cat actively tracks the mouse and prepares to pounce.
A pounce is initiated after 2-3 seconds in the pounce pose.
The player must hide or make a break for the mouse hole.

If the player manages to escape from a pounce, they’ll earn a Lucky Escape bonus at the end of the stage.

Design Note: These numbers must be allowed to change for later levels as the Baker’s Cat becomes more difficult.
How to Build the Cat’s Awareness Meter:
Misstep: +4 alert points
Misstep with 3-6 chunks: +8 alert points
Hastiness: +10 alert points
Hesitation (no input for 10 seconds): +5 alert points
How to Deduct from the Cat’s Awareness Meter:
If the Cat is Asleep: clean inputs reduce the awareness meter by -4 points.
If the Cat is Stirring: clean inputs reduce the awareness meter by -2 points.
If the Cat is Awake or Alert: clean inputs don’t do anything. The player must temporarily use a hiding spot or hide in the mouse hole until the Cat becomes bored and goes back to sleep. Awareness cooldown while in the mouse hole is 10-15 seconds (playtest-worthy).   
If in a Hiding Spot: the cat cannot pounce, but it will search for you if you hesitate for 10 seconds. The best thing to do is wait until the pounce pose is cancelled, then make a run to the mouse hole.

Tricky Awareness States
The cat can be unpredictable in later stages and may skip awareness states entirely. This is called Fake Sleep, and players must watch for subtle visual cues such as:
No ZZZ bubble
One eye partially opening periodically
Other Obstacles
As the game progresses, mousetraps are laid.

Mousetraps
These traps randomly switch between button commands. Time them right and jump over the trap. Time them wrong and you may see yourself early to a long slumber party.

Hiding Spots
Each level contains one or two hiding spots: the mouse hole or the leg of a drawer. Hiding reduces the cat’s awareness and cannot be immediately targeted by a pounce. However, if the player stays there for too long, the cat may decide to check the hiding place and threaten a good run.

Failure States
The player loses the level if:
The Baker’s Cat successfully pounces on the mouse
The mouse hits an active mousetrap
The timer reaches zero

Failure Penalties
When the player fails:
All points earned during the current level are lost.
The current level restarts.
Previously completed levels will remain cleared
But:
If the player loses their Lives:
They’ll lose their progress and begin from the Start Screen.
Prototype Development Timeline
Groundworks
Movement System and Button Interactions
Implement movement zones and path of travel from mouse hole to cookie and back again.
Implement Zone Button prompts and their corresponding button inputs.
Tether corresponding inputs to advance the mouse.
Cookie Interaction, Chunk Weight System
Tether “interact button” input to grab chunks based on tap.
Implement repeated button presses based on weight
Chunk Depositing, Scoring Implementation
Enter the mouse hole
Automatically deposit the chunks for points
Tally points into score in the top right.
Animate a visual confirming points were earned in front of the mouse hole.
Playtesting Session: Test a full run, scoring functionality, and stage completion
Cat Awareness States
Implement code that checks if the player has input an incorrect button
Set a rule that shifts the cat from Asleep to Stirring after a few incorrect button presses
From Stirring to Awake, and Awake to Alert
Determine if player has made correct inputs to reduce the cat’s awareness 

