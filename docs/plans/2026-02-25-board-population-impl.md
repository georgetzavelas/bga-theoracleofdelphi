# Board Hex & Piece Population Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Populate the DB with hex grid and game pieces (monsters, offerings, temples, statues) after board generation, so the game is ready to play.

**Architecture:** `populateBoard()` method in Game.php called from `setupNewGame()`. Uses a `distributeColorRounds()` helper for randomized color assignment with no-duplicate constraint. Board state returned via `getAllDatas()` with island visibility filtering.

**Tech Stack:** PHP 8.1+, BGA framework DB methods (`DbQuery`, `DbGetLastId`), `MaterialDefs` constants.

---

### Task 1: Add player_island_knowledge table to schema

**Files:**
- Modify: `dbmodel.sql`

**Step 1: Add the table after the `shrine` table**

```sql
-- Player-specific island visibility (equipment card #13 peek)
CREATE TABLE IF NOT EXISTS `player_island_knowledge` (
    `player_id` INT NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    PRIMARY KEY (`player_id`, `hex_q`, `hex_r`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

**Step 2: Commit**

```bash
git add dbmodel.sql
git commit -m "schema: add player_island_knowledge table for island peek tracking"
```

---

### Task 2: Color distribution helper + test

**Files:**
- Modify: `modules/php/Game.php`
- Create: `tests/test_distribute_colors.php`

**Step 1: Add distributeColorRounds() to Game.php**

Add this static method to the Game class (after the constructor):

```php
    /**
     * Distribute 6 colors across 6 slots over N rounds.
     * Each round shuffles all 6 colors and assigns one per slot.
     * Guarantees: N items per slot, no duplicate colors per slot.
     *
     * @param int $rounds Number of rounds (= pieces per island)
     * @return array<int, string[]> Index 0-5 -> array of assigned colors
     */
    public static function distributeColorRounds(int $rounds): array
    {
        $slots = array_fill(0, 6, []);
        for ($r = 0; $r < $rounds; $r++) {
            $colors = MaterialDefs::COLORS;
            shuffle($colors);
            for ($i = 0; $i < 6; $i++) {
                $slots[$i][] = $colors[$i];
            }
        }
        return $slots;
    }
```

**Step 2: Write the test**

```php
<?php
/**
 * Test color distribution algorithm.
 * Run: php tests/test_distribute_colors.php
 */

require_once __DIR__ . '/../modules/php/MaterialDefs.php';

// Inline the function to test without BGA framework
function distributeColorRounds(int $rounds): array
{
    $colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
    $slots = array_fill(0, 6, []);
    for ($r = 0; $r < $rounds; $r++) {
        $shuffled = $colors;
        shuffle($shuffled);
        for ($i = 0; $i < 6; $i++) {
            $slots[$i][] = $shuffled[$i];
        }
    }
    return $slots;
}

$passed = 0;
$failed = 0;

function assert_true(bool $condition, string $message): void {
    global $passed, $failed;
    if ($condition) { $passed++; } else { $failed++; echo "FAIL: $message\n"; }
}

// Test with 1 round (2-player monster regular islands)
$result = distributeColorRounds(1);
assert_true(count($result) === 6, '1 round: should have 6 slots');
foreach ($result as $i => $colors) {
    assert_true(count($colors) === 1, "1 round: slot $i should have 1 color");
}
// All 6 colors should appear exactly once
$allColors = array_merge(...$result);
sort($allColors);
$expected = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
sort($expected);
assert_true($allColors === $expected, '1 round: all 6 colors should appear once');

// Test with 4 rounds (4-player offerings)
$result = distributeColorRounds(4);
assert_true(count($result) === 6, '4 rounds: should have 6 slots');
foreach ($result as $i => $colors) {
    assert_true(count($colors) === 4, "4 rounds: slot $i should have 4 colors");
    // No duplicates per slot
    assert_true(count(array_unique($colors)) === count($colors),
        "4 rounds: slot $i should have no duplicate colors");
}
// Total should be 24 (6 colors x 4)
$allColors = array_merge(...$result);
assert_true(count($allColors) === 24, '4 rounds: should have 24 total pieces');
// Each color appears exactly 4 times
$colorCounts = array_count_values($allColors);
foreach ($colorCounts as $color => $count) {
    assert_true($count === 4, "4 rounds: color $color should appear 4 times, got $count");
}

