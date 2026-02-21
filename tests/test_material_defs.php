<?php
/**
 * Smoke test for MaterialDefs constants.
 * Run: php tests/test_material_defs.php
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

echo "\n$passed passed, $failed failed out of " . ($passed + $failed) . " assertions\n";
exit($failed > 0 ? 1 : 0);
