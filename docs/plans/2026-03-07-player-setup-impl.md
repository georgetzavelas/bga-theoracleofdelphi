# Player Setup (Phases 3c-3f) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete player initialization in `setupNewGame()` — card decks, Zeus tiles, player resources, gods, shrines, ship tiles, starting injury, and oracle dice.

**Architecture:** All setup logic as private helper methods in `Game.php`, called from `setupNewGame()` in specific order. New constants added to `MaterialDefs.php`. Card table uses integer `card_type_arg` for all card types.

**Tech Stack:** PHP 8.1+ (strict types, namespaced), BGA framework (`DbQuery`, `DbGetLastId`, `bga_rand`, `globals`), MySQL

---

### Task 1: Add Setup Constants to MaterialDefs

**Files:**
- Modify: `modules/php/MaterialDefs.php`

**Step 1: Add constants**

Add these constants to the `MaterialDefs` class, after the existing `DUAL_SIDED_TILES` constant:

```php
// Player-count row: when advancing a god FROM row 0, jump to this row
public const PLAYER_COUNT_ROW = [2 => 3, 3 => 2, 4 => 1];

// Map BGA player_color hex to game color name
public const HEX_TO_GAME_COLOR = [
    'dc3545' => 'red',
    'ffc107' => 'yellow',
    '28a745' => 'green',
    '007bff' => 'blue',
];

// Map color name to integer index for card_type_arg
public const COLOR_INDEX = [
    'red' => 0, 'yellow' => 1, 'green' => 2,
    'blue' => 3, 'pink' => 4, 'black' => 5,
];
```

**Step 2: Commit**

```bash
git add modules/php/MaterialDefs.php
git commit -m "feat: add PLAYER_COUNT_ROW, HEX_TO_GAME_COLOR, COLOR_INDEX constants to MaterialDefs"
```

---

### Task 2: Implement createCardDecks()

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add the createCardDecks method**

Add after `placeStatues()` method in Game.php:

```php
/**
 * Create and shuffle all 4 card decks. Deal 6 equipment to display.
 * Must be called before initPlayers() since starting injury + ship tile bonus draw cards.
 */
private function createCardDecks(): void
{
    // Oracle deck: 6 colors x 5 = 30 cards
    $oracleCards = [];
    foreach (MaterialDefs::COLORS as $color) {
        $colorIdx = MaterialDefs::COLOR_INDEX[$color];
        for ($i = 0; $i < MaterialDefs::ORACLE_CARDS_PER_COLOR; $i++) {
            $oracleCards[] = $colorIdx;
        }
    }
    self::bgaShuffle($oracleCards);
    foreach ($oracleCards as $order => $colorIdx) {
        static::DbQuery("INSERT INTO card (card_type, card_type_arg, card_location, card_location_arg, card_order)
            VALUES ('oracle', $colorIdx, 'deck', 0, $order)");
    }

    // Equipment deck: 22 cards (IDs 0-21)
    $equipIds = array_keys(MaterialDefs::EQUIPMENT_CARDS);
    self::bgaShuffle($equipIds);
    foreach ($equipIds as $order => $cardId) {
        // First 6 go to display, rest stay in deck
        $location = $order < 6 ? 'display' : 'deck';
        static::DbQuery("INSERT INTO card (card_type, card_type_arg, card_location, card_location_arg, card_order)
            VALUES ('equipment', $cardId, '$location', 0, $order)");
    }

    // Companion deck: 6 colors x 3 types = 18 cards
    // card_type_arg = color_index * 3 + type_index
    $companionIds = [];
    for ($c = 0; $c < 6; $c++) {
        for ($t = 0; $t < 3; $t++) {
            $companionIds[] = $c * 3 + $t;
        }
    }
    self::bgaShuffle($companionIds);
    foreach ($companionIds as $order => $cardId) {
        static::DbQuery("INSERT INTO card (card_type, card_type_arg, card_location, card_location_arg, card_order)
            VALUES ('companion', $cardId, 'deck', 0, $order)");
    }

    // Injury deck: 6 colors x 7 = 42 cards
    $injuryCards = [];
    foreach (MaterialDefs::COLORS as $color) {
        $colorIdx = MaterialDefs::COLOR_INDEX[$color];
        for ($i = 0; $i < MaterialDefs::INJURY_CARDS_PER_COLOR; $i++) {
            $injuryCards[] = $colorIdx;
        }
    }
    self::bgaShuffle($injuryCards);
    foreach ($injuryCards as $order => $colorIdx) {
        static::DbQuery("INSERT INTO card (card_type, card_type_arg, card_location, card_location_arg, card_order)
            VALUES ('injury', $colorIdx, 'deck', 0, $order)");
    }
}
```