// Test with 2 rounds (2-player offerings)
$result = distributeColorRounds(2);
foreach ($result as $i => $colors) {
    assert_true(count($colors) === 2, "2 rounds: slot $i should have 2 colors");
    assert_true($colors[0] !== $colors[1], "2 rounds: slot $i should have different colors");
}

// Run 100 iterations to verify no-duplicate invariant holds
for ($trial = 0; $trial < 100; $trial++) {
    $result = distributeColorRounds(3);
    foreach ($result as $i => $colors) {
        assert_true(count(array_unique($colors)) === 3,
            "Trial $trial, slot $i: duplicate colors found: " . implode(',', $colors));
    }
}

echo "\n$passed passed, $failed failed out of " . ($passed + $failed) . " assertions\n";
exit($failed > 0 ? 1 : 0);
```

**Step 3: Run test**

Run: `php tests/test_distribute_colors.php`
Expected: All assertions pass

**Step 4: Verify Game.php syntax**

Run: `php -l modules/php/Game.php`
Expected: `No syntax errors detected`

**Step 5: Commit**

```bash
git add modules/php/Game.php tests/test_distribute_colors.php
git commit -m "feat: add distributeColorRounds() helper with test"
```

---

### Task 3: Hex table population

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Refactor setupNewGame cluster saving to capture placement IDs**

Replace the existing cluster-saving loop in `setupNewGame()` with:

```php
        // Save placements to board_placement table and capture IDs
        $clusterPlacementIds = [];
        foreach ($result['clusters'] as $idx => $placement) {
            $clusterId = addslashes($placement['cluster']['id']);
            $q = (int)$placement['anchorQ'];
            $r = (int)$placement['anchorR'];
            $rot = (int)$placement['rotation'];
            static::DbQuery("INSERT INTO board_placement (cluster_id, anchor_q, anchor_r, rotation)
                VALUES ('$clusterId', $q, $r, $rot)");
            $clusterPlacementIds[$idx] = (int)self::DbGetLastId();
        }

        // Populate hex grid and game pieces
        $this->populateBoard($result, $clusterPlacementIds, count($players));
```

**Step 2: Add populateBoard() skeleton with hex insertion**

Add to Game.php:

```php
    /**
     * Populate hex grid and place game pieces after board generation.
     */
    private function populateBoard(array $boardResult, array $clusterPlacementIds, int $playerCount): void
    {
        // Step 1: Save all hexes to hex table, grouped by island attribute
        $hexesByAttribute = [];

        foreach ($boardResult['clusters'] as $idx => $placement) {
            $placementId = $clusterPlacementIds[$idx];
            $clusterType = addslashes($placement['cluster']['id']);
            $rotation = (int)$placement['rotation'];

            foreach ($placement['hexes'] as $hex) {
                $q = (int)$hex['q'];
                $r = (int)$hex['r'];
                $tileType = addslashes($hex['type']);
                $color = $hex['color'] !== null ? "'" . addslashes($hex['color']) . "'" : 'NULL';
                $attribute = $hex['attribute'] !== null ? "'" . addslashes($hex['attribute']) . "'" : 'NULL';
                $isRevealed = 0; // islands start face-down

                static::DbQuery("INSERT INTO hex (q, r, tile_type, color, island_content, is_revealed,
                    cluster_id, cluster_type, cluster_rotation)
                    VALUES ($q, $r, '$tileType', $color, $attribute, $isRevealed,
                    $placementId, '$clusterType', $rotation)");

                // Track hexes by attribute for piece placement
                if ($hex['attribute'] !== null) {
                    $hexesByAttribute[$hex['attribute']][] = ['q' => $q, 'r' => $r];
                }
            }
        }

        // Steps 2-5: Place pieces (added in subsequent tasks)
    }
```

**Step 3: Verify PHP syntax**

Run: `php -l modules/php/Game.php`
Expected: `No syntax errors detected`

**Step 4: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: populate hex table from BoardGenerator with cluster linkage"
```

---

### Task 4: Monster placement

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add placeMonsters() method**

```php
    /**
     * Place monsters on monster and two_monster hexes.
     * Rule 6: N per color, 2 on each marked island, rest distributed evenly.
     */
    private function placeMonsters(array $hexesByAttribute, int $playerCount): void
    {
        $twoMonsterHexes = $hexesByAttribute['two_monster'] ?? [];
        $monsterHexes = $hexesByAttribute['monster'] ?? [];

        // Step 1: Marked islands — shuffle 6 colors, deal 2 per island
        $colors = MaterialDefs::COLORS;
        shuffle($colors);
        foreach ($twoMonsterHexes as $i => $hex) {
            for ($j = 0; $j < 2; $j++) {
                $color = $colors[$i * 2 + $j];
                $type = array_search($color, array_column(MaterialDefs::MONSTERS, 'color', null));
                // Find monster type by color
                foreach (MaterialDefs::MONSTERS as $monsterType => $data) {
                    if ($data['color'] === $color) {
                        $type = $monsterType;
                        break;
                    }
                }
                static::DbQuery("INSERT INTO monster (color, monster_type, hex_q, hex_r, is_defeated)
                    VALUES ('$color', '$type', {$hex['q']}, {$hex['r']}, 0)");
            }
        }

        // Step 2: Regular islands — distribute remaining (playerCount - 1) rounds
        $regularRounds = $playerCount - 1;
        if ($regularRounds > 0) {
            $distribution = self::distributeColorRounds($regularRounds);
            foreach ($monsterHexes as $i => $hex) {
                foreach ($distribution[$i] as $color) {
                    $type = '';
                    foreach (MaterialDefs::MONSTERS as $monsterType => $data) {
                        if ($data['color'] === $color) {
                            $type = $monsterType;
                            break;
                        }
                    }
                    static::DbQuery("INSERT INTO monster (color, monster_type, hex_q, hex_r, is_defeated)
                        VALUES ('$color', '$type', {$hex['q']}, {$hex['r']}, 0)");
                }
            }
        }
    }
```

**Step 2: Call from populateBoard()**

Add at the end of `populateBoard()`:

```php
        // Step 2: Place monsters
        $this->placeMonsters($hexesByAttribute, $playerCount);
```

**Step 3: Verify PHP syntax**

Run: `php -l modules/php/Game.php`
Expected: `No syntax errors detected`

**Step 4: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: place monsters on monster and two_monster hexes"
```

---

### Task 5: Offering placement

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add placeOfferings() method**

```php
    /**
     * Place offerings on offering hexes.
     * Rule 4: N per color, distributed evenly, no color twice per island.
     */
    private function placeOfferings(array $hexesByAttribute, int $playerCount): void
    {
        $offeringHexes = $hexesByAttribute['offering'] ?? [];
        $distribution = self::distributeColorRounds($playerCount);

        foreach ($offeringHexes as $i => $hex) {
            foreach ($distribution[$i] as $color) {
                static::DbQuery("INSERT INTO offering (color, origin_hex_q, origin_hex_r, is_delivered)
                    VALUES ('$color', {$hex['q']}, {$hex['r']}, 0)");
            }
        }
    }
```

**Step 2: Call from populateBoard()**

Add after the monster placement call:

```php
        // Step 3: Place offerings
        $this->placeOfferings($hexesByAttribute, $playerCount);
```

**Step 3: Verify PHP syntax**

Run: `php -l modules/php/Game.php`
Expected: `No syntax errors detected`

**Step 4: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: place offerings on offering hexes"
```

---

### Task 6: Temple and statue placement

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add placeTemples() method**

```php
    /**
     * Place 6 temples (one per color) on temple hexes, randomly assigned.
     */
    private function placeTemples(array $hexesByAttribute): void
    {
        $templeHexes = $hexesByAttribute['temple'] ?? [];
        $colors = MaterialDefs::COLORS;
        shuffle($colors);

        foreach ($templeHexes as $i => $hex) {
            $color = $colors[$i];
            static::DbQuery("INSERT INTO temple (color, hex_q, hex_r)
                VALUES ('$color', {$hex['q']}, {$hex['r']})");
        }
    }
```

**Step 2: Add placeStatues() method**

```php
    /**
     * Place 3 statues of each color at the matching city tile.
     * City color derived from cluster ID (e.g., 'city-red' -> 'red').
     */
    private function placeStatues(array $hexesByAttribute, array $boardResult): void
    {
        $cityHexes = $hexesByAttribute['city'] ?? [];

        // Build city hex -> cluster color mapping
        foreach ($boardResult['clusters'] as $placement) {
            $clusterId = $placement['cluster']['id'];
            if (!str_starts_with($clusterId, 'city-')) {
                continue;
            }
            $cityColor = substr($clusterId, 5); // 'city-red' -> 'red'

            foreach ($placement['hexes'] as $hex) {
                if ($hex['attribute'] === 'city') {
                    $q = (int)$hex['q'];
                    $r = (int)$hex['r'];
                    for ($s = 0; $s < 3; $s++) {
                        static::DbQuery("INSERT INTO statue (color, origin_hex_q, origin_hex_r, is_raised)
                            VALUES ('$cityColor', $q, $r, 0)");
                    }
                }
            }
        }
    }
```

**Step 3: Call both from populateBoard()**

Add after the offering placement call:

```php
        // Step 4: Place temples
        $this->placeTemples($hexesByAttribute);

        // Step 5: Place statues at cities
        $this->placeStatues($hexesByAttribute, $boardResult);
```

**Step 4: Verify PHP syntax**

Run: `php -l modules/php/Game.php`
Expected: `No syntax errors detected`

**Step 5: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: place temples and statues during board setup"
```

---

### Task 7: Update getAllDatas() with board state

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add board state queries to getAllDatas()**

Replace the current `getAllDatas()` method body (after the players query) with:

```php
        // Board placements for client-side rendering
        $result['boardPlacements'] = self::getObjectListFromDB(
            "SELECT cluster_id AS clusterId, anchor_q AS anchorQ, anchor_r AS anchorR, rotation
             FROM board_placement"
        );

        // Zeus starting position
        $result['zeusPosition'] = $this->globals->get('zeus_position');

        // Hex grid — filter island_content by visibility
        $hexes = self::getObjectListFromDB(
            "SELECT hex_id AS id, q, r, tile_type AS tileType, color,
                    island_content AS islandContent, is_revealed AS isRevealed,
                    cluster_id AS clusterId, cluster_type AS clusterType,
                    cluster_rotation AS clusterRotation
             FROM hex"
        );

        // Get islands this player has peeked at
        $peekedHexes = self::getObjectListFromDB(
            "SELECT hex_q AS q, hex_r AS r FROM player_island_knowledge
             WHERE player_id = $current_player_id"
        );
        $peekedSet = [];
        foreach ($peekedHexes as $ph) {
            $peekedSet["{$ph['q']},{$ph['r']}"] = true;
        }

        // Hide island_content for unrevealed, non-peeked islands
        foreach ($hexes as &$hex) {
            if ($hex['tileType'] === 'island'
                && !$hex['isRevealed']
                && !isset($peekedSet["{$hex['q']},{$hex['r']}"])) {
                $hex['islandContent'] = null;
            }
        }
        unset($hex);
        $result['hexes'] = $hexes;

        // Monsters — on board + defeated per player
        $result['monsters'] = self::getObjectListFromDB(
            "SELECT monster_id AS id, color, monster_type AS monsterType,
                    hex_q AS hexQ, hex_r AS hexR,
                    is_defeated AS isDefeated, defeated_by_player_id AS defeatedBy
             FROM monster"
        );

        // Offerings
        $result['offerings'] = self::getObjectListFromDB(
            "SELECT offering_id AS id, color, origin_hex_q AS originQ, origin_hex_r AS originR,
                    player_id AS playerId, is_delivered AS isDelivered,
                    delivered_to_hex_q AS deliveredQ, delivered_to_hex_r AS deliveredR,
                    delivered_by_player_id AS deliveredBy
             FROM offering"
        );

        // Statues
        $result['statues'] = self::getObjectListFromDB(
            "SELECT statue_id AS id, color, origin_hex_q AS originQ, origin_hex_r AS originR,
                    player_id AS playerId, is_raised AS isRaised,
                    raised_at_hex_q AS raisedQ, raised_at_hex_r AS raisedR,
                    raised_by_player_id AS raisedBy
             FROM statue"
        );

        // Temples
        $result['temples'] = self::getObjectListFromDB(
            "SELECT temple_id AS id, color, hex_q AS hexQ, hex_r AS hexR
             FROM temple"
        );
```

**Step 2: Verify PHP syntax**

Run: `php -l modules/php/Game.php`
Expected: `No syntax errors detected`

**Step 3: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: return board state (hexes, monsters, offerings, statues, temples) from getAllDatas"
```
