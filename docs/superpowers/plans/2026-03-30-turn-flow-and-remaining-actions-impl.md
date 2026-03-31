# Turn Flow & Remaining Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the core turn loop — god advancement from oracle rolls, injury check/recovery/no-injury bonus, look at 2 islands action, and favor-based movement extension.

**Architecture:** Five features wired into the existing BGA state machine. New `god_advancement_queue` DB table tracks pending god advancement opportunities. Existing stub states (CheckGodAdvancement, CheckInjuries, Recover, NoInjuryBonus) get real implementations. New PeekIslands state (ID 41) for the look-at-islands action. MoveShip extended with favor-based range.

**Tech Stack:** PHP 8.1+ (BGA framework states, named params, attributes), MySQL, vanilla JS (BGA client framework)

**Spec:** `docs/superpowers/specs/2026-03-30-turn-flow-and-remaining-actions-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `dbmodel.sql` | Modify | Add `god_advancement_queue` table |
| `modules/php/States/ConsultOracle.php` | Modify | Create queue entries for other players after rolling |
| `modules/php/States/PlayerTurnStart.php` | Modify | Route to CheckGodAdvancement if queue entries exist |
| `modules/php/States/CheckGodAdvancement.php` | Modify | Real implementation — prompt with eligible gods from source roll |
| `modules/php/States/CheckInjuries.php` | Modify | Real implementation — count injuries, route to Recover/NoInjuryBonus/PlayerActions |
| `modules/php/States/Recover.php` | Modify | Real implementation — player selects 3 injuries to discard, then NextPlayer |
| `modules/php/States/NoInjuryBonus.php` | Modify | Real implementation — choose +2 favor or advance any god |
| `modules/php/States/SelectAction.php` | Modify | Add `actLookAtIslands()` action + `getPeekableIslands()` helper |
| `modules/php/States/PeekIslands.php` | Create | New state ID 41 — select 2 unrevealed islands to peek |
| `modules/php/States/MoveShip.php` | Modify | Extend BFS range with favor, deduct on confirm |
| `theoracleofdelphigzed.js` | Modify | New state UI + notification handlers for all new features |
| `modules/php/Game.php` | Modify | Add `god_advancement_queue` to `resetCustomTables()` |

---

### Task 1: God Advancement Queue — Database & ConsultOracle

**Files:**
- Modify: `dbmodel.sql`
- Modify: `modules/php/States/ConsultOracle.php`
- Modify: `modules/php/Game.php` (resetCustomTables)

- [ ] **Step 1: Add god_advancement_queue table to dbmodel.sql**

Add after the `player_island_knowledge` table:

```sql
-- Pending god advancement opportunities from other players' oracle rolls
CREATE TABLE IF NOT EXISTS `god_advancement_queue` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `source_player_id` INT NOT NULL,
    PRIMARY KEY (`id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

- [ ] **Step 2: Add god_advancement_queue to resetCustomTables() in Game.php**

Find the `resetCustomTables()` method and add `god_advancement_queue` to the list of tables that get dropped/recreated. Follow the existing pattern — it should already have lines like:

```php
static::DbQuery("DROP TABLE IF EXISTS `god_advancement_queue`");
```

Add it alongside the other custom table drops.

- [ ] **Step 3: Modify ConsultOracle to create queue entries**

In `modules/php/States/ConsultOracle.php`, after rolling dice and sending notifications, add queue entry creation before the `return NextPlayer::class;`:

```php
function onEnteringState(int $activePlayerId) {
    // Re-roll oracle dice for the next player's turn
    $colors = MaterialDefs::COLORS;
    $colorCount = count($colors);
    $newColors = [];
    for ($d = 0; $d < 3; $d++) {
        $color = $colors[bga_rand(0, $colorCount - 1)];
        $newColors[] = $color;
        $safeColor = addslashes($color);
        $this->game->DbQuery(
            "UPDATE oracle_die SET color = '$safeColor', original_color = '$safeColor', is_used = 0
             WHERE player_id = $activePlayerId AND die_index = $d"
        );
    }

    $this->notify->all("consultOracle", clienttranslate('${player_name} consults the oracle'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
    ]);

    $this->notify->all("diceRolled", '', [
        "player_id" => $activePlayerId,
        "colors" => $newColors,
    ]);

    // Create god advancement queue entries for all other players
    $allPlayers = $this->game->getObjectListFromDB(
        "SELECT player_id FROM player WHERE player_id != $activePlayerId"
    );
    foreach ($allPlayers as $p) {
        $pid = (int)$p['player_id'];
        $this->game->DbQuery(
            "INSERT INTO god_advancement_queue (player_id, source_player_id)
             VALUES ($pid, $activePlayerId)"
        );
    }

    return NextPlayer::class;
}
```

- [ ] **Step 4: Commit**

```bash
git add dbmodel.sql modules/php/States/ConsultOracle.php modules/php/Game.php
git commit -m "feat: add god_advancement_queue table and populate on oracle consultation"
```

---

### Task 2: PlayerTurnStart + CheckGodAdvancement

**Files:**
- Modify: `modules/php/States/PlayerTurnStart.php`
- Modify: `modules/php/States/CheckGodAdvancement.php`

- [ ] **Step 1: Modify PlayerTurnStart to check queue**

Replace the current `onEnteringState` in `PlayerTurnStart.php`:

```php
function onEnteringState(int $activePlayerId) {
    $this->game->giveExtraTime($activePlayerId);

    $this->notify->all("playerTurnStart", clienttranslate('${player_name} starts their turn'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
    ]);

    // Check for pending god advancement opportunities
    $pending = $this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM god_advancement_queue WHERE player_id = $activePlayerId"
    );
    if ((int)$pending > 0) {
        return CheckGodAdvancement::class;
    }
    return CheckInjuries::class;
}
```

- [ ] **Step 2: Implement CheckGodAdvancement fully**

Replace the entire `CheckGodAdvancement.php`:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class CheckGodAdvancement extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 9,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may advance a god'),
            descriptionMyTurn: clienttranslate('${you} may advance a god from ${source_player_name}\'s oracle roll'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();

        // Get first pending queue entry
        $entry = $this->game->getObjectFromDB(
            "SELECT id, source_player_id FROM god_advancement_queue
             WHERE player_id = $playerId ORDER BY id ASC LIMIT 1"
        );
        if (!$entry) {
            return ['eligibleGods' => [], 'sourceColors' => [], 'source_player_name' => ''];
        }

        $sourcePlayerId = (int)$entry['source_player_id'];
        $queueId = (int)$entry['id'];

        // Get source player's current oracle dice colors
        $dice = $this->game->getObjectListFromDB(
            "SELECT color FROM oracle_die WHERE player_id = $sourcePlayerId"
        );
        $sourceColors = array_unique(array_column($dice, 'color'));

        // Find eligible gods: matching one of the source colors, not on row 0, not at max row (6)
        $eligibleGods = [];
        foreach ($sourceColors as $color) {
            foreach (MaterialDefs::GODS as $godName => $god) {
                if ($god['color'] === $color) {
                    $safeName = addslashes($godName);
                    $row = (int)$this->game->getUniqueValueFromDB(
                        "SELECT track_row FROM player_god
                         WHERE player_id = $playerId AND god_name = '$safeName'"
                    );
                    if ($row > 0 && $row < 6) {
                        $eligibleGods[] = [
                            'god_name' => $godName,
                            'color' => $color,
                            'current_row' => $row,
                        ];
                    }
                }
            }
        }

        return [
            'queueId' => $queueId,
            'eligibleGods' => $eligibleGods,
            'sourceColors' => array_values($sourceColors),
            'source_player_name' => $this->game->getPlayerNameById($sourcePlayerId),
        ];
    }

    #[PossibleAction]
    public function actAdvanceGod(string $godName, int $activePlayerId) {
        $args = $this->getArgs();

        // Validate the god is eligible
        $valid = false;
        foreach ($args['eligibleGods'] as $g) {
            if ($g['god_name'] === $godName) {
                $valid = true;
                break;
            }
        }
        if (!$valid) {
            throw new UserException(clienttranslate('You cannot advance that god'));
        }

        $safeName = addslashes($godName);
        $currentRow = (int)$this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        $newRow = $currentRow + 1;

        $this->game->DbQuery(
            "UPDATE player_god SET track_row = $newRow
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );

        // Delete the queue entry
        $queueId = (int)$args['queueId'];
        $this->game->DbQuery("DELETE FROM god_advancement_queue WHERE id = $queueId");

        $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name} (from ${source_player_name}\'s oracle roll)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => $godName,
            "new_row" => $newRow,
            "source_player_name" => $args['source_player_name'],
        ]);

        return $this->checkForMore($activePlayerId);
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $args = $this->getArgs();
        $queueId = (int)($args['queueId'] ?? 0);

        if ($queueId > 0) {
            $this->game->DbQuery("DELETE FROM god_advancement_queue WHERE id = $queueId");
        }

        $this->notify->all("skipGodAdvancement", clienttranslate('${player_name} skips god advancement'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);

        return $this->checkForMore($activePlayerId);
    }

    private function checkForMore(int $playerId): string
    {
        $remaining = (int)$this->game->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM god_advancement_queue WHERE player_id = $playerId"
        );
        if ($remaining > 0) {
            return CheckGodAdvancement::class;
        }
        return CheckInjuries::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

- [ ] **Step 3: Add JS buttons for CheckGodAdvancement**

In `theoracleofdelphigzed.js`, in the `onUpdateAction` switch, add a new case after the existing `PlayerActions` case:

```javascript
case 'CheckGodAdvancement':
    if (args && args.eligibleGods && args.eligibleGods.length > 0) {
        args.eligibleGods.forEach(g => {
            var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1);
            this.statusBar.addActionButton(_('Advance') + ' ' + godLabel, () => {
                this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
            });
        });
    }
    this.statusBar.addActionButton(_('Pass'), () => {
        this.bgaPerformAction("actPass", {});
    }, { color: 'secondary' });
    break;
