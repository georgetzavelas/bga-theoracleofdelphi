# Oracle Card Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow players to play an oracle card from hand as a virtual die (bonus action), one per turn, discarded after use.

**Architecture:** Add `oracle_card_played` and `selected_oracle_card_id` globals. Extract duplicated die-spending logic into a shared `Game::spendActionSource()` method. Modify `PlayerActions` to offer oracle cards alongside dice. Modify `SelectAction` to read color from oracle card when applicable and disable recolor. All 10 locations that mark `is_used = 1` call the shared method instead.

**Tech Stack:** PHP (BGA framework states), JavaScript (AMD game module), CSS

---

### Task 1: Extract shared `spendActionSource()` and `allDiceUsed()` into Game.php

The die-spending pattern (mark used, clear global, notify, check if all used) is duplicated across 10 state files. Extract it into `Game.php` so oracle card support only needs to be added in one place.

**Files:**
- Modify: `modules/php/Game.php`
- Modify: `modules/php/States/SelectAction.php` (4 locations)
- Modify: `modules/php/States/MoveShip.php:117-122` and `:182-206`
- Modify: `modules/php/States/FightMonsterStart.php:31`
- Modify: `modules/php/States/LoadCargo.php:106-111` and `:146`
- Modify: `modules/php/States/DeliverCargo.php:120-125` and `:202`
- Modify: `modules/php/States/ExploreIsland.php:33` and `:221-226`
- Modify: `modules/php/States/PeekIslands.php:141`
- Modify: `modules/php/States/SelectReward.php:75-80`

- [ ] **Step 1: Add `allDiceUsed()` to Game.php**

Add this public method to `Game.php` after the `getAllDatas()` method:

```php
/**
 * Check if all 3 oracle dice have been used this turn.
 */
public function allDiceUsed(int $playerId): bool
{
    $unused = (int)$this->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM oracle_die WHERE player_id = $playerId AND is_used = 0"
    );
    return $unused === 0;
}
```

- [ ] **Step 2: Add `spendActionSource()` to Game.php**

This replaces the 10 duplicated "mark die used + clear global + notify dieUsed" blocks. For now it only handles dice; Task 3 will add oracle card handling.

```php
/**
 * Spend the current action source (die or oracle card) after an action completes.
 * Returns the next state class: ConsultOracle if all dice used, else PlayerActions.
 */
public function spendActionSource(int $playerId): string
{
    $dieIndex = $this->globals->get('selected_die_index');

    // Spend the die
    $this->DbQuery(
        "UPDATE oracle_die SET is_used = 1
         WHERE player_id = $playerId AND die_index = $dieIndex"
    );
    $this->globals->set('selected_die_index', null);

    $this->notify->all("dieUsed", '', [
        "player_id" => $playerId,
        "die_index" => $dieIndex,
    ]);

    if ($this->allDiceUsed($playerId)) {
        return \Bga\Games\theoracleofdelphigzed\States\ConsultOracle::class;
    }
    return \Bga\Games\theoracleofdelphigzed\States\PlayerActions::class;
}
```

- [ ] **Step 3: Replace all 10 die-spending locations with `$this->game->spendActionSource()`**

In each state file, replace the block pattern:
```php
$this->game->DbQuery("UPDATE oracle_die SET is_used = 1 WHERE player_id = $activePlayerId AND die_index = $dieIndex");
$this->game->globals->set('selected_die_index', null);
// ... (some have notifications between)
$this->notify->all("dieUsed", '', [...]);
// ... check unused count
if ($this->allDiceUsed($activePlayerId)) { return ConsultOracle::class; }
return PlayerActions::class;
```

With:
```php
return $this->game->spendActionSource($activePlayerId);
```

**Files and locations:**

