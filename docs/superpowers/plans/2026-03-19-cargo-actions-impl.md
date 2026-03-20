# Cargo Actions Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Load Offering, Deliver Offering, Load Statue, and Raise Statue actions so players can pick up and deliver cargo to complete Zeus tile tasks.

**Architecture:** Extend 3 existing skeleton PHP state classes (LoadCargo, DeliverCargo, SelectReward) with validation, DB updates, and notifications. Add JS state entry handlers and notification subscribers. Cargo actions share a common pattern: die color must match item color, ship must be adjacent to target hex, cargo capacity checked.

**Tech Stack:** PHP 8.2 (BGA framework state classes), vanilla JS (AMD module), CSS.

**Design doc:** `docs/plans/2026-03-19-cargo-actions-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `modules/php/MaterialDefs.php` | MODIFY | Add STATUE_ISLAND_COLORS constant |
| `modules/php/States/SelectAction.php` | MODIFY | Add 4 action methods + cargo helper queries |
| `modules/php/States/LoadCargo.php` | MODIFY | Replace skeleton with full validation + DB logic |
| `modules/php/States/DeliverCargo.php` | MODIFY | Replace skeleton with full validation + DB logic |
| `modules/php/States/SelectReward.php` | MODIFY | Add companion card selection for statue reward |
| `theoracleofdelphigzed.js` | MODIFY | Add state entry handlers, click handlers, notification subscribers |
| `theoracleofdelphigzed.css` | MODIFY | Add `.selectable` highlighting for offerings/statues/cargo |

---

## Task 0: Add Statue Island Color Mapping to MaterialDefs

**Files:**
- Modify: `modules/php/MaterialDefs.php`

### Context

Each statue island accepts 3 specific statue colors. The 3 pedestal positions are always in the same order: E, SW, NW (matching the edge of the hex they're placed along). The array index encodes the position: 0=E, 1=SW, 2=NW.

### Steps

- [ ] **Step 1: Add STATUE_ISLAND_COLORS constant**

Add after the `SHIP_TILES` constant in `MaterialDefs.php`:

```php
// Statue island pedestal colors, indexed by cluster ID.
// Array order = pedestal position: [0]=E edge, [1]=SW edge, [2]=NW edge.
// Each color appears exactly 3 times across all islands (18 total = 6 colors × 3).
public const STATUE_ISLAND_COLORS = [
    'cluster-7-5'  => ['pink', 'blue', 'red'],
    'cluster-9-0'  => ['green', 'red', 'yellow'],
    'cluster-9-1'  => ['blue', 'black', 'yellow'],
    'cluster-9-2'  => ['pink', 'green', 'yellow'],
    'cluster-11-1' => ['green', 'black', 'blue'],
    'cluster-11-2' => ['pink', 'black', 'red'],
];
```

- [ ] **Step 2: Verify no PHP syntax errors**

Run: `php -l modules/php/MaterialDefs.php`
Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add modules/php/MaterialDefs.php
git commit -m "feat: add statue island color mapping constant"
```

---

## Task 1: SelectAction — Add Cargo Action Entry Points

**Files:**
- Modify: `modules/php/States/SelectAction.php`

### Context

SelectAction (id:21) is the state where a player has selected a die and picks which action to perform. Currently has `actMoveShip` and `actFightMonster`. We need 4 new actions that set globals and transition to LoadCargo(34) or DeliverCargo(35).

Key references:
- `actFightMonster()` at line 77 shows the validation + globals + transition pattern
- `getArgs()` at line 22 shows how to get `dieIndex` and `dieColor`
- `getFightableMonsters()` at line 39 shows adjacency query pattern using `HexUtils::hexDistance()`

### Steps

- [ ] **Step 1: Add helper methods for cargo queries**

Add these private methods to `SelectAction.php` after `getFightableMonsters()` (after line 69):

