# Oracle & Turn Mechanics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Draw Oracle Card, Take Favor Tokens, and Recolor Die as actions in SelectAction, completing the core action economy.

**Architecture:** All three actions resolve within SelectAction (no new state classes). Draw/Take are die-spending actions following the existing pattern (actMethod → spend die → notify → return to PlayerActions/ConsultOracle). Recolor doesn't spend a die — it updates the die color and returns to SelectAction so the player can pick an action at the new color. The oracle wheel gets a recolor interaction mode with cost badges.

**Tech Stack:** PHP 8.2 (BGA framework states), JavaScript (AMD Dojo module), CSS

**Spec:** `docs/plans/2026-03-22-oracle-turn-mechanics-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `modules/php/MaterialDefs.php` | Add `ORACLE_WHEEL_ORDER` and `COLOR_NAMES` constants |
| Modify | `modules/php/States/SelectAction.php` | Add `actDrawOracleCard()`, `actTakeFavorTokens()`, `actRecolorDie()`, recolor cost helper, update `getArgs()` and state description |
| Modify | `theoracleofdelphigzed.js` | Add 3 action buttons, recolor mode UI on oracle wheel, notification handlers, update status text |
| Modify | `theoracleofdelphigzed.css` | Add recolor mode styles (cost badges, slot highlighting) |

---

### Task 1: Add Constants to MaterialDefs

**Files:**
- Modify: `modules/php/MaterialDefs.php`

- [ ] **Step 1: Add ORACLE_WHEEL_ORDER constant**

Add after `COLOR_INDEX` (around line 213):

```php
// Oracle wheel clockwise order for recolor cost calculation
public const ORACLE_WHEEL_ORDER = ['red', 'black', 'pink', 'blue', 'yellow', 'green'];

// Translated color names for status bar display
public const COLOR_NAMES = [
    'red' => 'Red',
    'black' => 'Black',
    'pink' => 'Pink',
    'blue' => 'Blue',
    'yellow' => 'Yellow',
    'green' => 'Green',
];
```

- [ ] **Step 2: Commit**

```bash
git add modules/php/MaterialDefs.php
git commit -m "feat: add oracle wheel order and color name constants"
```

---

### Task 2: Draw Oracle Card & Take Favor Tokens — Backend

**Files:**
- Modify: `modules/php/States/SelectAction.php`

- [ ] **Step 1: Add actDrawOracleCard() action method**

Add after `actAdvanceGod()` (around line 496):

```php
#[PossibleAction]
public function actDrawOracleCard(int $activePlayerId) {
    // Draw top oracle card from deck
    $card = $this->game->getObjectFromDB(
        "SELECT card_id, card_type_arg FROM card
         WHERE card_type = 'oracle' AND card_location = 'deck'
         ORDER BY card_order ASC LIMIT 1"
    );
    if ($card === null) {
        throw new UserException(clienttranslate('No oracle cards left in the deck'));
    }

    $cardId = (int)$card['card_id'];
    $colorIndex = (int)$card['card_type_arg'];
    $cardColor = MaterialDefs::COLORS[$colorIndex];

    $this->game->DbQuery(
        "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
         WHERE card_id = $cardId"
    );

    // Spend the die
    $dieIndex = $this->game->globals->get('selected_die_index');
    $this->game->DbQuery(
        "UPDATE oracle_die SET is_used = 1
         WHERE player_id = $activePlayerId AND die_index = $dieIndex"
    );
    $this->game->globals->set('selected_die_index', null);

    $this->notify->all("oracleCardDrawn", clienttranslate('${player_name} draws an Oracle card'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "card_color" => $cardColor,
    ]);

    $this->notify->all("dieUsed", '', [
        "player_id" => $activePlayerId,
        "die_index" => $dieIndex,
    ]);

    $unused = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM oracle_die WHERE player_id = $activePlayerId AND is_used = 0"
    );
    if ($unused === 0) {
        return ConsultOracle::class;
    }
    return PlayerActions::class;
}
```

- [ ] **Step 2: Add actTakeFavorTokens() action method**

Add after `actDrawOracleCard()`:

```php
#[PossibleAction]
public function actTakeFavorTokens(int $activePlayerId) {
    $amount = 2;

    $this->game->DbQuery(
        "UPDATE player SET favor_tokens = favor_tokens + $amount WHERE player_id = $activePlayerId"
    );
    $newFavor = (int)$this->game->getUniqueValueFromDB(
        "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
    );

    // Spend the die
    $dieIndex = $this->game->globals->get('selected_die_index');
    $this->game->DbQuery(
        "UPDATE oracle_die SET is_used = 1
         WHERE player_id = $activePlayerId AND die_index = $dieIndex"
    );
    $this->game->globals->set('selected_die_index', null);

    $this->notify->all("favorTokensTaken", clienttranslate('${player_name} takes ${amount} Favor Tokens'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "amount" => $amount,
        "favor_tokens" => $newFavor,
    ]);

    $this->notify->all("dieUsed", '', [
        "player_id" => $activePlayerId,
        "die_index" => $dieIndex,
    ]);

    $unused = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM oracle_die WHERE player_id = $activePlayerId AND is_used = 0"
    );
    if ($unused === 0) {
        return ConsultOracle::class;
    }
    return PlayerActions::class;
}
```

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/SelectAction.php
git commit -m "feat: add draw oracle card and take favor tokens actions"
```