**SelectAction.php** — 4 locations:
- `actDiscardInjuries()` (~lines 451-476): Remove lines 451-456 (die spend), 465-468 (dieUsed notify), 470-476 (unused check + return). Replace with `return $this->game->spendActionSource($activePlayerId);` after the injuriesDiscarded notification.
- `actAdvanceGod()` (~lines 510-535): Same pattern — remove die spend + dieUsed notify + unused check, replace with `return $this->game->spendActionSource($activePlayerId);` after godAdvanced notification.
- `actDrawOracleCard()` (~lines 560-584): Same pattern.
- `actTakeFavorTokens()` (~lines 599-623): Same pattern.

**MoveShip.php** — `actConfirmMove()` (~lines 182-206): Remove lines 182-189 (die spend), 198-201 (dieUsed notify), 203-206 (unused check + return). Replace with `return $this->game->spendActionSource($activePlayerId);` after shipMoved notification.

**FightMonsterStart.php** (~line 31): Remove die spend block. Replace with `return $this->game->spendActionSource($activePlayerId);` — note: this file marks the die used at combat START (before rolling), so the replacement goes in the same spot.

**LoadCargo.php** — `actConfirmLoad()` (~line 146): Remove die spend + transition. Replace with `return $this->game->spendActionSource($activePlayerId);`.

**DeliverCargo.php** — `actConfirmDelivery()` (~line 202): Same replacement.

**ExploreIsland.php** (~line 33): Same replacement.

**PeekIslands.php** (~line 141): Same replacement.

- [ ] **Step 4: Remove all 5 private `allDiceUsed()` methods from state files**

Delete the private `allDiceUsed()` method from:
- `MoveShip.php:117-122`
- `DeliverCargo.php:120-125`
- `SelectReward.php:75-80`
- `LoadCargo.php:106-111`
- `ExploreIsland.php:221-226`

Update any remaining callers in those files to use `$this->game->allDiceUsed($playerId)` instead. Check `SelectReward.php` — it calls `allDiceUsed` in its own logic; update that call.

- [ ] **Step 5: Verify the game still works**

Run the BGA dev server and play through a turn: select die → pick action → verify die is marked used → verify transition to PlayerActions or ConsultOracle works correctly.

- [ ] **Step 6: Commit**

```bash
git add modules/php/Game.php modules/php/States/SelectAction.php modules/php/States/MoveShip.php modules/php/States/FightMonsterStart.php modules/php/States/LoadCargo.php modules/php/States/DeliverCargo.php modules/php/States/ExploreIsland.php modules/php/States/PeekIslands.php modules/php/States/SelectReward.php
git commit -m "refactor: extract shared spendActionSource() and allDiceUsed() into Game.php"
```

---

### Task 2: Add oracle card globals and reset at turn start

**Files:**
- Modify: `modules/php/Game.php` (globals init in `setupNewGame()`)
- Modify: `modules/php/States/PlayerTurnStart.php`

- [ ] **Step 1: Initialize globals in `setupNewGame()`**

In `Game.php`, find the line `$this->globals->set('selected_die_index', null);` (~line 924) and add after it:

```php
$this->globals->set('oracle_card_played', 0);
$this->globals->set('selected_oracle_card_id', 0);
```

- [ ] **Step 2: Reset globals at turn start**

In `PlayerTurnStart.php`, add these lines at the start of `onEnteringState()`, after the `giveExtraTime` call (line 14):

```php
$this->game->globals->set('oracle_card_played', 0);
$this->game->globals->set('selected_oracle_card_id', 0);
```

- [ ] **Step 3: Commit**

```bash
git add modules/php/Game.php modules/php/States/PlayerTurnStart.php
git commit -m "feat: add oracle_card_played and selected_oracle_card_id globals"
```

---

### Task 3: Add `actPlayOracleCard` to PlayerActions state

**Files:**
- Modify: `modules/php/States/PlayerActions.php`

- [ ] **Step 1: Add oracle card data to `getArgs()`**

Replace the existing `getArgs()` method (lines 20-29) with:

