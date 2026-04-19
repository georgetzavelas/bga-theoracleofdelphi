# fewer_tasks Ship Tile — Design

## Context

Ship tile 6 (`fewer_tasks`, defined in [MaterialDefs.php:59](../../../modules/php/MaterialDefs.php:59)) is one of three unimplemented ship tile abilities. Its rule text:

> Return a Zeus Tile of your choice to the box. You do not receive its reward. You require 11 completed tasks to win the game instead of 12.

The ship tile is dealt to at most one player per game (8 tiles are shuffled and dealt without duplicates; `fewer_tasks` is assigned to a single player only if the random draw includes tile id 6 within the first N tiles for N players).

The existing plan note in [MoveShip.php:48](../../../modules/php/States/MoveShip.php:48) anticipated wiring this ability via eligibility math, but the faithful-to-rules implementation is different: the player picks a tile to discard at setup time, which makes their Zeus board have 11 slots instead of 12 for the whole game.

## Architecture

One new active-player state class (`DiscardZeusTile`) that runs after `setupNewGame()` and before the normal first-round entry state, but only when a `fewer_tasks` player exists. Discarded tile is `DELETE`d from the `zeus_tile` table — no schema change. A single public notification (`zeusTileDiscarded`) drives client updates. The chooser's Zeus board renders with click-to-discard; everyone else sees a standard BGA "waiting on player" status.

All downstream mechanics (end-game eligibility, scoring tie-break, Zeus board rendering) work correctly for free because they all read existing rows from `zeus_tile` — with the row gone, counts and displays naturally reflect 11.

## State Machine

Add `modules/php/States/DiscardZeusTile.php` as an active-player state:

- `descriptionMyTurn`: *"Your ship tile requires you to return a Zeus tile to the box — pick one to discard. You won't receive its reward, and you'll win at 11 completed tasks."*
- `description` (shown to non-active players): *"${actplayer} is choosing a Zeus tile to discard (fewer_tasks ship tile)"*
- `getArgs()` returns `{ tiles: [...] }` — the active player's 12 tile rows with task_type, task_color, task_letter, sort_order, tile_id. Used to gate which tiles are clickable on the client (though any player tile is valid).
- `#[PossibleAction] actDiscardTile(int $tileId, int $activePlayerId)`:
  1. Load tile row via `getObjectFromDB` with `tile_id = $tileId AND player_id = $activePlayerId AND is_completed = 0`. Throw `UserException` if not found (defense against replay/corruption).
  2. Build log message composed from tile fields.
  3. Emit `zeusTileDiscarded` notification.
  4. `DELETE FROM zeus_tile WHERE tile_id = $tileId`.
  5. Return the same state class as the normal first-round entry (whatever state is reached after `setupNewGame` completes today — likely `RoundStart` or equivalent).
- `zombie()`: discard the tile with the lowest `sort_order` in the "offering" task group (arbitrary deterministic pick) to unblock the game.

### Entry routing

Modify `RoundStart::onEnteringState` in [RoundStart.php](../../../modules/php/States/RoundStart.php) to redirect to `DiscardZeusTile` when a pending `fewer_tasks` discard exists, then proceed normally to `PlayerTurnStart` afterward.

"Pending" detection: check whether the `fewer_tasks` player still has 12 `zeus_tile` rows (pre-discard state). Once the discard happens, the row count drops to 11 and subsequent `RoundStart` entries skip the check. This avoids adding a dedicated global flag.

```php
function onEnteringState(int $activePlayerId) {
    $pendingPlayerId = $this->findPendingFewerTasksPlayer();
    if ($pendingPlayerId !== null) {
        $this->game->gamestate->changeActivePlayer($pendingPlayerId);
        return DiscardZeusTile::class;
    }
    $this->notify->all("roundStart", clienttranslate('A new round begins'), []);
    return PlayerTurnStart::class;
}
```

`DiscardZeusTile::actDiscardTile` returns `RoundStart::class` when done (no infinite loop since `findPendingFewerTasksPlayer()` returns null after the delete). The initial "A new round begins" notification fires only after the discard is resolved, so the UX reads cleanly.

### State id

Next available id in the low range — RoundStart is 2, PlayerTurnStart is 3 (per [RoundStart.php:15](../../../modules/php/States/RoundStart.php:15) and conventions). A concrete id will be chosen during implementation based on free slots; likely in the 4–10 range.

## Data Model

No schema changes. `zeus_tile` already supports everything needed:

- `actDiscardTile` executes `DELETE FROM zeus_tile WHERE tile_id = $tileId AND player_id = $activePlayerId`.
- `getAllDatas()` (via `self::getObjectListFromDB("SELECT ... FROM zeus_tile ...")`) returns 11 rows for this player post-discard; the player board renders 11 slots automatically.
- `isEligibleForZeus()` in [MoveShip.php:51](../../../modules/php/States/MoveShip.php:51) counts `is_completed = 0` — with only 11 existing rows, eligibility triggers at 11 completed.
- `EndScore` tie-break aux score computes `tasks = COUNT(*) FROM zeus_tile WHERE player_id = ? AND is_completed = 1` (see [EndScore.php:49](../../../modules/php/States/EndScore.php:49)) — caps at 11 for this player naturally.