```

- [ ] **Step 4: Commit**

```bash
git add modules/php/States/PlayerTurnStart.php modules/php/States/CheckGodAdvancement.php theoracleofdelphigzed.js
git commit -m "feat: implement god advancement at turn start from other players' oracle rolls"
```

---

### Task 3: CheckInjuries — Route to Recover/NoInjuryBonus/PlayerActions

**Files:**
- Modify: `modules/php/States/CheckInjuries.php`

- [ ] **Step 1: Implement CheckInjuries routing logic**

Replace the entire `CheckInjuries.php`:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class CheckInjuries extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 11, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        // Count injuries by color
        $injuries = $this->game->getObjectListFromDB(
            "SELECT card_type_arg, COUNT(*) AS cnt FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $activePlayerId
             GROUP BY card_type_arg"
        );

        $totalInjuries = 0;
        $hasThreeSameColor = false;
        foreach ($injuries as $row) {
            $count = (int)$row['cnt'];
            $totalInjuries += $count;
            if ($count >= 3) {
                $hasThreeSameColor = true;
            }
        }

        // 3 same color OR 6+ total → forced recovery
        if ($hasThreeSameColor || $totalInjuries >= 6) {
            $this->notify->all("recoveryRequired", clienttranslate('${player_name} must recover from injuries'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "total_injuries" => $totalInjuries,
            ]);
            return Recover::class;
        }

        // 0 injuries → no-injury bonus
        if ($totalInjuries === 0) {
            return NoInjuryBonus::class;
        }

        // Otherwise → normal turn
        return PlayerActions::class;
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/php/States/CheckInjuries.php
git commit -m "feat: implement injury check routing — recovery, no-injury bonus, or normal turn"
```

