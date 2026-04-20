# Equipment Cards — Batch 1 (Infra + Canaries) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Commit policy (user preference):** Never commit without explicit user approval. Every "Commit" step means: stage the files, show the user a file list + drafted message, wait for `yes`, then commit. Do NOT include `Co-Authored-By: Claude …` trailers. After each approved commit, auto-merge `--no-ff` into local `master`. No CodeRabbit.

**Goal:** Land shared infrastructure for equipment cards (DB flag, ownership helper, activation dispatcher, reaction hook point, card click UI, notification conventions) and prove it works by shipping 5 canary cards — one per effect archetype.

**Architecture:** Add an `is_used` column to the `card` table (dev-seeded via `ensureCardColumns()`). Extend `SelectAction` with a single `actActivateEquipment($cardId)` dispatcher that resolves inline effects or transitions to sub-states. Reactions fire synchronously in the triggering state's `onEnteringState` (Hero pattern). Five canary cards — 008 (passive), 000 (reaction), 003 (once-per-turn activated), 007 (one-time lifetime activated), 017 (one-time + sub-selection) — cover every code path.

**Tech Stack:** PHP 8 (BGA framework), JS (BGA game module, AMD), MySQL, CSS.

**Spec:** [`docs/superpowers/specs/2026-04-19-equipment-cards-infra-design.md`](../specs/2026-04-19-equipment-cards-infra-design.md).

---

## File Structure

**Create:**
- `modules/php/States/SelectOfferingFromAnyIsland.php` — new sub-state, ~120 lines, handles card 017's island/color pick.

**Modify:**
- `dbmodel.sql` — base schema comment for the eventual migration (dev uses `ensureCardColumns()`).
- `modules/php/Game.php` — add `ensureCardColumns()` helper + call, `playerOwnsEquipment()` helper, `equipmentName()` helper, reset `equipment_bonus_action_used` in the per-turn cleanup block, include `is_used` in `getAllDatas()` card rows.
- `modules/php/MaterialDefs.php` — add `EQUIPMENT_NAMES` constant.
- `modules/php/States/SelectAction.php` — add `activatableEquipment` to `getArgs`, add `actActivateEquipment` dispatcher.
- `modules/php/States/ConsultOracle.php` — inject reaction check for cards 000/001/002 after dice roll (only 000 active in this batch; 001/002 guarded by `playerOwnsEquipment`).
- `modules/php/States/MoveShip.php` — +1 range if player owns equipment 8.
- `modules/php/States/ChooseGodAdvancement.php` — accept an optional `max_gods` budget so card 007 can allow "1 or 2 gods, 2 steps total".
- `modules/php/DevTools.php` — `giveEquipment($cardTypeArg)` helper.
- `theoracleofdelphigzed.js` — `onEquipmentCardClick`, notif handlers, reload-path `.used` class.
- `modules/js/Components.js` — attach click listener in `addEquipmentCard`.
- `theoracleofdelphigzed.css` — `.delphi-equipment-card.used` + `.delphi-equipment-card.activatable` rules.
- `theoracleofdelphigzed_theoracleofdelphigzed.tpl` — add `title` attr template variable on `jstpl_equipment_card`.

---

## Part A — Infrastructure

### Task A1: Add `is_used` column to `card` table (dev-mode)

**Files:**
- Modify: `modules/php/Game.php` (mirror `ensurePlayerColumns` at ~line 93)
- Modify: `dbmodel.sql` (add `-- TODO pre-release: add is_used TINYINT UNSIGNED NOT NULL DEFAULT 0 to card table` comment near the `card` table definition)

- [ ] **Step 1: Add `ensureCardColumns()` method in `Game.php`**

Immediately below the existing `ensurePlayerColumns()` method (around line 115), add:

```php
    private function ensureCardColumns(): void
    {
        $columns = [
            'is_used' => 'TINYINT UNSIGNED NOT NULL DEFAULT 0',
        ];

        $existing = array_column(
            self::getObjectListFromDB("SHOW COLUMNS FROM `card`"),
            'Field'
        );

        foreach ($columns as $name => $definition) {
            if (!in_array($name, $existing, true)) {
                static::DbQuery("ALTER TABLE `card` ADD `$name` $definition");
            }
        }
    }
```

- [ ] **Step 2: Call it from the same place `ensurePlayerColumns()` is called**

Find every call site of `ensurePlayerColumns()` in `Game.php` and add `$this->ensureCardColumns();` immediately after it.

- [ ] **Step 3: Add pre-release comment to `dbmodel.sql`**

Near the `card` table definition, add a single-line comment:
```sql
-- TODO pre-release: add `is_used` TINYINT UNSIGNED NOT NULL DEFAULT 0
```

- [ ] **Step 4: Verify the column exists**

Restart the BGA Studio game server (or hit the game URL to trigger setup). In MySQL:
```sql
SHOW COLUMNS FROM card LIKE 'is_used';
```
Expected: 1 row, `is_used` / `tinyint unsigned` / `NO` / `0`.