---

### Task 3: Recolor Die — Backend

**Files:**
- Modify: `modules/php/States/SelectAction.php`

- [ ] **Step 1: Add getRecolorCost() helper**

Add after `getAdvanceableGod()` (around line 281):

```php
/**
 * Calculate clockwise recolor cost from current color to target color.
 * Returns 0 if same color, 1-5 for clockwise steps.
 */
private function getRecolorCost(string $fromColor, string $targetColor): int
{
    if ($fromColor === $targetColor) return 0;
    $order = MaterialDefs::ORACLE_WHEEL_ORDER;
    $fromIdx = array_search($fromColor, $order);
    $toIdx = array_search($targetColor, $order);
    if ($fromIdx === false || $toIdx === false) return 0;
    return ($toIdx - $fromIdx + count($order)) % count($order);
}
```

- [ ] **Step 2: Add recolor data to getArgs()**

In `getArgs()` return array, add after `'advanceableGod'`:

```php
'playerFavor' => (int)$this->game->getUniqueValueFromDB(
    "SELECT favor_tokens FROM player WHERE player_id = $playerId"
),
'die_color' => $dieColor ? (MaterialDefs::COLOR_NAMES[$dieColor] ?? $dieColor) : '',
```

Note: The existing `'dieColor'` key (line 39) stays as-is — it provides the raw color string for JS logic. The new `'die_color'` key provides the translated name for BGA status bar substitution (`${die_color}` in description strings).

- [ ] **Step 3: Add actRecolorDie() action method**

Add after `actTakeFavorTokens()`:

```php
#[PossibleAction]
public function actRecolorDie(string $targetColor, int $activePlayerId) {
    $dieIndex = $this->game->globals->get('selected_die_index');
    $die = $this->game->getObjectFromDB(
        "SELECT color FROM oracle_die WHERE player_id = $activePlayerId AND die_index = $dieIndex"
    );
    $currentColor = $die ? $die['color'] : null;

    if (!$currentColor || $currentColor === $targetColor) {
        throw new UserException(clienttranslate('Invalid recolor target'));
    }

    // Validate target color exists
    if (!in_array($targetColor, MaterialDefs::ORACLE_WHEEL_ORDER)) {
        throw new UserException(clienttranslate('Invalid color'));
    }

    $cost = $this->getRecolorCost($currentColor, $targetColor);
    if ($cost === 0) {
        throw new UserException(clienttranslate('Invalid recolor target'));
    }

    $favor = (int)$this->game->getUniqueValueFromDB(
        "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
    );
    if ($favor < $cost) {
        throw new UserException(clienttranslate('Not enough Favor Tokens'));
    }

    // Deduct favor
    $this->game->DbQuery(
        "UPDATE player SET favor_tokens = favor_tokens - $cost WHERE player_id = $activePlayerId"
    );
    $newFavor = $favor - $cost;

    // Update die color (keep original_color unchanged)
    $safeTarget = addslashes($targetColor);
    $this->game->DbQuery(
        "UPDATE oracle_die SET color = '$safeTarget'
         WHERE player_id = $activePlayerId AND die_index = $dieIndex"
    );

    $this->notify->all("dieRecolored", clienttranslate('${player_name} recolors die to ${target_color} (${cost} Favor)'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "die_index" => $dieIndex,
        "target_color" => $targetColor,
        "cost" => $cost,
        "favor_tokens" => $newFavor,
    ]);

    // Return to SelectAction — die is NOT spent, player still picks an action
    return SelectAction::class;
}
```

- [ ] **Step 4: Update descriptionMyTurn**

Change the constructor's `descriptionMyTurn` from:

```php
descriptionMyTurn: clienttranslate('Select action for die'),
```

to:

```php
descriptionMyTurn: clienttranslate('${you} must select action for ${die_color} die'),
```

And update `description` similarly:

```php
description: clienttranslate('${actplayer} selects action for ${die_color} die'),
```

The `die_color` key was already added to `getArgs()` in Step 2. BGA automatically substitutes `${die_color}` in the description string from the args.

- [ ] **Step 5: Commit**

```bash
git add modules/php/States/SelectAction.php
git commit -m "feat: add recolor die action with clockwise cost calculation"
```