```php
public function getArgs(): array
{
    $playerId = (int)$this->game->getActivePlayerId();
    $dice = $this->game->getObjectListFromDB(
        "SELECT die_index, color, is_used FROM oracle_die WHERE player_id = $playerId ORDER BY die_index"
    );

    // Oracle cards in hand, grouped by color
    $oracleCardPlayed = (int)$this->game->globals->get('oracle_card_played');
    $oracleCardsInHand = [];
    if ($oracleCardPlayed === 0) {
        $rows = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'oracle' AND card_location = 'hand' AND card_location_arg = $playerId
             ORDER BY card_id"
        );
        $colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
        foreach ($rows as $row) {
            $oracleCardsInHand[] = [
                'cardId' => (int)$row['card_id'],
                'color' => $colors[(int)$row['card_type_arg']] ?? 'red',
            ];
        }
    }

    return [
        'dice' => $dice,
        'oracleCardsInHand' => $oracleCardsInHand,
        'canPlayOracleCard' => $oracleCardPlayed === 0 && count($oracleCardsInHand) > 0,
    ];
}
```

- [ ] **Step 2: Add `actPlayOracleCard` action**

Add this method after `actSelectDie()`:

```php
#[PossibleAction]
public function actPlayOracleCard(int $card_id, int $activePlayerId) {
    // Validate card is in player's hand
    $card = $this->game->getObjectFromDB(
        "SELECT card_id, card_type_arg FROM card
         WHERE card_id = $card_id AND card_type = 'oracle'
         AND card_location = 'hand' AND card_location_arg = $activePlayerId"
    );
    if ($card === null) {
        throw new UserException('Invalid oracle card');
    }

    // Validate no oracle card already played this turn
    if ((int)$this->game->globals->get('oracle_card_played') !== 0) {
        throw new UserException('You have already played an oracle card this turn');
    }

    $this->game->globals->set('oracle_card_played', 1);
    $this->game->globals->set('selected_oracle_card_id', (int)$card['card_id']);

    $colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
    $color = $colors[(int)$card['card_type_arg']] ?? 'red';

    $this->notify->all("oracleCardPlayed", clienttranslate('${player_name} plays a ${card_color} oracle card'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "card_id" => (int)$card['card_id'],
        "card_color" => $color,
    ]);

    return SelectAction::class;
}
```

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/PlayerActions.php
git commit -m "feat: add actPlayOracleCard action to PlayerActions state"
```

---

### Task 4: Update SelectAction to support oracle card as action source

**Files:**
- Modify: `modules/php/States/SelectAction.php`

- [ ] **Step 1: Add helper to get current action color**

Add this private method near the top of the class (after the constructor):

```php
/**
 * Get the color of the current action source (die or oracle card).
 */