- [ ] **Step 5: Commit (await user approval)**
```
feat(equipment): add is_used column to card table (dev workaround)
```
Files: `modules/php/Game.php`, `dbmodel.sql`.

---

### Task A2: `EQUIPMENT_NAMES` + `equipmentName()` helper

**Files:**
- Modify: `modules/php/MaterialDefs.php` (after `COMPANION_NAMES` at ~line 172)
- Modify: `modules/php/Game.php` (near `companionName()`)

- [ ] **Step 1: Add `EQUIPMENT_NAMES` to `MaterialDefs.php`**

```php
    public const EQUIPMENT_NAMES = [
         0 => 'Yellow Charm',      1 => 'Red Charm',         2 => 'Black Charm',
         3 => 'Bonus Action',      4 => 'Hermes Amulet',     5 => 'Artemis Amulet',
         6 => 'Poseidon Amulet',   7 => 'Divine Favor',      8 => 'Quadrireme',
         9 => 'Long Hook',        10 => 'Seafarer Charm',   11 => 'Blessed Reward',
        12 => 'Altar Caller',     13 => 'Island Scout',     14 => 'Shallow Runner',
        15 => 'Pain Tolerance',   16 => 'Reinforced Hull',  17 => 'Warm Offering Hook',
        18 => 'Cool Offering Hook', 19 => 'Cool Statue Hook', 20 => 'Warm Statue Hook',
        21 => 'Divine Surge',
    ];
```

(Names are descriptive placeholders — can be refined later if BGA card art provides canonical names.)

- [ ] **Step 2: Add `equipmentName()` method to `Game.php`**

Place next to `companionName()`:

```php
    public function equipmentName(int $cardTypeArg): string
    {
        return MaterialDefs::EQUIPMENT_NAMES[$cardTypeArg] ?? ('Equipment #' . $cardTypeArg);
    }
```

- [ ] **Step 3: Verify by tailing BGA logs**

After next page load, confirm no PHP warnings or undefined-constant errors referencing `EQUIPMENT_NAMES`.

- [ ] **Step 4: Commit (await approval)**
```
feat(equipment): add EQUIPMENT_NAMES constant and equipmentName helper
```

---

### Task A3: `playerOwnsEquipment()` helper

**Files:**
- Modify: `modules/php/Game.php` (next to `playerOwnsCompanion` at ~line 1020)

- [ ] **Step 1: Add method**

```php
    public function playerOwnsEquipment(int $playerId, int $cardTypeArg, bool $unusedOnly = true): bool
    {
        $usedClause = $unusedOnly ? ' AND is_used = 0' : '';
        $count = (int)$this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM card WHERE card_type = 'equipment'
             AND card_location = 'hand' AND card_location_arg = $playerId
             AND card_type_arg = $cardTypeArg" . $usedClause
        );
        return $count > 0;
    }
```

- [ ] **Step 2: Smoke test via temporary DevTools call**

Add a temporary button in `DevTools.php` (or run via console) that calls `$this->playerOwnsEquipment($pid, 0)` on a player who owns card 0 after you seed it manually via SQL. Verify returns `true`. Remove the temporary button before commit.

- [ ] **Step 3: Commit (await approval)**
```
feat(equipment): add playerOwnsEquipment ownership helper
```

---

### Task A4: `is_used` flag in `getAllDatas()` output

**Files:**
- Modify: `modules/php/Game.php` — find the block that builds the player hand for `getAllDatas()`

- [ ] **Step 1: Locate the hand-building block**

Grep for `card_type = 'equipment'` or similar hand-building queries in `Game.php`. Identify the block where equipment cards are serialized into the gamedatas payload (most likely under `$result['hand']` or per-player `equipment`).

- [ ] **Step 2: Include `is_used` in the SELECT**

If the current query is:
```sql
SELECT card_id, card_type, card_type_arg FROM card WHERE card_location = 'hand' ...
```
change it to include `is_used`:
```sql
SELECT card_id, card_type, card_type_arg, is_used FROM card WHERE card_location = 'hand' ...
```

And ensure the `is_used` column propagates into the JS-facing array (often keyed as `isUsed` or left as `is_used` — follow the convention already used by other columns in that block).

- [ ] **Step 3: Verify in browser**

Reload a game, open devtools console, run:
```js
gameui.gamedatas.players[gameui.player_id].hand
```
Confirm equipment cards now have an `is_used` field.

- [ ] **Step 4: Commit (await approval)**
```
feat(equipment): expose is_used flag in getAllDatas
```

---

### Task A5: Per-turn reset of `equipment_bonus_action_used`

**Files:**
- Modify: `modules/php/Game.php:1230` (the per-turn globals reset block)

- [ ] **Step 1: Add the global reset**

The existing block reads:
```php
        $this->globals->set('selected_die_index', null);
        $this->globals->set('oracle_card_played', 0);
        $this->globals->set('selected_oracle_card_id', 0);
```

Add one line:
```php
        $this->globals->set('equipment_bonus_action_used', 0);
```

- [ ] **Step 2: Commit (await approval)**
```
feat(equipment): reset equipment_bonus_action_used per turn
```

---

