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

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