private function getActionColor(int $playerId): ?string
{
    $oracleCardId = (int)$this->game->globals->get('selected_oracle_card_id');
    if ($oracleCardId > 0) {
        $card = $this->game->getObjectFromDB(
            "SELECT card_type_arg FROM card WHERE card_id = $oracleCardId"
        );
        if ($card) {
            $colors = MaterialDefs::COLORS;
            return $colors[(int)$card['card_type_arg']] ?? null;
        }
        return null;
    }

    $dieIndex = $this->game->globals->get('selected_die_index');
    $die = $this->game->getObjectFromDB(
        "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
    );
    return $die ? $die['color'] : null;
}
```

- [ ] **Step 2: Update `getArgs()` to use `getActionColor()` and flag oracle card source**

Replace the first ~8 lines of `getArgs()` (lines 24-30):

```php
// Old:
$dieIndex = $this->game->globals->get('selected_die_index');
$playerId = (int)$this->game->getActivePlayerId();
$die = $this->game->getObjectFromDB(
    "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
);
$dieColor = $die ? $die['color'] : null;
```

With:

```php
$playerId = (int)$this->game->getActivePlayerId();
$dieIndex = $this->game->globals->get('selected_die_index');
$oracleCardId = (int)$this->game->globals->get('selected_oracle_card_id');
$isOracleCard = $oracleCardId > 0;
$dieColor = $this->getActionColor($playerId);
```

Then add `isOracleCard` to the returned array (after the existing `cargoCapacity` key):

```php
'isOracleCard' => $isOracleCard,
```

- [ ] **Step 3: Update `actCancelDieSelection()` to handle oracle card cancel**

Replace the existing `actCancelDieSelection()` method (lines 371-379) with:

```php
#[PossibleAction]
public function actCancelDieSelection(int $activePlayerId) {
    $oracleCardId = (int)$this->game->globals->get('selected_oracle_card_id');

    if ($oracleCardId > 0) {
        // Cancel oracle card — return it to hand
        $colors = MaterialDefs::COLORS;
        $card = $this->game->getObjectFromDB(
            "SELECT card_type_arg FROM card WHERE card_id = $oracleCardId"
        );
        $color = $card ? ($colors[(int)$card['card_type_arg']] ?? 'red') : 'red';

        $this->game->globals->set('selected_oracle_card_id', 0);
        $this->game->globals->set('oracle_card_played', 0);

        $this->notify->all("oracleCardCancelled", clienttranslate('${player_name} cancels oracle card'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_id" => $oracleCardId,
            "card_color" => $color,
        ]);
    } else {
        $this->game->globals->set('selected_die_index', null);
        $this->notify->all("dieCancelled", clienttranslate('${player_name} cancels die selection'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
    }

    return PlayerActions::class;
}
```

- [ ] **Step 4: Update `actRecolorDie()` to reject oracle card source**

At the start of `actRecolorDie()` (after the opening brace, ~line 637), add:

```php
if ((int)$this->game->globals->get('selected_oracle_card_id') > 0) {
    throw new UserException(clienttranslate('Cannot recolor an oracle card'));
}
```

- [ ] **Step 5: Update all action methods that read die color directly**

Several `act*` methods in SelectAction.php read the die color directly (e.g., `actExploreIsland`, `actAdvanceGod`, `actDiscardInjuries`). These need to use `getActionColor()` instead. Find every occurrence in SelectAction.php that does:

```php
$dieIndex = $this->game->globals->get('selected_die_index');
$die = $this->game->getObjectFromDB("SELECT color FROM oracle_die WHERE player_id = ...");
$dieColor = $die ? $die['color'] : null;
```

And replace with:

```php
$dieColor = $this->getActionColor($activePlayerId);
```

These locations are in: `actDiscardInjuries()`, `actAdvanceGod()`, `actExploreIsland()`.

- [ ] **Step 6: Commit**

```bash
git add modules/php/States/SelectAction.php
git commit -m "feat: SelectAction supports oracle card as action source"
```

---

### Task 5: Update `spendActionSource()` to handle oracle cards

**Files:**
- Modify: `modules/php/Game.php`

- [ ] **Step 1: Update `spendActionSource()` to branch on oracle card vs die**

Replace the `spendActionSource()` method added in Task 1 with:

```php
public function spendActionSource(int $playerId): string
{
    $oracleCardId = (int)$this->globals->get('selected_oracle_card_id');

    if ($oracleCardId > 0) {
        // Discard the oracle card
        $this->DbQuery(
            "UPDATE card SET card_location = 'discard', card_location_arg = 0
             WHERE card_id = $oracleCardId"
        );
        $this->globals->set('selected_oracle_card_id', 0);

        $this->notify->all("oracleCardDiscarded", '', [
            "player_id" => $playerId,
            "card_id" => $oracleCardId,
        ]);
    } else {
        // Spend the die
        $dieIndex = $this->globals->get('selected_die_index');
        $this->DbQuery(
            "UPDATE oracle_die SET is_used = 1
             WHERE player_id = $playerId AND die_index = $dieIndex"
        );
        $this->globals->set('selected_die_index', null);

        $this->notify->all("dieUsed", '', [
            "player_id" => $playerId,
            "die_index" => $dieIndex,
        ]);
    }

    if ($this->allDiceUsed($playerId)) {
        return \Bga\Games\theoracleofdelphigzed\States\ConsultOracle::class;
    }
    return \Bga\Games\theoracleofdelphigzed\States\PlayerActions::class;
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: spendActionSource handles oracle card discard"
```

---

### Task 6: Client-side — oracle card click handlers in PlayerActions

**Files:**
- Modify: `theoracleofdelphigzed.js`
- Modify: `theoracleofdelphigzed.css`

- [ ] **Step 1: Add `_setupOracleCardClickHandlers()` method**

Add this method after `_teardownDieClickHandlers()` (~after line 1881):

```javascript
/**
 * Set up oracle card click handlers for playing an oracle card as a virtual die
 */
_setupOracleCardClickHandlers: function(oracleCards) {
    var self = this;
    this._oracleCardClickHandlers = [];
    oracleCards.forEach(function(card) {
        // Find the oracle card element in hand by color
        var container = document.getElementById('delphi-oracle-cards-area');
        if (!container) return;
        var cardEl = container.querySelector('.oracle-' + card.color);
        if (cardEl && !cardEl.classList.contains('oracle-card-selectable')) {
            cardEl.classList.add('oracle-card-selectable');
            var handler = function() {
                self.bgaPerformAction("actPlayOracleCard", { card_id: card.cardId });
            };
            cardEl.addEventListener('click', handler);
            self._oracleCardClickHandlers.push({ el: cardEl, handler: handler });
        }
    });
},

/**
 * Remove oracle card click handlers
 */
_teardownOracleCardClickHandlers: function() {
    if (this._oracleCardClickHandlers) {
        this._oracleCardClickHandlers.forEach(function(item) {
            item.el.classList.remove('oracle-card-selectable');
            item.el.removeEventListener('click', item.handler);
        });
        this._oracleCardClickHandlers = null;
    }
},
```

- [ ] **Step 2: Wire up in `onEnteringState` for PlayerActions**

Update the `PlayerActions` case in `onEnteringState` (lines 1280-1285):

```javascript
case 'PlayerActions':
    console.log('playerActions check:', 'active=' + this.isCurrentPlayerActive(), 'args.args=', args.args);
    if (this.isCurrentPlayerActive() && args.args && args.args.dice) {
        this._setupDieClickHandlers(args.args.dice);
        if (args.args.canPlayOracleCard && args.args.oracleCardsInHand) {
            this._setupOracleCardClickHandlers(args.args.oracleCardsInHand);
        }
    }
    break;
```

- [ ] **Step 3: Wire up in `onLeavingState` for PlayerActions**

Update the `PlayerActions` case in `onLeavingState` (lines 1471-1475):

```javascript
case 'PlayerActions':
    this._teardownDieClickHandlers();
    this._teardownOracleCardClickHandlers();
    this.clearRangeOverlays();
    this.components.deselectShips();
    break;
```

- [ ] **Step 4: Add CSS for selectable oracle cards**

Add to `theoracleofdelphigzed.css` (near the existing `.cargo-selectable` rule):

```css
/* Oracle card selectable for playing as wild die */
.oracle-card-selectable {
    cursor: pointer;
    outline: 3px solid #FFD700;
    outline-offset: 2px;
    animation: cargo-pulse 1.2s ease-in-out infinite;
}
```

This reuses the existing `cargo-pulse` animation for consistency.

- [ ] **Step 5: Commit**

```bash
git add theoracleofdelphigzed.js theoracleofdelphigzed.css
git commit -m "feat: oracle card click handlers in PlayerActions state"
```

---

### Task 7: Client-side — notification handlers for oracle card play/discard/cancel

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Add `notif_oracleCardPlayed` handler**

Add after the existing `notif_oracleCardDrawn` handler (~line 2286):

```javascript
notif_oracleCardPlayed: function(args) {
    console.log('notif_oracleCardPlayed', args);
    if (parseInt(args.player_id) === this.player_id) {
        this.components.playOracleCard(args.card_color);
    }
},
```

- [ ] **Step 2: Add `notif_oracleCardDiscarded` handler**

Add after `notif_oracleCardPlayed`:

```javascript
notif_oracleCardDiscarded: function(args) {
    console.log('notif_oracleCardDiscarded', args);
    if (parseInt(args.player_id) === this.player_id) {
        this.components.clearPlayedOracleCard();
    }
},
```

- [ ] **Step 3: Add `notif_oracleCardCancelled` handler**

Add after `notif_oracleCardDiscarded`:

```javascript
notif_oracleCardCancelled: function(args) {
    console.log('notif_oracleCardCancelled', args);
    if (parseInt(args.player_id) === this.player_id) {
        this.components.clearPlayedOracleCard();
        this.components.addOracleCardToHand(args.card_color);
    }
},
```

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat: notification handlers for oracle card play/discard/cancel"
```

---

### Task 8: Update SelectAction UI to hide recolor when using oracle card

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Add `isOracleCard` check to recolor button creation**

The recolor button is created in `onUpdateActionButtons` at ~line 1689. The current code:

```javascript
if (args && args.playerFavor && args.playerFavor > 0) {
    this.statusBar.addActionButton(_('Recolor Die'), () => {
        this.enterRecolorMode(args.dieColor, args.playerFavor);
    }, { color: 'secondary' });
}
```

Add `!args.isOracleCard` to the condition:

```javascript
if (args && args.playerFavor && args.playerFavor > 0 && !args.isOracleCard) {
    this.statusBar.addActionButton(_('Recolor Die'), () => {
        this.enterRecolorMode(args.dieColor, args.playerFavor);
    }, { color: 'secondary' });
}
```

- [ ] **Step 2: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat: hide recolor option when using oracle card"
```

---

### Task 9: End-to-end testing

**Files:** None (manual testing)

- [ ] **Step 1: Test normal die flow still works**

Play a turn using all 3 dice normally. Verify each die marks as used, transitions work, and ConsultOracle triggers after 3rd die.

- [ ] **Step 2: Test playing an oracle card**

1. Draw oracle cards first (use dice to draw a few)
2. On a subsequent turn, verify oracle cards appear highlighted/clickable alongside dice
3. Click an oracle card — verify it moves to the played area
4. Choose an action (e.g., take favor) — verify the card is discarded and you return to PlayerActions
5. Verify you can still use remaining dice

- [ ] **Step 3: Test oracle card cancel**

1. Play an oracle card
2. Click "Cancel" in SelectAction
3. Verify card returns to hand, `canPlayOracleCard` is true again

- [ ] **Step 4: Test one-per-turn limit**

1. Play an oracle card and complete the action
2. Verify oracle cards are no longer highlighted/clickable for the rest of the turn

- [ ] **Step 5: Test recolor disabled**

1. Play an oracle card
2. In SelectAction, verify the recolor option is hidden/unavailable

- [ ] **Step 6: Test page refresh mid-action**

1. Play an oracle card, enter SelectAction
2. Refresh the page
3. Verify the state restores correctly (oracle card shown in played area, SelectAction args correct)

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix: oracle card usage bug fixes from testing"
```

---

### Task 10: Update game implementation plan

**Files:**
- Modify: `docs/plans/game-implementation-plan.md`

- [ ] **Step 1: Mark oracle card usage as complete**

Change line 1082 from:
```
- [ ] Oracle card usage (play matching color as wild die) [M]
```
To:
```
- [x] Oracle card usage (play matching color as wild die) [M]
```

- [ ] **Step 2: Commit**

```bash
git add docs/plans/game-implementation-plan.md
git commit -m "docs: mark oracle card usage as complete"
```