### Task A6: Equipment card click in `Components.js`

**Files:**
- Modify: `modules/js/Components.js:1839` — `addEquipmentCard`

- [ ] **Step 1: Extend `addEquipmentCard` to accept a click callback**

Current signature (approximate): `addEquipmentCard(id, imgUrl)`. Change to:
```javascript
addEquipmentCard: function(id, imgUrl, opts) {
    opts = opts || {};
    // ... existing element creation ...
    var el = this.equipmentCards.get(id) || /* create element as today */;

    if (opts.onClick) {
        el.addEventListener('click', function() { opts.onClick(id); });
        el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onClick(id); }
        });
    }
    if (opts.isUsed) el.classList.add('used');
    return el;
},
```

Keep backwards compatibility: if `opts` is omitted, behave exactly as today.

- [ ] **Step 2: Verify existing callers still work**

Grep for `addEquipmentCard(` across the JS. Reload the game — equipment cards still render, no JS errors.

- [ ] **Step 3: Commit (await approval)**
```
feat(equipment): accept click handler and used state in addEquipmentCard
```

---

### Task A7: CSS for activatable/used equipment cards

**Files:**
- Modify: `theoracleofdelphigzed.css` (near the existing `.oracle-card-selectable` rule at ~line 2732)

- [ ] **Step 1: Add rules**

```css
.delphi-equipment-card.used {
    filter: grayscale(1);
    opacity: 0.5;
    cursor: default;
}
.delphi-equipment-card.activatable {
    cursor: pointer;
    outline: 3px solid #FFD700;
    outline-offset: 2px;
    animation: cargo-pulse 1.2s ease-in-out infinite;
}
.delphi-equipment-card.activatable:hover {
    transform: scale(1.05);
    transition: transform 120ms ease-out;
}
```

- [ ] **Step 2: Verify**

Manually add `.activatable` and `.used` to an equipment card via browser devtools — confirm gold pulse and grey-out both render correctly.

- [ ] **Step 3: Commit (await approval)**
```
feat(equipment): add activatable/used card CSS
```

---

### Task A8: `onEquipmentCardClick` dispatcher in main JS

**Files:**
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Add the handler**

Place near `_setupOracleCardClickHandlers` (~line 2431):

```javascript
        onEquipmentCardClick: function(cardId) {
            var args = this.gamedatas.gamestate.args || {};
            var activatable = args.activatableEquipment || [];
            var found = activatable.some(function(e) { return e.card_id == cardId; });
            if (!found) {
                // Brief visual feedback: shake
                var el = this._components.equipmentCards.get(cardId);
                if (el) {
                    el.classList.add('shake-feedback');
                    setTimeout(function() { el.classList.remove('shake-feedback'); }, 400);
                }
                return;
            }
            this.bgaPerformAction('actActivateEquipment', { card_id: cardId });
        },
```

(Path to `this._components.equipmentCards` may be slightly different — check what `addEquipmentCard` stores into. Use the actual path you observe.)

- [ ] **Step 2: Wire it up where equipment cards are rendered**

Find every call to `addEquipmentCard` in `theoracleofdelphigzed.js`. Update each to pass the new opts object:

```javascript
this._components.addEquipmentCard(card.card_id, imgUrl, {
    onClick: this.onEquipmentCardClick.bind(this),
    isUsed: !!card.is_used,
});
```

- [ ] **Step 3: Add `.shake-feedback` CSS** (if not already present)

In `theoracleofdelphigzed.css`:
```css
@keyframes equipment-shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-4px); }
    75% { transform: translateX(4px); }
}
.delphi-equipment-card.shake-feedback {
    animation: equipment-shake 300ms ease-in-out;
}
```

- [ ] **Step 4: Manual test**

Reload game. Click an equipment card while no activatable list is set — card should shake, no server call. Verify via Network tab that no request is sent.

- [ ] **Step 5: Commit (await approval)**
```
feat(equipment): add onEquipmentCardClick dispatcher with disabled feedback
```

---

### Task A9: Notification handlers

**Files:**
- Modify: `theoracleofdelphigzed.js` (in the `setupNotifications` block)

- [ ] **Step 1: Register handlers**

```javascript
dojo.subscribe('equipmentActivated', this, 'notif_equipmentActivated');
this.notifqueue.setSynchronous('equipmentActivated', 400);

dojo.subscribe('equipmentReactionTriggered', this, 'notif_equipmentReactionTriggered');
this.notifqueue.setSynchronous('equipmentReactionTriggered', 600);

dojo.subscribe('equipmentUsed', this, 'notif_equipmentUsed');
```

- [ ] **Step 2: Implement handlers**

```javascript
notif_equipmentActivated: function(n) {
    // Log-only. Server-side message template handles the text.
},

notif_equipmentReactionTriggered: function(n) {
    var pid = n.args.player_id;
    if (typeof n.args.favor_delta === 'number') {
        this.updatePlayerFavor(pid, n.args.favor_delta);  // or this project's favor-update method
    }
    var el = this._components.equipmentCards.get(n.args.card_id);
    if (el) {
        el.classList.add('equipment-pulse');
        setTimeout(function() { el.classList.remove('equipment-pulse'); }, 800);
    }
},

notif_equipmentUsed: function(n) {
    var el = this._components.equipmentCards.get(n.args.card_id);
    if (el) el.classList.add('used');
},
```

