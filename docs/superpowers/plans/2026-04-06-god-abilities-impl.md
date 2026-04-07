# God Special Abilities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 6 god special abilities as free actions available when a god reaches the top of the track (row 6), resetting the god to row 0 after use.

**Architecture:** Add `actUseGodAbility(godName)` to PlayerActions state for simple abilities (Aphrodite, Apollo) that resolve immediately. Expand the existing UseGodAbility state stub (state 38) for targeting abilities (Poseidon, Artemis, Ares, Hermes) that need player input. God icons appear as clickable buttons in the PlayerActions status bar. Each ability resets the god to row 0 after use.

**Tech Stack:** PHP 8.1 (BGA framework state classes), JavaScript (AMD module, BGA client framework), MySQL, CSS

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `modules/php/States/PlayerActions.php` | Modify | Add `getAvailableGods()`, `actUseGodAbility()`, god availability in `getArgs()` |
| `modules/php/States/UseGodAbility.php` | Modify | Expand stub with `getArgs()`, target actions for Poseidon/Artemis/Ares/Hermes |
| `modules/php/States/ConsultOracle.php` | Modify | Clear `apollo_wild_active` flag at end of turn |
| `modules/php/States/ExploreIsland.php` | Modify | Handle `god_explore_source` flag to skip `spendActionSource` for Artemis |
| `modules/php/Game.php` | Modify | Add `resetGod()` helper, modify `getActionColor()` for Apollo wild |
| `dbmodel.sql` | Modify | Add `is_wild` column to card table |
| `theoracleofdelphigzed.js` | Modify | God icon buttons in PlayerActions, UseGodAbility state handling, notifications |
| `theoracleofdelphigzed.css` | Modify | God icon button styles |

---

### Task 1: Database — Add `is_wild` Column to Card Table

**Files:**
- Modify: `dbmodel.sql:184` (card table)

- [ ] **Step 1: Add `is_wild` column to card table**

In `dbmodel.sql`, modify the card table to add the `is_wild` column after `card_order`:

```sql
CREATE TABLE IF NOT EXISTS `card` (
    `card_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `card_type` VARCHAR(16) NOT NULL,
    `card_type_arg` INT(11) NOT NULL,
    `card_location` VARCHAR(16) NOT NULL,
    `card_location_arg` INT(11) NOT NULL DEFAULT 0,
    `card_order` INT NOT NULL DEFAULT 0,
    `is_wild` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`card_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 AUTO_INCREMENT=1;
```

- [ ] **Step 2: Commit**

```bash
git add dbmodel.sql
git commit -m "feat: add is_wild column to card table for Apollo ability"
```

---

### Task 2: PHP — God Reset Helper and Apollo Wild in `getActionColor()`

**Files:**
- Modify: `modules/php/Game.php:901-919` (getActionColor), add resetGod helper

- [ ] **Step 1: Add `resetGod()` helper to Game.php**

Add this method after the `spendActionSource()` method (around line 970):

```php
/**
 * Reset a god to row 0 after using its ability.
 */
public function resetGod(int $playerId, string $godName): void
{
    $safeName = addslashes($godName);
    $this->DbQuery(
        "UPDATE player_god SET track_row = 0
         WHERE player_id = $playerId AND god_name = '$safeName'"
    );

    $this->notify->all("godReset", clienttranslate('${player_name} uses ${god_name}\'s power (god returns to bottom of track)'), [
        "player_id" => $playerId,
        "player_name" => $this->getPlayerNameById($playerId),
        "god_name" => $godName,
    ]);
}
```

- [ ] **Step 2: Modify `getActionColor()` to support Apollo wild**

In `Game.php`, modify `getActionColor()` (line 901) to check for Apollo wild flag:

```php
public function getActionColor(int $playerId): ?string
{
    // Apollo wild: any die color works, return the die's actual color
    // (color matching is bypassed elsewhere when apollo_wild_active is set)
    $oracleCardId = (int)$this->globals->get('selected_oracle_card_id');
    if ($oracleCardId > 0) {
        $card = $this->getObjectFromDB(
            "SELECT card_type_arg, is_wild FROM card WHERE card_id = $oracleCardId"
        );
        if ($card) {
            if ((int)$card['is_wild'] === 1) {
                // Wild card: return the chosen color stored in global
                return $this->globals->get('wild_card_chosen_color') ?? null;
            }
            return MaterialDefs::COLORS[(int)$card['card_type_arg']] ?? null;
        }
        return null;
    }

    $dieIndex = $this->globals->get('selected_die_index');
    $die = $this->getObjectFromDB(
        "SELECT color FROM oracle_die WHERE player_id = $playerId AND die_index = $dieIndex"
    );
    return $die ? $die['color'] : null;
}
```

- [ ] **Step 3: Add `isApolloWildActive()` helper**

Add after `getActionColor()`:

```php
/**
 * Check if Apollo's wild ability is active for this turn.
 * When active, all dice match any color.
 */
public function isApolloWildActive(): bool
{
    return (int)$this->globals->get('apollo_wild_active') === 1;
}
```

- [ ] **Step 4: Commit**

```bash
git add modules/php/Game.php
git commit -m "feat: add resetGod helper and Apollo wild support in getActionColor"
```

---

### Task 3: PHP — Aphrodite and Apollo Abilities in PlayerActions

**Files:**
- Modify: `modules/php/States/PlayerActions.php`

- [ ] **Step 1: Add `getAvailableGods()` helper**

Add this private method to `PlayerActions` class, before `actSelectDie()`:

