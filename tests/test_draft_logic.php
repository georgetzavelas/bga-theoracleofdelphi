<?php
/**
 * Smoke test for the pure Ship Tile draft decision logic.
 * Run: php tests/test_draft_logic.php
 */

require_once __DIR__ . '/../modules/php/DraftLogic.php';

use Bga\Games\theoracleofdelphi\DraftLogic;

$passed = 0;
$failed = 0;

function assert_true(bool $condition, string $message): void {
    global $passed, $failed;
    if ($condition) {
        $passed++;
    } else {
        $failed++;
        echo "FAIL: $message\n";
    }
}

// --- poolSize: one more tile than players -----------------------------------
assert_true(DraftLogic::poolSize(1) === 2, 'Solo lays out 2 tiles');
assert_true(DraftLogic::poolSize(2) === 3, '2 players lay out 3 tiles');
assert_true(DraftLogic::poolSize(3) === 4, '3 players lay out 4 tiles');
assert_true(DraftLogic::poolSize(4) === 5, '4 players lay out 5 tiles');

// --- availableTiles: pool minus claimed, order preserved --------------------
$pool = [4, 1, 5, 6];
assert_true(
    DraftLogic::availableTiles($pool, []) === [4, 1, 5, 6],
    'Nothing claimed => whole pool, in order'
);
assert_true(
    DraftLogic::availableTiles($pool, [4]) === [1, 5, 6],
    'One claimed tile is removed'
);
assert_true(
    DraftLogic::availableTiles($pool, [4, 5]) === [1, 6],
    'Multiple claimed tiles removed, order preserved'
);
assert_true(
    DraftLogic::availableTiles($pool, [4, 1, 5, 6]) === [],
    'All claimed => nothing available'
);
// Robust against string ids coming out of the DB.
assert_true(
    DraftLogic::availableTiles(['4', '1', '5', '6'], ['4']) === [1, 5, 6],
    'String tile ids are normalised to ints'
);

// --- nextDrafter: highest remaining player_no (reverse turn order) ----------
assert_true(DraftLogic::nextDrafter([]) === null, 'No undrafted players => null');
// Seating: player_id => player_no. Last player (highest no) drafts first.
assert_true(
    DraftLogic::nextDrafter([101 => 1, 102 => 2, 103 => 3]) === 103,
    'First pick goes to the last player (highest player_no)'
);
assert_true(
    DraftLogic::nextDrafter([101 => 1, 102 => 2]) === 102,
    'After the last player drafts, the next-highest player_no is next'
);
assert_true(
    DraftLogic::nextDrafter([101 => 1]) === 101,
    'First player drafts last'
);

echo "\nPassed: $passed\nFailed: $failed\n";
exit($failed === 0 ? 0 : 1);
