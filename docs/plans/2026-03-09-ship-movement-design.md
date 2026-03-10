# Ship Movement Design (Phase 4a)

**Goal:** Players can select an oracle die, choose "Move Ship", pick a destination hex, and have their ship animate to the new position.

## Movement Rules

- Base range: 3 hexes (5 with ship tile #5 `range_plus_2`)
- Passable hexes: `tile_type = 'water'` only
- Shallows are **impassable** (exceptions: game start on Zeus hex, return-to-Zeus after all tasks, specific equipment card — all deferred)
- Water hexes can hold any number of ships — no blocking
- Path must exist through water hexes (BFS validation, not just distance check)
- Die is consumed only on successful move, not on selection

## State Flow

```
PlayerActions(20) → actSelectDie(dieIndex) → SelectAction(21)
SelectAction(21) → actMoveShip() → MoveShip(30)
MoveShip(30) → actConfirmMove(q, r) → PlayerActions(20)

Cancel at any point → PlayerActions(20), die not consumed
```

## Server Side

### HexPathfinder (new: `modules/php/HexPathfinder.php`)

Reusable pathfinding utility. Loads hex grid from DB, runs BFS.

```
HexPathfinder::getReachableHexes(startQ, startR, maxRange) → [{q, r, distance}, ...]
```

- Query all water hexes from `hex` table (tile_type = 'water')
- BFS from start position, expanding through 6 axial neighbors
- Only expand into hexes that exist in the water set
- Return all reachable hexes within maxRange

Neighbor directions (pointy-top axial):
```
(0,-1), (+1,-1), (+1,0), (0,+1), (-1,+1), (-1,0)
```

### PlayerActions.php (state 20) — add actions

- `actSelectDie(int $dieIndex)`: validate die belongs to player, not yet used. Store `selected_die_index` in globals. Transition to SelectAction.
- `actEndTurn()`: rename from actPass. Transition to ConsultOracle.

### SelectAction.php (state 21) — add actions

- `actMoveShip()`: transition to MoveShip(30). No validation needed here (just routing).
- `actCancelDieSelection()`: clear `selected_die_index` global. Return to PlayerActions(20).
- `getArgs()`: return selected die info (color, index) for client UI.

### MoveShip.php (state 30) — add actions

- `getArgs()`: compute reachable hexes via HexPathfinder, return `{reachableHexes, shipQ, shipR, range}`.
- `actConfirmMove(int $q, int $r)`: validate (q,r) is in reachable set, update `player.ship_q/ship_r`, mark die `is_used = 1`, notify `shipMoved`, return to PlayerActions(20).
- `actPass()`: cancel — return to PlayerActions(20) via SelectAction cancel flow.

### Globals

- `selected_die_index` (int): which die the player selected (0, 1, 2). Set by actSelectDie, cleared on cancel or action completion.

## Client Side

### onEnteringState handlers

**playerActions**: show oracle dice as clickable. Add "End Turn" button.

**selectAction**: show available action buttons based on die color + board state. For now, just "Move Ship" and "Cancel".

**moveShip**: receive reachable hexes from `getArgs()`. Call `hexGrid.highlightReachableHexes()`. Add hex click handler. Add "Cancel" button.

### Hex interaction in moveShip state

1. Player clicks highlighted hex → show path preview via `hexGrid.highlightPath()`
2. Show "Move here" / "Cancel" buttons
3. "Move here" → `bgaPerformAction("actConfirmMove", {q, r})`
4. "Cancel" → clear preview, return to hex selection

### Notification: notif_shipMoved

Already wired in setupNotifications. Update to:
- If `args.player_id === this.player_id` → animate (CSS transition)
- Otherwise → snap to position (instant update)
- Always update `this.shipPositions[args.player_id]`

### Components.js update

`moveShip(playerId, x, y, animate)` already exists. The `animate` flag controls CSS transition. No changes needed — the notification handler passes the correct flag.

## Files Summary

| File | Action |
|------|--------|
| `modules/php/HexPathfinder.php` | CREATE — BFS pathfinding utility |
| `modules/php/States/PlayerActions.php` | MODIFY — add actSelectDie, rename actPass→actEndTurn |
| `modules/php/States/SelectAction.php` | MODIFY — add actMoveShip, actCancelDieSelection, getArgs |
| `modules/php/States/MoveShip.php` | MODIFY — add actConfirmMove, getArgs |
| `theoracleofdelphigzed.js` | MODIFY — state handlers, hex click, die click |