---

### Task 4: Frontend — Action Buttons + Notification Handlers

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Add Draw Oracle Card and Take Favor buttons in SelectAction case**

In `onUpdateActionButtons`, `case 'SelectAction':` (around line 1251), add before the Cancel button (line 1321):

```javascript
this.statusBar.addActionButton(_('Draw Oracle Card'), () => {
    this.bgaPerformAction("actDrawOracleCard", {});
});
this.statusBar.addActionButton(_('Take Favor Tokens'), () => {
    this.bgaPerformAction("actTakeFavorTokens", {});
});
```

- [ ] **Step 2: Add Recolor Die button**

Add before the Cancel button, after the Take Favor button. Only show if player has ≥1 favor:

```javascript
if (args && args.playerFavor && args.playerFavor > 0) {
    this.statusBar.addActionButton(_('Recolor Die'), () => {
        this.enterRecolorMode(args.dieColor, args.playerFavor);
    }, { color: 'secondary' });
}
```

- [ ] **Step 3: Add enterRecolorMode() and exitRecolorMode() methods**

Add after `setupDefeatedMonstersFromGamedata()` (around line 1030):

```javascript
/**
 * Enter recolor mode: highlight oracle wheel slots with cost badges.
 * @param {string} currentColor - Current die color
 * @param {number} playerFavor - Player's current favor token count
 */
enterRecolorMode: function(currentColor, playerFavor) {
    this._recolorActive = true;
    this._recolorCurrentColor = currentColor;
    var wheelOrder = ['red', 'black', 'pink', 'blue', 'yellow', 'green'];
    var fromIdx = wheelOrder.indexOf(currentColor);
    var self = this;
    this._recolorClickHandlers = [];

    document.getElementById('delphi-oracle-wheel').classList.add('recolor-active');

    wheelOrder.forEach(function(color, toIdx) {
        var slot = document.querySelector('.oracle-slot[data-color="' + color + '"]');
        if (!slot || color === currentColor) return;

        var cost = ((toIdx - fromIdx) + wheelOrder.length) % wheelOrder.length;
        var affordable = playerFavor >= cost;

        // Add cost badge
        var badge = document.createElement('div');
        badge.className = 'recolor-cost-badge' + (affordable ? ' affordable' : ' too-expensive');
        badge.textContent = cost;
        slot.appendChild(badge);
        slot.classList.add('recolor-target');

        if (affordable) {
            var handler = function() {
                self.exitRecolorMode();
                self.bgaPerformAction("actRecolorDie", { targetColor: color });
            };
            slot.addEventListener('click', handler);
            self._recolorClickHandlers.push({ el: slot, handler: handler });
        }
    });

    // Add a cancel recolor button to the status bar
    this.statusBar.addActionButton(_('Cancel Recolor'), () => {
        this.exitRecolorMode();
    }, { color: 'secondary' });
},

/**
 * Exit recolor mode: clean up highlights and badges.
 */
exitRecolorMode: function() {
    this._recolorActive = false;
    document.getElementById('delphi-oracle-wheel').classList.remove('recolor-active');
    document.querySelectorAll('.recolor-cost-badge').forEach(function(badge) {
        badge.remove();
    });
    document.querySelectorAll('.recolor-target').forEach(function(slot) {
        slot.classList.remove('recolor-target');
    });
    if (this._recolorClickHandlers) {
        this._recolorClickHandlers.forEach(function(item) {
            item.el.removeEventListener('click', item.handler);
        });
        this._recolorClickHandlers = null;
    }
},
```

- [ ] **Step 4: Clean up recolor mode on leaving SelectAction**

In `onLeavingState`, `case 'SelectAction':` (around line 1204), add:

```javascript
case 'SelectAction':
    this.clearRangeOverlays();
    if (this._recolorActive) {
        this.exitRecolorMode();
    }
    break;
```

- [ ] **Step 5: Add notif_oracleCardDrawn handler**

Add with other notification handlers:

```javascript
notif_oracleCardDrawn: function(args) {
    console.log('notif_oracleCardDrawn', args);
    if (parseInt(args.player_id) === this.player_id) {
        this.components.addOracleCardToHand(args.card_color);
    }
},
```

- [ ] **Step 6: Add notif_favorTokensTaken handler**

```javascript
notif_favorTokensTaken: function(args) {
    console.log('notif_favorTokensTaken', args);
    if (parseInt(args.player_id) === this.player_id) {
        this.components.setFavorTokenCount(parseInt(args.favor_tokens));
    }
},
```

- [ ] **Step 7: Add notif_dieRecolored handler**

```javascript
notif_dieRecolored: function(args) {
    console.log('notif_dieRecolored', args);
    if (parseInt(args.player_id) === this.player_id) {
        this.components.setFavorTokenCount(parseInt(args.favor_tokens));
        // Update the die color on the oracle wheel
        this.components.recolorDie(this.player_id, parseInt(args.die_index), args.target_color);
    }
},
```

