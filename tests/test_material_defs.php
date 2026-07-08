<?php
/**
 * Smoke test for MaterialDefs constants.
 * Run: php tests/test_material_defs.php
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

// COLORS
assert_true(count(MaterialDefs::COLORS) === 6, 'Should have 6 colors');

// MONSTERS
assert_true(count(MaterialDefs::MONSTERS) === 6, 'Should have 6 monsters');
$monsterColors = array_column(MaterialDefs::MONSTERS, 'color');
sort($monsterColors);
$expectedColors = MaterialDefs::COLORS;
sort($expectedColors);
assert_true($monsterColors === $expectedColors, 'Monster colors should cover all 6 colors');

// GODS
assert_true(count(MaterialDefs::GODS) === 6, 'Should have 6 gods');
$godColors = array_column(MaterialDefs::GODS, 'color');
sort($godColors);
assert_true($godColors === $expectedColors, 'God colors should cover all 6 colors');
foreach (MaterialDefs::GODS as $name => $god) {
    assert_true(isset($god['ability']), "God $name should have ability");
}

// SHIP_TILES
assert_true(count(MaterialDefs::SHIP_TILES) === 8, 'Should have 8 ship tiles');
foreach (MaterialDefs::SHIP_TILES as $id => $tile) {
    assert_true(isset($tile['ability']), "Ship tile $id should have ability");
    assert_true(isset($tile['storage']), "Ship tile $id should have storage");
    assert_true($tile['storage'] >= 2, "Ship tile $id storage should be >= 2");
}

// EQUIPMENT_CARDS
assert_true(count(MaterialDefs::EQUIPMENT_CARDS) === 22, 'Should have 22 equipment cards');
foreach (MaterialDefs::EQUIPMENT_CARDS as $id => $card) {
    assert_true(isset($card['type']), "Equipment $id should have type");
    assert_true(isset($card['ability']), "Equipment $id should have ability");
    assert_true(in_array($card['type'], ['permanent', 'one_time', 'mixed']),
        "Equipment $id type should be permanent/one_time/mixed");
}

// COMPANION_TYPES
assert_true(count(MaterialDefs::COMPANION_TYPES) === 3, 'Should have 3 companion types');

// Card counts
assert_true(MaterialDefs::ORACLE_CARDS_PER_COLOR === 5, 'Oracle should be 5 per color');
assert_true(MaterialDefs::INJURY_CARDS_PER_COLOR === 7, 'Injury should be 7 per color');

// SHRINE_LETTERS
assert_true(count(MaterialDefs::SHRINE_LETTERS) === 4, 'Should have 4 player colors for shrines');
foreach (MaterialDefs::SHRINE_LETTERS as $color => $letters) {
    assert_true(count($letters) === 3, "Player $color should have 3 shrine letters");
}

// SHRINE_BONUSES
assert_true(count(MaterialDefs::SHRINE_BONUSES) === 4, 'Should have 4 shrine bonuses');
$allLetters = [];
foreach (MaterialDefs::SHRINE_LETTERS as $letters) {
    $allLetters = array_merge($allLetters, $letters);
}
$uniqueLetters = array_unique($allLetters);
sort($uniqueLetters);
$bonusLetters = array_keys(MaterialDefs::SHRINE_BONUSES);
sort($bonusLetters);
assert_true($uniqueLetters === $bonusLetters, 'Shrine letters should match bonus keys');

// DUAL_SIDED_TILES
assert_true(count(MaterialDefs::DUAL_SIDED_TILES) === 4, 'Should have 4 dual-sided tiles');
foreach (MaterialDefs::DUAL_SIDED_TILES as $i => $tile) {
    assert_true(in_array($tile['offering_color'], MaterialDefs::COLORS),
        "Dual tile $i offering_color should be a valid color");
    assert_true(isset(MaterialDefs::MONSTERS[$tile['monster_type']]),
        "Dual tile $i monster_type should be a valid monster");
}

// favorGainWithTile — Golden Touch (favor_plus_1) applies +1 to ANY positive
// favor gain, exactly once; other tiles / no tile get the base; non-positive
// base gains nothing.
assert_true(MaterialDefs::favorGainWithTile(null, 2) === 2,
    'No ship tile: base 2 favor stays 2');
assert_true(MaterialDefs::favorGainWithTile('favor_plus_1', 2) === 3,
    'Golden Touch: base 2 favor becomes 3');
assert_true(MaterialDefs::favorGainWithTile('favor_plus_1', 4) === 5,
    'Golden Touch: bonus is +1 once regardless of base size (4 -> 5)');
assert_true(MaterialDefs::favorGainWithTile('favor_plus_1', 1) === 2,
    'Golden Touch: base 1 favor becomes 2');
assert_true(MaterialDefs::favorGainWithTile('shield_start', 2) === 2,
    'A different ship tile grants no favor bonus');
assert_true(MaterialDefs::favorGainWithTile('favor_plus_1', 0) === 0,
    'No favor taken (0): no bonus even with Golden Touch');
assert_true(MaterialDefs::favorGainWithTile('favor_plus_1', -3) === 0,
    'Non-positive base is guarded to 0 (never negative, never bonus)');
assert_true(MaterialDefs::favorGainWithTile(null, 0) === 0,
    'No tile, 0 base: 0');

// equipmentCapacityForAbility: Quartermaster (starting_equipment) can hold a
// 4th card (1 starting + 3 monster rewards, legal per errata); everyone else
// caps at 3.
assert_true(MaterialDefs::equipmentCapacityForAbility('starting_equipment') === 4,
    'Quartermaster equipment capacity is 4');
assert_true(MaterialDefs::equipmentCapacityForAbility(null) === 3,
    'No ship-tile ability: equipment capacity 3');
foreach (['shield_start', 'reverse_recolor', 'favor_plus_1', 'god_track_high',
          'range_plus_2', 'fewer_tasks', 'recolor_discount'] as $ability) {
    assert_true(MaterialDefs::equipmentCapacityForAbility($ability) === 3,
        "Non-Quartermaster ability '$ability': equipment capacity 3");
}

echo "\n$passed passed, $failed failed out of " . ($passed + $failed) . " assertions\n";
exit($failed > 0 ? 1 : 0);