```php
private function getAvailableGods(int $playerId): array
{
    $gods = $this->game->getObjectListFromDB(
        "SELECT god_name, track_row FROM player_god
         WHERE player_id = $playerId AND track_row = 6"
    );

    $available = [];
    foreach ($gods as $god) {
        $godName = $god['god_name'];
        $ability = MaterialDefs::GODS[$godName]['ability'] ?? null;
        if (!$ability) continue;

        // Filter by usability conditions
        switch ($ability) {
            case 'grab_any_statue':
                // Hermes: need cargo space AND ship adjacent to any city
                if (!$this->hasCargoSpace($playerId)) continue 2;
                if (!$this->isAdjacentToAnyCity($playerId)) continue 2;
                break;
            case 'auto_defeat_monster':
                // Ares: need adjacent monster
                if (!$this->hasAdjacentMonster($playerId)) continue 2;
                break;
            case 'free_explore_island':
                // Artemis: need unrevealed islands
                if (!$this->hasUnrevealedIslands()) continue 2;
                break;
            // Aphrodite, Apollo, Poseidon: always available at row 6
        }

        $available[] = [
            'god_name' => $godName,
            'ability' => $ability,
        ];
    }
    return $available;
}

private function hasCargoSpace(int $playerId): bool
{
    $shipTileId = $this->game->getUniqueValueFromDB(
        "SELECT ship_tile_id FROM player WHERE player_id = $playerId"
    );
    $capacity = MaterialDefs::SHIP_TILES[(int)($shipTileId ?? 0)]['storage'] ?? 2;
    $offeringCount = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM offering WHERE player_id = $playerId AND is_delivered = 0"
    );
    $statueCount = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM statue WHERE player_id = $playerId AND is_raised = 0"
    );
    return ($offeringCount + $statueCount) < $capacity;
}

private function isAdjacentToAnyCity(int $playerId): bool
{
    $player = $this->game->getObjectFromDB(
        "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
    );
    $shipQ = (int)$player['ship_q'];
    $shipR = (int)$player['ship_r'];

    $cities = $this->game->getObjectListFromDB(
        "SELECT q, r FROM hex WHERE tile_type = 'city'"
    );
    foreach ($cities as $city) {
        if (\HexUtils::hexDistance($shipQ, $shipR, (int)$city['q'], (int)$city['r']) === 1) {
            return true;
        }
    }
    return false;
}

private function hasAdjacentMonster(int $playerId): bool
{
    $player = $this->game->getObjectFromDB(
        "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
    );
    $shipQ = (int)$player['ship_q'];
    $shipR = (int)$player['ship_r'];

    $monsters = $this->game->getObjectListFromDB(
        "SELECT hex_q, hex_r FROM monster WHERE is_defeated = 0"
    );
    foreach ($monsters as $m) {
        if (\HexUtils::hexDistance($shipQ, $shipR, (int)$m['hex_q'], (int)$m['hex_r']) === 1) {
            return true;
        }
    }
    return false;
}

private function hasUnrevealedIslands(): bool
{
    $count = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM hex WHERE island_content = 'shrine' AND is_revealed = 0"
    );
    return $count > 0;
}
```

- [ ] **Step 2: Add `availableGods` to `getArgs()`**

In the `getArgs()` method, add to the return array (after line 47):

```php
return [
    'dice' => $dice,
    'oracleCardsInHand' => $oracleCardsInHand,
    'canPlayOracleCard' => $oracleCardPlayed === 0 && count($oracleCardsInHand) > 0,
    'availableGods' => $this->getAvailableGods($playerId),
];
```

- [ ] **Step 3: Add `require_once` for HexUtils at top of file**

Add after the namespace/use declarations:

```php
require_once(__DIR__ . '/../HexUtils.php');
```

- [ ] **Step 4: Add `actUseGodAbility()` action method**

Add this action method after `actPlayOracleCard()`:

```php
#[PossibleAction]
public function actUseGodAbility(string $godName, int $activePlayerId) {
    // Validate god exists and is at row 6
    $safeName = addslashes($godName);
    $row = $this->game->getUniqueValueFromDB(
        "SELECT track_row FROM player_god
         WHERE player_id = $activePlayerId AND god_name = '$safeName'"
    );
    if ($row === null || (int)$row !== 6) {
        throw new UserException(clienttranslate('That god is not at the top of the track'));
    }

    $ability = MaterialDefs::GODS[$godName]['ability'] ?? null;
    if (!$ability) {
        throw new UserException(clienttranslate('Invalid god'));
    }

    // Validate god is in available list (checks usability conditions)
    $available = $this->getAvailableGods($activePlayerId);
    $found = false;
    foreach ($available as $g) {
        if ($g['god_name'] === $godName) {
            $found = true;
            break;
        }
    }
    if (!$found) {
        throw new UserException(clienttranslate('That god ability cannot be used right now'));
    }

    switch ($ability) {
        case 'discard_all_injuries':
            return $this->useAphrodite($activePlayerId);
        case 'dice_wild':
            return $this->useApollo($activePlayerId);
        default:
            // Targeting abilities: store god name and go to UseGodAbility state
            $this->game->globals->set('active_god_ability', $godName);
            return UseGodAbility::class;
    }
}

private function useAphrodite(int $playerId): string
{
    // Discard all injury cards
    $injuries = $this->game->getObjectListFromDB(
        "SELECT card_id, card_type_arg FROM card
         WHERE card_type = 'injury' AND card_location = 'hand' AND card_location_arg = $playerId"
    );
    $count = count($injuries);

    if ($count > 0) {
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'discard', card_location_arg = 0
             WHERE card_type = 'injury' AND card_location = 'hand' AND card_location_arg = $playerId"
        );
    }

    $this->notify->all("godAbilityUsed", clienttranslate('${player_name} uses Aphrodite to discard all ${count} injuries'), [
        "player_id" => $playerId,
        "player_name" => $this->game->getPlayerNameById($playerId),
        "god_name" => "aphrodite",
        "ability" => "discard_all_injuries",
        "count" => $count,
    ]);

    $this->game->resetGod($playerId, 'aphrodite');
    return PlayerActions::class;
}

private function useApollo(int $playerId): string
{
    // Set wild flag for rest of turn
    $this->game->globals->set('apollo_wild_active', 1);

    // Draw a wild oracle card
    $card = $this->game->getObjectFromDB(
        "SELECT card_id, card_type_arg FROM card
         WHERE card_type = 'oracle' AND card_location = 'deck'
         ORDER BY card_order ASC LIMIT 1"
    );

    $wildCardId = null;
    $wildCardColor = null;
    if ($card) {
        $wildCardId = (int)$card['card_id'];
        $wildCardColor = MaterialDefs::COLORS[(int)$card['card_type_arg']] ?? 'red';
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'hand', card_location_arg = $playerId, is_wild = 1
             WHERE card_id = $wildCardId"
        );
    }

    $this->notify->all("godAbilityUsed", clienttranslate('${player_name} uses Apollo — all dice become wild and draws a wild Oracle Card'), [
        "player_id" => $playerId,
        "player_name" => $this->game->getPlayerNameById($playerId),
        "god_name" => "apollo",
        "ability" => "dice_wild",
        "wild_card_id" => $wildCardId,
        "wild_card_color" => $wildCardColor,
    ]);

    $this->game->resetGod($playerId, 'apollo');
    return PlayerActions::class;
}
```