---

### Task 4: Recover State — Discard 3 Injuries

**Files:**
- Modify: `modules/php/States/Recover.php`
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Implement Recover state**

Replace the entire `Recover.php`:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class Recover extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 12,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must discard 3 injury cards'),
            descriptionMyTurn: clienttranslate('${you} must select 3 injury cards to discard'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $injuries = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $playerId"
        );

        $injuryCards = [];
        foreach ($injuries as $card) {
            $colorIndex = (int)$card['card_type_arg'];
            $injuryCards[] = [
                'card_id' => (int)$card['card_id'],
                'color' => MaterialDefs::COLORS[$colorIndex],
            ];
        }

        return [
            'injuryCards' => $injuryCards,
            'totalInjuries' => count($injuryCards),
        ];
    }

    #[PossibleAction]
    public function actDiscardInjuries(string $cardIdsJson, int $activePlayerId) {
        $cardIds = json_decode($cardIdsJson, true);
        if (!is_array($cardIds) || count($cardIds) !== 3) {
            throw new UserException(clienttranslate('You must select exactly 3 injury cards'));
        }

        // Validate all cards belong to this player and are injury cards
        foreach ($cardIds as $cardId) {
            $cardId = (int)$cardId;
            $card = $this->game->getObjectFromDB(
                "SELECT card_id FROM card
                 WHERE card_id = $cardId AND card_type = 'injury'
                 AND card_location = 'hand' AND card_location_arg = $activePlayerId"
            );
            if (!$card) {
                throw new UserException(clienttranslate('Invalid injury card selection'));
            }
        }

        // Discard the selected cards
        $idList = implode(',', array_map('intval', $cardIds));
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'discard', card_location_arg = NULL
             WHERE card_id IN ($idList)"
        );

        $this->notify->all("injuriesRecovered", clienttranslate('${player_name} discards 3 injury cards to recover'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_ids" => array_map('intval', $cardIds),
        ]);

        // Recovery turn ends — skip actions and oracle consultation
        return NextPlayer::class;
    }

    function zombie(int $playerId) {
        // Auto-discard first 3 injury cards
        $cards = $this->game->getObjectListFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'injury' AND card_location = 'hand'
             AND card_location_arg = $playerId
             LIMIT 3"
        );
        $ids = array_column($cards, 'card_id');
        if (count($ids) >= 3) {
            return $this->actDiscardInjuries(json_encode($ids), $playerId);
        }
        return NextPlayer::class;
    }
}
```

- [ ] **Step 2: Add JS UI for Recover state**

In `theoracleofdelphigzed.js`, add state entry handler in `onEnteringState`:

```javascript
case 'Recover':
    if (this.isCurrentPlayerActive() && args.args) {
        this._selectedRecoveryCards = new Set();
        this._recoveryCardHandlers = [];
        var self = this;
        args.args.injuryCards.forEach(card => {
            var el = document.getElementById('injury_card_' + card.card_id);
            if (el) {
                el.classList.add('injury-selectable');
                var handler = () => {
                    if (self._selectedRecoveryCards.has(card.card_id)) {
                        self._selectedRecoveryCards.delete(card.card_id);
                        el.classList.remove('injury-selected');
                    } else if (self._selectedRecoveryCards.size < 3) {
                        self._selectedRecoveryCards.add(card.card_id);
                        el.classList.add('injury-selected');
                    }
                };
                el.addEventListener('click', handler);
                self._recoveryCardHandlers.push({ el: el, handler: handler });
            }
        });
    }
    break;