- [ ] **Step 3: Add `.equipment-pulse` CSS**

```css
@keyframes equipment-pulse {
    0%, 100% { box-shadow: none; }
    50% { box-shadow: 0 0 18px 6px rgba(255, 215, 0, 0.8); }
}
.delphi-equipment-card.equipment-pulse {
    animation: equipment-pulse 800ms ease-in-out;
}
```

- [ ] **Step 4: Commit (await approval)**
```
feat(equipment): add client notif handlers for activate/react/use
```

---

### Task A10: `SelectAction::actActivateEquipment` dispatcher skeleton

**Files:**
- Modify: `modules/php/States/SelectAction.php`

- [ ] **Step 1: Add the dispatcher**

Near the other `#[PossibleAction]` methods:

```php
    #[\Bga\GameFramework\PossibleAction]
    public function actActivateEquipment(int $cardId, int $activePlayerId): string
    {
        $row = $this->game->getObjectFromDB(
            "SELECT card_id, card_type, card_type_arg, card_location, card_location_arg, is_used
             FROM card WHERE card_id = $cardId"
        );
        if (!$row
            || $row['card_type'] !== 'equipment'
            || $row['card_location'] !== 'hand'
            || (int)$row['card_location_arg'] !== $activePlayerId) {
            throw new \BgaUserException('Invalid equipment card.');
        }

        $cardTypeArg = (int)$row['card_type_arg'];

        switch ($cardTypeArg) {
            case 3:
                return $this->activateEquipment003($activePlayerId, $cardId);
            case 7:
                return $this->activateEquipment007($activePlayerId, $cardId);
            case 17:
                return $this->activateEquipment017($activePlayerId, $cardId, $row);
            default:
                throw new \BgaUserException('Equipment card not activatable.');
        }
    }
```

- [ ] **Step 2: Add private method stubs that throw**

```php
    private function activateEquipment003(int $pid, int $cardId): string
    {
        throw new \BgaUserException('Equipment 3 not yet implemented');
    }
    private function activateEquipment007(int $pid, int $cardId): string
    {
        throw new \BgaUserException('Equipment 7 not yet implemented');
    }
    private function activateEquipment017(int $pid, int $cardId, array $row): string
    {
        throw new \BgaUserException('Equipment 17 not yet implemented');
    }
```

These will be filled in Part B.

- [ ] **Step 3: Commit (await approval)**
```
feat(equipment): add actActivateEquipment dispatcher skeleton
```

---

### Task A11: `activatableEquipment` in `SelectAction::getArgs`

**Files:**
- Modify: `modules/php/States/SelectAction.php:82-103` (the final `return` array)

- [ ] **Step 1: Compute activatable list**

Above the `return [ ... ]` block, add:

```php
        $activatableEquipment = $this->computeActivatableEquipment($playerId, $playerFavor);
```

- [ ] **Step 2: Add the list to the return array**

```php
            'activatableEquipment' => $activatableEquipment,
```

- [ ] **Step 3: Add `computeActivatableEquipment()` helper**

```php
    private function computeActivatableEquipment(int $playerId, int $favor): array
    {
        $cards = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg, is_used FROM card
             WHERE card_type = 'equipment'
             AND card_location = 'hand'
             AND card_location_arg = $playerId"
        );

        $bonusUsed = (int)$this->game->globals->get('equipment_bonus_action_used');

        $out = [];
        foreach ($cards as $c) {
            $arg = (int)$c['card_type_arg'];
            $used = (int)$c['is_used'];
            $activatable = false;
            switch ($arg) {
                case 3:
                    $activatable = ($bonusUsed === 0 && $favor >= 3);
                    break;
                case 7:
                    $activatable = ($used === 0);
                    break;
                case 17:
                    $activatable = ($used === 0 && $this->hasAnyOffering(['red','green','yellow']));
                    break;
            }
            if ($activatable) {
                $out[] = ['card_id' => (int)$c['card_id'], 'card_type_arg' => $arg];
            }
        }
        return $out;
    }

    private function hasAnyOffering(array $colors): bool
    {
        $list = "'" . implode("','", array_map('addslashes', $colors)) . "'";
        return (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM offering WHERE color IN ($list) AND island_id IS NOT NULL"
        ) > 0;
    }
```

(If the `offering` table/columns differ, adapt `hasAnyOffering` to match the actual schema — grep `offering` in `modules/php/` to find the real table.)

- [ ] **Step 4: Verify**

Reload game. Console: `gameui.gamedatas.gamestate.args.activatableEquipment` — empty array is fine (no cards seeded yet). No JS or PHP errors.

- [ ] **Step 5: Commit (await approval)**
```
feat(equipment): expose activatableEquipment list in SelectAction args
```

---

### Task A12: `DevTools::giveEquipment($cardTypeArg)`

**Files:**
- Modify: `modules/php/DevTools.php`