**Step 2: Verify card table has `card_order` column**

Check `dbmodel.sql` — the existing `card` table does NOT have a `card_order` column. It has `card_id`, `card_type`, `card_type_arg`, `card_location`, `card_location_arg` only. We need to add it:

Add to `dbmodel.sql`, after the existing card table ALTER or within the CREATE TABLE:

The current card table already exists but lacks `card_order`. Looking at the schema, there's no `card_order` column. Add it:

In `dbmodel.sql`, modify the `card` CREATE TABLE to add `card_order`:

```sql
CREATE TABLE IF NOT EXISTS `card` (
    `card_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `card_type` VARCHAR(16) NOT NULL,
    `card_type_arg` INT(11) NOT NULL,
    `card_location` VARCHAR(16) NOT NULL,
    `card_location_arg` INT(11) NOT NULL DEFAULT 0,
    `card_order` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`card_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 AUTO_INCREMENT=1;
```

**Step 3: Commit**

```bash
git add modules/php/Game.php dbmodel.sql
git commit -m "feat: implement createCardDecks() — oracle, equipment, companion, injury decks"
```

---

### Task 3: Implement distributeZeusTiles()

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add the distributeZeusTiles method**

Add after `createCardDecks()` in Game.php:

```php
/**
 * Distribute 12 Zeus tiles per player: 3 shrine + 3 statue + 3 offering + 3 monster.
 * Dual-sided offering/monster tiles: randomly pick 2 of 4 to show offering, other 2 show monster.
 * The flip selection is global (same for all players).
 *
 * @param array<int, array{player_id: int, player_color: string}> $players
 */
private function distributeZeusTiles(array $players): void
{
    $playerCount = count($players);

    // Step 1: Global dual-sided flip — pick 2 of 4 to remain as offerings
    $dualIndices = [0, 1, 2, 3];
    self::bgaShuffle($dualIndices);
    $offeringIndices = [$dualIndices[0], $dualIndices[1]]; // these stay offering-side
    $monsterIndices = [$dualIndices[2], $dualIndices[3]];  // these flip to monster-side

    $offeringColors = array_map(
        fn($i) => MaterialDefs::DUAL_SIDED_TILES[$i]['offering_color'],
        $offeringIndices
    );
    $monsterTypes = array_map(
        fn($i) => MaterialDefs::DUAL_SIDED_TILES[$i]['monster_type'],
        $monsterIndices
    );

    // Store flip selection as global for image reference
    $this->globals->set('zeus_flip_offering_colors', $offeringColors);

    foreach ($players as $player) {
        $playerId = (int)$player['player_id'];
        $playerColor = MaterialDefs::HEX_TO_GAME_COLOR[$player['player_color']] ?? null;

        // --- Shrine tiles (3): fixed Greek letters per player color ---
        $letters = MaterialDefs::SHRINE_LETTERS[$playerColor] ?? ['omega', 'phi', 'psi'];
        $shrineOrder = [0, 1, 2];
        self::bgaShuffle($shrineOrder);
        foreach ($shrineOrder as $sortIdx => $letterIdx) {
            $letter = addslashes($letters[$letterIdx]);
            static::DbQuery("INSERT INTO zeus_tile (player_id, task_type, task_color, task_letter, is_completed, sort_order)
                VALUES ($playerId, 'shrine', NULL, '$letter', 0, $sortIdx)");
        }

        // --- Statue tiles (3): generic, no color ---
        $statueOrder = [0, 1, 2];
        self::bgaShuffle($statueOrder);
        foreach ($statueOrder as $sortIdx) {
            static::DbQuery("INSERT INTO zeus_tile (player_id, task_type, task_color, task_letter, is_completed, sort_order)
                VALUES ($playerId, 'statue', NULL, NULL, 0, $sortIdx)");
        }

        // --- Offering tiles (3): "any" + 2 unflipped colors ---
        $offeringTiles = [null]; // "any" = null task_color
        foreach ($offeringColors as $c) {
            $offeringTiles[] = $c;
        }
        $offeringOrder = [0, 1, 2];
        self::bgaShuffle($offeringOrder);
        foreach ($offeringOrder as $sortIdx => $tileIdx) {
            $color = $offeringTiles[$tileIdx];
            $colorSql = $color !== null ? "'" . addslashes($color) . "'" : 'NULL';
            static::DbQuery("INSERT INTO zeus_tile (player_id, task_type, task_color, task_letter, is_completed, sort_order)
                VALUES ($playerId, 'offering', $colorSql, NULL, 0, $sortIdx)");
        }

        // --- Monster tiles (3): "any" + 2 flipped monster types ---
        $monsterTiles = [null]; // "any" = null task_color
        foreach ($monsterTypes as $t) {
            $monsterTiles[] = $t;
        }
        $monsterOrder = [0, 1, 2];
        self::bgaShuffle($monsterOrder);
        foreach ($monsterOrder as $sortIdx => $tileIdx) {
            $color = $monsterTiles[$tileIdx];
            $colorSql = $color !== null ? "'" . addslashes($color) . "'" : 'NULL';
            static::DbQuery("INSERT INTO zeus_tile (player_id, task_type, task_color, task_letter, is_completed, sort_order)
                VALUES ($playerId, 'monster', $colorSql, NULL, 0, $sortIdx)");
        }
    }
}
```