```

Add cleanup in `onLeavingState`:

```javascript
case 'Recover':
    if (this._recoveryCardHandlers) {
        this._recoveryCardHandlers.forEach(item => {
            item.el.classList.remove('injury-selectable', 'injury-selected');
            item.el.removeEventListener('click', item.handler);
        });
        this._recoveryCardHandlers = null;
    }
    this._selectedRecoveryCards = null;
    break;
```

Add action buttons in `onUpdateAction`:

```javascript
case 'Recover':
    this.statusBar.addActionButton(_('Confirm Discard'), () => {
        if (this._selectedRecoveryCards && this._selectedRecoveryCards.size === 3) {
            this.bgaPerformAction("actDiscardInjuries", {
                cardIdsJson: JSON.stringify(Array.from(this._selectedRecoveryCards))
            });
        }
    });
    break;
```

Add notification handler:

```javascript
notif_injuriesRecovered: function(args) {
    console.log('notif_injuriesRecovered', args);
    if (parseInt(args.player_id) === this.player_id && args.card_ids) {
        args.card_ids.forEach(cardId => {
            var el = document.getElementById('injury_card_' + cardId);
            if (el) el.remove();
        });
    }
},
```

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/Recover.php theoracleofdelphigzed.js
git commit -m "feat: implement recovery state — select and discard 3 injury cards"
```

---

### Task 5: NoInjuryBonus State — Favor or Advance God

**Files:**
- Modify: `modules/php/States/NoInjuryBonus.php`
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Implement NoInjuryBonus state**

