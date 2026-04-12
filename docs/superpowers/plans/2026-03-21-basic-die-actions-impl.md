# Basic Die Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Discard Injuries and Advance God as die-spending actions in SelectAction, and wire up the existing god track UI.

**Architecture:** Both actions resolve entirely within SelectAction (no separate state class). They follow the established pattern: getArgs() exposes availability, action button appears in JS, actMethod validates + executes + spends die + notifies + returns to PlayerActions or ConsultOracle. God track UI already exists in Components.js — just needs initialization in setup() and notification wiring.

**Tech Stack:** PHP 8.2 (BGA framework states), JavaScript (AMD Dojo module), MySQL (card + player_god tables)

**Spec:** `docs/plans/2026-03-21-basic-die-actions-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `modules/php/States/SelectAction.php` | Add getDiscardableInjuries(), getAdvanceableGod(), actDiscardInjuries(), actAdvanceGod() + update getArgs() |
| Modify | `theoracleofdelphigzed.js` | Add action buttons + notif handlers + god track setup |

---

### Task 1: Discard Injuries — Backend

**Files:**
- Modify: `modules/php/States/SelectAction.php`

- [ ] **Step 1: Add getDiscardableInjuries() helper**

Add after `getExplorableIslands()` (around line 260):

```php
private function getDiscardableInjuries(int $playerId, ?string $dieColor): int
{
    if (!$dieColor) return 0;
    $colorIndex = MaterialDefs::COLOR_INDEX[$dieColor] ?? -1;
    return (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM card
         WHERE card_type = 'injury' AND card_location = 'hand'
         AND card_location_arg = $playerId AND card_type_arg = $colorIndex"
    );
}
```

- [ ] **Step 2: Add discardableInjuryCount to getArgs()**

In `getArgs()` return array (line 37-48), add after `'explorableIslands'`:

```php
'discardableInjuryCount' => $this->getDiscardableInjuries($playerId, $dieColor),
```

- [ ] **Step 3: Add actDiscardInjuries() action method**

Add after `actExploreIsland()` (around line 352):

```php
#[PossibleAction]
public function actDiscardInjuries(int $activePlayerId) {
    $dieIndex = $this->game->globals->get('selected_die_index');
    $die = $this->game->getObjectFromDB(
        "SELECT color FROM oracle_die WHERE player_id = $activePlayerId AND die_index = $dieIndex"
    );
    $dieColor = $die ? $die['color'] : null;

    $count = $this->getDiscardableInjuries($activePlayerId, $dieColor);
    if ($count === 0) {
        throw new UserException(clienttranslate('You have no injuries of that color to discard'));
    }

    // Batch discard all matching injury cards
    $colorIndex = MaterialDefs::COLOR_INDEX[$dieColor] ?? -1;
    $this->game->DbQuery(
        "UPDATE card SET card_location = 'discard', card_location_arg = 0
         WHERE card_type = 'injury' AND card_location = 'hand'
         AND card_location_arg = $activePlayerId AND card_type_arg = $colorIndex"
    );

    // Spend the die
    $this->game->DbQuery(
        "UPDATE oracle_die SET is_used = 1
         WHERE player_id = $activePlayerId AND die_index = $dieIndex"
    );
    $this->game->globals->set('selected_die_index', null);

    $this->notify->all("injuriesDiscarded", clienttranslate('${player_name} discards ${count} ${color} injury cards'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "count" => $count,
        "color" => $dieColor,
    ]);

    $this->notify->all("dieUsed", '', [
        "player_id" => $activePlayerId,
        "die_index" => $dieIndex,
    ]);

    // Return to actions or consult oracle
    $unused = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM oracle_die WHERE player_id = $activePlayerId AND is_used = 0"
    );
    if ($unused === 0) {
        return ConsultOracle::class;
    }
    return PlayerActions::class;
}
```

- [ ] **Step 4: Commit**

```bash
git add modules/php/States/SelectAction.php
git commit -m "feat: add discard injuries action to SelectAction"
```

---

### Task 2: Advance God — Backend

**Files:**
- Modify: `modules/php/States/SelectAction.php`

- [ ] **Step 1: Add getAdvanceableGod() helper**

Add after `getDiscardableInjuries()`:

```php
private function getAdvanceableGod(int $playerId, ?string $dieColor): ?string
{
    if (!$dieColor) return null;

    // Find the god matching this die color
    $godName = null;
    foreach (MaterialDefs::GODS as $name => $god) {
        if ($god['color'] === $dieColor) {
            $godName = $name;
            break;
        }
    }
    if (!$godName) return null;

    $safeName = addslashes($godName);
    $row = (int)$this->game->getUniqueValueFromDB(
        "SELECT track_row FROM player_god
         WHERE player_id = $playerId AND god_name = '$safeName'"
    );

    // Max row is 6 (top of track)
    if ($row >= 6) return null;

    return $godName;
}
```

- [ ] **Step 2: Add advanceableGod to getArgs()**

In `getArgs()` return array, add after `'discardableInjuryCount'`:

```php
'advanceableGod' => $this->getAdvanceableGod($playerId, $dieColor),
```

- [ ] **Step 3: Add actAdvanceGod() action method**

Add after `actDiscardInjuries()`:

```php
#[PossibleAction]
public function actAdvanceGod(string $godName, int $activePlayerId) {
    $dieIndex = $this->game->globals->get('selected_die_index');
    $die = $this->game->getObjectFromDB(
        "SELECT color FROM oracle_die WHERE player_id = $activePlayerId AND die_index = $dieIndex"
    );
    $dieColor = $die ? $die['color'] : null;

    // Validate god matches die color and is advanceable
    $advanceable = $this->getAdvanceableGod($activePlayerId, $dieColor);
    if ($advanceable !== $godName) {
        throw new UserException(clienttranslate('You cannot advance that god'));
    }

    $safeName = addslashes($godName);
    $currentRow = (int)$this->game->getUniqueValueFromDB(
        "SELECT track_row FROM player_god
         WHERE player_id = $activePlayerId AND god_name = '$safeName'"
    );

    // Special case: from row 0, jump to PLAYER_COUNT_ROW
    if ($currentRow === 0) {
        $playerCount = (int)$this->game->getUniqueValueFromDB("SELECT COUNT(*) FROM player");
        $newRow = MaterialDefs::PLAYER_COUNT_ROW[$playerCount] ?? 1;
    } else {
        $newRow = $currentRow + 1;
    }

    $this->game->DbQuery(
        "UPDATE player_god SET track_row = $newRow
         WHERE player_id = $activePlayerId AND god_name = '$safeName'"
    );

    // Spend the die
    $this->game->DbQuery(
        "UPDATE oracle_die SET is_used = 1
         WHERE player_id = $activePlayerId AND die_index = $dieIndex"
    );
    $this->game->globals->set('selected_die_index', null);

    $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name}'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "god_name" => $godName,
        "new_row" => $newRow,
    ]);

    $this->notify->all("dieUsed", '', [
        "player_id" => $activePlayerId,
        "die_index" => $dieIndex,
    ]);

    // Return to actions or consult oracle
    $unused = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM oracle_die WHERE player_id = $activePlayerId AND is_used = 0"
    );
    if ($unused === 0) {
        return ConsultOracle::class;
    }
    return PlayerActions::class;
}
```

- [ ] **Step 4: Commit**

```bash
git add modules/php/States/SelectAction.php
git commit -m "feat: add advance god action to SelectAction"
```

---

### Task 3: Frontend — Action Buttons + Notification Handlers

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Add Discard Injuries button in SelectAction case**

In `onUpdateActionButtons`, `case 'SelectAction':` (line 1100), add after the explore island button block (before the Cancel button at line 1159):

```javascript
if (args && args.discardableInjuryCount && args.discardableInjuryCount > 0) {
    this.statusBar.addActionButton(_('Discard Injuries'), () => {
        this.bgaPerformAction("actDiscardInjuries", {});
    });
}
```

- [ ] **Step 2: Add Advance God button**

Add after the Discard Injuries button:

```javascript
if (args && args.advanceableGod) {
    var godLabel = args.advanceableGod.charAt(0).toUpperCase() + args.advanceableGod.slice(1);
    this.statusBar.addActionButton(_('Advance') + ' ' + godLabel, () => {
        this.bgaPerformAction("actAdvanceGod", { godName: args.advanceableGod });
    });
}
```

- [ ] **Step 3: Add notif_injuriesDiscarded handler**

Add with the other notification handlers (after `notif_shrineExplored`):

```javascript
notif_injuriesDiscarded: function(args) {
    console.log('notif_injuriesDiscarded', args);
    // Visual card removal deferred to injury card UI phase
},
```

- [ ] **Step 4: Add notif_godAdvanced handler**

```javascript
notif_godAdvanced: function(args) {
    console.log('notif_godAdvanced', args);
    this.components.positionGodToken(
        parseInt(args.player_id),
        args.god_name,
        parseInt(args.new_row)
    );
},
```

- [ ] **Step 5: Bump DELPHI_JS_VERSION**

```javascript
var DELPHI_JS_VERSION = "v35";
```

- [ ] **Step 6: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat: add discard injuries + advance god buttons and notification handlers"
```