- [ ] **Step 5: Commit**

```bash
git add modules/php/States/PlayerActions.php
git commit -m "feat: add Aphrodite and Apollo god abilities to PlayerActions"
```

---

### Task 4: PHP — Poseidon (Teleport Ship) in UseGodAbility

**Files:**
- Modify: `modules/php/States/UseGodAbility.php`

- [ ] **Step 1: Expand UseGodAbility with getArgs and Poseidon action**

Replace the entire `UseGodAbility.php` content:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

require_once(__DIR__ . '/../HexUtils.php');

class UseGodAbility extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 38,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} uses ${god_name}\'s ability'),
            descriptionMyTurn: clienttranslate('${god_ability_instruction}'),
        );
    }

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $godName = $this->game->globals->get('active_god_ability');
        $ability = MaterialDefs::GODS[$godName]['ability'] ?? null;

        $args = [
            'god_name' => ucfirst($godName ?? ''),
            'god_ability_instruction' => $this->getInstruction($godName),
            'ability' => $ability,
            'godNameRaw' => $godName,
        ];

        switch ($ability) {
            case 'teleport_ship':
                $args['validHexes'] = $this->getWaterHexes();
                break;
            case 'free_explore_island':
                $args['validHexes'] = $this->getUnrevealedIslands();
                break;
            case 'auto_defeat_monster':
                $args['adjacentMonsters'] = $this->getAdjacentMonsters($playerId);
                break;
            case 'grab_any_statue':
                $args['validCities'] = $this->getCitiesWithStatues();
                break;
        }

        return $args;
    }

    private function getInstruction(?string $godName): string
    {
        return match ($godName) {
            'poseidon' => clienttranslate('Select a water hex to teleport your ship'),
            'artemis' => clienttranslate('Select an island to explore'),
            'ares' => clienttranslate('Select a monster to defeat'),
            'hermes' => clienttranslate('Select a city to take a statue from'),
            default => clienttranslate('Select a target'),
        };
    }

    private function getWaterHexes(): array
    {
        return $this->game->getObjectListFromDB(
            "SELECT q, r FROM hex WHERE tile_type = 'water'"
        );
    }

    private function getUnrevealedIslands(): array
    {
        return $this->game->getObjectListFromDB(
            "SELECT q, r, color FROM hex
             WHERE island_content = 'shrine' AND is_revealed = 0"
        );
    }

    private function getAdjacentMonsters(int $playerId): array
    {
        $player = $this->game->getObjectFromDB(
            "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
        );
        $shipQ = (int)$player['ship_q'];
        $shipR = (int)$player['ship_r'];

        $monsters = $this->game->getObjectListFromDB(
            "SELECT monster_id, color, monster_type, hex_q, hex_r
             FROM monster WHERE is_defeated = 0"
        );

        $adjacent = [];
        foreach ($monsters as $m) {
            $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$m['hex_q'], (int)$m['hex_r']);
            if ($dist === 1) {
                $adjacent[] = [
                    'monster_id' => (int)$m['monster_id'],
                    'monster_type' => $m['monster_type'],
                    'color' => $m['color'],
                    'hex_q' => (int)$m['hex_q'],
                    'hex_r' => (int)$m['hex_r'],
                ];
            }
        }
        return $adjacent;
    }

    private function getCitiesWithStatues(): array
    {
        return $this->game->getObjectListFromDB(
            "SELECT DISTINCT h.q, h.r, s.statue_id, s.color AS statue_color
             FROM hex h
             JOIN statue s ON s.origin_hex_q = h.q AND s.origin_hex_r = h.r
             WHERE h.tile_type = 'city' AND s.player_id IS NULL AND s.is_raised = 0
             ORDER BY h.q, h.r"
        );
    }

    // --- Poseidon: Teleport Ship ---

    #[PossibleAction]
    public function actTeleportShip(int $hexQ, int $hexR, int $activePlayerId) {
        $godName = $this->game->globals->get('active_god_ability');
        if ($godName !== 'poseidon') {
            throw new UserException(clienttranslate('Invalid action for current god ability'));
        }

        // Validate target is a water hex
        $hex = $this->game->getObjectFromDB(
            "SELECT q, r FROM hex WHERE q = $hexQ AND r = $hexR AND tile_type = 'water'"
        );
        if (!$hex) {
            throw new UserException(clienttranslate('Invalid destination'));
        }

        // Move ship
        $this->game->DbQuery(
            "UPDATE player SET ship_q = $hexQ, ship_r = $hexR WHERE player_id = $activePlayerId"
        );

        $this->notify->all("shipMoved", clienttranslate('${player_name} uses Poseidon to teleport ship'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "q" => $hexQ,
            "r" => $hexR,
        ]);

        $this->game->resetGod($activePlayerId, 'poseidon');
        $this->game->globals->set('active_god_ability', null);
        return PlayerActions::class;
    }

    // --- Cancel ---

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelGodAbility", clienttranslate('${player_name} cancels god ability'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        $this->game->globals->set('active_god_ability', null);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/php/States/UseGodAbility.php
git commit -m "feat: implement Poseidon teleport in UseGodAbility state"
```

---

### Task 5: PHP — Artemis (Free Explore Island) in UseGodAbility

**Files:**
- Modify: `modules/php/States/UseGodAbility.php`
- Modify: `modules/php/States/ExploreIsland.php`

- [ ] **Step 1: Add Artemis action to UseGodAbility**

Add this action method in `UseGodAbility.php`, after `actTeleportShip()`:

```php
// --- Artemis: Free Explore Island ---

#[PossibleAction]
public function actExploreIsland(int $hexQ, int $hexR, int $activePlayerId) {
    $godName = $this->game->globals->get('active_god_ability');
    if ($godName !== 'artemis') {
        throw new UserException(clienttranslate('Invalid action for current god ability'));
    }

    // Validate target is an unrevealed island
    $hex = $this->game->getObjectFromDB(
        "SELECT q, r FROM hex
         WHERE q = $hexQ AND r = $hexR AND island_content = 'shrine' AND is_revealed = 0"
    );
    if (!$hex) {
        throw new UserException(clienttranslate('Invalid island'));
    }

    // Set globals for ExploreIsland state
    $this->game->globals->set('explore_hex_q', $hexQ);
    $this->game->globals->set('explore_hex_r', $hexR);
    $this->game->globals->set('god_explore_source', 1);  // Flag: don't spend die

    $this->game->resetGod($activePlayerId, 'artemis');
    $this->game->globals->set('active_god_ability', null);
    return ExploreIsland::class;
}
```

- [ ] **Step 2: Modify ExploreIsland to skip spendActionSource for Artemis**

In `ExploreIsland.php`, modify `onEnteringState()` (around line 30) to check the flag:

Replace:
```php
        // Spend the die (sends dieUsed notification)
        $this->game->spendActionSource($playerId);