Replace the entire `NoInjuryBonus.php`:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class NoInjuryBonus extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 13,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} has no injuries — take bonus'),
            descriptionMyTurn: clienttranslate('No injuries! Take 2 Favor or advance 1 God'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();

        // Find all gods that can be advanced (any god not at max row 6)
        $gods = $this->game->getObjectListFromDB(
            "SELECT god_name, track_row FROM player_god
             WHERE player_id = $playerId AND track_row < 6"
        );

        $advanceableGods = [];
        foreach ($gods as $god) {
            $advanceableGods[] = [
                'god_name' => $god['god_name'],
                'current_row' => (int)$god['track_row'],
            ];
        }

        return [
            'advanceableGods' => $advanceableGods,
        ];
    }

    #[PossibleAction]
    public function actTakeFavor(int $activePlayerId) {
        $amount = 2;
        $this->game->DbQuery(
            "UPDATE player SET favor_tokens = favor_tokens + $amount WHERE player_id = $activePlayerId"
        );
        $newFavor = (int)$this->game->getUniqueValueFromDB(
            "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
        );

        $this->notify->all("favorTokensTaken", clienttranslate('${player_name} takes ${amount} Favor (no-injury bonus)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "amount" => $amount,
            "favor_tokens" => $newFavor,
        ]);

        return PlayerActions::class;
    }

    #[PossibleAction]
    public function actAdvanceGod(string $godName, int $activePlayerId) {
        // Validate: god must exist and not be at max row
        $safeName = addslashes($godName);
        $currentRow = $this->game->getUniqueValueFromDB(
            "SELECT track_row FROM player_god
             WHERE player_id = $activePlayerId AND god_name = '$safeName'"
        );
        if ($currentRow === null) {
            throw new UserException(clienttranslate('Invalid god'));
        }
        $currentRow = (int)$currentRow;
        if ($currentRow >= 6) {
            throw new UserException(clienttranslate('That god is already at the top of the track'));
        }

        // Row 0 → player-count row, otherwise +1
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

        $this->notify->all("godAdvanced", clienttranslate('${player_name} advances ${god_name} (no-injury bonus)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "god_name" => $godName,
            "new_row" => $newRow,
        ]);

        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actTakeFavor($playerId);
    }
}
```

- [ ] **Step 2: Add JS buttons for NoInjuryBonus**

In `theoracleofdelphigzed.js`, add to `onUpdateAction`:

```javascript
case 'NoInjuryBonus':
    this.statusBar.addActionButton(_('Take 2 Favor'), () => {
        this.bgaPerformAction("actTakeFavor", {});
    });
    if (args && args.advanceableGods && args.advanceableGods.length > 0) {
        args.advanceableGods.forEach(g => {
            var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1);
            this.statusBar.addActionButton(_('Advance') + ' ' + godLabel, () => {
                this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
            });
        });
    }
    break;
```

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/NoInjuryBonus.php theoracleofdelphigzed.js
git commit -m "feat: implement no-injury bonus — take 2 favor or advance any god"
```

---

### Task 6: Look at 2 Islands — PeekIslands State

**Files:**
- Create: `modules/php/States/PeekIslands.php`
- Modify: `modules/php/States/SelectAction.php`
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Add getPeekableIslands() helper and actLookAtIslands() to SelectAction**

In `SelectAction.php`, add a new helper method after the existing `getExplorableIslands()`:

```php
private function getPeekableIslands(int $playerId): array
{
    // Unrevealed shrine hexes that the player hasn't already peeked at
    $hexes = $this->game->getObjectListFromDB(
        "SELECT h.q, h.r, h.island_content FROM hex h
         WHERE h.tile_type = 'island' AND h.is_revealed = 0
         AND NOT EXISTS (
             SELECT 1 FROM player_island_knowledge pik
             WHERE pik.player_id = $playerId AND pik.hex_q = h.q AND pik.hex_r = h.r
         )"
    );
    $result = [];
    foreach ($hexes as $hex) {
        $result[] = [
            'q' => (int)$hex['q'],
            'r' => (int)$hex['r'],
        ];
    }
    return $result;
}
```

Add `peekableIslands` to the `getArgs()` return array:

```php
'peekableIslands' => $this->getPeekableIslands($playerId),
```

Add the action method:

```php
#[PossibleAction]
public function actLookAtIslands(int $activePlayerId) {
    $peekable = $this->getPeekableIslands($activePlayerId);
    if (count($peekable) === 0) {
        throw new UserException(clienttranslate('No unrevealed islands to look at'));
    }
    return PeekIslands::class;
}
```

- [ ] **Step 2: Create PeekIslands state**

Create `modules/php/States/PeekIslands.php`:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;

