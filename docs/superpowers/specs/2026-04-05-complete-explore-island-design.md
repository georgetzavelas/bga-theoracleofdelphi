# Complete Explore Island — Design Spec

## Summary

Complete the Explore Island action with three missing features:
1. **Own shrine visual placement** — animate shrine piece from player board to island hex
2. **Shrine Zeus tile reward** — advance any god by 1 step on tile completion
3. **Sigma and omega explorer bonuses** — implement the two deferred shrine letter bonuses

## Rules Reference

### Own Shrine (color matches player)
- Shrine piece moves from player board to the island hex (visual + DB already handled)
- Matching Zeus tile is completed
- **Reward for completing shrine Zeus tile**: advance any god by 1 step (no restrictions on which god or current row)

### Other Player's Shrine (color doesn't match, or no matching Zeus tile left)
Take a reward based on the Greek letter:
- **psi**: Take 4 Favor Tokens *(already implemented)*
- **phi**: Draw 2 Oracle Cards *(already implemented)*
- **sigma**: Advance 1 or more gods by a total of 3 steps (any gods, no restrictions, can split across multiple gods)
- **omega**: Discard all Injury Cards of a color of your choice, then increase Shield strength by 1. If no injuries, still get +1 shield.

---

## New States

### ChooseGodAdvancement (state id ~37, ACTIVE_PLAYER)

Generic state for "advance gods by N total steps with free choice." Used by:
- Shrine Zeus tile completion reward (1 step)
- Sigma explorer bonus (3 steps)

**Globals:**
- `god_steps_remaining` (int) — steps left to assign
- `god_advance_return_state` (string) — state class to return to when done (always `ExploreIsland::returnToActions` flow, stored as a flag like `'explore_return'`)

**`getArgs()`** returns:
- `stepsRemaining`: current value of `god_steps_remaining`
- `gods`: all 6 gods with `{godName, color, currentRow}` for the active player
- `reason`: display string ("Shrine reward" or "Sigma bonus")

**Actions:**
- `actAdvanceGod(string $godName)` — validate god exists, advance by 1, decrement `god_steps_remaining`. If row was 0, jump to player-count row (same logic as existing god advancement). If steps remain, re-enter `ChooseGodAdvancement`. If 0, clean up globals and return to actions.
- `actPass()` — forfeit remaining steps, clean up globals, return to actions.

**Client UI:** Show all 6 gods as buttons with current row. Player clicks to advance. Status bar shows "Advance a god (N steps remaining)". "Done" button to stop early.

### ChooseInjuryColor (state id ~38, ACTIVE_PLAYER)

State for omega bonus: pick an injury color to discard all of, then +1 shield.

**`getArgs()`** returns:
- `injuryColors`: array of distinct colors the player has injury cards for (e.g., `['red', 'blue']`)
- `hasInjuries`: boolean

**Actions:**
- `actChooseColor(string $color)` — validate player has injuries of that color. Discard all of that color. Increase shield by 1 (cap at 5). Send notifications for both. Return to actions.
- `actPass()` — for the case where player has no injuries (shouldn't reach this state, but safety). Just +1 shield and return.

**Client UI:** Show injury color options as buttons. Player clicks one. If no injuries, this state is skipped entirely (shield granted inline in ExploreIsland).

---

## ExploreIsland Changes

### `buildOwnShrine()` — after Zeus tile completion

Current flow ends with `return $this->returnToActions($playerId)`. New flow:

```
if ($completedTileId !== null) {
    // Set up god advancement reward (1 step)
    globals->set('god_steps_remaining', 1);
    globals->set('god_advance_reason', 'shrine_reward');
    return ChooseGodAdvancement::class;
}
return $this->returnToActions($playerId);
```

### `applyExplorerBonus()` — sigma case

Replace the deferred placeholder with:

```
case 'gods':
    globals->set('god_steps_remaining', 3);
    globals->set('god_advance_reason', 'sigma_bonus');
    return ChooseGodAdvancement::class;
```

### `applyExplorerBonus()` — omega case

Replace the deferred placeholder with:

```
case 'heal':
    // Check if player has any injuries
    $injuryCount = count of injuries in hand;
    if ($injuryCount > 0) {
        return ChooseInjuryColor::class;
    }
    // No injuries — just grant +1 shield
    increase shield by 1 (cap at 5);
    send notification;
    return $this->returnToActions($playerId);
```

---

## Shrine Visual Placement (Client-Side)

### `notif_shrineBuilt` handler

Currently a no-op. New behavior:

1. Find the shrine piece element on the player board (in `#delphi-shrine-slots`, the slot matching `shrine_index`)
2. Calculate the source position (player board slot) and destination position (island hex center on the board)
3. Animate the piece sliding from source to destination using CSS transform/transition or `this.slideToObject()`
4. On arrival, leave the shrine piece at the hex position as a permanent board piece (similar to how statues/offerings appear on hexes)

### Shrine piece on player board

The shrine slots in `#delphi-shrine-slots` currently show empty slots. Need to populate them with shrine piece images during `setup()` from gamedatas (`gamedatas.shrines` has `isBuilt` per shrine). Unbuilt shrines show the piece; built shrines show an empty slot.

### Shrine piece on island hex

After animation completes (or on page reload for already-built shrines), show a `shrine.png` piece at the hex center, using the same positioning pattern as offerings/statues on hexes. The piece is in the player's color to distinguish it.

### Page reload

On `setupShrinesFromGamedata`, check `gamedatas.shrines` for built shrines. For each built shrine with `builtQ`/`builtR`, place the piece directly on the hex (no animation). Don't show the piece on the player board slot.

---

## Notifications

| Notification | Data | Client Action |
|---|---|---|
| `shrineBuilt` (existing) | `{playerId, hex_q, hex_r, shrine_index, shrine_letter}` | Animate shrine piece from player board to hex |
| `godAdvanced` (existing) | `{playerId, god_name, new_row}` | Update god track token position |
| `injuriesDiscardedByChoice` (new) | `{playerId, color, count}` | Remove injury cards of that color from hand display |
| `shieldIncreased` (new) | `{playerId, new_shield_value}` | Update shield track marker |

---

## Files to Modify

| File | Changes | Size |
|---|---|---|
| `modules/php/States/ExploreIsland.php` | Update `buildOwnShrine` and `applyExplorerBonus` for new state transitions | M |
| `modules/php/States/ChooseGodAdvancement.php` | New state file | M |
| `modules/php/States/ChooseInjuryColor.php` | New state file | M |
| `theoracleofdelphigzed.js` | `notif_shrineBuilt` animation, new state UI handlers, shrine piece setup from gamedatas | L |
| `theoracleofdelphigzed.css` | Shrine piece styling on player board + hex board | S |
| `modules/js/Components.js` | Optional: shrine piece creation helpers | S |

## Edge Cases

- **God at max row (6)**: still shown as an option but advancing does nothing beyond row 6. The `actAdvanceGod` should cap at 6.
- **God at row 0**: advancing from row 0 jumps to `PLAYER_COUNT_ROW` (same as existing god advancement logic).
- **All gods at max**: player can pass immediately with "Done" button.
- **Omega with no injuries**: skip `ChooseInjuryColor` state entirely, grant +1 shield inline.
- **Shield at max (5)**: cap shield at 5 when granting +1.
- **Shrine piece animation during zoom/scroll**: use absolute board coordinates, not viewport-relative.
- **Page reload during ChooseGodAdvancement/ChooseInjuryColor**: states are ACTIVE_PLAYER with proper `getArgs()`, so BGA framework handles restore automatically.
