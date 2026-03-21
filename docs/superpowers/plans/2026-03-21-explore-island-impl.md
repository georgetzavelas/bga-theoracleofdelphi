# Explore Island + Build Shrine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Explore Island action — players spend a matching die to reveal shrine islands, auto-build own shrines, and receive bonuses from other players' shrines.

**Architecture:** The action enters from `SelectAction` via `actExploreIsland(hexQ, hexR)`, transitions to `ExploreIsland` (state 36) which auto-resolves: own shrine auto-builds + Zeus tile completes, other player's shrine applies Psi (favor) or Phi (oracle card) bonus immediately (Sigma/Omega deferred). `BuildShrine` (state 37) is unused. Exploration color is a static property of each cluster definition, looked up at runtime.

**Tech Stack:** PHP 8.2 (BGA framework states), JavaScript (AMD Dojo module), MySQL (hex + shrine tables)

**Spec:** `docs/plans/2026-03-21-explore-island-design.md`

## Status (2026-03-21)

Tasks 1–9 are **complete**. Post-implementation fixes applied:
- Removed `zombie()` from ExploreIsland (GAME states don't allow it)
- Implemented Phi oracle card draw bonus (was TODO'd)
- Wired up shrine flip animation: `setupShrinesFromGamedata()` places cloud overlays on all shrine hexes at page load, `notif_islandRevealed` swaps overlay class + triggers CSS 3D flip, removed duplicate CSS
- Shrine overlay sized to 60×52px

## Deferred to Polish Phase

- **Sigma bonus** (shrine letter Σ): Advance on god tracks by 3 steps total. Needs god track advancement system.
- **Omega bonus** (shrine letter Ω): Discard all injury cards + receive shield token. Needs injury/shield system.
- **Monster defeat visual**: Monster should animate from hex to player board on defeat (not explore-specific, general combat polish).
- **Zeus tile annotation**: When another player discovers your shrine, annotate the Zeus tile visually.

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `dbmodel.sql:27-40` | Add `shrine_player_id`, `shrine_letter`, `revealed_by_player_id` columns to hex table |
| Modify | `modules/php/ClusterDefinitions.php` | Add `explorationColor` to each shrine hex definition |
| Modify | `modules/php/ClusterDefinitions.php:146-158` | Update `getWorldHexes()` to pass through `explorationColor` |
| Modify | `modules/js/ClusterDefinitions.js` | Add `explorationColor` to each shrine hex definition |
| Modify | `modules/php/MaterialDefs.php` | Add `SHRINE_EXPLORATION_COLORS` constant |
| Modify | `modules/php/Game.php:149-190` | Store exploration color in hex.color, add `placeShrines()` step |
| Modify | `modules/php/Game.php:681-797` | Update `getAllDatas()` to include shrine hex data + hide unrevealed |
| Modify | `modules/php/States/SelectAction.php` | Add `getExplorableIslands()`, `actExploreIsland()`, include in `getArgs()` |
| Modify | `modules/php/States/ExploreIsland.php` | Full implementation: resolve shrine reveal, auto-build, apply bonus |
| Modify | `theoracleofdelphigzed.js` | Add action buttons, notification handlers, shrine visual |
| Modify | `theoracleofdelphigzed.css` | Shrine piece styling on board |

---

### Task 1: DB Schema — Add Shrine Columns to Hex Table

**Files:**
- Modify: `dbmodel.sql:27-40`

- [x] **Step 1: Add shrine columns to hex table definition**

In `dbmodel.sql`, add three columns to the `hex` table:

```sql
CREATE TABLE IF NOT EXISTS `hex` (
    `hex_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `q` INT NOT NULL,
    `r` INT NOT NULL,
    `tile_type` VARCHAR(20) NOT NULL,   -- 'water','island','city','zeus','shallow'
    `color` VARCHAR(10) DEFAULT NULL,   -- hex color (red, yellow, green, blue, pink, black)
    `island_content` VARCHAR(50) DEFAULT NULL,  -- for revealed islands: shrine color, bonus type, etc.
    `is_revealed` TINYINT(1) DEFAULT 0,
    `shrine_player_id` INT DEFAULT NULL,        -- NEW: which player owns the shrine on this hex
    `shrine_letter` VARCHAR(10) DEFAULT NULL,    -- NEW: greek letter (omega, phi, psi, sigma)
    `revealed_by_player_id` INT DEFAULT NULL,    -- NEW: who explored this island
    `cluster_id` INT DEFAULT NULL,      -- which cluster this hex belongs to (for rendering)
    `cluster_type` VARCHAR(30) DEFAULT NULL,  -- cluster type name (for image lookup)
    `cluster_rotation` INT DEFAULT 0,   -- rotation of the cluster (0-5, x60 degrees)
    PRIMARY KEY (`hex_id`),
    UNIQUE KEY `coords` (`q`, `r`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

- [x] **Step 2: Commit**

```bash
git add dbmodel.sql
git commit -m "feat(explore): add shrine_player_id, shrine_letter, revealed_by_player_id to hex table"
```

---

### Task 2: Add Exploration Colors to Cluster Definitions

**Files:**
- Modify: `modules/php/ClusterDefinitions.php`
- Modify: `modules/js/ClusterDefinitions.js`
- Modify: `modules/php/MaterialDefs.php`

- [x] **Step 1: Add SHRINE_EXPLORATION_COLORS to MaterialDefs.php**

After the `STATUE_ISLAND_COLORS` constant (line 75), add:

```php
// Exploration color for each shrine hex, indexed by cluster ID + relative offset.
// The die color must match this to explore the island.
// 2 per die color = 12 total shrine hexes.
public const SHRINE_EXPLORATION_COLORS = [
    'cluster-7-1' => [['dq' => -1, 'dr' => 0, 'color' => 'green']],
    'cluster-7-2' => [['dq' => -1, 'dr' => 0, 'color' => 'green']],
    'cluster-7-3' => [['dq' => 0, 'dr' => -1, 'color' => 'black']],
    'cluster-7-4' => [['dq' => -1, 'dr' => 0, 'color' => 'blue']],
    'cluster-7-5' => [['dq' => -1, 'dr' => 0, 'color' => 'blue']],
    'cluster-9-0' => [['dq' => 0, 'dr' => 0, 'color' => 'yellow']],
    'cluster-9-1' => [['dq' => 0, 'dr' => -1, 'color' => 'black']],
    'cluster-9-2' => [['dq' => 1, 'dr' => -1, 'color' => 'red']],
    'cluster-11-0' => [
        ['dq' => -1, 'dr' => 0, 'color' => 'red'],
        ['dq' => -1, 'dr' => 3, 'color' => 'pink'],
    ],
    'cluster-11-1' => [['dq' => 1, 'dr' => 0, 'color' => 'yellow']],
    'cluster-11-2' => [['dq' => -2, 'dr' => 2, 'color' => 'pink']],
];
```

- [x] **Step 2: Add explorationColor to PHP ClusterDefinitions**

For each shrine hex entry in `ClusterDefinitions.php`, add the `'explorationColor'` key. Example for cluster-7-1 (line 256):

```php
// Was:
['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
// Now:
['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'shrine', 'color' => null, 'explorationColor' => 'green'],
```

Apply the same for all 12 shrine hexes using the color mapping:

| Cluster | Offset | explorationColor |
|---------|--------|-----------------|
| cluster-7-1 | (-1, 0) | green |
| cluster-7-2 | (-1, 0) | green |
| cluster-7-3 | (0, -1) | black |
| cluster-7-4 | (-1, 0) | blue |
| cluster-7-5 | (-1, 0) | blue |
| cluster-9-0 | (0, 0) | yellow |
| cluster-9-1 | (0, -1) | black |
| cluster-9-2 | (1, -1) | red |
| cluster-11-0 | (-1, 0) | red |
| cluster-11-0 | (-1, 3) | pink |
| cluster-11-1 | (1, 0) | yellow |
| cluster-11-2 | (-2, 2) | pink |

- [x] **Step 3: Add explorationColor to JS ClusterDefinitions**

Same changes in `ClusterDefinitions.js`. Example for cluster-7-1 (line 189):

```javascript
// Was:
{ dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE },
// Now:
{ dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'green' },
```

Apply for all 12 shrine hexes with same colors as PHP.

- [x] **Step 4: Update getWorldHexes() in ClusterDefinitions.php to pass through explorationColor**

In `ClusterDefinitions.php:146-158`, the `getWorldHexes()` method builds world-coordinate hex arrays but only copies `q`, `r`, `type`, `color`, `attribute`. Update it to also pass through `explorationColor`:

```php
public function getWorldHexes(array $cluster, int $anchorQ, int $anchorR, int $rotation = 0): array
{
    $rotatedHexes = $this->getRotatedHexes($cluster, $rotation);
    return array_map(function ($hex) use ($anchorQ, $anchorR) {
        $result = [
            'q' => $anchorQ + $hex['dq'],
            'r' => $anchorR + $hex['dr'],
            'type' => $hex['type'],
            'color' => $hex['color'] ?? null,
            'attribute' => $hex['attribute'] ?? null,
        ];
        if (isset($hex['explorationColor'])) {
            $result['explorationColor'] = $hex['explorationColor'];
        }
        return $result;
    }, $rotatedHexes);
}
```

This is critical — without it, `explorationColor` is lost during board generation and won't be available in `populateBoard()`.

- [x] **Step 5: Commit**

```bash
git add modules/php/ClusterDefinitions.php modules/js/ClusterDefinitions.js modules/php/MaterialDefs.php
git commit -m "feat(explore): add exploration colors to cluster definitions and MaterialDefs"
```

---

### Task 3: Shrine Placement During Game Setup

**Files:**
- Modify: `modules/php/Game.php:149-190` (populateBoard)
- Modify: `modules/php/Game.php:681-735` (getAllDatas)

During setup, randomly assign 12 shrine tokens (4 players × 3 letters) to the 12 shrine hexes on the board.

- [x] **Step 1: Store exploration color in hex.color during populateBoard()**

In `populateBoard()`, update the hex INSERT loop (line 163) to store the exploration color in the `color` column for shrine hexes. The `color` column is currently NULL for all island hexes, so we repurpose it for shrine exploration color:

```php
$color = $hex['color'] !== null ? "'" . addslashes($hex['color']) . "'" : 'NULL';
// For shrine islands, store explorationColor in the color column
if ($hex['attribute'] === 'shrine' && isset($hex['explorationColor'])) {
    $color = "'" . addslashes($hex['explorationColor']) . "'";
}
```

- [x] **Step 2: Add placeShrines() method to Game.php**

Add after `placeStatues()` (around line 190):

```php
/**
 * Assign shrine tokens to shrine hexes during setup.
 * Each player has 3 shrines (indexed by SHRINE_LETTERS), randomly distributed across 12 shrine hexes.
 * Stores owner + letter directly on the hex table (hidden until explored).
 */
private function placeShrines(array $hexesByAttribute, array $players): void
{
    $shrineHexes = $hexesByAttribute['shrine'] ?? [];

    // Build 12 shrine tokens: one per player per letter
    $tokens = [];
    foreach ($players as $player) {
        $playerId = (int)$player['player_id'];
        $playerColor = MaterialDefs::HEX_TO_GAME_COLOR[$player['player_color']] ?? null;
        if (!$playerColor) continue;
        $letters = MaterialDefs::SHRINE_LETTERS[$playerColor] ?? [];
        foreach ($letters as $index => $letter) {
            $tokens[] = [
                'player_id' => $playerId,
                'letter' => $letter,
                'shrine_index' => $index,
            ];
        }
    }

    // Shuffle and assign to hexes
    self::bgaShuffle($tokens);

    foreach ($shrineHexes as $i => $hex) {
        if (!isset($tokens[$i])) break;
        $token = $tokens[$i];
        $q = (int)$hex['q'];
        $r = (int)$hex['r'];
        $letter = addslashes($token['letter']);
        $playerId = $token['player_id'];

        static::DbQuery(
            "UPDATE hex SET shrine_player_id = $playerId, shrine_letter = '$letter'
             WHERE q = $q AND r = $r"
        );
    }
}
```

- [x] **Step 3: Call placeShrines() in populateBoard()**

In `populateBoard()` (around line 189), add after `placeStatues`:

```php
// Step 5: Place statues at cities
$this->placeStatues($hexesByAttribute, $boardResult);

// Step 6: Assign shrine tokens to shrine hexes
$this->placeShrines($hexesByAttribute, $playerRows);
```

Note: `populateBoard` signature needs `$playerRows` passed in. Update the call site at line 910:

```php
// Was:
$this->populateBoard($result, $clusterPlacementIds, count($players));
// Now:
$this->populateBoard($result, $clusterPlacementIds, count($players), $playerRows);
```

And update the method signature:

```php
// Was:
private function populateBoard(array $boardResult, array $clusterPlacementIds, int $playerCount): void
// Now:
private function populateBoard(array $boardResult, array $clusterPlacementIds, int $playerCount, array $players = []): void
```

- [x] **Step 4: Update getAllDatas() to include shrine hex info**

In `getAllDatas()`, the hex query (line 709) already returns `island_content`. But we need to also return `shrine_player_id` and `shrine_letter` for revealed hexes, and hide them for unrevealed ones.

Update the hex query:

```php
$hexes = self::getObjectListFromDB(
    "SELECT hex_id AS id, q, r, tile_type AS tileType, color,
            island_content AS islandContent, is_revealed AS isRevealed,
            shrine_player_id AS shrinePlayerId, shrine_letter AS shrineLetter,
            revealed_by_player_id AS revealedByPlayerId,
            cluster_id AS clusterId, cluster_type AS clusterType,
            cluster_rotation AS clusterRotation
     FROM hex"
);
```

Update the hiding logic (line 728) to also hide shrine info for unrevealed hexes:

```php
foreach ($hexes as &$hex) {
    if ($hex['tileType'] === 'island'
        && (int)$hex['isRevealed'] === 0
        && !isset($peekedSet["{$hex['q']},{$hex['r']}"])) {
        $hex['islandContent'] = null;
        $hex['shrinePlayerId'] = null;
        $hex['shrineLetter'] = null;
    }
}
```

- [x] **Step 5: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat(explore): store exploration color, assign shrine tokens, update getAllDatas"
```

---

### Task 4: SelectAction — Explore Island Entry Point

**Files:**
- Modify: `modules/php/States/SelectAction.php`

- [x] **Step 1: Add getExplorableIslands() helper**

Add after `getDeliverableStatues()` (around line 217). The exploration color is stored in the hex's `color` column during setup (see Task 3), so we query it directly — no rotation math needed:

```php
private function getExplorableIslands(int $playerId, ?string $dieColor): array
{
    if (!$dieColor) return [];

    [$shipQ, $shipR] = $this->getShipPosition($playerId);
    $safeColor = addslashes($dieColor);

    $shrineHexes = $this->game->getObjectListFromDB(
        "SELECT q, r FROM hex
         WHERE island_content = 'shrine' AND is_revealed = 0 AND color = '$safeColor'"
    );

    $explorable = [];
    foreach ($shrineHexes as $hex) {
        $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$hex['q'], (int)$hex['r']);
        if ($dist !== 1) continue;

        $explorable[] = [
            'hex_q' => (int)$hex['q'],
            'hex_r' => (int)$hex['r'],
            'explorationColor' => $dieColor,
        ];
    }
    return $explorable;
}
```

- [x] **Step 2: Add explorable islands to getArgs()**

In `getArgs()` (line 23), add after `deliverableStatues`:

```php
return [
    'dieIndex' => $dieIndex,
    'dieColor' => $dieColor,
    'fightableMonsters' => $fightableMonsters,
    'loadableOfferings' => $canLoad ? $this->getLoadableOfferings($playerId, $dieColor) : [],
    'loadableStatues' => $canLoad ? $this->getLoadableStatues($playerId, $dieColor) : [],
    'deliverableOfferings' => $this->getDeliverableOfferings($playerId, $dieColor),
    'deliverableStatues' => $this->getDeliverableStatues($playerId, $dieColor),
    'explorableIslands' => $this->getExplorableIslands($playerId, $dieColor),
    'cargoCount' => $cargoCount,
    'cargoCapacity' => $cargoCapacity,
];
```

- [x] **Step 3: Add actExploreIsland action method**

After `actRaiseStatue` (line 300):

```php
#[PossibleAction]
public function actExploreIsland(int $hexQ, int $hexR, int $activePlayerId) {
    $dieIndex = $this->game->globals->get('selected_die_index');
    $die = $this->game->getObjectFromDB(
        "SELECT color FROM oracle_die WHERE player_id = $activePlayerId AND die_index = $dieIndex"
    );
    $dieColor = $die ? $die['color'] : null;
    $explorable = $this->getExplorableIslands($activePlayerId, $dieColor);

    $valid = false;
    foreach ($explorable as $island) {
        if ($island['hex_q'] === $hexQ && $island['hex_r'] === $hexR) {
            $valid = true;
            break;
        }
    }
    if (!$valid) {
        throw new UserException(clienttranslate('You cannot explore that island'));
    }

    $this->game->globals->set('explore_hex_q', $hexQ);
    $this->game->globals->set('explore_hex_r', $hexR);
    return ExploreIsland::class;
}
```

- [x] **Step 4: Commit**

```bash
git add modules/php/States/SelectAction.php modules/php/Game.php
git commit -m "feat(explore): add getExplorableIslands and actExploreIsland to SelectAction"
```

---

### Task 5: ExploreIsland State — Full Implementation

**Files:**
- Modify: `modules/php/States/ExploreIsland.php`

- [x] **Step 1: Implement ExploreIsland state**

Replace the entire skeleton with:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class ExploreIsland extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 36,
            type: StateType::GAME,
            description: clienttranslate('Revealing island...'),
        );
    }

    public function onEnteringState(int $activePlayerId): string
    {
        $playerId = $activePlayerId;
        $hexQ = $this->game->globals->get('explore_hex_q');
        $hexR = $this->game->globals->get('explore_hex_r');

        // Mark hex as revealed
        $this->game->DbQuery(
            "UPDATE hex SET is_revealed = 1, revealed_by_player_id = $playerId
             WHERE q = $hexQ AND r = $hexR"
        );

        // Spend the die
        $dieIndex = $this->game->globals->get('selected_die_index');
        $this->game->DbQuery(
            "UPDATE oracle_die SET is_used = 1
             WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        $this->game->globals->set('selected_die_index', null);

        // Get shrine info from hex
        $hex = $this->game->getObjectFromDB(
            "SELECT shrine_player_id, shrine_letter, color AS exploration_color
             FROM hex WHERE q = $hexQ AND r = $hexR"
        );
        $shrinePlayerId = (int)$hex['shrine_player_id'];
        $shrineLetter = $hex['shrine_letter'];
        $explorationColor = $hex['exploration_color'];

        // Get shrine owner's game color for display
        $shrineOwnerColor = $this->game->getUniqueValueFromDB(
            "SELECT player_color FROM player WHERE player_id = $shrinePlayerId"
        );
        $shrineOwnerGameColor = MaterialDefs::HEX_TO_GAME_COLOR[$shrineOwnerColor] ?? 'unknown';

        // Notify all: island revealed
        $this->notify->all("islandRevealed", clienttranslate('${player_name} explores an island, revealing a ${shrine_letter} shrine'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "hex_q" => $hexQ,
            "hex_r" => $hexR,
            "shrine_owner_id" => $shrinePlayerId,
            "shrine_owner_color" => $shrineOwnerGameColor,
            "shrine_letter" => $shrineLetter,
        ]);

        // Notify die used
        $this->notify->all("dieUsed", '', [
            "player_id" => $playerId,
            "die_index" => $dieIndex,
        ]);

        if ($shrinePlayerId === $playerId) {
            return $this->buildOwnShrine($playerId, $hexQ, $hexR, $shrineLetter);
        } else {
            return $this->applyExplorerBonus($playerId, $shrinePlayerId, $shrineLetter, $hexQ, $hexR);
        }
    }

    private function buildOwnShrine(int $playerId, int $hexQ, int $hexR, string $shrineLetter): string
    {
        // Find the shrine record for this player + letter
        $letters = $this->getPlayerLetters($playerId);
        $shrineIndex = array_search($shrineLetter, $letters);

        // Update shrine table
        $this->game->DbQuery(
            "UPDATE shrine SET is_built = 1, built_at_hex_q = $hexQ, built_at_hex_r = $hexR
             WHERE player_id = $playerId AND shrine_index = $shrineIndex"
        );

        // Notify shrine built
        $this->notify->all("shrineBuilt", clienttranslate('${player_name} builds a shrine!'), [
            "player_id" => $playerId,
            "player_name" => $this->game->getPlayerNameById($playerId),
            "hex_q" => $hexQ,
            "hex_r" => $hexR,
            "shrine_index" => $shrineIndex,
            "shrine_letter" => $shrineLetter,
        ]);

        // Complete Zeus tile for shrine
        $completedTileId = $this->completeZeusTile($playerId, $shrineLetter);
        if ($completedTileId !== null) {
            $this->notify->all("taskCompleted", clienttranslate('${player_name} completes a Zeus tile!'), [
                "player_id" => $playerId,
                "player_name" => $this->game->getPlayerNameById($playerId),
                "tile_id" => $completedTileId,
            ]);
        }

        return $this->returnToActions($playerId);
    }

    private function applyExplorerBonus(int $playerId, int $shrinePlayerId, string $shrineLetter, int $hexQ, int $hexR): string
    {
        $bonus = MaterialDefs::SHRINE_BONUSES[$shrineLetter] ?? null;
        if (!$bonus) {
            return $this->returnToActions($playerId);
        }

        switch ($bonus['type']) {
            case 'favor':
                // Psi: +4 favor tokens to EXPLORING player
                $delta = $bonus['value'];
                $this->game->DbQuery(
                    "UPDATE player SET favor_tokens = favor_tokens + $delta WHERE player_id = $playerId"
                );
                $newFavor = (int)$this->game->getUniqueValueFromDB(
                    "SELECT favor_tokens FROM player WHERE player_id = $playerId"
                );
                $this->notify->all("favorTokensChanged", clienttranslate('${player_name} receives ${delta} Favor Tokens from exploring a shrine'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "favor_tokens" => $newFavor,
                    "delta" => $delta,
                ]);
                break;

            case 'oracle':
                // Phi: Draw 2 oracle cards for EXPLORING player
                // TODO: implement oracle card draw when card system supports it
                $this->notify->all("shrineExplored", clienttranslate('${player_name} draws ${value} Oracle Cards from exploring a shrine'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "bonus_type" => $bonus['type'],
                    "value" => $bonus['value'],
                    "shrine_letter" => $shrineLetter,
                ]);
                break;

            case 'gods':
                // Sigma: deferred — log only
                $this->notify->all("shrineExplored", clienttranslate('${player_name} earns ${description} from exploring a shrine (not yet implemented)'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "bonus_type" => $bonus['type'],
                    "value" => $bonus['value'],
                    "description" => $bonus['description'],
                    "shrine_letter" => $shrineLetter,
                ]);
                break;

            case 'heal':
                // Omega: deferred — log only
                $this->notify->all("shrineExplored", clienttranslate('${player_name} earns ${description} from exploring a shrine (not yet implemented)'), [
                    "player_id" => $playerId,
                    "player_name" => $this->game->getPlayerNameById($playerId),
                    "bonus_type" => $bonus['type'],
                    "value" => $bonus['value'],
                    "description" => $bonus['description'],
                    "shrine_letter" => $shrineLetter,
                ]);
                break;
        }

        return $this->returnToActions($playerId);
    }

    private function completeZeusTile(int $playerId, string $shrineLetter): ?int
    {
        $safeLetter = addslashes($shrineLetter);
        $zeusTile = $this->game->getObjectFromDB(
            "SELECT tile_id FROM zeus_tile
             WHERE player_id = $playerId AND task_type = 'shrine'
             AND task_letter = '$safeLetter' AND is_completed = 0
             LIMIT 1"
        );

        if (!$zeusTile) return null;

        $tileId = (int)$zeusTile['tile_id'];
        $this->game->DbQuery("UPDATE zeus_tile SET is_completed = 1 WHERE tile_id = $tileId");
        $this->game->DbQuery(
            "UPDATE player SET tasks_completed = tasks_completed + 1 WHERE player_id = $playerId"
        );
        return $tileId;
    }

    private function getPlayerLetters(int $playerId): array
    {
        $playerColor = $this->game->getUniqueValueFromDB(
            "SELECT player_color FROM player WHERE player_id = $playerId"
        );
        $gameColor = MaterialDefs::HEX_TO_GAME_COLOR[$playerColor] ?? null;
        return MaterialDefs::SHRINE_LETTERS[$gameColor] ?? [];
    }

    private function allDiceUsed(int $playerId): bool
    {
        $unused = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM oracle_die WHERE player_id = $playerId AND is_used = 0"
        );
        return $unused === 0;
    }

    private function returnToActions(int $playerId): string
    {
        // Clean up globals
        $this->game->globals->set('explore_hex_q', null);
        $this->game->globals->set('explore_hex_r', null);

        if ($this->allDiceUsed($playerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        // If zombie during explore, just return to player actions
        $this->game->globals->set('explore_hex_q', null);
        $this->game->globals->set('explore_hex_r', null);
        $this->game->globals->set('selected_die_index', null);
        return PlayerActions::class;
    }
}
```

**Note:** This follows the established `StateType::GAME` pattern used by `RoundStart`, `CombatResult`, `ConsultOracle`, `FightMonsterStart`, etc. — all use `onEnteringState(int $activePlayerId): string` and return the next state class.

- [x] **Step 2: Commit**

```bash
git add modules/php/States/ExploreIsland.php
git commit -m "feat(explore): implement ExploreIsland state with auto-build and bonus logic"
```

---

### Task 6: JS — Action Buttons for Explore Island

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [x] **Step 1: Add Explore Island button in onUpdateActionButtons**

In the `SelectAction` case (around line 1033), after the Raise Statue button block (line 1070), add:

```javascript
if (args && args.explorableIslands && args.explorableIslands.length > 0) {
    var islands = args.explorableIslands;
    if (islands.length === 1) {
        this.statusBar.addActionButton(_('Explore Island'), () => {
            this.bgaPerformAction("actExploreIsland", {
                hexQ: islands[0].hex_q,
                hexR: islands[0].hex_r
            });
        });
    } else {
        islands.forEach(island => {
            var label = _('Explore') + ' ' + island.explorationColor.charAt(0).toUpperCase() + island.explorationColor.slice(1) + ' ' + _('Island');
            this.statusBar.addActionButton(label, () => {
                this.bgaPerformAction("actExploreIsland", {
                    hexQ: island.hex_q,
                    hexR: island.hex_r
                });
            });
        });
    }
}
```

- [x] **Step 2: Bump DELPHI_JS_VERSION**

Update the version string (find current version near top of file):

```javascript
// Was: var DELPHI_JS_VERSION = "v32";
var DELPHI_JS_VERSION = "v33";
```

- [x] **Step 3: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(explore): add Explore Island action buttons in JS"
```

---

### Task 7: JS — Notification Handlers

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [x] **Step 1: Add notif_islandRevealed handler**

Add with the other notification handlers:

```javascript
notif_islandRevealed: function(args) {
    console.log('notif_islandRevealed', args);
    // Update the hex visual to show it's been revealed
    // The hex element should show shrine owner color + letter
    var hexKey = args.hex_q + ',' + args.hex_r;
    // TODO: Add visual indicator on the hex showing the shrine has been revealed
    // For now, just log it
},
```

- [x] **Step 2: Add notif_shrineBuilt handler**

```javascript
notif_shrineBuilt: function(args) {
    console.log('notif_shrineBuilt', args);
    // Move shrine piece from player board to hex on main board
    var center = this.getHexCenterPixel(args.hex_q, args.hex_r);
    if (!center) return;

    var shrineEl = document.createElement('div');
    shrineEl.className = 'delphi-shrine';
    shrineEl.id = 'shrine_' + args.player_id + '_' + args.shrine_index;
    shrineEl.style.left = center.x + 'px';
    shrineEl.style.top = center.y + 'px';
    this.components.boardPieces.appendChild(shrineEl);
},
```

- [x] **Step 3: Add notif_shrineExplored handler**

```javascript
notif_shrineExplored: function(args) {
    console.log('notif_shrineExplored', args);
    // Log notification for shrine bonuses — favor handled by favorTokensChanged
},
```

- [x] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat(explore): add JS notification handlers for island reveal and shrine build"
```

---

### Task 8: CSS — Shrine Piece Styling

**Files:**
- Modify: `theoracleofdelphigzed.css`

- [x] **Step 1: Add shrine piece CSS**

```css
.delphi-shrine {
    position: absolute;
    width: 20px;
    height: 24px;
    background-color: #f5f5f0;
    border: 2px solid #8b7355;
    border-radius: 2px 2px 0 0;
    transform: translate(-50%, -50%);
    z-index: 15;
    /* Simple shrine shape — triangular top */
    clip-path: polygon(50% 0%, 100% 35%, 100% 100%, 0% 100%, 0% 35%);
}
```

- [x] **Step 2: Commit**

```bash
git add theoracleofdelphigzed.css
git commit -m "feat(explore): add shrine piece CSS styling"
```

---

### Task 9: Integration Verification

- [x] **Step 1: Start a new game and verify setup**

Check the `hex` table after a new game starts:
- All 12 shrine hexes should have `island_content = 'shrine'`
- All 12 shrine hexes should have `color` set to the exploration color (green, black, blue, yellow, red, pink)
- All 12 shrine hexes should have `shrine_player_id` and `shrine_letter` assigned
- Each player should have exactly 3 shrine hexes assigned to them
- The 4 players × 3 letters should all be accounted for

- [x] **Step 2: Verify SelectAction shows Explore Island button**

Position a ship adjacent to an unrevealed shrine hex, select a die matching the exploration color, and confirm the "Explore Island" button appears.

- [x] **Step 3: Verify own shrine auto-build**

Click Explore Island on your own shrine. Verify:
- Hex is revealed (is_revealed = 1)
- Shrine is built (shrine.is_built = 1)
- Zeus tile is completed
- Shrine piece appears on the board
- Die is consumed

- [x] **Step 4: Verify other player's shrine bonus**

Click Explore Island on another player's Psi shrine. Verify:
- Hex is revealed
- +4 favor tokens received by exploring player
- Die is consumed

- [x] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix(explore): integration fixes for explore island"
```

---

## Summary

| Task | Description | Files |
|------|------------|-------|
| 1 | DB schema changes | dbmodel.sql |
| 2 | Exploration colors in cluster defs + getWorldHexes fix | ClusterDefinitions.php/js, MaterialDefs.php |
| 3 | Store exploration color + shrine placement + getAllDatas | Game.php |
| 4 | SelectAction entry point | SelectAction.php |
| 5 | ExploreIsland state implementation | ExploreIsland.php |
| 6 | JS action buttons | theoracleofdelphigzed.js |
| 7 | JS notification handlers | theoracleofdelphigzed.js |
| 8 | CSS shrine styling | theoracleofdelphigzed.css |
| 9 | Integration verification | all |