- [ ] **Step 1: Add the helper**

```php
    public function giveEquipment(int $cardTypeArg): void
    {
        $pid = (int)$this->game->getActivePlayerId();
        // Pull one from deck if available, otherwise reuse a discard/display row.
        $row = $this->game->getObjectFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'equipment' AND card_type_arg = $cardTypeArg
             AND card_location IN ('deck','display')
             LIMIT 1"
        );
        if (!$row) {
            throw new \BgaUserException("No equipment card of type $cardTypeArg available");
        }
        $cardId = (int)$row['card_id'];
        $this->game->DbQuery(
            "UPDATE card SET card_location='hand', card_location_arg=$pid, is_used=0
             WHERE card_id = $cardId"
        );
        $this->game->notify->all('equipmentGrantedDev', clienttranslate('[dev] ${player_name} is given ${equipment_name}'), [
            'player_id' => $pid,
            'player_name' => $this->game->getPlayerNameById($pid),
            'card_id' => $cardId,
            'card_type_arg' => $cardTypeArg,
            'equipment_name' => $this->game->equipmentName($cardTypeArg),
        ]);
    }
```

- [ ] **Step 2: Add a DevTools button that calls `giveEquipment(0)`** (or a small input selector for any of 0–21) to exercise manually.

- [ ] **Step 3: Smoke test**

Use the DevTools button to seed card 0. Confirm it appears in hand; `is_used = 0` in DB.

- [ ] **Step 4: Commit (await approval)**
```
chore(devtools): add giveEquipment helper for canary testing
```

---

## Part B — Canary Cards

### Task B1: Card 008 — Passive range +1

**Files:**
- Modify: `modules/php/States/MoveShip.php:22-48` — `getMovementRange`

- [ ] **Step 1: Add the ownership check**

In `getMovementRange`, after the ship-tile `range_plus_2` block and before the companion-creature block, add:

```php
        // Equipment 008: Quadrireme — +1 ship range.
        if ($this->game->playerOwnsEquipment($playerId, 8)) {
            $range += 1;
        }
```

- [ ] **Step 2: Manual test**

Seed card 8 via `giveEquipment(8)`. Roll a die, enter Move Ship. Verify the highlighted hex range shows one more ring than without the card. Remove card (SQL: `UPDATE card SET card_location='deck' WHERE card_type_arg=8 AND card_location='hand'`). Verify range returns to normal.

- [ ] **Step 3: Commit (await approval)**
```
feat(equipment): card 008 Quadrireme grants +1 ship range
```

---

### Task B2: Card 000 — Yellow die reaction on Consult Oracle

**Files:**
- Modify: `modules/php/States/ConsultOracle.php:14-57` — `onEnteringState`

- [ ] **Step 1: Add reaction logic after the `diceRolled` notify**

Just after:
```php
        $this->notify->all("diceRolled", '', [
            "player_id" => $activePlayerId,
            "colors" => $newColors,
        ]);
```
insert:
```php
        $this->grantOracleColorReactions($activePlayerId, $newColors);
```

- [ ] **Step 2: Implement `grantOracleColorReactions` in the same file**

```php
    private function grantOracleColorReactions(int $playerId, array $rolledColors): void
    {
        $reactionCards = [
            0 => 'yellow',
            1 => 'red',
            2 => 'black',
        ];
        foreach ($reactionCards as $cardTypeArg => $requiredColor) {
            if (!$this->game->playerOwnsEquipment($playerId, $cardTypeArg)) continue;
            if (!in_array($requiredColor, $rolledColors, true)) continue;

            $this->game->DbQuery(
                "UPDATE player SET favor_tokens = favor_tokens + 2 WHERE player_id = $playerId"
            );
            $cardRow = $this->game->getObjectFromDB(
                "SELECT card_id FROM card WHERE card_type='equipment'
                 AND card_type_arg=$cardTypeArg AND card_location='hand'
                 AND card_location_arg=$playerId LIMIT 1"
            );
            $this->notify->all('equipmentReactionTriggered',
                clienttranslate('${player_name} gains 2 Favor from ${equipment_name} (${color} shown)'),
                [
                    'player_id' => $playerId,
                    'player_name' => $this->game->getPlayerNameById($playerId),
                    'card_id' => $cardRow ? (int)$cardRow['card_id'] : 0,
                    'equipment_name' => $this->game->equipmentName($cardTypeArg),
                    'color' => $requiredColor,
                    'favor_delta' => 2,
                ]
            );
        }
    }
```

