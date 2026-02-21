# MaterialDefs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create `modules/php/MaterialDefs.php` containing all game reference data as PHP constants.

**Architecture:** Single class with `const` arrays. No runtime initialization. All data sourced from rulebook + misc/*.md mappings. Game.php accesses via `MaterialDefs::CONSTANT_NAME`.

**Tech Stack:** PHP 8.1+ (class constants with arrays)

---

### Task 1: Create MaterialDefs.php with core constants

**Files:**
- Create: `modules/php/MaterialDefs.php`

**Step 1: Create the file with COLORS, MONSTERS, GODS**

```php
<?php
declare(strict_types=1);

namespace Bga\Games\theoracleofdelphigzed;

/**
 * Static game material definitions. All data is compile-time constant.
 * Sources: rulebook, misc/monster-and-gods.md, misc/ship-tiles.md,
 *          misc/equipment-cards.md, misc/companion-cards.md
 */
class MaterialDefs
{
    public const COLORS = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];

    public const MONSTERS = [
        'chimera'  => ['color' => 'yellow'],
        'cyclops'  => ['color' => 'red'],
        'gorgon'   => ['color' => 'green'],
        'hydra'    => ['color' => 'pink'],
        'minotaur' => ['color' => 'black'],
        'siren'    => ['color' => 'blue'],
    ];

    public const GODS = [
        'aphrodite' => ['color' => 'red',    'ability' => 'discard_all_injuries'],
        'apollo'    => ['color' => 'yellow',  'ability' => 'dice_wild'],
        'ares'      => ['color' => 'black',   'ability' => 'auto_defeat_monster'],
        'artemis'   => ['color' => 'green',   'ability' => 'free_explore_island'],
        'hermes'    => ['color' => 'pink',    'ability' => 'grab_any_statue'],
        'poseidon'  => ['color' => 'blue',    'ability' => 'teleport_ship'],
    ];
}
```

**Step 2: Verify PHP syntax**

Run: `php -l modules/php/MaterialDefs.php`
Expected: `No syntax errors detected`

**Step 3: Commit**

```bash
git add modules/php/MaterialDefs.php
git commit -m "feat: add MaterialDefs with COLORS, MONSTERS, GODS"
```

---

### Task 2: Add SHIP_TILES constant

**Files:**
- Modify: `modules/php/MaterialDefs.php`

**Step 1: Add SHIP_TILES after GODS**

```php
    // Ship tile IDs match img/ship-tiles/ship-{id}.jpg
    public const SHIP_TILES = [
        0 => ['ability' => 'shield_start',       'storage' => 2,
              'description' => '+2 Shield at game start'],
        1 => ['ability' => 'starting_equipment',  'storage' => 2,
              'description' => 'Start with 1 Equipment + 1 Oracle card'],
        2 => ['ability' => 'reverse_recolor',     'storage' => 4,
              'description' => 'Recolor counterclockwise + 4 storage'],
        3 => ['ability' => 'favor_plus_1',        'storage' => 2,
              'description' => '+1 Favor when gaining favor (incl. starting)'],
        4 => ['ability' => 'god_track_high',      'storage' => 2,
              'description' => 'Gods start/return to player-count row'],
        5 => ['ability' => 'range_plus_2',        'storage' => 2,
              'description' => '+2 Ship movement range'],
        6 => ['ability' => 'fewer_tasks',         'storage' => 2,
              'description' => '-1 Zeus tile (11 tasks to win)'],
        7 => ['ability' => 'recolor_discount',    'storage' => 2,
              'description' => '-1 recolor cost'],
    ];
