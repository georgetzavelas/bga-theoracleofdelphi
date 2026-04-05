# Oracle Card Usage — Play as Wild Die

## Summary

Players can play an oracle card from hand as a "virtual die" of that card's color, granting one bonus action per turn beyond the standard 3 dice. The card is discarded after the action resolves. No recoloring allowed on oracle cards.

## Rules

- From the `PlayerActions` state, a player may play an oracle card **instead of** selecting a die
- The card's color determines available actions, identical to how a die's color works
- **One oracle card per turn** maximum
- Card is **discarded** (moved to `discard` location) after the action resolves
- **No recoloring** — the card's color is fixed; `actRecolorDie` is unavailable when the action source is an oracle card
- All standard actions are available (move, fight, load, deliver, explore, discard injuries, advance god, draw oracle card, take favor, look at islands)

## State Machine Changes

### Globals (new)

| Global | Type | Purpose |
|--------|------|---------|
| `oracle_card_played` | bool (0/1) | Whether an oracle card has been played this turn |
| `selected_oracle_card_id` | int | Card ID of the oracle card being used (0 = none, using a die) |

### PlayerActions (state 20)

**`argPlayerActions()`** — add to returned args:
- `oracleCardsInHand`: array of `{cardId, color}` for oracle cards in the active player's hand
- `canPlayOracleCard`: `true` if player has oracle cards AND `oracle_card_played == 0`

**New action: `actPlayOracleCard(int $cardId)`**
1. Validate card exists in player's hand with `card_type = 'oracle'`
2. Validate `oracle_card_played == 0`
3. Set globals: `oracle_card_played = 1`, `selected_oracle_card_id = $cardId`
4. Read card color from `card_type_arg` (color index)
5. Send notification: `oracleCardPlayed` with `{cardId, color, playerId}`
6. Transition to `SelectAction`

### SelectAction (state 21)

**`getArgs()` changes:**
- Check `selected_oracle_card_id` global
- If non-zero: read color from the oracle card instead of from `oracle_die` table
- Exclude `actRecolorDie` from available actions when source is an oracle card

**Action completion changes (all `act*` methods):**
- After performing the action, check `selected_oracle_card_id`:
  - If non-zero: move the oracle card to `discard` location, reset `selected_oracle_card_id = 0`, send `oracleCardDiscarded` notification
  - If zero: mark die as used (existing behavior)

**`actCancelDieSelection()` changes:**
- If `selected_oracle_card_id` is non-zero: reset it to 0, reset `oracle_card_played = 0`, send `oracleCardCancelled` notification (card returns to hand)
- If zero: existing die cancel behavior

### Turn Transition

**`PlayerTurnStart` or `RoundStart`:**
- Reset `oracle_card_played = 0`, `selected_oracle_card_id = 0`

**`PlayerActions` → `ConsultOracle` transition logic:**
- Current: transition when all 3 dice are used
- New: transition when all 3 dice are used AND (`canPlayOracleCard == false` OR player chooses to end turn)
- Note: player may still have oracle cards but choose not to play one. The existing "Consult Oracle" / end-turn button handles this — it's already available alongside die selection.

## Client-Side Changes

### PlayerActions UI

**Oracle card clickability:**
- When `canPlayOracleCard` is true, oracle cards in `#delphi-oracle-cards-area` become clickable (add `selectable` class + click handler)
- Clicking sends `actPlayOracleCard` with the card ID
- Visual: highlight oracle cards with same selection glow used for dice

### SelectAction UI

**Played card display:**
- On `oracleCardPlayed` notification: call existing `Components.playOracleCard(color)` to show the card in `#delphi-played-oracle-card` and remove from hand
- Hide recolor option in action menu

### Action Resolution

- On `oracleCardDiscarded` notification: call existing `Components.clearPlayedOracleCard()`
- On `oracleCardCancelled` notification: move card back to hand via `Components.addOracleCardToHand(color)` and `Components.clearPlayedOracleCard()`

### Turn End

- `clearPlayedOracleCard()` already called at turn end — no change needed

## Notifications

| Notification | Data | Client Action |
|-------------|------|---------------|
| `oracleCardPlayed` | `{cardId, color, playerId}` | `playOracleCard(color)`, remove from hand, update card count |
| `oracleCardDiscarded` | `{cardId, playerId}` | `clearPlayedOracleCard()` |
| `oracleCardCancelled` | `{cardId, color, playerId}` | `addOracleCardToHand(color)`, `clearPlayedOracleCard()` |

## Files to Modify

| File | Changes | Size |
|------|---------|------|
| `modules/php/States/PlayerActions.php` | Add `actPlayOracleCard`, update args | M |
| `modules/php/States/SelectAction.php` | Oracle card color source, disable recolor, discard on action complete, cancel handling | M |
| `modules/php/States/PlayerTurnStart.php` | Reset globals | S |
| `modules/php/Game.php` | Register new globals, register action | S |
| `theoracleofdelphigzed.js` | Oracle card click handlers, notification handlers | M |
| `modules/js/Components.js` | Add `selectable` class toggling for oracle cards (methods already exist) | S |

## Edge Cases

- **Player has oracle cards but all are same color as already-used actions**: still allowed to play — the card opens new action choices or duplicates
- **Cancel after playing oracle card**: card returns to hand, `oracle_card_played` resets to 0, player can select a die or play a (possibly different) oracle card
- **Page refresh mid-oracle-card-action**: `getAllDatas` already returns hand cards; globals persist in DB; `SelectAction` args will correctly read from oracle card if `selected_oracle_card_id` is set
- **No oracle cards in hand**: `canPlayOracleCard = false`, no UI change, standard dice-only flow
