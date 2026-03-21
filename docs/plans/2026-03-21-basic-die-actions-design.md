# Basic Die Actions: Discard Injuries & Advance God

## Goal

Add two die-spending actions to SelectAction: discard injury cards and advance gods on the track. Both follow the same pattern as existing actions — button appears only when actionable, die is spent, state returns to PlayerActions or ConsultOracle.

## Design

### Discard Injuries

**Trigger:** Player has injury cards in hand matching the selected die's color.

**Flow:**
1. `SelectAction.getArgs()` includes `discardableInjuryCount` — count of injury cards in hand matching die color
2. If count > 0, a "Discard Injuries" button appears
3. `actDiscardInjuries()` moves ALL matching-color injury cards from hand to discard pile (batch discard per rulebook)
4. Spends the die
5. Sends `notif_injuriesDiscarded` with player_id, count, color
6. Returns to PlayerActions or ConsultOracle if all dice used

**No separate state needed** — resolves entirely within SelectAction action method.

**Frontend:** `notif_injuriesDiscarded` logs the message. Visual card removal deferred to injury card UI phase.

### Advance God

**Trigger:** A god matching the selected die's color has `track_row < 7` (not at max).

**Flow:**
1. `SelectAction.getArgs()` includes `advanceableGod` — god name if advanceable, null otherwise
2. If non-null, an "Advance [God Name]" button appears (e.g., "Advance Poseidon")
3. `actAdvanceGod(godName)` validates color match and row < 7, increments `track_row` by 1
4. Special case: advancing from row 0 jumps to `PLAYER_COUNT_ROW[playerCount]` instead of row 1
5. Spends the die
6. Sends `notif_godAdvanced` with player_id, god_name, new_row
7. Returns to PlayerActions or ConsultOracle if all dice used

**No separate state needed.**

**God abilities on reaching top row (row 7) are deferred** to the God Special Abilities phase.

### God Track Visual (Wire-Up)

The god track UI already exists in Components.js (`createGodToken`, `positionGodToken`, `advanceGodToken`), HTML template, CSS, and images. Just needs wiring:

1. **Setup:** Call `components.initializePlayerGods()` for each player during `setup()`, using `gamedatas.gods` to position tokens at their current rows
2. **Notification:** `notif_godAdvanced` calls `components.positionGodToken(playerId, godName, newRow)` to animate the marker

## Deferred

- God special ability effects (Phase 4 — God abilities)
- Injury card visual UI on player board
- Reaching top row notification/celebration