```

**Step 2: Verify PHP syntax**

Run: `php -l modules/php/MaterialDefs.php`
Expected: `No syntax errors detected`

**Step 3: Commit**

```bash
git add modules/php/MaterialDefs.php
git commit -m "feat: add SHIP_TILES to MaterialDefs"
```

---

### Task 3: Add EQUIPMENT_CARDS constant

**Files:**
- Modify: `modules/php/MaterialDefs.php`

**Step 1: Add EQUIPMENT_CARDS after SHIP_TILES**

```php
    // Equipment card IDs match img/equipment/card-{id:03d}.jpg
    public const EQUIPMENT_CARDS = [
        0  => ['type' => 'permanent', 'ability' => 'oracle_favor_yellow',
               'description' => 'Consulting oracle: if yellow shows, +2 Favor'],
        1  => ['type' => 'permanent', 'ability' => 'oracle_favor_red',
               'description' => 'Consulting oracle: if red shows, +2 Favor'],
        2  => ['type' => 'permanent', 'ability' => 'oracle_favor_black',
               'description' => 'Consulting oracle: if black shows, +2 Favor'],
        3  => ['type' => 'permanent', 'ability' => 'extra_action',
               'description' => 'Spend 3 Favor for additional action of any color'],
        4  => ['type' => 'permanent', 'ability' => 'color_action_pink',
               'god' => 'hermes',
               'description' => 'Pink die: +1 Favor, +1 Oracle Card, advance Hermes'],
        5  => ['type' => 'permanent', 'ability' => 'color_action_green',
               'god' => 'artemis',
               'description' => 'Green die: +1 Favor, +1 Oracle Card, advance Artemis'],
        6  => ['type' => 'permanent', 'ability' => 'color_action_blue',
               'god' => 'poseidon',
               'description' => 'Blue die: +1 Favor, +1 Oracle Card, advance Poseidon'],
        7  => ['type' => 'one_time',  'ability' => 'big_bonus',
               'description' => '+3 Favor, +1 Oracle Card, advance 1-2 Gods 2 steps total'],
        8  => ['type' => 'permanent', 'ability' => 'range_plus_1',
               'description' => '+1 Ship range'],
        9  => ['type' => 'permanent', 'ability' => 'statue_distance',
               'description' => 'Load/Raise Statue from 1 water space away'],
        10 => ['type' => 'permanent', 'ability' => 'combat_distance',
               'description' => 'Fight/Explore/Shrine from 1 water space away'],
        11 => ['type' => 'permanent', 'ability' => 'reward_god_advance',
               'description' => 'On reward from Offering/Statue/Monster: advance 1 God'],
        12 => ['type' => 'permanent', 'ability' => 'offering_distance',
               'description' => 'Load/Make Offering from 1 water space away'],
        13 => ['type' => 'one_time',  'ability' => 'look_and_explore',
               'description' => 'Look at 2 islands, put 1 back, explore the other'],
        14 => ['type' => 'permanent', 'ability' => 'cross_shallows',
               'description' => 'Ship crosses shallows (free, no space cost)'],
        15 => ['type' => 'permanent', 'ability' => 'injury_tolerance',
               'description' => 'Recover at 4 same-color or 8 total (not 3/6)'],
        16 => ['type' => 'mixed',     'ability' => 'storage_and_shield',
               'description' => 'Permanent: +1 storage. One-time: +1 Shield'],
        17 => ['type' => 'one_time',  'ability' => 'grab_offering_warm',
               'colors' => ['red', 'green', 'yellow'],
               'description' => 'Take 1 red/green/yellow Offering from any island'],
        18 => ['type' => 'one_time',  'ability' => 'grab_offering_cool',
               'colors' => ['pink', 'blue', 'black'],
               'description' => 'Take 1 pink/blue/black Offering from any island'],
        19 => ['type' => 'one_time',  'ability' => 'grab_statue_cool',
               'colors' => ['pink', 'blue', 'black'],
               'description' => 'Take 1 pink/blue/black Statue from city'],
        20 => ['type' => 'one_time',  'ability' => 'grab_statue_warm',
               'colors' => ['red', 'green', 'yellow'],
               'description' => 'Take 1 red/green/yellow Statue from city'],
        21 => ['type' => 'one_time',  'ability' => 'advance_god_max',
               'gods' => ['poseidon', 'hermes', 'artemis', 'aphrodite'],
               'description' => 'Advance 1 of Poseidon/Hermes/Artemis/Aphrodite to top'],
    ];