```php
private function getShipPosition(int $playerId): array
{
    $player = $this->game->getObjectFromDB(
        "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
    );
    return [(int)$player['ship_q'], (int)$player['ship_r']];
}

private function getLoadableOfferings(int $playerId, ?string $dieColor): array
{
    if (!$dieColor) return [];
    [$shipQ, $shipR] = $this->getShipPosition($playerId);
    $safeColor = addslashes($dieColor);
    $offerings = $this->game->getObjectListFromDB(
        "SELECT offering_id, color, origin_hex_q, origin_hex_r
         FROM offering WHERE player_id IS NULL AND is_delivered = 0 AND color = '$safeColor'"
    );
    $result = [];
    foreach ($offerings as $o) {
        $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$o['origin_hex_q'], (int)$o['origin_hex_r']);
        if ($dist === 1) {
            $result[] = [
                'id' => (int)$o['offering_id'],
                'type' => 'offering',
                'color' => $o['color'],
                'hex_q' => (int)$o['origin_hex_q'],
                'hex_r' => (int)$o['origin_hex_r'],
            ];
        }
    }
    return $result;
}

private function getLoadableStatues(int $playerId, ?string $dieColor): array
{
    if (!$dieColor) return [];
    [$shipQ, $shipR] = $this->getShipPosition($playerId);
    $safeColor = addslashes($dieColor);
    $statues = $this->game->getObjectListFromDB(
        "SELECT statue_id, color, origin_hex_q, origin_hex_r
         FROM statue WHERE player_id IS NULL AND is_raised = 0 AND color = '$safeColor'"
    );
    $result = [];
    foreach ($statues as $s) {
        $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$s['origin_hex_q'], (int)$s['origin_hex_r']);
        if ($dist === 1) {
            $result[] = [
                'id' => (int)$s['statue_id'],
                'type' => 'statue',
                'color' => $s['color'],
                'hex_q' => (int)$s['origin_hex_q'],
                'hex_r' => (int)$s['origin_hex_r'],
            ];
        }
    }
    return $result;
}

private function getDeliverableOfferings(int $playerId, ?string $dieColor): array
{
    if (!$dieColor) return [];
    [$shipQ, $shipR] = $this->getShipPosition($playerId);
    $safeColor = addslashes($dieColor);
    // Offerings in cargo matching die color
    $offerings = $this->game->getObjectListFromDB(
        "SELECT offering_id, color FROM offering
         WHERE player_id = $playerId AND is_delivered = 0 AND color = '$safeColor'"
    );
    if (empty($offerings)) return [];
    // Check ship is adjacent to matching-color temple
    $temple = $this->game->getObjectFromDB(
        "SELECT hex_q, hex_r FROM temple WHERE color = '$safeColor'"
    );
    if (!$temple) return [];
    $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$temple['hex_q'], (int)$temple['hex_r']);
    if ($dist !== 1) return [];
    $result = [];
    foreach ($offerings as $o) {
        $result[] = [
            'id' => (int)$o['offering_id'],
            'type' => 'offering',
            'color' => $o['color'],
            'dest_q' => (int)$temple['hex_q'],
            'dest_r' => (int)$temple['hex_r'],
        ];
    }
    return $result;
}

private function getDeliverableStatues(int $playerId, ?string $dieColor): array
{
    if (!$dieColor) return [];
    [$shipQ, $shipR] = $this->getShipPosition($playerId);
    $safeColor = addslashes($dieColor);
    // Statues in cargo matching die color
    $statues = $this->game->getObjectListFromDB(
        "SELECT statue_id, color FROM statue
         WHERE player_id = $playerId AND is_raised = 0 AND color = '$safeColor'"
    );
    if (empty($statues)) return [];
    // Check ship is adjacent to a statue island that accepts this color
    $statueIslands = $this->game->getObjectListFromDB(
        "SELECT q, r, cluster_type FROM hex WHERE tile_type = 'island' AND island_content = 'statue'"
    );
    $adjacentIsland = null;
    foreach ($statueIslands as $island) {
        $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$island['q'], (int)$island['r']);
        if ($dist !== 1) continue;
        // Check this island accepts the die/statue color
        $clusterId = $island['cluster_type'] ?? '';
        $acceptedColors = MaterialDefs::STATUE_ISLAND_COLORS[$clusterId] ?? [];
        if (!in_array($dieColor, $acceptedColors, true)) continue;
        $adjacentIsland = $island;
        break;
    }
    if (!$adjacentIsland) return [];
    $result = [];
    foreach ($statues as $s) {
        $result[] = [
            'id' => (int)$s['statue_id'],
            'type' => 'statue',
            'color' => $s['color'],
            'dest_q' => (int)$adjacentIsland['q'],
            'dest_r' => (int)$adjacentIsland['r'],
        ];
    }
    return $result;
}

private function getCargoCount(int $playerId): int
{
    $offerings = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM offering WHERE player_id = $playerId AND is_delivered = 0"
    );
    $statues = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM statue WHERE player_id = $playerId AND is_raised = 0"
    );
    return $offerings + $statues;
}

private function getCargoCapacity(int $playerId): int
{
    $shipTileId = $this->game->getUniqueValueFromDB(
        "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
    );
    if ($shipTileId !== null) {
        $tile = \Bga\Games\theoracleofdelphigzed\MaterialDefs::SHIP_TILES[(int)$shipTileId] ?? null;
        if ($tile) {
            return $tile['storage'];
        }
    }
    return 2; // default
}
```

- [ ] **Step 2: Update getArgs() to include cargo action availability**

Replace the existing `getArgs()` method body (lines 22-37) to also return cargo action data:

```php
public function getArgs(): array
{
    $dieIndex = $this->game->globals->get('selected_die_index');
    $playerId = (int)$this->game->getActivePlayerId();
    $die = $this->game->getObjectFromDB(
        "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
    );
    $dieColor = $die ? $die['color'] : null;

    $cargoCount = $this->getCargoCount($playerId);
    $cargoCapacity = $this->getCargoCapacity($playerId);
    $canLoad = $cargoCount < $cargoCapacity;

    return [
        'dieIndex' => $dieIndex,
        'dieColor' => $dieColor,
        'fightableMonsters' => $this->getFightableMonsters($playerId, $dieColor),
        'loadableOfferings' => $canLoad ? $this->getLoadableOfferings($playerId, $dieColor) : [],
        'loadableStatues' => $canLoad ? $this->getLoadableStatues($playerId, $dieColor) : [],
        'deliverableOfferings' => $this->getDeliverableOfferings($playerId, $dieColor),
        'deliverableStatues' => $this->getDeliverableStatues($playerId, $dieColor),
        'cargoCount' => $cargoCount,
        'cargoCapacity' => $cargoCapacity,
    ];
}
```

- [ ] **Step 3: Add the 4 cargo action methods**

Add after `actCancelDieSelection()` (after line 108):