**Step 2: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: implement distributeZeusTiles() — 12 tiles per player with global dual-sided flip"
```

---

### Task 4: Implement initPlayers()

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add the initPlayers method**

Add after `distributeZeusTiles()` in Game.php:

```php
/**
 * Initialize player state: ship placement, ship tiles, favor tokens, shrines, gods.
 * Must be called after createCardDecks() since starting injury + bonuses draw cards.
 *
 * @param array<int, array{player_id: int, player_no: int, player_color: string}> $players
 * @param array{q: int, r: int} $zeusPosition
 */
private function initPlayers(array $players, array $zeusPosition): void
{
    $playerCount = count($players);
    $zeusQ = (int)$zeusPosition['q'];
    $zeusR = (int)$zeusPosition['r'];

    // Assign ship tiles: shuffle [0..7], deal first N
    $shipTileIds = array_keys(MaterialDefs::SHIP_TILES);
    self::bgaShuffle($shipTileIds);

    $playerIndex = 0;
    foreach ($players as $player) {
        $playerId = (int)$player['player_id'];
        $playerNo = (int)$player['player_no'];
        $shipTileId = $shipTileIds[$playerIndex];

        // Base resources
        $favorTokens = 2 + $playerNo; // Player 1 gets 3, Player 2 gets 4, etc.
        $shieldValue = 0;

        // Ship tile immediate bonus: shield_start
        if (MaterialDefs::SHIP_TILES[$shipTileId]['ability'] === 'shield_start') {
            $shieldValue += 2;
        }

        // Update player row
        static::DbQuery("UPDATE player SET
            ship_q = $zeusQ,
            ship_r = $zeusR,
            shield_value = $shieldValue,
            favor_tokens = $favorTokens,
            ship_tile_id = $shipTileId,
            tasks_completed = 0
            WHERE player_id = $playerId");

        // Insert 3 shrines
        for ($s = 0; $s < 3; $s++) {
            static::DbQuery("INSERT INTO shrine (player_id, shrine_index, is_built)
                VALUES ($playerId, $s, 0)");
        }

        // Insert 6 gods at track_row = 0
        foreach (MaterialDefs::GODS as $godName => $godData) {
            $godName = addslashes($godName);
            static::DbQuery("INSERT INTO player_god (player_id, god_name, track_row)
                VALUES ($playerId, '$godName', 0)");
        }

        $playerIndex++;
    }

    // Set titan holder = last player (highest player_no)
    $lastPlayer = null;
    $maxNo = 0;
    foreach ($players as $player) {
        if ((int)$player['player_no'] >= $maxNo) {
            $maxNo = (int)$player['player_no'];
            $lastPlayer = (int)$player['player_id'];
        }
    }
    $this->globals->set('titan_holder_id', $lastPlayer);
}
```

**Step 2: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: implement initPlayers() — ships, tiles, favor, shrines, gods, titan holder"
```

---

### Task 5: Implement Starting Injury Draw + Ship Tile Bonuses

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add drawStartingInjuries method**

Add after `initPlayers()`:

```php
/**
 * Each player draws 1 injury card and advances their matching god.
 * God advances from row 0 to the player-count row.
 *
 * @param array<int, array{player_id: int}> $players
 */
private function drawStartingInjuries(array $players): void
{
    $playerCount = count($players);
    $playerCountRow = MaterialDefs::PLAYER_COUNT_ROW[$playerCount];

    foreach ($players as $player) {
        $playerId = (int)$player['player_id'];

        // Draw top injury card (lowest card_order in deck)
        $card = self::getObjectFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'injury' AND card_location = 'deck'
             ORDER BY card_order ASC LIMIT 1"
        );

        if ($card === null) {
            throw new \BgaSystemException('No injury cards in deck during setup');
        }

        // Move card to player's hand
        $cardId = (int)$card['card_id'];
        static::DbQuery("UPDATE card SET card_location = 'hand', card_location_arg = $playerId
            WHERE card_id = $cardId");

        // Find matching god by color index
        $colorIdx = (int)$card['card_type_arg'];
        $colorName = MaterialDefs::COLORS[$colorIdx];

        // Find the god matching this color
        $godName = null;
        foreach (MaterialDefs::GODS as $name => $data) {
            if ($data['color'] === $colorName) {
                $godName = $name;
                break;
            }
        }

        if ($godName !== null) {
            // Advance this player's matching god from row 0 to player-count row
            $godName = addslashes($godName);
            static::DbQuery("UPDATE player_god SET track_row = $playerCountRow
                WHERE player_id = $playerId AND god_name = '$godName' AND track_row = 0");
        }
    }
}
```

**Step 2: Add applyShipTileBonuses method**

```php
/**
 * Apply ship tile starting bonuses that require existing card decks.
 * Currently only tile 1 (starting_equipment): draw 1 equipment from display + 1 oracle from deck.
 *
 * @param array<int, array{player_id: int}> $players
 */
private function applyShipTileBonuses(array $players): void
{
    foreach ($players as $player) {
        $playerId = (int)$player['player_id'];
        $shipTileId = (int)self::getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );

        $ability = MaterialDefs::SHIP_TILES[$shipTileId]['ability'];

        if ($ability === 'starting_equipment') {
            // Draw 1 equipment from display
            $equipCard = self::getObjectFromDB(
                "SELECT card_id FROM card
                 WHERE card_type = 'equipment' AND card_location = 'display'
                 ORDER BY card_order ASC LIMIT 1"
            );
            if ($equipCard !== null) {
                static::DbQuery("UPDATE card SET card_location = 'hand', card_location_arg = $playerId
                    WHERE card_id = {$equipCard['card_id']}");

                // Refill display from deck
                $deckCard = self::getObjectFromDB(
                    "SELECT card_id FROM card
                     WHERE card_type = 'equipment' AND card_location = 'deck'
                     ORDER BY card_order ASC LIMIT 1"
                );
                if ($deckCard !== null) {
                    static::DbQuery("UPDATE card SET card_location = 'display'
                        WHERE card_id = {$deckCard['card_id']}");
                }
            }

            // Draw 1 oracle from deck
            $oracleCard = self::getObjectFromDB(
                "SELECT card_id FROM card
                 WHERE card_type = 'oracle' AND card_location = 'deck'
                 ORDER BY card_order ASC LIMIT 1"
            );
            if ($oracleCard !== null) {
                static::DbQuery("UPDATE card SET card_location = 'hand', card_location_arg = $playerId
                    WHERE card_id = {$oracleCard['card_id']}");
            }
        }
    }
}
```

**Step 3: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: implement drawStartingInjuries() and applyShipTileBonuses()"
```

---

### Task 6: Implement rollInitialDice()

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add the rollInitialDice method**

Add after `applyShipTileBonuses()`:

```php
/**
 * Roll 3 oracle dice per player, assigning random colors.
 *
 * @param array<int, array{player_id: int}> $players
 */
private function rollInitialDice(array $players): void
{
    $colorCount = count(MaterialDefs::COLORS);

    foreach ($players as $player) {
        $playerId = (int)$player['player_id'];

        for ($d = 0; $d < 3; $d++) {
            $colorIdx = bga_rand(0, $colorCount - 1);
            $color = addslashes(MaterialDefs::COLORS[$colorIdx]);
            static::DbQuery("INSERT INTO oracle_die (player_id, die_index, color, original_color, is_used)
                VALUES ($playerId, $d, '$color', '$color', 0)");
        }
    }
}
```

**Step 2: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: implement rollInitialDice() — 3 random oracle dice per player"
```

---

### Task 7: Wire Setup Methods into setupNewGame()

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Update setupNewGame()**

After the existing `populateBoard()` call and `globals->set('zeus_position', ...)`, add the new setup calls in the correct order. Replace the section from `// Populate hex grid` through `$this->activeNextPlayer()` with:

```php
// Populate hex grid and game pieces (Phase 3b)
$this->populateBoard($result, $clusterPlacementIds, count($players));

// Save zeus position as a global
$this->globals->set('zeus_position', $result['zeusPosition']);

// Create all card decks (Phase 3e) — must come before player init
$this->createCardDecks();

// Load player data with player_no for ordering
$playerRows = self::getObjectListFromDB(
    "SELECT player_id, player_no, player_color FROM player ORDER BY player_no ASC"
);

// Distribute Zeus tiles (Phase 3d)
$this->distributeZeusTiles($playerRows);

// Initialize players: ships, tiles, favor, shrines, gods (Phase 3c)
$this->initPlayers($playerRows, $result['zeusPosition']);

// Draw starting injuries + advance matching god (Phase 3c)
$this->drawStartingInjuries($playerRows);

// Apply ship tile bonuses that require card decks (Phase 3c)
$this->applyShipTileBonuses($playerRows);

// Roll initial oracle dice (Phase 3f)
$this->rollInitialDice($playerRows);

// Activate first player once everything has been initialized and ready.
$this->activeNextPlayer();
```

**Step 2: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: wire player setup into setupNewGame() — decks, tiles, players, injuries, dice"
```

---

### Task 8: Update getAllDatas() with Player State

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Expand the players query**

Replace the existing players query in `getAllDatas()`:

```php
// OLD:
$result["players"] = $this->getCollectionFromDb(
    "SELECT `player_id` `id`, `player_score` `score` FROM `player`"
);

// NEW:
$result["players"] = $this->getCollectionFromDb(
    "SELECT player_id id, player_score score, player_no playerNo,
            player_color playerColor,
            ship_q shipQ, ship_r shipR,
            shield_value shieldValue, favor_tokens favorTokens,
            ship_tile_id shipTileId, tasks_completed tasksCompleted
     FROM player"
);
```

**Step 2: Add shrine, god, dice, zeus tile, and card queries**

Add after the existing `$result['temples']` section, before the final `return $result`:

```php
// Shrines (per player)
$result['shrines'] = self::getObjectListFromDB(
    "SELECT shrine_id AS id, player_id AS playerId, shrine_index AS shrineIndex,
            is_built AS isBuilt, built_at_hex_q AS builtQ, built_at_hex_r AS builtR
     FROM shrine"
);

// Gods (per player)
$result['gods'] = self::getObjectListFromDB(
    "SELECT id, player_id AS playerId, god_name AS godName, track_row AS trackRow
     FROM player_god"
);

// Oracle dice (per player)
$result['oracleDice'] = self::getObjectListFromDB(
    "SELECT die_id AS id, player_id AS playerId, die_index AS dieIndex,
            color, original_color AS originalColor, is_used AS isUsed
     FROM oracle_die"
);

// Zeus tiles (per player)
$result['zeusTiles'] = self::getObjectListFromDB(
    "SELECT tile_id AS id, player_id AS playerId, task_type AS taskType,
            task_color AS taskColor, task_letter AS taskLetter,
            is_completed AS isCompleted, sort_order AS sortOrder
     FROM zeus_tile"
);

// Cards: equipment display (visible to all)
$result['equipmentDisplay'] = self::getObjectListFromDB(
    "SELECT card_id AS id, card_type_arg AS cardTypeArg
     FROM card WHERE card_type = 'equipment' AND card_location = 'display'
     ORDER BY card_order ASC"
);

// Cards: current player's hand (oracle + injury + equipment + companion)
$result['hand'] = self::getObjectListFromDB(
    "SELECT card_id AS id, card_type AS cardType, card_type_arg AS cardTypeArg
     FROM card WHERE card_location = 'hand' AND card_location_arg = $current_player_id
     ORDER BY card_type, card_order ASC"
);

// Card counts for other players (no card details revealed)
$result['playerCardCounts'] = self::getObjectListFromDB(
    "SELECT card_location_arg AS playerId, card_type AS cardType, COUNT(*) AS cnt
     FROM card WHERE card_location = 'hand'
     GROUP BY card_location_arg, card_type"
);

// Deck sizes (for display)
$result['deckSizes'] = self::getObjectListFromDB(
    "SELECT card_type AS cardType, COUNT(*) AS cnt
     FROM card WHERE card_location = 'deck'
     GROUP BY card_type"
);

// Game globals
$result['titanHolderId'] = $this->globals->get('titan_holder_id');
$result['zeusFlipOfferingColors'] = $this->globals->get('zeus_flip_offering_colors');
```

**Step 3: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: update getAllDatas() — players, shrines, gods, dice, tiles, cards"
```

---

### Task 9: Update Game Implementation Plan

**Files:**
- Modify: `docs/plans/game-implementation-plan.md`

**Step 1: Mark phases 3c-3f complete**

Update the Phase 3 section:
- Mark 3c (Player Initialization) items as `[x]`
- Mark 3d (Zeus Tile Distribution) items as `[x]`
- Mark 3e (Card Deck Setup) items as `[x]`
- Mark 3f (Initial Oracle Roll) items as `[x]`
- Mark `getAllDatas() — remaining` as `[x]`
- Update Game.php status line to reflect 3c-3f completion
- Update `Last updated` date

**Step 2: Commit**

```bash
git add docs/plans/game-implementation-plan.md
git commit -m "docs: mark phases 3c-3f complete in game implementation plan"
```

---

## Dependency Graph

```
Task 1 (MaterialDefs constants)
  ↓
Task 2 (createCardDecks) ─── requires card_order column in dbmodel.sql
  ↓
Task 3 (distributeZeusTiles) ─── requires HEX_TO_GAME_COLOR from Task 1
  ↓
Task 4 (initPlayers) ─── requires PLAYER_COUNT_ROW from Task 1
  ↓
Task 5 (injuries + bonuses) ─── requires decks from Task 2, gods from Task 4
  ↓
Task 6 (rollInitialDice) ─── independent but ordered last in setup
  ↓
Task 7 (wire into setupNewGame) ─── requires all above
  ↓
Task 8 (getAllDatas updates) ─── requires DB tables populated by Tasks 2-6
  ↓
Task 9 (update plan doc) ─── after all code complete
```

## Notes for Implementer

- **BGA quirk**: `getObjectListFromDB` returns all values as strings. Cast with `(int)` where needed on the client side.
- **`bga_rand()`** is a global function, not a method. Used in `bgaShuffle()` and `rollInitialDice()`.
- **Player colors**: BGA assigns hex colors like `dc3545`. Use `MaterialDefs::HEX_TO_GAME_COLOR` to map to game color names (red/yellow/green/blue).
- **Card draw order**: Cards are drawn in `card_order ASC` order from the deck. The shuffle happens at insert time via `bgaShuffle()`.
- **God advancement from row 0**: Always jumps to `PLAYER_COUNT_ROW[playerCount]`, not +1. Subsequent advances are +1.
- **Zeus tile flip is global**: All players flip the same 2 colored offerings to monster side.
- **Ship tile 1 (`starting_equipment`)**: Draws 1 equipment from display (refill from deck) + 1 oracle from deck.
