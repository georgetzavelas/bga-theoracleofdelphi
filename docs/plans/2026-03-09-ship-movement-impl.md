# Ship Movement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up die selection → ship movement → server validation so players can move their ships on the board.

**Architecture:** Server-side BFS pathfinder validates movement legality. Client already has hex highlighting, ship animation, and click handlers — we wire them to server actions via bgaPerformAction instead of local-only DOM updates.

**Tech Stack:** PHP 8.1+ (BGA GameState classes, globals), JavaScript (BGA client framework, existing HexGrid.js BFS)

---

## Implementer Notes

- **Client-side infrastructure already exists:** `onShipClick`, `showShipRange`, `moveShipToHex`, `onHexClick`, `notif_shipMoved` are all implemented. The main client change is wiring `moveShipToHex` to call the server.
- **BGA action pattern:** `bgaPerformAction("actMethodName", {param: value})` on client → `#[PossibleAction] public function actMethodName(int $param, int $activePlayerId)` on server.
- **Globals pattern:** `$this->globals->set('key', value)` / `$this->globals->get('key')`.
- **Notification pattern:** `$this->notify->all("notifName", clienttranslate('message'), [...data])`.
- **State transitions:** Action methods return next state class (e.g., `return PlayerActions::class`).
- **Oracle die table:** `oracle_die` with columns `die_id, player_id, die_index (0-2), color, original_color, is_used`.
- **Player ship position:** `player.ship_q`, `player.ship_r` columns.
- **Hex table:** `hex` with `q, r, tile_type` — passable tiles have `tile_type = 'water'`.
- **Ship tile #5** (`range_plus_2`): stored in `player.ship_tile_id`, look up in `MaterialDefs::SHIP_TILES`.

## Dependency Graph

```
Task 1 (HexPathfinder.php) ──┐
                              ├── Task 3 (MoveShip.php) ── Task 5 (client wiring) ── Task 6 (lint+test)
Task 2 (PlayerActions + SelectAction) ─┘
```

Tasks 1 and 2 are independent.

---

### Task 1: Create HexPathfinder.php

**Files:**
- Create: `modules/php/HexPathfinder.php`

**Step 1: Create the pathfinder class**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed;

class HexPathfinder
{
    /** Pointy-top axial hex neighbor directions */
    private const DIRECTIONS = [
        [0, -1], [1, -1], [1, 0],
        [0, 1], [-1, 1], [-1, 0],
    ];

    /** @var array<string, true> Set of passable hex keys "q,r" */
    private array $passableSet = [];

    /**
     * Load passable hexes from DB. Call once per request.
     * @param list<array{q: string, r: string}> $hexRows rows from hex table
     */
    public function loadWaterHexes(array $hexRows): void
    {
        $this->passableSet = [];
        foreach ($hexRows as $row) {
            $this->passableSet[(int)$row['q'] . ',' . (int)$row['r']] = true;
        }
    }

    /**
     * BFS from start position, returning all reachable hexes within maxRange.
     * @return array<string, int> Map of "q,r" => distance
     */
    public function getReachableHexes(int $startQ, int $startR, int $maxRange): array
    {
        $startKey = "$startQ,$startR";
        $distances = [$startKey => 0];
        $queue = [[$startQ, $startR]];
        $head = 0;

        while ($head < count($queue)) {
            [$q, $r] = $queue[$head++];
            $dist = $distances["$q,$r"];

            if ($dist >= $maxRange) {
                continue;
            }

            foreach (self::DIRECTIONS as [$dq, $dr]) {
                $nq = $q + $dq;
                $nr = $r + $dr;
                $nKey = "$nq,$nr";

                if (isset($this->passableSet[$nKey]) && !isset($distances[$nKey])) {
                    $distances[$nKey] = $dist + 1;
                    $queue[] = [$nq, $nr];
                }
            }
        }

        // Remove starting hex from results
        unset($distances[$startKey]);
        return $distances;
    }

    /**
     * Check if a specific hex is reachable within range.
     */
    public function isReachable(int $startQ, int $startR, int $targetQ, int $targetR, int $maxRange): bool
    {
        $reachable = $this->getReachableHexes($startQ, $startR, $maxRange);
        return isset($reachable["$targetQ,$targetR"]);
    }
}
```

**Step 2: Verify with lint**

Run: `php -l modules/php/HexPathfinder.php`

---

### Task 2: Update PlayerActions.php and SelectAction.php

**Files:**
- Modify: `modules/php/States/PlayerActions.php`
- Modify: `modules/php/States/SelectAction.php`

**Step 1: Update PlayerActions.php — add die selection + end turn**

Replace the entire class body with:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;

class PlayerActions extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 20,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may perform actions'),
            descriptionMyTurn: clienttranslate('${you} may perform actions'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $dice = $this->game->getObjectListFromDB(
            "SELECT die_index, color, is_used FROM oracle_die WHERE player_id = $playerId ORDER BY die_index"
        );
        return [
            'dice' => $dice,
        ];
    }

    #[PossibleAction]
    public function actSelectDie(int $die_index, int $activePlayerId) {
        // Validate die exists and is not used
        $die = $this->game->getObjectFromDB(
            "SELECT die_id, color, is_used FROM oracle_die
             WHERE player_id = $activePlayerId AND die_index = $die_index"
        );
        if ($die === null) {
            throw new UserException('Invalid die');
        }
        if ((int)$die['is_used'] === 1) {
            throw new UserException('This die has already been used');
        }

        // Store selected die for subsequent action states
        $this->game->globals->set('selected_die_index', $die_index);

        $this->notify->all("dieSelected", clienttranslate('${player_name} selects a ${die_color} die'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "die_color" => $die['color'],
            "die_index" => $die_index,
        ]);

        return SelectAction::class;
    }

    #[PossibleAction]
    public function actEndTurn(int $activePlayerId) {
        $this->notify->all("endTurn", clienttranslate('${player_name} ends their turn'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return ConsultOracle::class;
    }

    function zombie(int $playerId) {
        return $this->actEndTurn($playerId);
    }
}
```