```php
#[PossibleAction]
public function actLoadOffering(int $activePlayerId) {
    $this->game->globals->set('cargo_action_type', 'offering');
    return LoadCargo::class;
}

#[PossibleAction]
public function actLoadStatue(int $activePlayerId) {
    $this->game->globals->set('cargo_action_type', 'statue');
    return LoadCargo::class;
}

#[PossibleAction]
public function actMakeOffering(int $activePlayerId) {
    $this->game->globals->set('cargo_action_type', 'offering');
    return DeliverCargo::class;
}

#[PossibleAction]
public function actRaiseStatue(int $activePlayerId) {
    $this->game->globals->set('cargo_action_type', 'statue');
    return DeliverCargo::class;
}
```

- [ ] **Step 4: Add use statement for MaterialDefs**

Add at top of file after existing use statements (after line 7):

```php
use Bga\Games\theoracleofdelphigzed\MaterialDefs;
```

- [ ] **Step 5: Verify no PHP syntax errors**

Run: `php -l modules/php/States/SelectAction.php`
Expected: `No syntax errors detected`

- [ ] **Step 6: Commit**

```bash
git add modules/php/States/SelectAction.php
git commit -m "feat: add cargo action entry points to SelectAction state"
```

---

## Task 2: LoadCargo — Full Implementation

**Files:**
- Modify: `modules/php/States/LoadCargo.php`

### Context

Currently a skeleton with only `actPass()`. Needs `getArgs()` to return valid items, `actConfirmLoad()` to validate and update DB, and `actCancel()` to return to SelectAction.

Key patterns to follow:
- `MoveShip.actConfirmMove()` (line 112): validation → DB update → mark die used → notify → auto-end check
- `FightMonsterStart.onEnteringState()` (line 13): die marking + `dieUsed` notification pattern
- `SelectAction` cargo helpers (from Task 1): reuse the same adjacency + color + capacity logic

### Steps

- [ ] **Step 1: Replace LoadCargo.php with full implementation**

Replace the entire file content:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

require_once(__DIR__ . '/../HexUtils.php');

