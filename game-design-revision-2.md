Revision 2

**Controls**
• remove the arrow keys
• (for mobile) add invisible left and right control parameters that covers the left side of the screen for the left
control input, and right side of the screen for the right control input. Center them so they cover equal parts of the
screen.

For Mouse:
I want to try a single speed for him. Let’s make the run speed his default speed.

“Dead” Mouse:
When the player stops, program Mouse to flip upside down. If you can, put an X over his eyes haha. I think it’d be funny
if he plays dead when you stop.

Movement Acceleration and Deceleration:
If the player holds down for 0.6 seconds, the mouse will accelerate to full speed or previous running speed. If they
release, the mouse must decelerate to a speed of 0 in .1 or .15 seconds, whichever feels better.

**UI**
I figure this first prototype was just to get the mechanics in, but the Cat’s face is a bit obscured. Removing the UI
will make it easier to read the Cat.

Time Clock and Score
Two things: Place the score above the door, then place the time clock above the score board. I want to see how that
looks.

**Game Design**
Cat’s Eyes Indicator:
The Cat’s Eyes should eventually track player position if they move too much in the Awakened state.

Not sure if this is still in, but the Cat should wake up faster if the player moves too quickly.

You could possibly base it off a speed range. For example, if player is consistently between, 0.1 - 0.4 speed, the cat
will eventually stir after x amount of time to spook the player into hiding. If over 0.4, the cat will awake after x
seconds