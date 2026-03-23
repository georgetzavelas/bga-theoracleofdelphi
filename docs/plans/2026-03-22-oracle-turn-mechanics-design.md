# Oracle & Turn Mechanics: Core Die Actions

## Goal

Add three die-related mechanics to SelectAction: Draw Oracle Card, Take Favor Tokens, and Recolor Die. These complete the core action economy — the things players use every turn.

## Design

### Draw Oracle Card

**Trigger:** Always available when a die is selected (no color restriction).

**Flow:**
1. "Draw Oracle Card" button appears in SelectAction
2. `actDrawOracleCard()` draws top card from oracle deck (lowest `card_order` where `card_location = 'deck'` and `card_type = 'oracle'`)
3. Moves card to player's hand (`card_location = 'hand'`, `card_location_arg = playerId`)
4. Spends the die
5. Sends `notif_oracleCardDrawn` with player_id, card color
6. Returns to PlayerActions or ConsultOracle if all dice used

**No separate state needed.**

**Frontend:** `notif_oracleCardDrawn` calls `components.addOracleCardToHand(color)`.

### Take Favor Tokens

**Trigger:** Always available when a die is selected (no color restriction).

**Flow:**
1. "Take Favor Tokens" button appears in SelectAction
2. `actTakeFavorTokens()` increments player's `favor_tokens` by 2
3. Ship tile ability `favor_bonus` gives +1 (total 3) — deferred to ship tile abilities phase
4. Spends the die
5. Sends `notif_favorTokensTaken` with player_id, new favor total, amount gained
6. Returns to PlayerActions or ConsultOracle if all dice used

**No separate state needed.**

**Frontend:** `notif_favorTokensTaken` calls `components.setFavorTokenCount(newTotal)`.

### Recolor Die

**Trigger:** "Recolor Die" button appears when player has ≥1 favor token.

**Oracle Wheel Order (clockwise):** red → black → pink → blue → yellow → green (wraps around)

**Cost:** Number of clockwise steps from current color to target color.

| From\To | red | black | pink | blue | yellow | green |
|---------|-----|-------|------|------|--------|-------|
| red     | -   | 1     | 2    | 3    | 4      | 5     |
| black   | 5   | -     | 1    | 2    | 3      | 4     |
| pink    | 4   | 5     | -    | 1    | 2      | 3     |
| blue    | 3   | 4     | 5    | -    | 1      | 2     |
| yellow  | 2   | 3     | 4    | 5    | -      | 1     |
| green   | 1   | 2     | 3    | 4    | 5      | -     |

**Flow:**
1. Player selects a die → enters SelectAction, status: "Select action for Pink die"
2. "Recolor Die" button appears (if favor ≥ 1)
3. Click → oracle wheel enters recolor mode: 5 other slots highlight with cost badges
4. Click a color slot → `actRecolorDie(targetColor)` validates favor, deducts cost, updates die's `color` (keeps `original_color` unchanged)
5. Sends `notif_dieRecolored` with die_index, new_color, favor_spent, new_favor_total
6. Returns to SelectAction — same die still selected, status text + buttons refresh for new color
7. Player can recolor again or pick an action

**No separate state needed.** Recoloring doesn't spend the die.

**Frontend:** CSS class `recolor-active` on oracle wheel highlights slots with cost badges. Click slot or "Cancel" exits recolor mode.

### Status Bar Text

SelectAction's `descriptionMyTurn` updated to: `'${you} must select an action for ${die_color} die'`

`getArgs()` passes the die color name (translated) so BGA substitutes it.

`COLOR_NAMES` constant in MaterialDefs maps color strings to `clienttranslate()` names.

## Constants

```php
// MaterialDefs.php
public const ORACLE_WHEEL_ORDER = ['red', 'black', 'pink', 'blue', 'yellow', 'green'];

public const COLOR_NAMES = [
    'red' => 'Red',
    'black' => 'Black',
    'pink' => 'Pink',
    'blue' => 'Blue',
    'yellow' => 'Yellow',
    'green' => 'Green',
];
```

## Deferred

- Oracle card usage as wild die (play matching color card instead of die)
- Favor spending for extended ship range (+1 per favor)
- Favor bonus from ship tile ability (+1 when gaining favor)
- God advancement check at turn start (from previous oracle roll)
- No-injury bonus (2 favor OR advance god)