class LoadCargo extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 34,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} loads cargo'),
            descriptionMyTurn: clienttranslate('Select item to load'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $actionType = $this->game->globals->get('cargo_action_type');
        $dieIndex = $this->game->globals->get('selected_die_index');
        $die = $this->game->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        $dieColor = $die ? $die['color'] : null;

        return [
            'actionType' => $actionType,
            'dieColor' => $dieColor,
            'validItems' => $this->getValidItems($playerId, $actionType, $dieColor),
        ];
    }

    private function getValidItems(int $playerId, ?string $actionType, ?string $dieColor): array
    {
        if (!$dieColor || !$actionType) return [];

        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $safeColor = addslashes($dieColor);

        if ($actionType === 'offering') {
            $rows = $this->game->getObjectListFromDB(
                "SELECT offering_id AS id, color, origin_hex_q AS hex_q, origin_hex_r AS hex_r
                 FROM offering WHERE player_id IS NULL AND is_delivered = 0 AND color = '$safeColor'"
            );
        } else {
            $rows = $this->game->getObjectListFromDB(
                "SELECT statue_id AS id, color, origin_hex_q AS hex_q, origin_hex_r AS hex_r
                 FROM statue WHERE player_id IS NULL AND is_raised = 0 AND color = '$safeColor'"
            );
        }

        $result = [];
        foreach ($rows as $row) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$row['hex_q'], (int)$row['hex_r']);
            if ($dist === 1) {
                $result[] = [
                    'id' => (int)$row['id'],
                    'type' => $actionType,
                    'color' => $row['color'],
                    'hex_q' => (int)$row['hex_q'],
                    'hex_r' => (int)$row['hex_r'],
                ];
            }
        }
        return $result;
    }

    private function getCargoCount(int $playerId): int
    {
        $offerings = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM offering WHERE player_id = $playerId AND is_delivered = 0"
        );
        $statues = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM statue WHERE player_id = $playerId AND is_raised = 0"
        );
        return $offerings + $statues;
    }

    private function getCargoCapacity(int $playerId): int
    {
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        if ($shipTileId !== null) {
            $tile = MaterialDefs::SHIP_TILES[(int)$shipTileId] ?? null;
            if ($tile) {
                return $tile['storage'];
            }
        }
        return 2;
    }

    private function allDiceUsed(int $playerId): bool
    {
        $unused = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM oracle_die WHERE player_id = $playerId AND is_used = 0"
        );
        return $unused === 0;
    }

    #[PossibleAction]
    public function actConfirmLoad(int $itemId, int $activePlayerId) {
        $actionType = $this->game->globals->get('cargo_action_type');
        $validItems = $this->getArgs()['validItems'];

        // Validate item is in valid list
        $selectedItem = null;
        foreach ($validItems as $item) {
            if ($item['id'] === $itemId) {
                $selectedItem = $item;
                break;
            }
        }
        if (!$selectedItem) {
            throw new UserException(clienttranslate('You cannot load that item'));
        }

        // Check cargo capacity
        if ($this->getCargoCount($activePlayerId) >= $this->getCargoCapacity($activePlayerId)) {
            throw new UserException(clienttranslate('Your cargo hold is full'));
        }

        // DB update: set player_id to claim the item
        if ($actionType === 'offering') {
            $this->game->DbQuery(
                "UPDATE offering SET player_id = $activePlayerId WHERE offering_id = $itemId"
            );
        } else {
            $this->game->DbQuery(
                "UPDATE statue SET player_id = $activePlayerId WHERE statue_id = $itemId"
            );
        }

        // Mark die as used
        $dieIndex = $this->game->globals->get('selected_die_index');
        $this->game->DbQuery(
            "UPDATE oracle_die SET is_used = 1
             WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );
        $this->game->globals->set('selected_die_index', null);
        $this->game->globals->set('cargo_action_type', null);

        $this->notify->all("loadCargo", clienttranslate('${player_name} loads a ${color} ${item_type}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "item_id" => $itemId,
            "item_type" => $actionType,
            "color" => $selectedItem['color'],
            "hex_q" => $selectedItem['hex_q'],
            "hex_r" => $selectedItem['hex_r'],
        ]);

        $this->notify->all("dieUsed", '', [
            "player_id" => $activePlayerId,
            "die_index" => $dieIndex,
        ]);

        if ($this->allDiceUsed($activePlayerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actCancel(int $activePlayerId) {
        $this->game->globals->set('cargo_action_type', null);
        return SelectAction::class;
    }

    function zombie(int $playerId) {
        return $this->actCancel($playerId);
    }
}
```

- [ ] **Step 2: Verify no PHP syntax errors**

Run: `php -l modules/php/States/LoadCargo.php`
Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/LoadCargo.php
git commit -m "feat: implement LoadCargo state with validation, DB updates, notifications"
```

---

## Task 3: DeliverCargo — Full Implementation

**Files:**
- Modify: `modules/php/States/DeliverCargo.php`

### Context

Handles both delivering offerings (to temples) and raising statues (at statue islands). The key difference: offerings award 3 favor tokens immediately, statues transition to SelectReward(39) for companion card choice. Zeus tile completion logic follows the pattern in `CombatVictory.php` lines 69-95.

Destination validation:
- Offerings: ship adjacent to matching-color temple (from `temple` table)
- Statues: ship adjacent to any statue island hex (`hex` table where `tile_type='island' AND island_content='statue'`)

### Steps

- [ ] **Step 1: Replace DeliverCargo.php with full implementation**

Replace the entire file content:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;

require_once(__DIR__ . '/../HexUtils.php');

class DeliverCargo extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 35,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} delivers cargo'),
            descriptionMyTurn: clienttranslate('Select item to deliver'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $actionType = $this->game->globals->get('cargo_action_type');
        $dieIndex = $this->game->globals->get('selected_die_index');
        $die = $this->game->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        $dieColor = $die ? $die['color'] : null;

        return [
            'actionType' => $actionType,
            'dieColor' => $dieColor,
            'deliverableItems' => $this->getDeliverableItems($playerId, $actionType, $dieColor),
        ];
    }

    private function getDeliverableItems(int $playerId, ?string $actionType, ?string $dieColor): array
    {
        if (!$dieColor || !$actionType) return [];

        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $safeColor = addslashes($dieColor);

        if ($actionType === 'offering') {
            return $this->getDeliverableOfferingsForPlayer($playerId, $safeColor, $shipQ, $shipR);
        } else {
            return $this->getDeliverableStatuesForPlayer($playerId, $safeColor, $shipQ, $shipR);
        }
    }

    private function getDeliverableOfferingsForPlayer(int $playerId, string $safeColor, int $shipQ, int $shipR): array
    {
        // Check if ship is adjacent to matching-color temple
        $temple = $this->game->getObjectFromDB(
            "SELECT hex_q, hex_r FROM temple WHERE color = '$safeColor'"
        );
        if (!$temple) return [];
        $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$temple['hex_q'], (int)$temple['hex_r']);
        if ($dist !== 1) return [];

        $offerings = $this->game->getObjectListFromDB(
            "SELECT offering_id AS id, color FROM offering
             WHERE player_id = $playerId AND is_delivered = 0 AND color = '$safeColor'"
        );

        $result = [];
        foreach ($offerings as $o) {
            $result[] = [
                'id' => (int)$o['id'],
                'type' => 'offering',
                'color' => $o['color'],
                'dest_q' => (int)$temple['hex_q'],
                'dest_r' => (int)$temple['hex_r'],
            ];
        }
        return $result;
    }

    private function getDeliverableStatuesForPlayer(int $playerId, string $safeColor, int $shipQ, int $shipR): array
    {
        // Check if ship is adjacent to a statue island that accepts this color
        $statueIslands = $this->game->getObjectListFromDB(
            "SELECT q, r, cluster_type FROM hex WHERE tile_type = 'island' AND island_content = 'statue'"
        );
        $adjacentIsland = null;
        foreach ($statueIslands as $island) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$island['q'], (int)$island['r']);
            if ($dist !== 1) continue;
            $clusterId = $island['cluster_type'] ?? '';
            $acceptedColors = MaterialDefs::STATUE_ISLAND_COLORS[$clusterId] ?? [];
            if (!in_array($safeColor, $acceptedColors, true)) continue;
            $adjacentIsland = $island;
            break;
        }
        if (!$adjacentIsland) return [];

        $statues = $this->game->getObjectListFromDB(
            "SELECT statue_id AS id, color FROM statue
             WHERE player_id = $playerId AND is_raised = 0 AND color = '$safeColor'"
        );

        $result = [];
        foreach ($statues as $s) {
            $result[] = [
                'id' => (int)$s['id'],
                'type' => 'statue',
                'color' => $s['color'],
                'dest_q' => (int)$adjacentIsland['q'],
                'dest_r' => (int)$adjacentIsland['r'],
            ];
        }
        return $result;
    }

    private function allDiceUsed(int $playerId): bool
    {
        $unused = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM oracle_die WHERE player_id = $playerId AND is_used = 0"
        );
        return $unused === 0;
    }

    /**
     * Complete a matching Zeus tile for this action.
     * For offerings: match task_type='offering' with task_color matching offering color (or NULL for "any").
     * For statues: match task_type='statue' (no color — statue tiles are generic).
     */
    private function completeZeusTile(int $playerId, string $actionType, string $itemColor): ?int
    {
        if ($actionType === 'offering') {
            $safeColor = addslashes($itemColor);
            // Try specific color match first
            $zeusTile = $this->game->getObjectFromDB(
                "SELECT tile_id FROM zeus_tile
                 WHERE player_id = $playerId AND task_type = 'offering'
                 AND task_color = '$safeColor' AND is_completed = 0
                 LIMIT 1"
            );
            if (!$zeusTile) {
                // Fall back to "any" offering tile
                $zeusTile = $this->game->getObjectFromDB(
                    "SELECT tile_id FROM zeus_tile
                     WHERE player_id = $playerId AND task_type = 'offering'
                     AND task_color IS NULL AND is_completed = 0
                     LIMIT 1"
                );
            }
        } else {
            // Statue tiles are generic (no color)
            $zeusTile = $this->game->getObjectFromDB(
                "SELECT tile_id FROM zeus_tile
                 WHERE player_id = $playerId AND task_type = 'statue'
                 AND is_completed = 0
                 LIMIT 1"
            );
        }

        if (!$zeusTile) return null;

        $tileId = (int)$zeusTile['tile_id'];
        $this->game->DbQuery("UPDATE zeus_tile SET is_completed = 1 WHERE tile_id = $tileId");
        $this->game->DbQuery(
            "UPDATE player SET tasks_completed = tasks_completed + 1 WHERE player_id = $playerId"
        );
        return $tileId;
    }

    #[PossibleAction]
    public function actConfirmDeliver(int $itemId, int $activePlayerId) {
        $actionType = $this->game->globals->get('cargo_action_type');
        $deliverableItems = $this->getArgs()['deliverableItems'];

        // Validate item is in deliverable list
        $selectedItem = null;
        foreach ($deliverableItems as $item) {
            if ($item['id'] === $itemId) {
                $selectedItem = $item;
                break;
            }
        }
        if (!$selectedItem) {
            throw new UserException(clienttranslate('You cannot deliver that item'));
        }

        $destQ = $selectedItem['dest_q'];
        $destR = $selectedItem['dest_r'];

        // DB update
        if ($actionType === 'offering') {
            $this->game->DbQuery(
                "UPDATE offering SET is_delivered = 1,
                        delivered_to_hex_q = $destQ, delivered_to_hex_r = $destR,
                        delivered_by_player_id = $activePlayerId
                 WHERE offering_id = $itemId"
            );
        } else {
            $this->game->DbQuery(
                "UPDATE statue SET is_raised = 1,
                        raised_at_hex_q = $destQ, raised_at_hex_r = $destR,
                        raised_by_player_id = $activePlayerId
                 WHERE statue_id = $itemId"
            );
        }

        // Mark die as used
        $dieIndex = $this->game->globals->get('selected_die_index');
        $this->game->DbQuery(
            "UPDATE oracle_die SET is_used = 1
             WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );
        $this->game->globals->set('selected_die_index', null);

        // Complete Zeus tile
        $completedTileId = $this->completeZeusTile($activePlayerId, $actionType, $selectedItem['color']);

        // Notifications
        $logMsg = $actionType === 'offering'
            ? clienttranslate('${player_name} delivers a ${color} offering to the temple')
            : clienttranslate('${player_name} raises a ${color} statue');

        $this->notify->all("deliverCargo", $logMsg, [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "item_id" => $itemId,
            "item_type" => $actionType,
            "color" => $selectedItem['color'],
            "dest_q" => $destQ,
            "dest_r" => $destR,
        ]);

        $this->notify->all("dieUsed", '', [
            "player_id" => $activePlayerId,
            "die_index" => $dieIndex,
        ]);

        if ($completedTileId !== null) {
            $this->notify->all("taskCompleted", clienttranslate('${player_name} completes a Zeus tile!'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "tile_id" => $completedTileId,
            ]);
        }

        // Rewards
        if ($actionType === 'offering') {
            // Award 3 Favor Tokens
            $this->game->DbQuery(
                "UPDATE player SET favor_tokens = favor_tokens + 3 WHERE player_id = $activePlayerId"
            );
            $newFavor = (int)$this->game->getUniqueValueFromDB(
                "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
            );
            $this->notify->all("favorTokensChanged", clienttranslate('${player_name} receives 3 Favor Tokens'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "favor_tokens" => $newFavor,
                "delta" => 3,
            ]);

            $this->game->globals->set('cargo_action_type', null);

            if ($this->allDiceUsed($activePlayerId)) {
                return ConsultOracle::class;
            }
            return PlayerActions::class;
        } else {
            // Statue: transition to SelectReward for companion card
            $this->game->globals->set('reward_type', 'companion');
            $this->game->globals->set('reward_color', $selectedItem['color']);
            $this->game->globals->set('cargo_action_type', null);
            return SelectReward::class;
        }
    }

    #[PossibleAction]
    public function actCancel(int $activePlayerId) {
        $this->game->globals->set('cargo_action_type', null);
        return SelectAction::class;
    }

    function zombie(int $playerId) {
        return $this->actCancel($playerId);
    }
}
```

- [ ] **Step 2: Verify no PHP syntax errors**

Run: `php -l modules/php/States/DeliverCargo.php`
Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/DeliverCargo.php
git commit -m "feat: implement DeliverCargo state with offering delivery and statue raising"
```