**Guardrail:** validate `player_id` ownership and `is_completed = 0` at the point of delete. Guarded against impossible-but-cheap scenarios (this state runs pre-round 1, so no tile can be completed yet).

## Client UX

### For the chooser (active player)

- Zeus tile elements are already rendered on page load from `gamedatas.zeusTiles`.
- On entering `DiscardZeusTile` state when active: attach click handlers to each of their 12 tile elements; add `.zeus-tile-discardable` class.
- CSS: `.zeus-tile-discardable` gets a hover outline and `cursor: pointer`.
- Status bar text comes from the state's `descriptionMyTurn` verbatim.
- Click → `bgaPerformAction("actDiscardTile", {tile_id})`. No confirm dialog (status text is explicit; pre-round tiles have no realized value yet to "accidentally" lose).

### For everyone else

- Standard BGA "waiting on player X" behavior uses the public state description. No custom UI.
- Chooser's Zeus board renders identically to its normal state (no discardable highlight).

### After discard (all clients)

- `notif_zeusTileDiscarded` finds the DOM element by `tile_id` and removes it. CSS Grid reflows automatically; no manual repositioning.
- `onLeavingState('DiscardZeusTile')` tears down the chooser's click handlers and removes the `.zeus-tile-discardable` class as a safety net.

### Reload during this state

- `onEnteringState` already fires on setup/reload via the standard BGA mechanism. The new case handler re-attaches click handlers when `isCurrentPlayerActive()`. Non-active players get the waiting status via the standard flow.

## Notifications & Logs

### `zeusTileDiscarded` (public)

```php
$this->notify->all("zeusTileDiscarded", $logMsg, [
    "player_id" => $activePlayerId,
    "player_name" => $this->game->getPlayerNameById($activePlayerId),
    "tile_id" => (int)$tile['tile_id'],
    "task_type" => $tile['task_type'],
    "task_color" => $tile['task_color'],
    "task_letter" => $tile['task_letter'],
]);
```

### Log message

> `${player_name} returns a ${task_description} Zeus tile to the box (fewer_tasks ship tile)`

`${task_description}` is composed client-side by a small formatter that maps `{task_type, task_color, task_letter}` to a human-readable string:

- `task_type = 'shrine'` → `"${letter} shrine"` (e.g., "Ψ shrine")
- `task_type = 'statue'` → `"${color} statue"` (e.g., "green statue")
- `task_type = 'offering'` → `"${color} offering"`
- `task_type = 'monster'` → `"${color} monster"` (color → monster name via `MaterialDefs::MONSTERS`)

The formatter reuses existing color-name maps on the client; the implementation plan will locate the right helper or add a new one if none fits.

### Client handler

Existing Zeus tile DOM is tracked in `this.components.zeusTiles` (a `Map` keyed by tile id, populated in [Components.js:2319](../../../modules/js/Components.js:2319)) and elements are also addressable via `document.getElementById('zeus_' + tileId)`. The handler reuses that:

```js
notif_zeusTileDiscarded: async function(args) {
    console.log('notif_zeusTileDiscarded', args);
    var el = this.components.zeusTiles.get(parseInt(args.tile_id));
    if (el) {
        el.remove();
        this.components.zeusTiles.delete(parseInt(args.tile_id));
    }
    // Safety net: if this is my tile, tear down any lingering click state.
    if (parseInt(args.player_id) === this.player_id) {
        document.querySelectorAll('.zeus-tile-discardable').forEach(e => {
            e.classList.remove('zeus-tile-discardable');
        });
    }
}
```

## Testing Notes

- Smoke test: 2-player game, simulate fewer_tasks dealt to P1 → P1 should see discard UI; P2 should see waiting status. P1 picks a tile → board updates to 11 for P1, P2 sees the same. Round 1 begins.
- Edge case: no player has fewer_tasks → state is skipped entirely; game flows directly from setup to round 1.
- Eligibility: P1 (with fewer_tasks) completes 11 tasks → qualifies for Zeus landing. Confirm `isEligibleForZeus` passes with 0 incomplete rows out of 11.
- Reload during discard state: P1 refreshes → click handlers re-attach, tile still discardable. P2 refreshes → still sees waiting status.

## Out of Scope

- The other two remaining ship tile abilities (`reverse_recolor`, `recolor_discount`).
- Audit trail / history feature for discarded tiles beyond the log message.
- A confirm dialog before the discard. If user testing reveals accidental discards are a problem, this can be added later.
- UI affordances indicating "you need 11 tasks to win" elsewhere in the app (e.g., on the Zeus tile group headers). Not a blocker — the log message and the 11-slot board are sufficient signal.