class PeekIslands extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 41,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} looks at islands'),
            descriptionMyTurn: clienttranslate('Select up to 2 unrevealed islands to peek at'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();

        $hexes = $this->game->getObjectListFromDB(
            "SELECT h.q, h.r FROM hex h
             WHERE h.tile_type = 'island' AND h.is_revealed = 0
             AND NOT EXISTS (
                 SELECT 1 FROM player_island_knowledge pik
                 WHERE pik.player_id = $playerId AND pik.hex_q = h.q AND pik.hex_r = h.r
             )"
        );

        $peekable = [];
        foreach ($hexes as $hex) {
            $peekable[] = ['q' => (int)$hex['q'], 'r' => (int)$hex['r']];
        }

        return [
            'peekableIslands' => $peekable,
            'maxPeeks' => min(2, count($peekable)),
        ];
    }

    #[PossibleAction]
    public function actConfirmPeek(string $hexCoordsJson, int $activePlayerId) {
        $hexCoords = json_decode($hexCoordsJson, true);
        if (!is_array($hexCoords) || count($hexCoords) === 0 || count($hexCoords) > 2) {
            throw new UserException(clienttranslate('Select 1 or 2 islands'));
        }

        // Validate each hex is a valid peekable island
        $revealedContents = [];
        foreach ($hexCoords as $coord) {
            $q = (int)$coord['q'];
            $r = (int)$coord['r'];

            $hex = $this->game->getObjectFromDB(
                "SELECT island_content FROM hex
                 WHERE q = $q AND r = $r AND tile_type = 'island' AND is_revealed = 0"
            );
            if (!$hex) {
                throw new UserException(clienttranslate('Invalid island selection'));
            }

            // Check not already peeked
            $alreadyPeeked = $this->game->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM player_island_knowledge
                 WHERE player_id = $activePlayerId AND hex_q = $q AND hex_r = $r"
            );
            if ((int)$alreadyPeeked > 0) {
                throw new UserException(clienttranslate('You already know this island'));
            }

            // Store peek knowledge
            $this->game->DbQuery(
                "INSERT INTO player_island_knowledge (player_id, hex_q, hex_r)
                 VALUES ($activePlayerId, $q, $r)"
            );

            $revealedContents[] = [
                'q' => $q,
                'r' => $r,
                'island_content' => $hex['island_content'],
            ];
        }

        // Private notification — only the active player sees the contents
        $this->notify->player($activePlayerId, "islandsPeeked",
            clienttranslate('You peek at ${count} island(s)'), [
            "count" => count($revealedContents),
            "islands" => $revealedContents,
        ]);

        // Public notification — others just know the action happened
        $this->notify->all("playerPeekedIslands",
            clienttranslate('${player_name} looks at ${count} island(s)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "count" => count($revealedContents),
        ]);

        // Spend the die
        $dieIndex = $this->game->globals->get('selected_die_index');
        $this->game->DbQuery(
            "UPDATE oracle_die SET is_used = 1
             WHERE player_id = $activePlayerId AND die_index = $dieIndex"
        );
        $this->game->globals->set('selected_die_index', null);

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

    #[PossibleAction]
    public function actCancel(int $activePlayerId) {
        return SelectAction::class;
    }

    function zombie(int $playerId) {
        return $this->actCancel($playerId);
    }
}
```

- [ ] **Step 3: Add JS UI for PeekIslands and Look at Islands button**

In `theoracleofdelphigzed.js`, add the "Look at Islands" button in the `SelectAction` case of `onUpdateAction`, after the "Take Favor Tokens" button and before the "Recolor Die" button:

```javascript
if (args && args.peekableIslands && args.peekableIslands.length > 0) {
    this.statusBar.addActionButton(_('Look at Islands'), () => {
        this.bgaPerformAction("actLookAtIslands", {});
    });
}
```

Add state entry handler in `onEnteringState`:

```javascript
case 'PeekIslands':
    if (this.isCurrentPlayerActive() && args.args) {
        this._selectedPeekIslands = [];
        this._peekMaxPeeks = args.args.maxPeeks || 2;
        var peekable = args.args.peekableIslands || [];
        this._peekIslandSet = new Set(peekable.map(h => h.q + ',' + h.r));
        this._showReachableOverlays(peekable);
    }
    break;
```

Add cleanup in `onLeavingState`:

```javascript
case 'PeekIslands':
    this._clearReachableOverlays();
    this._selectedPeekIslands = null;
    this._peekIslandSet = null;
    break;
