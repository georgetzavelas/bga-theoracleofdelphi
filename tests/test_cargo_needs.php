<?php
/**
 * Tests for CargoNeeds: "do I still need more cargo of this type?"
 *
 * Regression origin: a player rolled a pink die next to a pink offering, had a
 * single PINK offering Zeus tile left, one free cargo space, and could not load
 * it. They were carrying a RED offering picked up earlier for a white
 * (any-colour) tile that was then completed with green, so the red could no
 * longer complete anything. The old rule compared counts only,
 * `openTasks > itemsAboard`, so 1 open tile against 1 item aboard read as
 * "already covered" and every offering was filtered out.
 *
 * The rule is not "how many do I hold?" but "is there an open tile that nothing
 * aboard can complete?".
 *
 * Run: php tests/test_cargo_needs.php
 */

require_once __DIR__ . '/../modules/php/CargoNeeds.php';

use Bga\Games\theoracleofdelphi\CargoNeeds;

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

/** Tile helpers: a fixed-colour tile, a white (any-colour) tile. */
function tile(?string $color, ?string $completedWith = null): array {
    return ['task_color' => $color, 'completion_value' => $completedWith];
}

// ---- the reported game ------------------------------------------------------
// Open: the pink tile. Siblings: pink, plus the two completed ones (a white
// finished with green, and a yellow). Aboard: one red offering.
$open = [tile('pink')];
$siblings = [tile('pink'), tile(null, 'green'), tile('yellow', 'yellow')];
check(CargoNeeds::needsMore($open, $siblings, ['red']) === true,
    'a red offering that can complete nothing must NOT block loading the pink one');

// The same player once they are holding the pink they need: now covered.
check(CargoNeeds::needsMore($open, $siblings, ['pink']) === false,
    'holding the pink offering covers the pink tile, so no more are needed');
// And red alongside pink still leaves nothing open.
check(CargoNeeds::needsMore($open, $siblings, ['pink', 'red']) === false,
    'the useless red does not create a phantom need once pink is aboard');

// ---- the count rule this replaced must still hold where it was right --------
check(CargoNeeds::needsMore([], $siblings, []) === false,
    'no open tiles means no cargo is needed');
check(CargoNeeds::needsMore($open, $siblings, []) === true,
    'an open tile with an empty hold needs cargo');

// Statue tasks are white/any, which is the case the count rule got right: two
// statues aboard cover two open tiles, so a third must not be offered (the
// Hermes-with-two-statues fix).
$twoWhite = [tile(null), tile(null)];
$whiteSiblings = [tile(null), tile(null)];
check(CargoNeeds::needsMore($twoWhite, $whiteSiblings, ['red', 'green']) === false,
    'two items aboard cover two white tiles');
check(CargoNeeds::needsMore($twoWhite, $whiteSiblings, ['red']) === true,
    'one item aboard leaves the second white tile open');

// ---- white-tile exclusion is respected -------------------------------------
// A white tile cannot be completed with a colour a sibling already used, so an
// item of that colour covers nothing.
$openWhite = [tile(null)];
$usedYellow = [tile(null), tile('yellow', 'yellow')];
check(CargoNeeds::needsMore($openWhite, $usedYellow, ['yellow']) === true,
    'a yellow item cannot cover a white tile when yellow is already spoken for');
check(CargoNeeds::needsMore($openWhite, $usedYellow, ['blue']) === false,
    'a blue item can cover that white tile');
check(CargoNeeds::excludedColors($usedYellow) === ['yellow'],
    'the exclusion set is the sibling colours actually used');

// ---- assignment order: exact match before wildcard -------------------------
// Aboard pink + blue against an open pink tile and an open white tile. Pink must
// take the pink tile so blue can take the white one. Assigning pink to the white
// tile first would leave the pink tile "open" and overstate the need.
$mixedOpen = [tile('pink'), tile(null)];
$mixedSiblings = [tile('pink'), tile(null)];
check(CargoNeeds::needsMore($mixedOpen, $mixedSiblings, ['pink', 'blue']) === false,
    'an exact match claims its own tile so the wildcard is left for the other item');
// Order of arrival must not change the answer.
check(CargoNeeds::needsMore($mixedOpen, $mixedSiblings, ['blue', 'pink']) === false,
    'the same holds when the wildcard-only item is considered first');
// Only the pink aboard: the white tile is still open.
check(CargoNeeds::needsMore($mixedOpen, $mixedSiblings, ['pink']) === true,
    'one item cannot cover two open tiles');

// ---- a colour with no home at all ------------------------------------------
// Open pink tile only, no white tiles, holding blue: blue covers nothing.
check(CargoNeeds::needsMore([tile('pink')], [tile('pink')], ['blue']) === true,
    'an item whose colour matches no open tile covers nothing');

// ============================================================================
// canTakeColor — the reservation question. needsMore cannot answer it: it asks
// "is any open tile uncovered?", which stays true while OTHER tiles are open,
// and says nothing about whether the specific colour on offer is useful.
// ============================================================================

// ---- reported game 1 -------------------------------------------------------
// Tiles yellow / green / white, all open. Red is loaded for the white tile
// (red can never serve yellow or green). Blue also only fits white, which red
// has taken — so blue must not be offered. It WAS, was delivered to white, and
// the red could never be used again.
$g1Open     = [tile('yellow'), tile('green'), tile(null)];
$g1Siblings = [tile('yellow'), tile('green'), tile(null)];

check(CargoNeeds::canTakeColor($g1Open, $g1Siblings, [], 'red') === true,
    'game 1: red is loadable while the white tile is free');