```

**Step 2: Verify PHP syntax**

Run: `php -l modules/php/MaterialDefs.php`
Expected: `No syntax errors detected`

**Step 3: Commit**

```bash
git add modules/php/MaterialDefs.php
git commit -m "feat: add EQUIPMENT_CARDS to MaterialDefs"
```

---

### Task 4: Add card generation constants and Zeus tile definitions

**Files:**
- Modify: `modules/php/MaterialDefs.php`

**Step 1: Add companion types, oracle/injury counts, and Zeus tile data**

```php
    // Companion card index matches img/companion/{color}-card-{index}.png
    public const COMPANION_TYPES = [
        0 => ['subtype' => 'creature',  'ability' => 'move_range_plus_3',
              'description' => 'Moving with this color die: +3 range, end on any color'],
        1 => ['subtype' => 'demigod',   'ability' => 'die_wild_color',
              'description' => 'Draw 1 Oracle Card. Use any die in this color as wild'],
        2 => ['subtype' => 'hero',      'ability' => 'shield_and_discard',
              'description' => '+2 Shield. May discard injuries of this color anytime'],
    ];

    // Oracle: 6 colors x 5 = 30 cards. Image: img/oracle/{color}.jpg
    public const ORACLE_CARDS_PER_COLOR = 5;

    // Injury: 6 colors x 7 = 42 cards. Image: img/injury/{color}.jpg
    public const INJURY_CARDS_PER_COLOR = 7;

    // Shrine Greek letters per player color. Image: img/zeus-tiles/shrines/{player}-player-{letter}.jpg
    public const SHRINE_LETTERS = [
        'red'    => ['omega', 'phi', 'psi'],
        'yellow' => ['omega', 'psi', 'sigma'],
        'green'  => ['phi', 'psi', 'sigma'],
        'blue'   => ['omega', 'phi', 'sigma'],
    ];

    // Reward when another player explores an island matching your shrine
    public const SHRINE_BONUSES = [
        'psi'   => ['type' => 'favor',   'value' => 4,
                    'description' => 'Take 4 Favor Tokens'],
        'phi'   => ['type' => 'oracle',  'value' => 2,
                    'description' => 'Draw 2 Oracle Cards'],
        'sigma' => ['type' => 'gods',    'value' => 3,
                    'description' => 'Advance Gods 3 total steps'],
        'omega' => ['type' => 'heal',    'value' => 0,
                    'description' => 'Discard all injuries + 1 Shield'],
    ];

    // 4 dual-sided Zeus tiles: offering color on front, monster type on back.
    // During setup, 2 randomly placed offering-up, 2 monster-up.
    public const DUAL_SIDED_TILES = [
        ['offering_color' => 'blue',   'monster_type' => 'siren'],
        ['offering_color' => 'yellow', 'monster_type' => 'chimera'],
        ['offering_color' => 'pink',   'monster_type' => 'cyclops'],
        ['offering_color' => 'green',  'monster_type' => 'minotaur'],
    ];
```

**Step 2: Verify PHP syntax**

Run: `php -l modules/php/MaterialDefs.php`
Expected: `No syntax errors detected`

**Step 3: Commit**

```bash
git add modules/php/MaterialDefs.php
git commit -m "feat: add companion types, card counts, Zeus tile defs to MaterialDefs"
```

---

### Task 5: Write validation test

**Files:**
- Create: `tests/test_material_defs.php`

**Step 1: Write test that validates all constants are well-formed**

```php
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
```

**Step 2: Run the test**

Run: `php tests/test_material_defs.php`
Expected: All assertions pass, 0 failures

**Step 3: Commit**

```bash
git add tests/test_material_defs.php
git commit -m "test: add MaterialDefs validation test"
```

---

### Task 6: Wire MaterialDefs into Game.php

**Files:**
- Modify: `modules/php/Game.php` (remove placeholder CARD_TYPES, add use statement)

**Step 1: Add `use MaterialDefs;` import and remove placeholder CARD_TYPES**

In Game.php, add after existing use statements:
```php
use Bga\Games\theoracleofdelphigzed\MaterialDefs;
```

Remove the placeholder `$CARD_TYPES` static property and the Troll/Goblin initialization from the constructor.

**Step 2: Verify PHP syntax**

Run: `php -l modules/php/Game.php`
Expected: `No syntax errors detected`

**Step 3: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: wire MaterialDefs into Game.php, remove placeholder CARD_TYPES"
```