(Cards 001/002 become automatically live once they're added in a later batch — they share this code path.)

- [ ] **Step 3: Manual test**

Seed card 0 via DevTools. Consult the oracle; reroll dice until at least one lands yellow. Expected: log shows "… gains 2 Favor from Yellow Charm (yellow shown)"; favor counter ticks up by 2. With no yellow die: no notification, no favor gain.

- [ ] **Step 4: Commit (await approval)**
```
feat(equipment): card 000 grants +2 Favor on Consult when yellow shown
```

---

### Task B3: Card 003 — Bonus action for 3 Favor (once per turn)

**Files:**
- Modify: `modules/php/States/SelectAction.php` — replace the `activateEquipment003` stub

- [ ] **Step 1: Verify how actions are "granted"**

Before writing code, grep `modules/php/States/` for how actions are granted when favor is spent on recolor, or how ship-tile abilities add actions. Identify the mechanism: is it a counter global, a flag, or a dice-based source? Find the state/field that gates "can the player still act this turn".

- [ ] **Step 2: Implement `activateEquipment003`**

Assuming actions are gated by whether any action source (e.g., an unused oracle die) is available, card 003 grants one extra turn by marking a virtual source:

```php
    private function activateEquipment003(int $pid, int $cardId): string
    {
        $bonusUsed = (int)$this->game->globals->get('equipment_bonus_action_used');
        if ($bonusUsed !== 0) {
            throw new \BgaUserException('Bonus action already used this turn.');
        }
        $favor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $pid"
        );
        if ($favor < 3) {
            throw new \BgaUserException('Not enough Favor.');
        }

        $this->game->DbQuery(
            "UPDATE player SET favor_tokens = favor_tokens - 3 WHERE player_id = $pid"
        );
        $this->game->globals->set('equipment_bonus_action_used', 1);
        $this->game->globals->set('equipment_bonus_action_available', 1);

        $this->game->notify->all('equipmentActivated',
            clienttranslate('${player_name} activates ${equipment_name} (spends 3 Favor for a bonus action)'),
            [
                'player_id' => $pid,
                'player_name' => $this->game->getPlayerNameById($pid),
                'card_id' => $cardId,
                'equipment_name' => $this->game->equipmentName(3),
            ]
        );

        return SelectAction::class;
    }
```

- [ ] **Step 3: Make the bonus action consumable**

In the existing turn-end check (wherever the code asks "is the player out of actions?"), allow `equipment_bonus_action_available=1` to grant one more action. On consumption, set it back to 0.

Grep `PlayerActions` and `SelectAction` for the turn-end condition; add `equipment_bonus_action_available` as an alternative action source (similar pattern to how selected dice are consumed). The bonus action has no die color — when it's the source, any action color is allowed.

(The exact wiring depends on how "action of any color" is already modeled for the Pythia center / oracle-card-wild flow. Mirror that pattern.)

- [ ] **Step 4: Reset both globals per turn**

In the block edited in Task A5, also reset:
```php
        $this->globals->set('equipment_bonus_action_available', 0);
```

- [ ] **Step 5: Manual test**

Seed card 003. Confirm it's greyed when favor < 3. At favor ≥ 3: click activates; favor drops by 3; SelectAction state reopens with an extra action available (of any color). Take the bonus action. Verify the card can only be activated once per turn (second click → disabled feedback).

- [ ] **Step 6: Commit (await approval)**
```
feat(equipment): card 003 Bonus Action — spend 3 Favor for extra action
```

---

### Task B4: Card 007 — One-time big bonus (favor + oracle + god steps)

**Files:**
- Modify: `modules/php/States/SelectAction.php` — replace `activateEquipment007` stub
- Modify: `modules/php/States/ChooseGodAdvancement.php` — accept a `max_gods` budget

- [ ] **Step 1: Extend `ChooseGodAdvancement` for multi-god budget**

Today the state decrements `god_steps_remaining`. Card 007 needs "1 or 2 gods, 2 steps total". Since the state already lets the player pick any god each step, this is already supported — the player can spend both steps on the same god or split across two. The only addition: a "Done" button that exits early after ≥1 step spent (for players who want to stop at 1 god × 1 step).

Wait — card 007 is 2 steps total, not ≤2 steps. So we need exactly 2 steps. Leave `ChooseGodAdvancement` as-is (which already forces spending all steps).

No change needed in `ChooseGodAdvancement`. (This task step collapses to "verify current behavior matches the rule".)

- [ ] **Step 2: Implement `activateEquipment007`**

```php
    private function activateEquipment007(int $pid, int $cardId): string
    {
        // Grant 3 favor + 1 oracle card + 2 god steps (1-2 gods).
        $this->game->DbQuery(
            "UPDATE player SET favor_tokens = favor_tokens + 3 WHERE player_id = $pid"
        );
        // Draw 1 oracle card.
        $this->game->drawOracleCard($pid);  // assume existing helper; grep to confirm name

        // Mark card used.
        $this->game->DbQuery(
            "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
        );

        $this->game->notify->all('equipmentActivated',
            clienttranslate('${player_name} activates ${equipment_name} (+3 Favor, +1 Oracle Card, advance gods 2 steps)'),
            [
                'player_id' => $pid,
                'player_name' => $this->game->getPlayerNameById($pid),
                'card_id' => $cardId,
                'equipment_name' => $this->game->equipmentName(7),
            ]
        );
        $this->game->notify->all('equipmentUsed', '', [
            'player_id' => $pid,
            'card_id' => $cardId,
        ]);

        // Transition to god advance with 2 steps.
        $this->game->globals->set('god_steps_remaining', 2);
        $this->game->globals->set('god_advance_source', 'equipment_7');
        return ChooseGodAdvancement::class;
    }
```

(Confirm the oracle-card-draw helper name via grep; substitute as appropriate.)

- [ ] **Step 3: Manual test**

Seed card 007. Activate it. Verify:
- +3 favor, +1 oracle card in hand, card goes grey.
- `ChooseGodAdvancement` state opens with 2 steps remaining.
- Advance one god twice (same god) → returns to SelectAction.
- Activate again → disabled feedback (is_used=1).

- [ ] **Step 4: Commit (await approval)**
```
feat(equipment): card 007 Divine Favor — one-time +3 Favor, +1 card, 2 god steps
```

---

### Task B5: Card 017 — Take a red/green/yellow offering from any island

**Files:**
- Create: `modules/php/States/SelectOfferingFromAnyIsland.php`
- Modify: `modules/php/States/SelectAction.php` — implement `activateEquipment017`
- Modify: `modules/php/Game.php` — register state in `states.inc.php` (if that's the wiring point)

- [ ] **Step 1: Create the new state class**

`modules/php/States/SelectOfferingFromAnyIsland.php`:

```php
<?php
declare(strict_types=1);

namespace Bga\Games\theoracleofdelphigzed\States;

use Bga\GameFramework\States\GameState;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class SelectOfferingFromAnyIsland extends GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 47,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must pick an offering'),
            descriptionMyTurn: clienttranslate('${you}: pick an offering to take'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $colorOptionsJson = (string)$this->game->globals->get('eq17_color_options');
        $colorOptions = $colorOptionsJson ? json_decode($colorOptionsJson, true) : ['red','green','yellow'];
        $cardId = (int)$this->game->globals->get('eq17_card_id');

        $list = "'" . implode("','", array_map('addslashes', $colorOptions)) . "'";
        $rows = $this->game->getObjectListFromDB(
            "SELECT offering_id, island_id, color FROM offering
             WHERE color IN ($list) AND island_id IS NOT NULL"
        );
        return [
            'card_id' => $cardId,
            'color_options' => $colorOptions,
            'offerings' => $rows,
        ];
    }

    #[\Bga\GameFramework\PossibleAction]
    public function actConfirmOffering(int $offeringId, int $activePlayerId): string
    {
        $row = $this->game->getObjectFromDB(
            "SELECT offering_id, island_id, color FROM offering WHERE offering_id = $offeringId"
        );
        $colorOptionsJson = (string)$this->game->globals->get('eq17_color_options');
        $colorOptions = $colorOptionsJson ? json_decode($colorOptionsJson, true) : ['red','green','yellow'];
        if (!$row || $row['island_id'] === null || !in_array($row['color'], $colorOptions, true)) {
            throw new \BgaUserException('Invalid offering choice.');
        }
        $cardId = (int)$this->game->globals->get('eq17_card_id');

        // Transfer offering to player's ship storage.
        $this->game->loadOfferingToShip($activePlayerId, (int)$offeringId);  // grep for actual helper name

        // Mark card used.
        $this->game->DbQuery(
            "UPDATE card SET is_used = 1 WHERE card_id = $cardId"
        );

        $this->game->notify->all('equipmentActivated',
            clienttranslate('${player_name} takes a ${color} Offering from the board (${equipment_name})'),
            [
                'player_id' => $activePlayerId,
                'player_name' => $this->game->getPlayerNameById($activePlayerId),
                'card_id' => $cardId,
                'equipment_name' => $this->game->equipmentName(17),
                'color' => $row['color'],
            ]
        );
        $this->game->notify->all('equipmentUsed', '', [
            'player_id' => $activePlayerId,
            'card_id' => $cardId,
        ]);

        // Clear scratch globals.
        $this->game->globals->set('eq17_card_id', 0);
        $this->game->globals->set('eq17_color_options', '');

        return SelectAction::class;
    }

    public function zombie(int $playerId): string
    {
        // Auto-pick the first available offering.
        $colorOptionsJson = (string)$this->game->globals->get('eq17_color_options');
        $colorOptions = $colorOptionsJson ? json_decode($colorOptionsJson, true) : ['red','green','yellow'];
        $list = "'" . implode("','", array_map('addslashes', $colorOptions)) . "'";
        $row = $this->game->getObjectFromDB(
            "SELECT offering_id FROM offering WHERE color IN ($list) AND island_id IS NOT NULL LIMIT 1"
        );
        if ($row) {
            return $this->actConfirmOffering((int)$row['offering_id'], $playerId);
        }
        // No offering available — just exit.
        return SelectAction::class;
    }
}
```

- [ ] **Step 2: Register the state**

Find how states are registered (grep for other state-class references like `ChooseGodAdvancement::class` in `Game.php` or a states config array). Add `SelectOfferingFromAnyIsland::class` alongside the others.

- [ ] **Step 3: Implement `activateEquipment017`**

```php
    private function activateEquipment017(int $pid, int $cardId, array $row): string
    {
        // Sanity: at least one available offering of the allowed colors.
        $colors = ['red', 'green', 'yellow'];
        if (!$this->hasAnyOffering($colors)) {
            throw new \BgaUserException('No eligible offerings on the board.');
        }

        $this->game->globals->set('eq17_card_id', $cardId);
        $this->game->globals->set('eq17_color_options', json_encode($colors));

        return \Bga\Games\theoracleofdelphigzed\States\SelectOfferingFromAnyIsland::class;
    }
```

- [ ] **Step 4: Client rendering for the new state**

In `theoracleofdelphigzed.js`, handle `SelectOfferingFromAnyIsland`:
- `onEnteringState`: highlight all offerings on the board matching `args.color_options`; attach click handlers that call `actConfirmOffering`.
- `onLeavingState`: un-highlight.
- Add an "Advance Offering Picker" / "Cancel" button only if we want cancellation — otherwise, the action is committed on activation, so no cancel.

(This is a UI-heavy step. Reuse the existing offering-selection CSS from `LoadCargo` / similar states.)

- [ ] **Step 5: Manual test**

Seed card 017. Activate it. Expected:
- Board enters a state where only red/green/yellow island offerings are clickable.
- Pick one — it transfers to ship storage, card goes grey, return to SelectAction.
- Activate again → disabled (is_used=1).
- Seed 017 on a board with no red/green/yellow offerings available → activating is disabled (not in `activatableEquipment`).

- [ ] **Step 6: Commit (await approval)**
```
feat(equipment): card 017 — take a red/green/yellow offering from any island
```

---

### Task B6: Add `title` attribute to equipment cards (placeholder tooltip)

**Files:**
- Modify: `theoracleofdelphigzed_theoracleofdelphigzed.tpl:277` — `jstpl_equipment_card`
- Modify: `modules/js/Components.js` — pass description to the template
- Modify: `modules/php/Game.php` — include `description` from `EQUIPMENT_CARDS[cardTypeArg]` in getAllDatas equipment rows.

- [ ] **Step 1: Update template**

```
var jstpl_equipment_card = '<div class="delphi-equipment-card" id="equipment_${id}" data-card-id="${id}" tabindex="0" role="button" title="${effect_text}" style="background-image:url(${img_url})"></div>';
```

- [ ] **Step 2: Feed `effect_text` through `addEquipmentCard`**

```javascript
addEquipmentCard: function(id, imgUrl, opts) {
    opts = opts || {};
    var effectText = opts.effectText || '';
    // use in dojo.string.substitute for jstpl_equipment_card
    ...
}
```

- [ ] **Step 3: In main JS, pass effectText from gamedatas**

```javascript
this._components.addEquipmentCard(card.card_id, imgUrl, {
    onClick: this.onEquipmentCardClick.bind(this),
    isUsed: !!card.is_used,
    effectText: card.description || '',
});
```

- [ ] **Step 4: In `getAllDatas` equipment hand rows, include `description`**

From `MaterialDefs::EQUIPMENT_CARDS[$cardTypeArg]['description']`.

- [ ] **Step 5: Manual test**

Hover any equipment card — browser tooltip shows effect text.

- [ ] **Step 6: Commit (await approval)**
```
feat(equipment): hover title shows effect description (placeholder tooltip)
```

---

### Task B7: Plan doc update

**Files:**
- Modify: `docs/plans/game-implementation-plan.md:1089`

- [ ] **Step 1: Change the unchecked item**

Replace:
```
- [ ] Equipment card effects (22 cards) [XL]
```
with:
```
- [ ] Equipment card effects (22 cards) [XL]
  - Batch 1 (infra + 5 canaries 008/000/003/007/017) landed via `docs/superpowers/plans/2026-04-19-equipment-cards-infra-impl.md`. Remaining: batches 2-5 per spec.
```

- [ ] **Step 2: Commit (await approval)**
```
docs(plan): note equipment batch 1 landed
```

---

## Self-Review Checklist

Before marking the plan complete, verify:

1. **Spec coverage:**
   - ✓ D1 (is_used column) → Task A1
   - ✓ D2 (dispatcher + shared sub-states) → Tasks A10, A11, B5
   - ✓ D3 (reaction hooks) → Task B2
   - ✓ D4 (once-per-turn global) → Tasks A5, B3
   - ✓ D5 (5 canaries) → Tasks B1–B5
   - ✓ Schema, PHP helpers, client rendering, CSS, notifications, DevTools — all covered.
   - ✓ Tooltip placeholder → Task B6.

2. **Placeholder scan:** One intentional call-out — "(grep for actual helper name)" in Task B4 and B5 where the oracle-card-draw and ship-storage helper names weren't verified during exploration. Engineers executing the plan should grep first, substitute, and proceed.

3. **Type consistency:** `card_type_arg`, `card_id`, `playerId` used consistently; `playerOwnsEquipment` signature stable across Tasks A3, A11, B1, B2; `activatableEquipment` shape `{card_id, card_type_arg}` consistent in A11 and A8.

4. **State IDs:** `SelectOfferingFromAnyIsland` uses id 47 (next free, confirmed via exploration).

Fix any issue inline, then proceed to execution handoff.