```

With:
```php
        // Spend the die (sends dieUsed notification) — unless this is a free god ability
        $isGodExplore = (int)$this->game->globals->get('god_explore_source');
        if ($isGodExplore) {
            $this->game->globals->set('god_explore_source', null);
        } else {
            $this->game->spendActionSource($playerId);
        }
```

- [ ] **Step 3: Modify `returnToActions()` to handle god explore path**

In `ExploreIsland.php`, the `returnToActions()` method (line 246) already checks `allDiceUsed()`. Since Artemis doesn't spend a die, this should work correctly — unused dice remain, so it returns to `PlayerActions`. No change needed here.

- [ ] **Step 4: Commit**

```bash
git add modules/php/States/UseGodAbility.php modules/php/States/ExploreIsland.php
git commit -m "feat: implement Artemis free explore island ability"
```

---

### Task 6: PHP — Ares (Auto-Defeat Monster) in UseGodAbility

**Files:**
- Modify: `modules/php/States/UseGodAbility.php`
- Modify: `modules/php/States/CombatVictory.php` (minor: handle no-combat globals)

- [ ] **Step 1: Add Ares action to UseGodAbility**

Add this action method in `UseGodAbility.php`, after `actExploreIsland()`:

```php
// --- Ares: Auto-Defeat Adjacent Monster ---

#[PossibleAction]
public function actDefeatMonster(int $monster_id, int $activePlayerId) {
    $godName = $this->game->globals->get('active_god_ability');
    if ($godName !== 'ares') {
        throw new UserException(clienttranslate('Invalid action for current god ability'));
    }

    // Validate monster is adjacent
    $adjacentMonsters = $this->getAdjacentMonsters($activePlayerId);
    $valid = false;
    $monster = null;
    foreach ($adjacentMonsters as $m) {
        if ($m['monster_id'] === $monster_id) {
            $valid = true;
            $monster = $m;
            break;
        }
    }
    if (!$valid || !$monster) {
        throw new UserException(clienttranslate('That monster is not adjacent to your ship'));
    }

    // Auto-defeat: set combat globals for CombatVictory to handle rewards
    $this->game->globals->set('combat_monster_id', $monster_id);
    $this->game->globals->set('combat_strength', 0);
    $this->game->globals->set('combat_roll', 10); // auto-win
    $this->game->globals->set('ares_auto_defeat', 1);

    $this->notify->all("godAbilityUsed", clienttranslate('${player_name} uses Ares to auto-defeat ${monster_type}!'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "god_name" => "ares",
        "ability" => "auto_defeat_monster",
        "monster_type" => $monster['monster_type'],
        "monster_id" => $monster_id,
    ]);

    $this->game->resetGod($activePlayerId, 'ares');
    $this->game->globals->set('active_god_ability', null);

    // Go directly to CombatVictory for equipment selection and Zeus tile
    return CombatVictory::class;
}
```

- [ ] **Step 2: Handle Ares in CombatVictory return path**

In `CombatVictory.php`, the `actSelectEquipment()` method ends by calling `spendActionSource()`. For Ares auto-defeat, we need to return to `PlayerActions` without spending a die. Read the full file to find the return logic.

Find the return logic at the end of `actSelectEquipment()` (which currently calls `$this->game->spendActionSource($activePlayerId)`) and modify it:

After the Zeus tile completion logic and equipment selection, where the method returns, replace the action source spending with:

```php
// If Ares auto-defeat, don't spend a die — it's a free action
$isAresDefeat = (int)$this->game->globals->get('ares_auto_defeat');
if ($isAresDefeat) {
    $this->game->globals->set('ares_auto_defeat', null);
    $this->game->globals->set('combat_monster_id', null);
    return PlayerActions::class;
}

// Normal combat: spend the saved action source
```

The existing code restores `selected_die_index` from `combat_die_index` before calling `spendActionSource()`. For Ares, skip that entire restoration + spending block and return directly to `PlayerActions`. Look for the section that sets `selected_die_index` back from `combat_die_index` — insert the Ares check before it.

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/UseGodAbility.php modules/php/States/CombatVictory.php
git commit -m "feat: implement Ares auto-defeat monster ability"
```

---

### Task 7: PHP — Hermes (Grab Statue From Any City) in UseGodAbility

**Files:**
- Modify: `modules/php/States/UseGodAbility.php`

- [ ] **Step 1: Add Hermes action to UseGodAbility**

Add this action method in `UseGodAbility.php`, after `actDefeatMonster()`:

```php
// --- Hermes: Grab Any Statue From Any City ---

#[PossibleAction]
public function actGrabStatue(int $statue_id, int $activePlayerId) {
    $godName = $this->game->globals->get('active_god_ability');
    if ($godName !== 'hermes') {
        throw new UserException(clienttranslate('Invalid action for current god ability'));
    }

    // Validate ship is adjacent to ANY city
    $player = $this->game->getObjectFromDB(
        "SELECT ship_q, ship_r FROM player WHERE player_id = $activePlayerId"
    );
    $shipQ = (int)$player['ship_q'];
    $shipR = (int)$player['ship_r'];

    $cities = $this->game->getObjectListFromDB(
        "SELECT q, r FROM hex WHERE tile_type = 'city'"
    );
    $adjacentToCity = false;
    foreach ($cities as $city) {
        if (\HexUtils::hexDistance($shipQ, $shipR, (int)$city['q'], (int)$city['r']) === 1) {
            $adjacentToCity = true;
            break;
        }
    }
    if (!$adjacentToCity) {
        throw new UserException(clienttranslate('Your ship must be adjacent to a city'));
    }

    // Validate statue exists and is available
    $statue = $this->game->getObjectFromDB(
        "SELECT statue_id, color, origin_hex_q, origin_hex_r FROM statue
         WHERE statue_id = $statue_id AND player_id IS NULL AND is_raised = 0"
    );
    if (!$statue) {
        throw new UserException(clienttranslate('Invalid statue'));
    }

    // Validate cargo space
    $shipTileId = $this->game->getUniqueValueFromDB(
        "SELECT ship_tile_id FROM player WHERE player_id = $activePlayerId"
    );
    $capacity = MaterialDefs::SHIP_TILES[(int)($shipTileId ?? 0)]['storage'] ?? 2;
    $offeringCount = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM offering WHERE player_id = $activePlayerId AND is_delivered = 0"
    );
    $statueCount = (int)$this->game->getUniqueValueFromDB(
        "SELECT COUNT(*) FROM statue WHERE player_id = $activePlayerId AND is_raised = 0"
    );
    if (($offeringCount + $statueCount) >= $capacity) {
        throw new UserException(clienttranslate('No cargo space available'));
    }

    // Load statue onto ship
    $this->game->DbQuery(
        "UPDATE statue SET player_id = $activePlayerId WHERE statue_id = $statue_id"
    );

    $this->notify->all("godAbilityUsed", clienttranslate('${player_name} uses Hermes to grab a ${statue_color} statue'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "god_name" => "hermes",
        "ability" => "grab_any_statue",
        "statue_id" => (int)$statue['statue_id'],
        "statue_color" => $statue['color'],
        "from_hex_q" => (int)$statue['origin_hex_q'],
        "from_hex_r" => (int)$statue['origin_hex_r'],
    ]);

    $this->notify->all("loadCargo", '', [
        "player_id" => $activePlayerId,
        "item_type" => "statue",
        "item_id" => (int)$statue['statue_id'],
        "color" => $statue['color'],
        "hex_q" => (int)$statue['origin_hex_q'],
        "hex_r" => (int)$statue['origin_hex_r'],
    ]);

    $this->game->resetGod($activePlayerId, 'hermes');
    $this->game->globals->set('active_god_ability', null);
    return PlayerActions::class;
}
```

- [ ] **Step 2: Commit**

```bash
git add modules/php/States/UseGodAbility.php
git commit -m "feat: implement Hermes grab statue from any city ability"
```

---

### Task 8: PHP — Clear Apollo Wild in ConsultOracle

**Files:**
- Modify: `modules/php/States/ConsultOracle.php:14`

- [ ] **Step 1: Clear Apollo flag at end of turn**

In `ConsultOracle.php`, add at the start of `onEnteringState()` (after line 14):

```php
    function onEnteringState(int $activePlayerId) {
        // Clear Apollo wild flag from previous turn
        $this->game->globals->set('apollo_wild_active', null);
        $this->game->globals->set('wild_card_chosen_color', null);
```

- [ ] **Step 2: Commit**

```bash
git add modules/php/States/ConsultOracle.php
git commit -m "feat: clear Apollo wild flag at end of turn"
```

---

### Task 9: PHP — Apollo Wild Bypass in SelectAction Color Checks

**Files:**
- Modify: `modules/php/States/SelectAction.php`

- [ ] **Step 1: Bypass color matching when Apollo wild is active**

When Apollo is active, all dice work for any action. The color-matching helpers in SelectAction (`getFightableMonsters`, `getExplorableIslands`, `getLoadableOfferings`, etc.) all filter by `dieColor`. We need them to return all items regardless of color when Apollo is active.

In SelectAction's `getArgs()`, after getting `$dieColor` on line 33, add:

```php
$apolloWild = $this->game->isApolloWildActive();
$effectiveColor = $apolloWild ? null : $dieColor;
```

Then create a wrapper that each helper uses. The simplest approach: modify `getArgs()` to pass `null` as color when Apollo is active, and modify each helper to treat `null` as "any color" (removing the color filter from queries).

However, since these helpers already return `[]` when `$dieColor` is null, we need a different approach. Add a second parameter `$anyColor` to each helper:

Actually, the cleanest approach is to modify each helper to accept a `bool $anyColor = false` parameter. When true, skip the color WHERE clause.

Modify `getFightableMonsters()`:

```php
private function getFightableMonsters(int $playerId, ?string $dieColor, bool $anyColor = false): array
{
    if (!$dieColor && !$anyColor) return [];

    $player = $this->game->getObjectFromDB(
        "SELECT ship_q, ship_r FROM player WHERE player_id = $playerId"
    );
    $shipQ = (int)$player['ship_q'];
    $shipR = (int)$player['ship_r'];

    $colorClause = '';
    if (!$anyColor && $dieColor) {
        $safeColor = addslashes($dieColor);
        $colorClause = "AND color = '$safeColor'";
    }
    $monsters = $this->game->getObjectListFromDB(
        "SELECT monster_id, color, monster_type, hex_q, hex_r
         FROM monster WHERE is_defeated = 0 $colorClause"
    );

    $fightable = [];
    foreach ($monsters as $m) {
        $dist = \HexUtils::hexDistance($shipQ, $shipR, (int)$m['hex_q'], (int)$m['hex_r']);
        if ($dist === 1) {
            $fightable[] = [
                'monster_id' => (int)$m['monster_id'],
                'monster_type' => $m['monster_type'],
                'color' => $m['color'],
                'hex_q' => (int)$m['hex_q'],
                'hex_r' => (int)$m['hex_r'],
            ];
        }
    }
    return $fightable;
}
```

Apply the same pattern to: `getLoadableOfferings()`, `getLoadableStatues()`, `getDeliverableOfferings()`, `getDeliverableStatues()`, `getExplorableIslands()`, `getDiscardableInjuries()`, `getAdvanceableGod()`.

Then update `getArgs()` to pass `$apolloWild`:

```php
$apolloWild = $this->game->isApolloWildActive();
$fightableMonsters = $this->getFightableMonsters($playerId, $dieColor, $apolloWild);
// ... same for all other helpers
'loadableOfferings' => $canLoad ? $this->getLoadableOfferings($playerId, $dieColor, $apolloWild) : [],
'loadableStatues' => $canLoad ? $this->getLoadableStatues($playerId, $dieColor, $apolloWild) : [],
'deliverableOfferings' => $this->getDeliverableOfferings($playerId, $dieColor, $apolloWild),
'deliverableStatues' => $this->getDeliverableStatues($playerId, $dieColor, $apolloWild),
'explorableIslands' => $this->getExplorableIslands($playerId, $dieColor, $apolloWild),
'discardableInjuryCount' => $this->getDiscardableInjuries($playerId, $dieColor, $apolloWild),
'advanceableGod' => $this->getAdvanceableGod($playerId, $dieColor, $apolloWild),
```