```

Modify `onHexClick` to handle PeekIslands state (add before the MoveShip check):

```javascript
// Check if we're in PeekIslands state
if (this._peekIslandSet) {
    var key = q + ',' + r;
    if (this._peekIslandSet.has(key)) {
        var idx = this._selectedPeekIslands.findIndex(h => h.q === q && h.r === r);
        if (idx >= 0) {
            // Deselect
            this._selectedPeekIslands.splice(idx, 1);
        } else if (this._selectedPeekIslands.length < this._peekMaxPeeks) {
            // Select
            this._selectedPeekIslands.push({ q: q, r: r });
        }
        // Update visual feedback — re-render overlays with selected state
        this._clearReachableOverlays();
        var allPeekable = Array.from(this._peekIslandSet).map(k => {
            var parts = k.split(',');
            return { q: parseInt(parts[0]), r: parseInt(parts[1]) };
        });
        this._showReachableOverlays(allPeekable);
        // Mark selected hexes differently
        this._selectedPeekIslands.forEach(h => {
            var center = this.getHexCenterPixel(h.q, h.r);
            if (center) {
                var el = document.createElement('div');
                el.className = 'hex-overlay-selected';
                el.style.left = center.x + 'px';
                el.style.top = center.y + 'px';
                document.getElementById('delphi-hex-grid').appendChild(el);
                if (!this._selectedOverlays) this._selectedOverlays = [];
                this._selectedOverlays.push(el);
            }
        });
    }
    return;
}
```

Add buttons in `onUpdateAction`:

```javascript
case 'PeekIslands':
    this.statusBar.addActionButton(_('Confirm Peek'), () => {
        if (this._selectedPeekIslands && this._selectedPeekIslands.length > 0) {
            this.bgaPerformAction("actConfirmPeek", {
                hexCoordsJson: JSON.stringify(this._selectedPeekIslands)
            });
        }
    });
    this.statusBar.addActionButton(_('Cancel'), () => {
        this.bgaPerformAction("actCancel", {});
    }, { color: 'secondary' });
    break;
```

Add notification handlers:

```javascript
notif_islandsPeeked: function(args) {
    console.log('notif_islandsPeeked', args);
    // Private notification — update local island knowledge
    if (args.islands) {
        args.islands.forEach(island => {
            var hexData = this.boardHexes && this.boardHexes.find(
                h => h.q === island.q && h.r === island.r
            );
            if (hexData) {
                hexData.island_content = island.island_content;
                hexData._peeked = true;
            }
        });
    }
},

notif_playerPeekedIslands: function(args) {
    console.log('notif_playerPeekedIslands', args);
    // Public notification — log only, no visual update for other players
},
```

- [ ] **Step 4: Add hex-overlay-selected CSS class**

In `theoracleofdelphigzed.css`, add near the existing `.hex-overlay-pulsing` styles:

```css
.hex-overlay-selected {
    position: absolute;
    width: 40px;
    height: 40px;
    margin-left: -20px;
    margin-top: -20px;
    border-radius: 50%;
    background: rgba(255, 215, 0, 0.6);
    border: 3px solid gold;
    pointer-events: none;
    z-index: 10;
}
```

- [ ] **Step 5: Commit**

```bash
git add modules/php/States/PeekIslands.php modules/php/States/SelectAction.php theoracleofdelphigzed.js theoracleofdelphigzed.css
git commit -m "feat: add look at 2 islands action — peek at unrevealed shrine hexes"
```

---

### Task 7: Favor Movement Extension

**Files:**
- Modify: `modules/php/States/MoveShip.php`
- Modify: `theoracleofdelphigzed.js`

- [ ] **Step 1: Extend MoveShip PHP to support favor-extended range**

In `MoveShip.php`, modify `getMovementRange()` to return the base range only (unchanged), and add a new method for max range:

```php
private function getMaxMovementRange(int $playerId): int
{
    $baseRange = $this->getMovementRange($playerId);
    $favor = (int)$this->game->getUniqueValueFromDB(
        "SELECT favor_tokens FROM player WHERE player_id = $playerId"
    );
    return $baseRange + $favor;
}
```

Modify `getArgs()` to use max range for BFS but include base range for cost calculation:

In the `getArgs()` method, change the BFS call to use `$maxRange` instead of `$range`, and include both ranges in the return:

```php
$range = $this->getMovementRange($playerId);
$maxRange = $this->getMaxMovementRange($playerId);
// ...
$reachable = $pathfinder->getReachableHexes($shipQ, $shipR, $maxRange);
// ...
return [
    // ... existing fields ...
    'baseRange' => $range,
    'maxRange' => $maxRange,
    'playerFavor' => (int)$this->game->getUniqueValueFromDB(
        "SELECT favor_tokens FROM player WHERE player_id = $playerId"
    ),
];
```

Each entry in `reachableList` already includes `'distance' => $dist` — this is used to calculate favor cost.

Modify `actConfirmMove()` to deduct favor when distance exceeds base range. After existing validation (pathfinder reachability + color match), add:

```php
// Check if favor is needed for extended range
$baseRange = $this->getMovementRange($activePlayerId);
$distance = $reachable["$q,$r"];
$favorCost = max(0, $distance - $baseRange);