check(CargoNeeds::canTakeColor($g1Open, $g1Siblings, ['red'], 'blue') === false,
    'game 1: blue is NOT loadable once red has reserved the only white tile');
// The tiles red cannot serve are still needed, so needsMore stays true — which
// is exactly why it could not have caught this on its own.
check(CargoNeeds::needsMore($g1Open, $g1Siblings, ['red']) === true,
    'game 1: needsMore still (correctly) reports more cargo needed');
// And the colours that DO have an exact home are unaffected.
check(CargoNeeds::canTakeColor($g1Open, $g1Siblings, ['red'], 'yellow') === true,
    'game 1: yellow still loadable — it has its own tile, not the wildcard');
check(CargoNeeds::canTakeColor($g1Open, $g1Siblings, ['red'], 'green') === true,
    'game 1: green still loadable for the same reason');

// ---- reported game 2 -------------------------------------------------------
// Blue and pink tiles already completed with their own colours, only white
// open. Black is loaded for it; a yellow was still offered, so whichever was
// not delivered would be stuck.
$g2Open     = [tile(null)];
$g2Siblings = [tile('blue', 'blue'), tile('pink', 'pink'), tile(null)];

check(CargoNeeds::canTakeColor($g2Open, $g2Siblings, [], 'black') === true,
    'game 2: black is loadable for the last white tile');
check(CargoNeeds::canTakeColor($g2Open, $g2Siblings, ['black'], 'yellow') === false,
    'game 2: yellow is NOT loadable once black has reserved the white tile');
// A colour already spent on a sibling can never take a white tile.
check(CargoNeeds::canTakeColor($g2Open, $g2Siblings, [], 'blue') === false,
    'game 2: blue cannot take the white tile — a sibling was completed with it');

// ---- must stay permissive where it was right -------------------------------
// Two open white tiles (the Hermes case the original fix preserved): one item
// aboard leaves the second wildcard free.
$twoWhite = [tile(null), tile(null)];
check(CargoNeeds::canTakeColor($twoWhite, $twoWhite, ['red'], 'blue') === true,
    'two open white tiles still accept a second item');
check(CargoNeeds::canTakeColor($twoWhite, $twoWhite, ['red', 'blue'], 'green') === false,
    'but not a third');

// An exact-colour tile is claimed by its own colour, freeing the wildcard.
$exactPlusWhite = [tile('pink'), tile(null)];
check(CargoNeeds::canTakeColor($exactPlusWhite, $exactPlusWhite, ['pink'], 'blue') === true,
    'a carried exact match does not consume the wildcard');

// Nothing open: nothing is loadable, whatever the colour.
check(CargoNeeds::canTakeColor([], [tile('pink', 'pink')], [], 'blue') === false,
    'no open tiles means nothing is loadable');

// ---- the reservation rule must not over-block -------------------------------
// Reported as possibly broken: pink/green/white tiles ALL open, carrying a pink
// offering, wanting to load yellow. Yellow must be allowed — the carried pink
// has its own exact tile, so it does not touch the wildcard, which is still free
// for the yellow. This is the case the reservation rule could most plausibly
// have broken, so it is pinned explicitly alongside the cases that must block.
$r3Open     = [tile('pink'), tile('green'), tile(null)];
$r3Siblings = [tile('pink'), tile('green'), tile(null)];

check(CargoNeeds::canTakeColor($r3Open, $r3Siblings, ['pink'], 'yellow') === true,
    'carrying pink with pink/green/white all open: yellow IS loadable (pink takes '
    . 'its own tile, leaving the wildcard free)');
check(CargoNeeds::canTakeColor($r3Open, $r3Siblings, ['pink'], 'green') === true,
    'and so is green, which has its own tile');
check(CargoNeeds::canTakeColor($r3Open, $r3Siblings, ['pink'], 'pink') === false,
    'but not a second pink — one per colour aboard');
check(CargoNeeds::needsMore($r3Open, $r3Siblings, ['pink']) === true,
    'and more cargo is still needed, since green and white are uncovered');

// Completing the pink tile does NOT start blocking yellow, which is worth
// pinning because it looks like it should: the carried pink now has no exact
// tile, but pink is also excluded from the wildcard (a sibling was completed
// with it), so it claims nothing and the wildcard stays free. That is the
// original "a useless offering must not block the one you need" rule holding.
$r3bOpen     = [tile('green'), tile(null)];
$r3bSiblings = [tile('pink', 'pink'), tile('green'), tile(null)];
check(CargoNeeds::canTakeColor($r3bOpen, $r3bSiblings, ['pink'], 'yellow') === true,
    'a carried pink whose tile is already done blocks nothing — it cannot use the '
    . 'wildcard either, so yellow stays loadable');

// What DOES block yellow here: a second carried offering that can only go to the
// wildcard. Black has no tile of its own and is not excluded, so it reserves the
// wildcard and yellow has nowhere left to go.
check(CargoNeeds::canTakeColor($r3Open, $r3Siblings, ['pink', 'black'], 'yellow') === false,
    'carrying pink plus a wildcard-only black does block yellow — black has the '
    . 'wildcard reserved');

// ---- agreement with the empty-ship case ------------------------------------
// With an empty hold, canTakeColor must match the plain tile lookup
// (findCompletableZeusTileForType): exact tile, else a white tile the colour is
// allowed on, else nothing.
check(CargoNeeds::canTakeColor([tile('pink')], [tile('pink')], [], 'pink') === true,
    'empty hold: exact colour matches its tile');
check(CargoNeeds::canTakeColor([tile('pink')], [tile('pink')], [], 'blue') === false,
    'empty hold: no wildcard and no exact tile means no');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
