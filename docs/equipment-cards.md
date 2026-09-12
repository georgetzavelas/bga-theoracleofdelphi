## Equipment Card to image mapping

Cards have permanent effects unless otherwise stated. Some cards have more than one effect and duration.

000 - When you Consult the Oracle and at least 1 of the dice shows the yellow color, take 2 Favor Tokens.
001 - When you Consult the Oracle and at least 1 of the dice shows the red color, take 2 Favor Tokens.
002 - When you Consult the Oracle and at least 1 of the dice shows the black color, take 2 Favor Tokens.
003 - Once per turn, you may spend 3 Favor Tokens to perform an additional action of any color.
004 - You may use an Oracle Die of the pink color as an action to take 1 Favor Token, draw 1 Oracle Card, and advance Hermes by 1 step on the God Track.
005 - You may use an Oracle Die of the green color as an action to take 1 Favor Token, draw 1 Oracle Card, and advance Artemis by 1 step on the God Track.
006 - You may use an Oracle Die of the blue color as an action to take 1 Favor Token, draw 1 Oracle Card, and advance Poseidon by 1 step on the God Track.
007 - One-time: Take 3 Favor Tokens, draw 1 Oracle Card, and advance 1 or 2 Gods by a total of 2 steps combined.
008 - Your Ship’s range is increased by 1.
009 - You may Load a Statue and Raise a Statue from a distance of 1 water space from the respective City Tile or Island Tile.
010 - You may Fight a Monster, Explore an Island and Build a Shrine from a distance of 1 water space from the respective Island Tiles.
011 - Whenever you receive a reward for Making an Offering, Raising a Statue or Fighting a Monster, advance 1 God by 1 step.
012 - You may Load an Offering and Make an Offering from a distance of 1 water space from the respective Island Tile.
013 - One-time: Look at 2 face down Island Tiles and put 1 back. Uncover the other and take the corresponding reward. If there are less than 2 face down Island Tiles, this card cannot be used.
014 - Your Ship may cross shallows. A shallow does not count as a space!
015 - When checking your Injury Cards, you have to Recover due to 4 equally colored Injury Cards or 8 Injury Cards, in total instead of 3 and 6, respectively.
016 - Permanent: Your storage capacity is increased by 1. One-time: Increase your Shield’s strength by 1.
017 - One-time: Take 1 of the red, green or yellow Offerings from any Island Tile and store it in your Ship.
018 - One-time: Take 1 of the pink, blue or black Offerings from any Island Tile and store it in your Ship.
019 - One-time: Take 1 of the pink, blue or black Statues from the corresponding City Tile and store it in your Ship.
020 - One-time: Take 1 of the red, green or yellow Statues from the corresponding City Tile and store it in your Ship.
021 - One-time: Advance 1 of the following Gods to the topmost row of the God Track: Poseidon, Hermes, Artemis or Aphrodite.

## Rulings

Where the card text alone doesn't settle a question, this is the reading the
implementation commits to. Printed FAQ answers (`Delphi_FAQ_v1.0.pdf`) aren't
repeated here — only equipment-specific calls.

**004 / 005 / 006 — what counts as "an Oracle Die of the depicted color"**
Any action source of that colour: a rolled Oracle Die, a played Oracle Card, or
a 003 bonus action. Card 003 buys "an additional action of any color" and the
Amulet's ability is a colour-dependent action, so the two compose. The Creature
companion, worded identically, already accepted all three. The colour is read at
use time, so a recoloured source qualifies. Apollo must have resolved its free
colour choice first.
→ `Game::computeActivatableEquipment`, `SelectAction::activateAmuletEquipment`

**003 — bonus action mechanics**
Once per turn. The colour is fixed at the wheel picker and cannot be recoloured
afterwards, paid or free. The card can only be activated with nothing already in
flight — no die, no played card, no earlier bonus. The Demigod's free recolor is
a no-op on it, since the bonus action is already any-colour.
→ `Game::activateBonusActionEquipment`, `PlayerActions::actUseBonusAction`

**009 / 010 / 012 — "1 water space away"**
Strictly a water hex, not a shallow. Card 014 overrides ship movement but does
not extend this range qualifier. Reachable means distance 1, or distance 2 with a
single water hex between.
→ `Game::isReachableForEquipmentRange`

**014 — shallows are routing-only**
Passing through at zero cost is the whole benefit; the ship can never end its
move on a shallow. The Zeus hex is the sole exception — geographically a shallow,
landable only once all Zeus tiles are complete.
→ `MoveShip::getArgs`, `MoveShip::actConfirmMove`

**011 — per reward, not per turn**
Every qualifying reward triggers it, including several in one turn. The only
suppression is the monster reward that granted the card itself.
→ `Game::maybeGrantBlessedRewardGodStep`

**016 — the two halves have different lifetimes**
The one-time +1 Shield fires on receipt and is capped at 5. The permanent +1
storage survives the `is_used` flip and lasts as long as the card is in hand.
→ `Game::applyOneTimeEquipmentEffect` case 16, `Game::getCargoCapacity`

**One-time cards — no activation step**
Cards marked one-time (007, 013, 016, 017-021) resolve immediately on receipt per
the rulebook. They never enter the activatable list, so a hand card just shakes
when clicked.
→ `Game::applyOneTimeEquipmentEffect`

**Hand limit — 4 with Quartermaster, 3 otherwise**
Equipment is earned only by defeating monsters (3 monster Zeus tiles), plus the
one card the Quartermaster ship tile deals at setup. The rulebook errata makes
that 4th card legal.
→ `MaterialDefs::equipmentCapacityForAbility`