**Step 2: Update SelectAction.php — add movement routing + cancel**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class SelectAction extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 21,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} selects action'),
            descriptionMyTurn: clienttranslate('Select action for die'),
        );
    }

    public function getArgs(): array
    {
        $dieIndex = $this->game->globals->get('selected_die_index');
        $playerId = (int)$this->game->getActivePlayerId();
        $die = $this->game->getObjectFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        return [
            'dieIndex' => $dieIndex,
            'dieColor' => $die ? $die['color'] : null,
        ];
    }

    #[PossibleAction]
    public function actMoveShip(int $activePlayerId) {
        return MoveShip::class;
    }

    #[PossibleAction]
    public function actCancelDieSelection(int $activePlayerId) {
        $this->game->globals->set('selected_die_index', null);
        $this->notify->all("dieCancelled", clienttranslate('${player_name} cancels die selection'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actCancelDieSelection($playerId);
    }
}
```

**Step 3: Verify with lint**

Run: `php -l modules/php/States/PlayerActions.php modules/php/States/SelectAction.php`

---

### Task 3: Update MoveShip.php with real movement logic

**Files:**
- Modify: `modules/php/States/MoveShip.php`

**Step 1: Replace MoveShip.php with full implementation**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\HexPathfinder;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class MoveShip extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 30,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} moves ship'),
            descriptionMyTurn: clienttranslate('Select destination hex'),
        );
    }

    private function getMovementRange(int $playerId): int
    {
        $shipTileId = $this->game->getUniqueValueFromDB(
            "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
        );
        $range = 3;
        if ($shipTileId !== null) {
            $tile = MaterialDefs::SHIP_TILES[(int)$shipTileId] ?? null;
            if ($tile && $tile['ability'] === 'range_plus_2') {
                $range = 5;
            }
        }
        return $range;
    }

    private function getPathfinder(): HexPathfinder
    {
        $pathfinder = new HexPathfinder();
        $waterHexes = $this->game->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE tile_type = 'water'"
        );
        $pathfinder->loadWaterHexes($waterHexes);
        return $pathfinder;
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $range = $this->getMovementRange($playerId);

        $pathfinder = $this->getPathfinder();
        $reachable = $pathfinder->getReachableHexes($shipQ, $shipR, $range);

        // Convert "q,r" => distance to [{q, r, distance}, ...]
        $reachableList = [];
        foreach ($reachable as $key => $dist) {
            [$q, $r] = explode(',', $key);
            $reachableList[] = ['q' => (int)$q, 'r' => (int)$r, 'distance' => $dist];
        }

        return [
            'shipQ' => $shipQ,
            'shipR' => $shipR,
            'range' => $range,
            'reachableHexes' => $reachableList,
        ];
    }

    #[PossibleAction]
    public function actConfirmMove(int $q, int $r, int $activePlayerId) {
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $activePlayerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];
        $range = $this->getMovementRange($activePlayerId);

        // Validate target is reachable via BFS
        $pathfinder = $this->getPathfinder();
        if (!$pathfinder->isReachable($shipQ, $shipR, $q, $r, $range)) {
            throw new UserException(clienttranslate('You cannot move there'));
        }

        // Update ship position
        $this->game->DbQuery(
            "UPDATE player SET ship_q = $q, ship_r = $r WHERE player_id = $activePlayerId"
        );

        // Mark die as used
        $dieIndex = $this->game->globals->get('selected_die_index');
        $this->game->DbQuery(
            "UPDATE oracle_die SET is_used = 1
             WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );

        // Clear selected die global
        $this->game->globals->set('selected_die_index', null);

        // Notify all players
        $this->notify->all("shipMoved", clienttranslate('${player_name} moves their ship'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "q" => $q,
            "r" => $r,
        ]);

        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        // Cancel movement — clear die selection, return to PlayerActions
        $this->game->globals->set('selected_die_index', null);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 2: Verify with lint**

Run: `php -l modules/php/States/MoveShip.php`

---

### Task 4: Register selected_die_index global

**Files:**
- Modify: `modules/php/Game.php`

**Step 1: Add global initialization in setupNewGame**

Find the comment `// Init global values with their initial values.` in setupNewGame() and add:

```php
$this->globals->set('selected_die_index', null);
```

---

### Task 5: Wire client-side to server actions

**Files:**
- Modify: `theoracleofdelphigzed.js`

This task updates the existing client code to call server actions instead of moving ships locally.

**Step 1: Update onEnteringState for moveShip**

In the `onEnteringState` switch, add/update the `moveShip` case:

```javascript
case 'moveShip':
    if (this.isCurrentPlayerActive()) {
        // Highlight reachable hexes from server args
        var reachable = args.args.reachableHexes;
        if (reachable && reachable.length > 0) {
            // Build distances map for hexGrid
            var distances = new Map();
            reachable.forEach(function(h) {
                distances.set(h.q + ',' + h.r, h.distance);
            });
            this.hexGrid.highlightReachableHexes(distances);
            this._moveShipReachable = new Set(reachable.map(function(h) {
                return h.q + ',' + h.r;
            }));
        }
    }
    break;
```

**Step 2: Update onLeavingState for moveShip**

```javascript
case 'moveShip':
    this.hexGrid.clearHighlights();
    this._moveShipReachable = null;
    break;
```

**Step 3: Update onUpdateActionButtons for states**

```javascript
case 'playerActions':
    this.statusBar.addActionButton('btn_end_turn', _('End Turn'), () => {
        this.bgaPerformAction("actEndTurn", {});
    });
    break;

case 'selectAction':
    this.statusBar.addActionButton('btn_move_ship', _('Move Ship'), () => {
        this.bgaPerformAction("actMoveShip", {});
    });
    this.statusBar.addActionButton('btn_cancel_die', _('Cancel'), () => {
        this.bgaPerformAction("actCancelDieSelection", {});
    }, null, false, 'gray');
    break;

case 'moveShip':
    this.statusBar.addActionButton('btn_cancel_move', _('Cancel'), () => {
        this.bgaPerformAction("actPass", {});
    }, null, false, 'gray');
    break;
```

**Step 4: Update onHexClick to call server in moveShip state**

In the existing `onHexClick` method, when in `moveShip` state and the hex is reachable:

```javascript
// Instead of local moveShipToHex(), call server:
if (this.currentState === 'moveShip' && this._moveShipReachable) {
    var key = q + ',' + r;
    if (this._moveShipReachable.has(key)) {
        this.bgaPerformAction("actConfirmMove", { q: q, r: r });
        return;
    }
}
```

**Step 5: Update notif_shipMoved for animate vs snap**

```javascript
notif_shipMoved: async function(args) {
    var center = this.getHexCenterPixel(args.q, args.r);
    if (center) {
        var isMe = (args.player_id == this.player_id);
        this.components.moveShip(args.player_id, center.x, center.y, isMe);
        this.shipPositions[args.player_id] = { q: args.q, r: args.r };
    }
}
```

**Step 6: Add die click handler for playerActions state**

Wire oracle die clicks to send `actSelectDie`:

```javascript
// In onEnteringState 'playerActions':
// Make dice clickable
case 'playerActions':
    if (this.isCurrentPlayerActive()) {
        var dice = args.args.dice;
        // Add click handlers to die elements
        dice.forEach(function(die) {
            if (parseInt(die.is_used) === 0) {
                var dieEl = document.getElementById('oracle-die-' + die.die_index);
                if (dieEl) {
                    dieEl.classList.add('die-selectable');
                    dieEl.addEventListener('click', function() {
                        this.bgaPerformAction("actSelectDie", { die_index: parseInt(die.die_index) });
                    }.bind(this));
                }
            }
        }.bind(this));
    }
    break;
```

And in `onLeavingState('playerActions')`, remove click handlers:

```javascript
case 'playerActions':
    document.querySelectorAll('.die-selectable').forEach(function(el) {
        el.classList.remove('die-selectable');
        el.replaceWith(el.cloneNode(true)); // removes event listeners
    });
    this.clearRangeOverlays();
    this.components.deselectShips();
    break;
```

---

### Task 6: PHP Lint + Smoke Test

**Step 1: Lint all modified PHP files**

Run: `php -l modules/php/HexPathfinder.php modules/php/States/PlayerActions.php modules/php/States/SelectAction.php modules/php/States/MoveShip.php`

Expected: No syntax errors.

**Step 2: Upload to BGA Studio and test**

1. Create new game
2. Should see "You may perform actions" state
3. Click an oracle die → should transition to "Select action for die"
4. Click "Move Ship" → should highlight reachable water hexes
5. Click a highlighted hex → ship should animate to new position
6. Should return to "You may perform actions" with die marked used

---

### Task 7: Commit

```bash
git add modules/php/HexPathfinder.php modules/php/States/PlayerActions.php modules/php/States/SelectAction.php modules/php/States/MoveShip.php modules/php/Game.php theoracleofdelphigzed.js docs/plans/2026-03-09-ship-movement-design.md docs/plans/2026-03-09-ship-movement-impl.md
git commit -m "feat: implement ship movement with die selection and server-side pathfinding (Phase 4a)"
```
