<?php
/**
 * Smoke test for the player-panel data extension to MaterialDefs lookups.
 * Run: php tests/test_player_panel_data.php
 */

require_once __DIR__ . '/../modules/php/MaterialDefs.php';

use Bga\Games\theoracleofdelphi\MaterialDefs;

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
}
// The panel's summary line moved to MaterialDefs::shipTileDescriptions() so its
// literals could be wrapped in clienttranslate() — a const can't hold a call.
// Completeness of that map is covered by tests/test_material_i18n.php.

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

// Ship-ability glyph map covers all 8 abilities used in MaterialDefs::SHIP_TILES
$abilities = array_unique(array_column(MaterialDefs::SHIP_TILES, 'ability'));
$expectedAbilities = [
    'shield_start', 'starting_equipment', 'reverse_recolor', 'favor_plus_1',
    'god_track_high', 'range_plus_2', 'fewer_tasks', 'recolor_discount',
];
sort($abilities);
sort($expectedAbilities);
assert_true($abilities === $expectedAbilities, 'Ship-tile abilities cover the 8 expected values');

echo "\nPassed: $passed\nFailed: $failed\n";
exit($failed === 0 ? 0 : 1);
