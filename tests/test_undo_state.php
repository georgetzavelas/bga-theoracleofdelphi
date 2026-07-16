<?php
/**
 * Smoke test for UndoState JSON round-trip.
 * Run: php tests/test_undo_state.php
 */
require_once __DIR__ . '/../modules/php/UndoState.php';

use Bga\Games\theoracleofdelphi\UndoState;

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

$state = [
    'tables' => [
        'player' => [
            ['player_id' => '5', 'ship_q' => '2', 'ship_r' => '-1', 'favor_tokens' => '3'],
        ],
        'monster' => [],
    ],
    'globals' => [
        'selected_die_index' => 1,
        'active_god_ability' => null,
        'oracle_card_play_colors' => ['red', 'blue'],
    ],
];

$round = UndoState::decode(UndoState::encode($state));
check($round === $state, 'round-trip preserves nested tables + globals exactly');
check(is_string(UndoState::encode($state)), 'encode returns a string');
check(UndoState::decode('not json') === ['tables' => [], 'globals' => []],
      'decode of garbage yields empty state, not a crash');

// Manifest guard: assert against the real const, not a copied literal, so
// this test actually exercises the code Game.php references.
$forbidden = ['undo_snapshot', 'temple', 'board_placement'];
foreach ($forbidden as $f) {
    check(!in_array($f, UndoState::SNAPSHOT_TABLES, true), "manifest must not capture $f");
}
$required = ['hex', 'card', 'oracle_die'];
foreach ($required as $r) {
    check(in_array($r, UndoState::SNAPSHOT_TABLES, true), "manifest must capture $r");
}

// Regression: a captured value with malformed UTF-8 must NOT make encode fail.
// It previously returned false, which the `: string` return type converted
// into a TypeError that undoCheckpoint swallowed, leaving undo_snapshot empty
// for the entire game. Now the bad bytes are substituted (U+FFFD) and encode
// still returns a usable string.
$badByte = "ok\x80bad";  // lone 0x80 continuation byte = invalid UTF-8
$dirty = [
    'tables' => ['player' => [['player_id' => '5', 'name' => $badByte]]],
    'globals' => ['bonus_action_color' => $badByte],
];
$encoded = null; $threw = false;
try { $encoded = UndoState::encode($dirty); } catch (\Throwable $e) { $threw = true; }
check(!$threw, 'encode does not throw on malformed UTF-8');
check(is_string($encoded), 'encode returns a string on malformed UTF-8');
check(is_array(UndoState::decode((string)$encoded)['tables']['player'] ?? null),
      'malformed-UTF-8 snapshot still round-trips through decode');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