---

## Task 4: SelectReward — Companion Card Selection

**Files:**
- Modify: `modules/php/States/SelectReward.php`

### Context

Currently a skeleton. Needs to support companion card selection when `reward_type = 'companion'`. Companion cards are in the `card` table with `card_type = 'companion'`. Each color has 3 types (creature, demigod, hero) defined in `MaterialDefs::COMPANION_TYPES`. Card encoding: `card_type_arg = color_index * 3 + type_index` where color_index follows red=0, yellow=1, green=2, blue=3, pink=4, black=5.

The existing `CombatVictory.actSelectEquipment()` pattern (lines 48-137) is the reference for card selection + Zeus tile + transition logic.

### Steps

- [ ] **Step 1: Replace SelectReward.php with full implementation**

Replace the entire file content:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class SelectReward extends \Bga\GameFramework\States\GameState
{
    private const COLOR_INDEX = [
        'red' => 0, 'yellow' => 1, 'green' => 2,
        'blue' => 3, 'pink' => 4, 'black' => 5,
    ];

    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 39,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} selects reward'),
            descriptionMyTurn: clienttranslate('Select your reward'),
        );
    }

    public function getArgs(): array
    {
        $rewardType = $this->game->globals->get('reward_type');
        $rewardColor = $this->game->globals->get('reward_color');

        if ($rewardType === 'companion' && $rewardColor) {
            return [
                'rewardType' => 'companion',
                'rewardColor' => $rewardColor,
                'availableCards' => $this->getAvailableCompanions($rewardColor),
            ];
        }

        // Equipment reward (from combat) — handled by CombatVictory, but keep as fallback
        return [
            'rewardType' => $rewardType,
            'rewardColor' => $rewardColor,
            'availableCards' => [],
        ];
    }

    private function getAvailableCompanions(string $color): array
    {
        $colorIndex = self::COLOR_INDEX[$color] ?? -1;
        if ($colorIndex < 0) return [];

        // Companion card_type_arg range for this color: colorIndex*3 to colorIndex*3+2
        $minArg = $colorIndex * 3;
        $maxArg = $minArg + 2;

        $cards = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'companion' AND card_location = 'deck'
             AND card_type_arg >= $minArg AND card_type_arg <= $maxArg"
        );

        $result = [];
        foreach ($cards as $card) {
            $typeIndex = (int)$card['card_type_arg'] - $minArg;
            $companionType = MaterialDefs::COMPANION_TYPES[$typeIndex] ?? null;
            $result[] = [
                'card_id' => (int)$card['card_id'],
                'card_type_arg' => (int)$card['card_type_arg'],
                'subtype' => $companionType ? $companionType['subtype'] : 'unknown',
                'description' => $companionType ? $companionType['description'] : '',
                'color' => $color,
            ];
        }
        return $result;
    }

    private function allDiceUsed(int $playerId): bool
    {
        $unused = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM oracle_die WHERE player_id = $playerId AND is_used = 0"
        );
        return $unused === 0;
    }

    #[PossibleAction]
    public function actSelectReward(int $card_id, int $activePlayerId) {
        $rewardType = $this->game->globals->get('reward_type');

        if ($rewardType === 'companion') {
            return $this->selectCompanion($card_id, $activePlayerId);
        }

        throw new UserException(clienttranslate('Unknown reward type'));
    }

    private function selectCompanion(int $cardId, int $activePlayerId): string
    {
        $rewardColor = $this->game->globals->get('reward_color');
        $availableCards = $this->getAvailableCompanions($rewardColor);

        // Validate card is available
        $selectedCard = null;
        foreach ($availableCards as $card) {
            if ($card['card_id'] === $cardId) {
                $selectedCard = $card;
                break;
            }
        }
        if (!$selectedCard) {
            throw new UserException(clienttranslate('That companion card is not available'));
        }

        // Move card to player's hand
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
             WHERE card_id = $cardId"
        );

        $this->notify->all("companionSelected", clienttranslate('${player_name} takes a ${subtype} companion'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_id" => $cardId,
            "card_type_arg" => $selectedCard['card_type_arg'],
            "subtype" => $selectedCard['subtype'],
            "color" => $rewardColor,
        ]);

        // Clear reward globals
        $this->game->globals->set('reward_type', null);
        $this->game->globals->set('reward_color', null);

        if ($this->allDiceUsed($activePlayerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        // Skip reward (shouldn't normally happen but keep as safety valve)
        $this->game->globals->set('reward_type', null);
        $this->game->globals->set('reward_color', null);

        if ($this->allDiceUsed($activePlayerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        // Auto-select first available companion
        $rewardColor = $this->game->globals->get('reward_color');
        if ($rewardColor) {
            $availableCards = $this->getAvailableCompanions($rewardColor);
            if (!empty($availableCards)) {
                return $this->selectCompanion($availableCards[0]['card_id'], $playerId);
            }
        }
        return $this->actPass($playerId);
    }
}
```

- [ ] **Step 2: Verify no PHP syntax errors**

Run: `php -l modules/php/States/SelectReward.php`
Expected: `No syntax errors detected`

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/SelectReward.php
git commit -m "feat: implement SelectReward with companion card selection for statue delivery"
```

---

## Task 5: JS — Action Buttons for Cargo Actions in SelectAction

**Files:**
- Modify: `theoracleofdelphigzed.js`

### Context

The `onUpdateActionButtons` switch at line 844 needs new cases for cargo action buttons. Follow the existing pattern at lines 856-877 where SelectAction adds "Move Ship", "Fight Monster", and "Cancel" buttons.

New buttons should only appear when the corresponding `getArgs()` data has valid items.

### Steps

- [ ] **Step 1: Add cargo action buttons to SelectAction case**

In `onUpdateActionButtons`, within the `case 'SelectAction':` block (after the fight monster buttons, before the Cancel button at line 874), add:

```javascript
// Load Offering button
if (args && args.loadableOfferings && args.loadableOfferings.length > 0) {
    this.statusBar.addActionButton(_('Load Offering'), () => {
        this.bgaPerformAction("actLoadOffering", {});
    });
}
// Make Offering button
if (args && args.deliverableOfferings && args.deliverableOfferings.length > 0) {
    this.statusBar.addActionButton(_('Make Offering'), () => {
        this.bgaPerformAction("actMakeOffering", {});
    });
}
// Load Statue button
if (args && args.loadableStatues && args.loadableStatues.length > 0) {
    this.statusBar.addActionButton(_('Load Statue'), () => {
        this.bgaPerformAction("actLoadStatue", {});
    });
}
// Raise Statue button
if (args && args.deliverableStatues && args.deliverableStatues.length > 0) {
    this.statusBar.addActionButton(_('Raise Statue'), () => {
        this.bgaPerformAction("actRaiseStatue", {});
    });
}
```

- [ ] **Step 2: Add LoadCargo and DeliverCargo state button cases**

In `onUpdateActionButtons`, add new cases after the MoveShip case (after line 883):

```javascript
case 'LoadCargo':
    if (args && args.validItems) {
        args.validItems.forEach(item => {
            var label = _('Load') + ' ' + item.color + ' ' + item.type;
            this.statusBar.addActionButton(label, () => {
                this.bgaPerformAction("actConfirmLoad", { itemId: item.id });
            });
        });
    }
    this.statusBar.addActionButton(_('Cancel'), () => {
        this.bgaPerformAction("actCancel", {});
    }, { color: 'secondary' });
    break;

case 'DeliverCargo':
    if (args && args.deliverableItems) {
        args.deliverableItems.forEach(item => {
            var actionWord = item.type === 'offering' ? _('Deliver') : _('Raise');
            var label = actionWord + ' ' + item.color + ' ' + item.type;
            this.statusBar.addActionButton(label, () => {
                this.bgaPerformAction("actConfirmDeliver", { itemId: item.id });
            });
        });
    }
    this.statusBar.addActionButton(_('Cancel'), () => {
        this.bgaPerformAction("actCancel", {});
    }, { color: 'secondary' });
    break;

case 'SelectReward':
    if (args && args.rewardType === 'companion' && args.availableCards) {
        args.availableCards.forEach(card => {
            this.statusBar.addActionButton(card.subtype + ' (' + card.color + ')', () => {
                this.bgaPerformAction("actSelectReward", { card_id: card.card_id });
            });
        });
    }
    this.statusBar.addActionButton(_('Skip'), () => {
        this.bgaPerformAction("actPass", {});
    }, { color: 'secondary' });
    break;
```

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat: add cargo action buttons to JS state handlers"
```

---

## Task 6: JS — State Entry Visual Highlighting

**Files:**
- Modify: `theoracleofdelphigzed.js`
- Modify: `theoracleofdelphigzed.css`

### Context

When entering LoadCargo or DeliverCargo states, valid targets should be visually highlighted. Follow the `MoveShip` pattern (lines 785-797) which adds overlays and stores state for click handling.

For LoadCargo: highlight offerings/statues on the board.
For DeliverCargo: highlight cargo items in ship storage.

### Steps

- [ ] **Step 1: Add onEnteringState handlers for cargo states**

In `onEnteringState`, add cases after the MoveShip case (after line 798):

```javascript
case 'LoadCargo':
    if (this.isCurrentPlayerActive() && args.args) {
        var items = args.args.validItems || [];
        var self = this;
        items.forEach(item => {
            var elId = item.type === 'offering' ? 'offering_' + item.id : 'statue_' + item.id;
            var el = document.getElementById(elId);
            if (el) {
                el.classList.add('cargo-selectable');
                el.addEventListener('click', function handler() {
                    el.removeEventListener('click', handler);
                    self.bgaPerformAction("actConfirmLoad", { itemId: item.id });
                });
            }
        });
        this._cargoSelectableItems = items;
    }
    break;

case 'DeliverCargo':
    if (this.isCurrentPlayerActive() && args.args) {
        var deliverItems = args.args.deliverableItems || [];
        var self = this;
        // Highlight cargo items in ship storage and add click handlers
        this.components.cargoItems.forEach((data, slotIndex) => {
            deliverItems.forEach(item => {
                if (data.type === item.type && data.color === item.color) {
                    data.element.classList.add('cargo-selectable');
                    data.element.addEventListener('click', function handler() {
                        data.element.removeEventListener('click', handler);
                        self.bgaPerformAction("actConfirmDeliver", { itemId: item.id });
                    });
                }
            });
        });
    }
    break;
```

- [ ] **Step 2: Add onLeavingState cleanup for cargo states**

In `onLeavingState`, add cases after the MoveShip case (after line 831):

```javascript
case 'LoadCargo':
    document.querySelectorAll('.cargo-selectable').forEach(el => {
        el.classList.remove('cargo-selectable');
    });
    this._cargoSelectableItems = null;
    break;

case 'DeliverCargo':
    document.querySelectorAll('.cargo-selectable').forEach(el => {
        el.classList.remove('cargo-selectable');
    });
    break;
```

- [ ] **Step 3: Add CSS highlighting styles**

In `theoracleofdelphigzed.css`, add at the end of file:

```css
/* Cargo action target highlighting */
.cargo-selectable {
    outline: 3px solid #FFD700;
    outline-offset: 2px;
    animation: cargo-pulse 1.2s ease-in-out infinite;
    cursor: pointer;
    z-index: 10;
    position: relative;
}

@keyframes cargo-pulse {
    0%, 100% { outline-color: #FFD700; box-shadow: 0 0 6px rgba(255, 215, 0, 0.4); }
    50% { outline-color: #FFA500; box-shadow: 0 0 12px rgba(255, 165, 0, 0.6); }
}
```

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js theoracleofdelphigzed.css
git commit -m "feat: add visual highlighting for cargo action targets"
```

---

## Task 7: JS — Notification Handlers

**Files:**
- Modify: `theoracleofdelphigzed.js`

### Context

Notification handlers follow the `bgaSetupPromiseNotifications()` auto-discovery pattern. Each handler is an async method named `notif_<name>` that receives `args` directly (not wrapped). Existing patterns at lines 1094-1205.

Key animations needed:
- `notif_loadCargo`: remove item from board, add to ship storage
- `notif_deliverCargo`: remove from ship storage (item is now delivered/raised)
- `notif_favorTokensChanged`: update favor counter badge
- `notif_companionSelected`: (placeholder — companion card UI not yet built)

The existing `notif_taskCompleted` at line 1120 already handles Zeus tile completion.

### Steps

- [ ] **Step 1: Add cargo notification handlers**

Add before the closing `notif_endTurn` handler (before line 1203):

```javascript
notif_loadCargo: async function(args) {
    console.log('notif_loadCargo', args);
    var itemId = args.item_id;
    var itemType = args.item_type;

    // Remove from board
    if (itemType === 'offering') {
        this.components.removeOffering(itemId);
    } else {
        this.components.removeStatue(itemId);
    }

    // Add to ship storage (for the player who loaded)
    this.components.addToShipStorage(itemType, args.color);
},

notif_deliverCargo: async function(args) {
    console.log('notif_deliverCargo', args);
    // Remove from ship storage — find matching cargo slot
    var found = false;
    this.components.cargoItems.forEach((data, slotIndex) => {
        if (!found && data.type === args.item_type && data.color === args.color) {
            this.components.removeFromShipStorage(slotIndex);
            found = true;
        }
    });
},

notif_favorTokensChanged: async function(args) {
    console.log('notif_favorTokensChanged', args);
    if (args.player_id == this.player_id) {
        var badge = document.querySelector('.favor-count-badge');
        if (badge) badge.textContent = args.favor_tokens;
    }
},

notif_companionSelected: async function(args) {
    console.log('notif_companionSelected', args);
    // Companion card visual handling — placeholder until companion UI is built
},
```

- [ ] **Step 2: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat: add JS notification handlers for cargo load/deliver actions"
```

---

## Task 8: Integration Verification

**Files:** None (verification only)

### Steps

- [ ] **Step 1: Verify all PHP files have no syntax errors**

Run:
```bash
php -l modules/php/States/SelectAction.php && \
php -l modules/php/States/LoadCargo.php && \
php -l modules/php/States/DeliverCargo.php && \
php -l modules/php/States/SelectReward.php
```
Expected: All `No syntax errors detected`

- [ ] **Step 2: Verify state ID consistency**

Confirm these state IDs are unchanged:
- SelectAction: 21
- LoadCargo: 34
- DeliverCargo: 35
- SelectReward: 39

- [ ] **Step 3: Verify all action methods have #[PossibleAction] attribute**

Check that every `act*` method in the modified files has `#[PossibleAction]`.

- [ ] **Step 4: Verify all activeplayer states have zombie() method**

Check that LoadCargo, DeliverCargo, and SelectReward all have `zombie()` methods.

- [ ] **Step 5: Verify notification name consistency PHP ↔ JS**

PHP sends these notifications:
- `loadCargo` → JS has `notif_loadCargo`
- `deliverCargo` → JS has `notif_deliverCargo`
- `dieUsed` → JS has `notif_dieUsed` (existing)
- `taskCompleted` → JS has `notif_taskCompleted` (existing)
- `favorTokensChanged` → JS has `notif_favorTokensChanged`
- `companionSelected` → JS has `notif_companionSelected`

- [ ] **Step 6: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: cargo action integration fixes"
```