Also add `'apolloWild' => $apolloWild` to the return array so JS can show the wild indicator.

- [ ] **Step 2: Update action validation methods to accept Apollo wild**

The `actFightMonster()`, `actExploreIsland()`, `actDiscardInjuries()`, `actAdvanceGod()` methods call these same helpers for validation. Update them to pass `$apolloWild`:

For example in `actFightMonster()` (around line 350):

```php
$apolloWild = $this->game->isApolloWildActive();
$fightable = $this->getFightableMonsters($activePlayerId, $dieColor, $apolloWild);
```

Apply to all action methods that call color-filtered helpers.

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/SelectAction.php
git commit -m "feat: Apollo wild bypasses color matching in all actions"
```

---

### Task 10: PHP — Wild Oracle Card Color Choice in PlayerActions

**Files:**
- Modify: `modules/php/States/PlayerActions.php`

- [ ] **Step 1: Add wild card color choice action**

When a player plays a wild oracle card (drawn by Apollo, `is_wild = 1`), they need to choose what color it acts as. Add a new action:

```php
#[PossibleAction]
public function actPlayWildOracleCard(int $card_id, string $chosen_color, int $activePlayerId) {
    $card = $this->game->getObjectFromDB(
        "SELECT card_id, card_type_arg, is_wild FROM card
         WHERE card_id = $card_id AND card_type = 'oracle'
         AND card_location = 'hand' AND card_location_arg = $activePlayerId"
    );
    if ($card === null || (int)$card['is_wild'] !== 1) {
        throw new UserException(clienttranslate('Invalid wild oracle card'));
    }

    // Validate color
    if (!in_array($chosen_color, MaterialDefs::COLORS, true)) {
        throw new UserException(clienttranslate('Invalid color'));
    }

    if ((int)$this->game->globals->get('oracle_card_played') !== 0) {
        throw new UserException(clienttranslate('You have already played an oracle card this turn'));
    }

    $this->game->globals->set('oracle_card_played', 1);
    $this->game->globals->set('selected_oracle_card_id', (int)$card['card_id']);
    $this->game->globals->set('wild_card_chosen_color', $chosen_color);

    $this->notify->all("oracleCardPlayed", clienttranslate('${player_name} plays a wild oracle card as ${card_color}'), [
        "player_id" => $activePlayerId,
        "player_name" => $this->game->getPlayerNameById($activePlayerId),
        "card_id" => (int)$card['card_id'],
        "card_color" => $chosen_color,
        "is_wild" => true,
    ]);

    return SelectAction::class;
}
```

- [ ] **Step 2: Include `is_wild` flag in oracle card hand data**

In `getArgs()`, modify the oracle card query to include `is_wild`:

```php
$rows = $this->game->getObjectListFromDB(
    "SELECT card_id, card_type_arg, is_wild FROM card
     WHERE card_type = 'oracle' AND card_location = 'hand' AND card_location_arg = $playerId
     ORDER BY card_id"
);
$colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
foreach ($rows as $row) {
    $oracleCardsInHand[] = [
        'cardId' => (int)$row['card_id'],
        'color' => $colors[(int)$row['card_type_arg']] ?? 'red',
        'isWild' => (int)$row['is_wild'] === 1,
    ];
}
```

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/PlayerActions.php
git commit -m "feat: add wild oracle card color choice for Apollo ability"
```

---

### Task 11: JS — God Icon Buttons in PlayerActions State

**Files:**
- Modify: `theoracleofdelphigzed.js` (onUpdateActionButtons, around line 1745)
- Modify: `theoracleofdelphigzed.css`

- [ ] **Step 1: Add god icon buttons to PlayerActions state**

In `theoracleofdelphigzed.js`, modify the `PlayerActions` case in `onUpdateActionButtons` (line 1745):

```javascript
case 'PlayerActions':
    // God ability icons (free actions)
    if (args && args.availableGods && args.availableGods.length > 0) {
        args.availableGods.forEach(g => {
            var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1);
            var btnId = 'god-ability-btn-' + g.god_name;
            this.statusBar.addActionButton(
                '<img src="' + g_themeurl + 'img/gods/' + g.god_name + '.png" class="god-ability-icon" alt="' + godLabel + '">',
                () => {
                    this.bgaPerformAction("actUseGodAbility", { godName: g.god_name });
                },
                { id: btnId }
            );
            // Add tooltip
            this.addTooltip(btnId, godLabel + ': ' + this.getGodAbilityDescription(g.ability), '');
        });
    }
    this.statusBar.addActionButton(_('End Turn'), () => this.onEndTurn(), { color: 'secondary' });
    break;
```

- [ ] **Step 2: Add god ability description helper**

Add this method to the game object (before `setupNotifications`):

```javascript
getGodAbilityDescription: function(ability) {
    switch (ability) {
        case 'discard_all_injuries': return _('Discard all injuries');
        case 'dice_wild': return _('All dice become wild + draw wild Oracle Card');
        case 'teleport_ship': return _('Teleport ship to any water hex');
        case 'free_explore_island': return _('Explore any island (no die needed)');
        case 'auto_defeat_monster': return _('Auto-defeat an adjacent monster');
        case 'grab_any_statue': return _('Take a statue from any city');
        default: return '';
    }
},
```

- [ ] **Step 3: Add CSS for god ability icons**

In `theoracleofdelphigzed.css`, add:

```css
/* God ability icon buttons */
.god-ability-icon {
    width: 28px;
    height: 28px;
    vertical-align: middle;
    border-radius: 50%;
}

#generalactions [id^="god-ability-btn-"] {
    padding: 4px 8px;
    background: linear-gradient(135deg, #ffd700, #ffaa00);
    border: 2px solid #d4a017;
    border-radius: 8px;
    min-width: auto;
}

#generalactions [id^="god-ability-btn-"]:hover {
    transform: scale(1.1);
    box-shadow: 0 0 10px rgba(255, 215, 0, 0.6);
}
```

- [ ] **Step 4: Commit**

```bash
git add theoracleofdelphigzed.js theoracleofdelphigzed.css
git commit -m "feat: god ability icon buttons in PlayerActions status bar"
```

---

### Task 12: JS — UseGodAbility State Handling

**Files:**
- Modify: `theoracleofdelphigzed.js` (onUpdateActionButtons, onEnteringState, onLeavingState)