if ($favorCost > 0) {
    $currentFavor = (int)$this->game->getUniqueValueFromDB(
        "SELECT favor_tokens FROM player WHERE player_id = $activePlayerId"
    );
    if ($currentFavor < $favorCost) {
        throw new UserException(clienttranslate('Not enough Favor Tokens for that distance'));
    }
    $this->game->DbQuery(
        "UPDATE player SET favor_tokens = favor_tokens - $favorCost WHERE player_id = $activePlayerId"
    );
    $newFavor = $currentFavor - $favorCost;

    $this->notify->all("favorSpentForMovement",
        clienttranslate('${player_name} spends ${cost} Favor to extend movement'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "cost" => $favorCost,
        "favor_tokens" => $newFavor,
    ]);
}
```

Also update the reachability validation in `actConfirmMove()` — change the BFS range from `$range` to the max range:

```php
$range = $this->getMaxMovementRange($activePlayerId);
```

But validate against max range that includes current favor (before spending). The key is: BFS uses max range on confirm, but favor is deducted based on actual distance.

- [ ] **Step 2: Update JS to show favor cost on movement destinations**

In `theoracleofdelphigzed.js`, the `MoveShip` state already receives `reachableHexes` with distance. Add favor cost display.

In the `onEnteringState` `MoveShip` case, after storing reachable data, also store base range and favor:

```javascript
case 'MoveShip':
    if (this.isCurrentPlayerActive() && args.args) {
        this.components.selectShip(this.player_id);
        this._moveShipBaseRange = args.args.baseRange || 3;
        this._moveShipFavor = args.args.playerFavor || 0;
        var reachable = args.args.reachableHexes;
        if (reachable && reachable.length > 0) {
            this._showReachableOverlays(reachable);
            this._moveShipReachable = new Map();
            reachable.forEach(h => {
                this._moveShipReachable.set(h.q + ',' + h.r, h.distance);
            });
        }
    }
    break;
```

Note: Change `_moveShipReachable` from a `Set` to a `Map` (key → distance) so we can show favor cost. Update the `onHexClick` MoveShip check accordingly:

```javascript
if (this._moveShipReachable) {
    var key = q + ',' + r;
    if (this._moveShipReachable.has(key)) {
        var dist = this._moveShipReachable.get(key);
        var favorCost = Math.max(0, dist - this._moveShipBaseRange);
        if (favorCost > 0 && favorCost > this._moveShipFavor) {
            return; // Can't afford — shouldn't happen if server filtered correctly
        }
        this.bgaPerformAction("actConfirmMove", { q: q, r: r });
        return;
    }
}
```

Add notification handler:

```javascript
notif_favorSpentForMovement: function(args) {
    console.log('notif_favorSpentForMovement', args);
    if (parseInt(args.player_id) === this.player_id) {
        this.components.setFavorTokenCount(parseInt(args.favor_tokens));
    }
},
```

- [ ] **Step 3: Clean up onLeavingState for MoveShip**

Update the existing `MoveShip` cleanup:

```javascript
case 'MoveShip':
    this._clearReachableOverlays();
    this.components.deselectShips();
    this._moveShipReachable = null;
    this._moveShipBaseRange = null;
    this._moveShipFavor = null;
    break;
```

- [ ] **Step 4: Commit**

```bash
git add modules/php/States/MoveShip.php theoracleofdelphigzed.js
git commit -m "feat: add favor-based movement range extension — spend favor for +1 hex per token"
```

---

### Task 8: Update Game Plan Checklist

**Files:**
- Modify: `docs/plans/game-implementation-plan.md`

- [ ] **Step 1: Mark completed items in the game plan**

Update these lines from `- [ ]` to `- [x]`:

Phase 3:
- `- [x] **Turn phase flow** — injury check → recovery/bonus → actions → oracle consultation [L]`
- `- [x] **Next player / round transitions** — proper round tracking, first player rotation [M]`

Phase 4:
- `- [x] Favor token extension (+1 range per favor spent) [S]`
- `- `- [x] Look at 2 islands (peek without die) [M]`
- `- [x] Oracle consultation — roll 3 dice, store results [M]` (was already rolling, now creates queue entries)
- `- [x] God advancement check at turn start (from previous oracle roll) [M]`

Phase 5:
- `- [x] Recovery turn (3 same color OR 6 total injuries → forced recovery) [M]`
- `- [x] No-injury bonus (2 favor OR advance god) [S]`

- [ ] **Step 2: Commit**

```bash
git add docs/plans/game-implementation-plan.md
git commit -m "docs: mark turn flow and remaining Phase 4 items as complete"
```