---

### Task 4: Frontend — God Track Setup on Page Load

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Add setupGodsFromGamedata() method**

Add after `getShrineOwnerGameColor()` (around line 880):

```javascript
/**
 * Initialize god track tokens from gamedatas.
 * Creates god tokens for each player and positions them at their current rows.
 */
setupGodsFromGamedata: function(gamedatas) {
    if (!gamedatas.gods || !gamedatas.players) return;
    var self = this;
    var playerCount = Object.keys(gamedatas.players).length;

    this.components.initGodTrack(playerCount);

    // Create and position all god tokens
    gamedatas.gods.forEach(function(god) {
        var playerId = parseInt(god.playerId);
        var player = gamedatas.players[playerId];
        if (!player) return;
        var playerColor = '#' + player.playerColor;

        self.components.createGodToken(playerId, god.godName, playerColor);
        self.components.positionGodToken(playerId, god.godName, parseInt(god.trackRow));
    });
},
```


- [ ] **Step 2: Call setupGodsFromGamedata in setup()**

Add after `this.setupShrinesFromGamedata(gamedatas);` (line 141):

```javascript
this.setupGodsFromGamedata(gamedatas);
```

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphigzed.js
git commit -m "feat: wire up god track token initialization from gamedatas"
```

---

### Task 5: Verification

- [ ] **Step 1: Start a new game and verify god tokens appear**

All 6 god tokens per player should appear in the starting row (row 0) of the god track.

- [ ] **Step 2: Select a die and verify buttons**

- If you have injury cards matching the die color → "Discard Injuries" button appears
- If the matching god isn't at max row → "Advance [God Name]" button appears

- [ ] **Step 3: Test Advance God**

Click the advance button. Verify:
- God token moves from row 0 to PLAYER_COUNT_ROW (row 1 for 4P, row 2 for 3P, row 3 for 2P)
- Die is consumed
- Notification appears in game log

- [ ] **Step 4: Test Discard Injuries**

Draw some injury cards (via Titan attack or test), then use a matching die to discard. Verify:
- All matching injuries removed from hand
- Die is consumed
- Notification appears in game log

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for basic die actions"
```

---

## Summary

| Task | Description | Files |
|------|------------|-------|
| 1 | Discard Injuries backend | SelectAction.php |
| 2 | Advance God backend | SelectAction.php |
| 3 | Action buttons + notif handlers | theoracleofdelphigzed.js |
| 4 | God track setup on page load | theoracleofdelphigzed.js |
| 5 | Integration verification | all |