- [ ] **Step 1: Add UseGodAbility case to onUpdateActionButtons**

In the switch statement, add after the `PlayerActions` case:

```javascript
case 'UseGodAbility':
    if (args) {
        switch (args.ability) {
            case 'teleport_ship':
                // Highlight water hexes on board
                this._highlightValidHexes(args.validHexes, 'god-target', (q, r) => {
                    this.bgaPerformAction("actTeleportShip", { hexQ: q, hexR: r });
                });
                break;
            case 'free_explore_island':
                this._highlightValidHexes(args.validHexes, 'god-target', (q, r) => {
                    this.bgaPerformAction("actExploreIsland", { hexQ: q, hexR: r });
                });
                break;
            case 'auto_defeat_monster':
                if (args.adjacentMonsters && args.adjacentMonsters.length > 0) {
                    args.adjacentMonsters.forEach(m => {
                        var label = _('Defeat') + ' ' + m.monster_type.charAt(0).toUpperCase() + m.monster_type.slice(1);
                        this.statusBar.addActionButton(label, () => {
                            this.bgaPerformAction("actDefeatMonster", { monster_id: m.monster_id });
                        }, { color: 'red' });
                    });
                }
                break;
            case 'grab_any_statue':
                if (args.validCities && args.validCities.length > 0) {
                    args.validCities.forEach(city => {
                        var colorLabel = city.statue_color.charAt(0).toUpperCase() + city.statue_color.slice(1);
                        this.statusBar.addActionButton(colorLabel + _(' Statue'), () => {
                            this.bgaPerformAction("actGrabStatue", { statue_id: city.statue_id });
                        });
                    });
                }
                break;
        }
    }
    this.statusBar.addActionButton(_('Cancel'), () => {
        this.bgaPerformAction("actPass", {});
    }, { color: 'secondary' });
    break;
```

- [ ] **Step 2: Add hex highlighting helper**

Add this helper method to the game object:

```javascript
_highlightValidHexes: function(hexes, className, onClick) {
    this._godTargetOverlays = [];
    var self = this;
    hexes.forEach(function(hex) {
        var q = parseInt(hex.q);
        var r = parseInt(hex.r);
        var pos = self.components.hexGrid.hexToPixel(q, r);
        if (!pos) return;

        var overlay = document.createElement('div');
        overlay.className = 'hex-overlay ' + className;
        overlay.style.left = pos.x + 'px';
        overlay.style.top = pos.y + 'px';
        overlay.addEventListener('click', function() {
            onClick(q, r);
        });

        var boardContainer = document.getElementById('delphi-board-container');
        if (boardContainer) {
            boardContainer.appendChild(overlay);
        }
        self._godTargetOverlays.push(overlay);
    });
},

_clearGodTargetOverlays: function() {
    if (this._godTargetOverlays) {
        this._godTargetOverlays.forEach(function(el) { el.remove(); });
        this._godTargetOverlays = null;
    }
},
```

- [ ] **Step 3: Clear overlays when leaving UseGodAbility state**

In `onLeavingState`, add a case:

```javascript
case 'UseGodAbility':
    this._clearGodTargetOverlays();
    break;
```

- [ ] **Step 4: Add CSS for god target hexes**

In `theoracleofdelphigzed.css`:

```css
/* God ability target hex overlays */
.hex-overlay.god-target {
    position: absolute;
    width: 80px;
    height: 92px;
    margin-left: -40px;
    margin-top: -46px;
    background: rgba(255, 215, 0, 0.3);
    clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
    cursor: pointer;
    z-index: 10;
    transition: background 0.2s;
}

.hex-overlay.god-target:hover {
    background: rgba(255, 215, 0, 0.6);
}
```

- [ ] **Step 5: Commit**

```bash
git add theoracleofdelphigzed.js theoracleofdelphigzed.css
git commit -m "feat: UseGodAbility state handling with hex targeting UI"
```

---

### Task 13: JS — God Ability Notifications

**Files:**
- Modify: `theoracleofdelphigzed.js` (setupNotifications, notification handlers)

- [ ] **Step 1: Add notification handlers**

Add these notification handlers after `notif_godAdvanced`:

```javascript
notif_godReset: function(args) {
    console.log('notif_godReset', args);
    this.components.positionGodToken(
        parseInt(args.player_id),
        args.god_name,
        0
    );
},

notif_godAbilityUsed: function(args) {
    console.log('notif_godAbilityUsed', args);
    // Handle specific ability side effects
    if (args.ability === 'discard_all_injuries' && parseInt(args.player_id) === this.player_id) {
        // Remove all injury cards from hand display
        this.components.clearAllInjuryCards();
    }
    if (args.ability === 'dice_wild') {
        // Show wild indicator on dice
        if (parseInt(args.player_id) === this.player_id) {
            this.components.setDiceWild(true);
            // Add wild oracle card to hand if drawn
            if (args.wild_card_color) {
                this.components.addOracleCardToHand(args.wild_card_color, true); // true = wild
            }
        }
    }
},

notif_cancelGodAbility: function(args) {
    console.log('notif_cancelGodAbility', args);
    // No visual changes needed
},
```

- [ ] **Step 2: Add `clearAllInjuryCards` to Components.js**

In `modules/js/Components.js`, add a method to clear all injury cards from the hand display. Find the injury card section and add:

```javascript
clearAllInjuryCards: function() {
    var container = document.getElementById('delphi-injury-cards');
    if (container) {
        container.innerHTML = '';
    }
    // Update injury count display if it exists
    var countEl = document.getElementById('delphi-injury-count');
    if (countEl) {
        countEl.textContent = '0';
    }
},
```

- [ ] **Step 3: Add `setDiceWild` to Components.js**

Add a method to show/clear the wild visual on dice:

```javascript
setDiceWild: function(active) {
    var diceContainer = document.getElementById('delphi-oracle-dice');
    if (diceContainer) {
        if (active) {
            diceContainer.classList.add('dice-wild-active');
        } else {
            diceContainer.classList.remove('dice-wild-active');
        }
    }
},
```

- [ ] **Step 4: Add wild dice CSS**

In `theoracleofdelphigzed.css`:

```css
/* Apollo wild dice indicator */
.dice-wild-active .oracle-die:not(.die-used) {
    animation: wild-shimmer 1.5s ease-in-out infinite;
    border: 2px solid gold;
    border-radius: 4px;
}

@keyframes wild-shimmer {
    0%, 100% { box-shadow: 0 0 5px rgba(255, 215, 0, 0.4); }
    50% { box-shadow: 0 0 15px rgba(255, 215, 0, 0.8); }
}
```

