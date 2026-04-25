<?php
/**
 * Smoke test for the player-panel data extension to MaterialDefs lookups.
 * Run: php tests/test_player_panel_data.php
 */

require_once __DIR__ . '/../modules/php/MaterialDefs.php';

use Bga\Games\theoracleofdelphigzed\MaterialDefs;

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

// All 8 ship tiles have an ability
assert_true(count(MaterialDefs::SHIP_TILES) === 8, 'Should have 8 ship tiles');
foreach (MaterialDefs::SHIP_TILES as $id => $tile) {
    assert_true(isset($tile['ability']), "Ship tile $id has ability");
    assert_true(isset($tile['storage']), "Ship tile $id has storage");
    assert_true(isset($tile['description']), "Ship tile $id has description");
}

// Storage values are 2 or 4
foreach (MaterialDefs::SHIP_TILES as $id => $tile) {
    assert_true(in_array($tile['storage'], [2, 4], true), "Ship tile $id storage in {2,4}");
}

// Exactly one ship tile is fewer_tasks (which sets task total to 11)
$fewerTasksTiles = array_filter(
    MaterialDefs::SHIP_TILES,
    fn($t) => ($t['ability'] ?? null) === 'fewer_tasks'
);
assert_true(count($fewerTasksTiles) === 1, 'Exactly one ship tile is fewer_tasks');

echo "\nPassed: $passed\nFailed: $failed\n";
exit($failed === 0 ? 0 : 1);