- [ ] **Step 8: Bump DELPHI_JS_VERSION**

```javascript
var DELPHI_JS_VERSION = "v37";
```

- [ ] **Step 9: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat: add draw oracle card, take favor, recolor die buttons and handlers"
```

---

### Task 5: Frontend — Recolor Die Visual (Components.js)

**Files:**
- Modify: `modules/js/Components.js`

- [ ] **Step 1: Add recolorDie() method to Components**

Find the die management section (near `selectDie`, `useDie` methods) and add:

```javascript
/**
 * Visually move a die to a new color slot on the oracle wheel.
 * @param {number} playerId - Player ID
 * @param {number} dieIndex - Die index (0, 1, 2)
 * @param {string} newColor - Target color name
 */
recolorDie: function(playerId, dieIndex, newColor) {
    var dieEl = this.dice.get(playerId + '_' + dieIndex);
    if (!dieEl) return;

    // Update die data attribute and class
    var oldColor = dieEl.dataset.color;
    dieEl.classList.remove('die-' + oldColor);
    dieEl.classList.add('die-' + newColor);
    dieEl.dataset.color = newColor;

    // Move die to new slot
    var targetSlot = document.querySelector('.oracle-slot[data-color="' + newColor + '"]');
    if (targetSlot) {
        targetSlot.appendChild(dieEl);
        targetSlot.classList.add('has-die');
    }

    // Remove has-die from old slot
    var oldSlot = document.querySelector('.oracle-slot[data-color="' + oldColor + '"]');
    if (oldSlot && !oldSlot.querySelector('.delphi-die')) {
        oldSlot.classList.remove('has-die');
    }
},
```

- [ ] **Step 2: Commit**

```bash
git add modules/js/Components.js
git commit -m "feat: add recolorDie visual method to Components"
```

---

### Task 6: CSS — Recolor Mode Styles

**Files:**
- Modify: `theoracleofdelphigzed.css`

- [ ] **Step 1: Add recolor mode styles**

Add after the existing oracle-slot styles (around line 684):

```css
/* Recolor mode */
#delphi-oracle-wheel.recolor-active .oracle-slot:not(.recolor-target) {
    opacity: 0.3;
    pointer-events: none;
}

.oracle-slot.recolor-target {
    cursor: pointer;
    box-shadow: 0 0 8px 2px rgba(255, 215, 0, 0.8);
    z-index: 10;
}

.oracle-slot.recolor-target:hover {
    transform: scale(1.15);
}

.recolor-cost-badge {
    position: absolute;
    top: -8px;
    right: -8px;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #333;
    color: #fff;
    font-size: 13px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 11;
    border: 2px solid #fff;
}

.recolor-cost-badge.affordable {
    background: #28a745;
}

.recolor-cost-badge.too-expensive {
    background: #dc3545;
    opacity: 0.5;
}

.oracle-slot.recolor-target:has(.too-expensive) {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add theoracleofdelphigzed.css
git commit -m "feat: add recolor mode CSS styles for oracle wheel"
```

---

### Task 7: Verification

- [ ] **Step 1: Start a new game and verify new buttons**

Select a die. Verify:
- "Draw Oracle Card" button always appears
- "Take Favor Tokens" button always appears
- "Recolor Die" button appears (player starts with favor tokens)
- Status bar shows "Select action for [Color] die"

- [ ] **Step 2: Test Draw Oracle Card**

Click "Draw Oracle Card". Verify:
- Oracle card appears in hand area
- Die is consumed
- Notification appears in game log

- [ ] **Step 3: Test Take Favor Tokens**

Click "Take Favor Tokens". Verify:
- Favor token count increases by 2
- Die is consumed
- Notification appears in game log

- [ ] **Step 4: Test Recolor Die**

Click "Recolor Die". Verify:
- Oracle wheel enters recolor mode — 5 other slots highlighted with cost badges
- Green cost badges for affordable, red for too expensive
- Click an affordable slot → die moves to new color, favor decreases, status text updates
- Action buttons refresh for the new color
- Can recolor again if still have favor

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for oracle turn mechanics"
```

---

## Summary

| Task | Description | Files |
|------|------------|-------|
| 1 | MaterialDefs constants | MaterialDefs.php |
| 2 | Draw Oracle Card + Take Favor backend | SelectAction.php |
| 3 | Recolor Die backend | SelectAction.php |
| 4 | Action buttons + notif handlers | theoracleofdelphigzed.js |
| 5 | Recolor Die visual in Components | Components.js |
| 6 | Recolor mode CSS | theoracleofdelphigzed.css |
| 7 | Integration verification | all |