- [ ] **Step 5: Add `addOracleCardToHand` wild support**

Modify `addOracleCardToHand` in Components.js to accept a `isWild` parameter. If wild, add a special class:

Find the existing `addOracleCardToHand` method and modify its signature and card creation:

```javascript
addOracleCardToHand: function(color, isWild) {
    // ... existing code to create card element ...
    // After creating the card element, add wild class if needed:
    if (isWild) {
        cardEl.classList.add('oracle-card-wild');
    }
    // ... rest of existing code ...
},
```

Add CSS:

```css
/* Wild oracle card indicator */
.oracle-card-wild {
    border: 2px solid gold;
    box-shadow: 0 0 8px rgba(255, 215, 0, 0.6);
}

.oracle-card-wild::after {
    content: '★';
    position: absolute;
    top: 2px;
    right: 4px;
    color: gold;
    font-size: 14px;
}
```

- [ ] **Step 6: Clear wild state on ConsultOracle notification**

In `notif_consultOracle` handler (line 2584), add:

```javascript
notif_consultOracle: async function(args) {
    console.log('notif_consultOracle', args);
    // Clear Apollo wild state
    this.components.setDiceWild(false);
},
```

- [ ] **Step 7: Commit**

```bash
git add theoracleofdelphigzed.js modules/js/Components.js theoracleofdelphigzed.css
git commit -m "feat: god ability notification handlers and visual effects"
```

---

### Task 14: JS — Wild Oracle Card Color Picker

**Files:**
- Modify: `theoracleofdelphigzed.js`
- Modify: `theoracleofdelphigzed.css`

- [ ] **Step 1: Add wild card color picker to PlayerActions**

In the `PlayerActions` case of `onUpdateActionButtons`, the existing oracle card buttons are rendered elsewhere (likely in `onEnteringState`). We need to intercept clicks on wild oracle cards and show a color picker instead of directly playing them.

Find where oracle card click handlers are set up (in `onEnteringState` for `PlayerActions` or in the action bar oracle card rendering). Modify the click handler for wild cards:

```javascript
// When setting up oracle card click handlers, check for wild cards:
if (card.isWild) {
    cardEl.addEventListener('click', function() {
        self.showWildColorPicker(card.cardId);
    });
} else {
    // existing click handler
}
```

Add the color picker method:

```javascript
showWildColorPicker: function(cardId) {
    var self = this;
    var colors = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];

    // Remove existing picker if any
    var existing = document.getElementById('delphi-wild-color-picker');
    if (existing) existing.remove();

    var picker = document.createElement('div');
    picker.id = 'delphi-wild-color-picker';
    picker.className = 'wild-color-picker';

    var label = document.createElement('span');
    label.textContent = _('Choose color: ');
    picker.appendChild(label);

    colors.forEach(function(color) {
        var btn = document.createElement('button');
        btn.className = 'wild-color-btn wild-color-' + color;
        btn.title = color.charAt(0).toUpperCase() + color.slice(1);
        btn.addEventListener('click', function() {
            picker.remove();
            self.bgaPerformAction("actPlayWildOracleCard", {
                card_id: cardId,
                chosen_color: color
            });
        });
        picker.appendChild(btn);
    });

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'wild-color-btn wild-color-cancel';
    cancelBtn.textContent = '✕';
    cancelBtn.addEventListener('click', function() {
        picker.remove();
    });
    picker.appendChild(cancelBtn);

    document.getElementById('generalactions').appendChild(picker);
},
```

- [ ] **Step 2: Add CSS for color picker**

```css
/* Wild oracle card color picker */
.wild-color-picker {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin-left: 8px;
    padding: 4px 8px;
    background: #fff;
    border: 2px solid gold;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}

.wild-color-btn {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid #666;
    cursor: pointer;
    transition: transform 0.15s;
}

.wild-color-btn:hover {
    transform: scale(1.2);
    border-color: #000;
}

.wild-color-red { background: #E53935; }
.wild-color-yellow { background: #FDD835; }
.wild-color-green { background: #43A047; }
.wild-color-blue { background: #1E88E5; }
.wild-color-pink { background: #D81B60; }
.wild-color-black { background: #424242; }
.wild-color-cancel {
    background: #eee;
    font-size: 12px;
    line-height: 24px;
    text-align: center;
}
```

- [ ] **Step 3: Commit**

```bash
git add theoracleofdelphigzed.js theoracleofdelphigzed.css
git commit -m "feat: wild oracle card color picker UI for Apollo ability"
```

---

### Task 15: Integration — Verify Full Flow

- [ ] **Step 1: Test Aphrodite flow manually**

Start a test game, advance Aphrodite to row 6, verify:
1. Gold god icon appears in PlayerActions status bar
2. Clicking it discards all injuries
3. God token animates back to row 0
4. Player can still use dice actions after

- [ ] **Step 2: Test Apollo flow manually**

Advance Apollo to row 6, verify:
1. Gold god icon appears
2. Clicking it: dice get wild shimmer, oracle card drawn with star/wild indicator
3. All die actions ignore color restrictions
4. Wild oracle card shows color picker when played
5. Wild flag clears at end of turn (ConsultOracle)

- [ ] **Step 3: Test Poseidon flow manually**

Advance Poseidon to row 6, verify:
1. Clicking icon: water hexes highlight gold
2. Clicking a hex: ship teleports there
3. Cancel button works

- [ ] **Step 4: Test Artemis flow manually**

Advance Artemis to row 6, verify:
1. Unrevealed islands highlight
2. Clicking one triggers explore flow
3. No die is spent

- [ ] **Step 5: Test Ares flow manually**

Advance Ares to row 6 with ship adjacent to monster, verify:
1. Monster buttons appear
2. Clicking auto-defeats, triggers equipment selection
3. No die spent

- [ ] **Step 6: Test Hermes flow manually**

Advance Hermes to row 6 with ship adjacent to a city, verify:
1. Statue buttons from all cities appear
2. Clicking loads statue onto ship
3. No die spent

- [ ] **Step 7: Test multiple abilities in one turn**

Have 2+ gods at row 6, verify both can be used in the same turn.

- [ ] **Step 8: Commit any fixes**

```bash
git add -A
git commit -m "fix: integration fixes for god abilities"
```
