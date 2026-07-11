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

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
