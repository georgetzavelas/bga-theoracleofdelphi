# State Machine Skeleton Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create ~20 PHP state classes implementing the full turn loop skeleton so players can cycle through states using "pass" actions.

**Architecture:** One class per state in `modules/php/States/`, matching the existing BGA class-based pattern (extends `GameState`, constructor with id/type, `onEnteringState` for game states, `#[PossibleAction]` for activeplayer states). All game states take happy path. All activeplayer states have `actPass()` + `zombie()`.

**Tech Stack:** PHP 8.1+, BGA Framework class-based states (`Bga\GameFramework\States\GameState`, `StateType`, `PossibleAction`)

---

## Implementer Notes

- **Pattern reference:** See existing `modules/php/States/NextPlayer.php` for game state pattern, `PlayerTurn.php` for activeplayer pattern.
- **Game states** have `onEnteringState(int $activePlayerId)` that returns next state class.
- **Active player states** have `#[PossibleAction]` methods that return next state class. They also need `zombie(int $playerId)`.
- **No `states.inc.php` needed** — the BGA framework auto-discovers state classes from the `States/` directory.
- **`$this->notify->all()`** is available on GameState for sending notifications.
- **`$this->game->getPlayerNameById()`** for player names in notifications.
- **`clienttranslate()`** wraps translatable strings.
- **ST_END_GAME = 99** is defined as a constant in `EndScore.php`.

## Dependency Graph

```
Task 1 (game states) ──┐
                        ├── Task 3 (update existing) ── Task 4 (update Game.php) ── Task 5 (lint)
Task 2 (active states) ─┘
```

Tasks 1 and 2 are independent and can run in parallel.

---

### Task 1: Create Game State Classes (7 files)

Auto-transition states that use `onEnteringState` to advance.

**Files to create:**
- `modules/php/States/RoundStart.php`
- `modules/php/States/PlayerTurnStart.php`
- `modules/php/States/CheckInjuries.php`
- `modules/php/States/FightMonsterStart.php`
- `modules/php/States/ConsultOracle.php`
- `modules/php/States/TitanAttack.php`
- `modules/php/States/PreEndGame.php`

**Step 1: Create RoundStart.php (id:2)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class RoundStart extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 2, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("roundStart", clienttranslate('A new round begins'), []);
        return PlayerTurnStart::class;
    }
}
```

**Step 2: Create PlayerTurnStart.php (id:10)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class PlayerTurnStart extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 10, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("playerTurnStart", clienttranslate('${player_name} starts their turn'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        // Happy path: skip god advancement (state 9), go straight to injury check
        return CheckInjuries::class;
    }
}
```

**Step 3: Create CheckInjuries.php (id:11)**

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
        // Happy path: no injuries to recover, go to normal turn
        return PlayerActions::class;
    }
}
```

**Step 4: Create FightMonsterStart.php (id:31)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class FightMonsterStart extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 31, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("combatStart", clienttranslate('${player_name} engages a monster!'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return CombatRound::class;
    }
}
```

**Step 5: Create ConsultOracle.php (id:40)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class ConsultOracle extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 40, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("consultOracle", clienttranslate('${player_name} consults the oracle'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return NextPlayer::class;
    }
}
```

**Step 6: Create TitanAttack.php (id:51)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class TitanAttack extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 51, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("titanAttack", clienttranslate('The Titan attacks!'), []);
        // Happy path: go to next round
        return RoundStart::class;
    }
}
```

**Step 7: Create PreEndGame.php (id:90)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class PreEndGame extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 90, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("preEndGame", clienttranslate('The game is ending — final scoring'), []);
        return EndScore::class;
    }
}
```

---

### Task 2: Create Active Player State Classes (14 files)

All follow the same pattern: constructor with id/type/descriptions, `actPass()` with `#[PossibleAction]`, and `zombie()`.

**Files to create:**
- `modules/php/States/CheckGodAdvancement.php`
- `modules/php/States/Recover.php`
- `modules/php/States/NoInjuryBonus.php`
- `modules/php/States/PlayerActions.php`
- `modules/php/States/SelectAction.php`
- `modules/php/States/ConfirmRecolor.php`
- `modules/php/States/MoveShip.php`
- `modules/php/States/CombatRound.php`
- `modules/php/States/CombatResult.php`
- `modules/php/States/LoadCargo.php`
- `modules/php/States/DeliverCargo.php`
- `modules/php/States/ExploreIsland.php`
- `modules/php/States/BuildShrine.php`
- `modules/php/States/UseGodAbility.php`
- `modules/php/States/SelectReward.php`

**Step 1: Create CheckGodAdvancement.php (id:9)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class CheckGodAdvancement extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 9,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may advance a god'),
            descriptionMyTurn: clienttranslate('${you} may advance a god from the oracle roll'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("skipGodAdvancement", clienttranslate('${player_name} skips god advancement'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return CheckInjuries::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 2: Create Recover.php (id:12)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class Recover extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 12,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} must recover'),
            descriptionMyTurn: clienttranslate('${you} must discard injury cards'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("recover", clienttranslate('${player_name} recovers (placeholder)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return NextPlayer::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 3: Create NoInjuryBonus.php (id:13)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class NoInjuryBonus extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 13,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} has no injuries'),
            descriptionMyTurn: clienttranslate('Take 2 Favor or advance 1 God'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("noInjuryBonus", clienttranslate('${player_name} takes no-injury bonus (placeholder)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 4: Create PlayerActions.php (id:20)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class PlayerActions extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 20,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may perform actions'),
            descriptionMyTurn: clienttranslate('${you} may perform actions'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("endTurn", clienttranslate('${player_name} ends their turn'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return ConsultOracle::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 5: Create SelectAction.php (id:21)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class SelectAction extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 21,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} selects action'),
            descriptionMyTurn: clienttranslate('Select action for die'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelAction", clienttranslate('${player_name} cancels die selection'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 6: Create ConfirmRecolor.php (id:22)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class ConfirmRecolor extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 22,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} confirms recolor'),
            descriptionMyTurn: clienttranslate('Confirm die recolor cost'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelRecolor", clienttranslate('${player_name} cancels recolor'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 7: Create MoveShip.php (id:30)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class MoveShip extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 30,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} moves ship'),
            descriptionMyTurn: clienttranslate('Select destination hex'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelMove", clienttranslate('${player_name} cancels ship movement'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 8: Create CombatRound.php (id:32)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class CombatRound extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 32,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} is in combat'),
            descriptionMyTurn: clienttranslate('Roll the Battle Die'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("combatRoll", clienttranslate('${player_name} rolls battle die (placeholder)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return CombatResult::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 9: Create CombatResult.php (id:33)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class CombatResult extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 33,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} combat result'),
            descriptionMyTurn: clienttranslate('Continue fighting or surrender'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("surrender", clienttranslate('${player_name} surrenders (placeholder)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 10: Create LoadCargo.php (id:34)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class LoadCargo extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 34,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} loads cargo'),
            descriptionMyTurn: clienttranslate('Pick up offering or statue'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelLoad", clienttranslate('${player_name} cancels loading'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 11: Create DeliverCargo.php (id:35)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class DeliverCargo extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 35,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} delivers cargo'),
            descriptionMyTurn: clienttranslate('Deliver offering or raise statue'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelDeliver", clienttranslate('${player_name} cancels delivery'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 12: Create ExploreIsland.php (id:36)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class ExploreIsland extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 36,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} explores an island'),
            descriptionMyTurn: clienttranslate('Select island to explore'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelExplore", clienttranslate('${player_name} cancels exploration'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 13: Create BuildShrine.php (id:37)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class BuildShrine extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 37,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} builds a shrine'),
            descriptionMyTurn: clienttranslate('Place shrine on island'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelShrine", clienttranslate('${player_name} cancels shrine placement'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 14: Create UseGodAbility.php (id:38)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class UseGodAbility extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 38,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} uses a god ability'),
            descriptionMyTurn: clienttranslate('Select god ability to use'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("cancelGodAbility", clienttranslate('${player_name} cancels god ability'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

**Step 15: Create SelectReward.php (id:39)**

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class SelectReward extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 39,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} selects reward'),
            descriptionMyTurn: clienttranslate('Select your reward'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("skipReward", clienttranslate('${player_name} skips reward (placeholder)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
```

---

### Task 3: Update Existing State Files

**Step 1: Delete PlayerTurn.php**

Delete `modules/php/States/PlayerTurn.php` — it's replaced by `PlayerActions.php` (id changed from 10 to 20).

**Step 2: Update NextPlayer.php (id 90→50)**

Replace full contents of `modules/php/States/NextPlayer.php` with:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class NextPlayer extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 50,
            type: StateType::GAME,
            updateGameProgression: true,
        );
    }

    function onEnteringState(int $activePlayerId) {
        $this->game->giveExtraTime($activePlayerId);
        $this->game->activeNextPlayer();
        // Happy path: always loop back to next player's turn
        return PlayerTurnStart::class;
    }
}
```

**Step 3: Keep EndScore.php as-is**

`EndScore.php` stays at id:98 with `ST_END_GAME = 99`. No changes needed.

---

### Task 4: Update Game.php References

**Step 1: Change import and initial state**

In `modules/php/Game.php`:

Change line 21:
```php
// OLD:
use Bga\Games\theoracleofdelphigzed\States\PlayerTurn;
// NEW:
use Bga\Games\theoracleofdelphigzed\States\RoundStart;
```

Change line 875:
```php
// OLD:
return PlayerTurn::class;
// NEW:
return RoundStart::class;
```

---

### Task 5: PHP Lint Check

Run: `php -l modules/php/States/*.php`

Expected: No syntax errors for all ~22 files.

---

### Task 6: Commit

```bash
git add modules/php/States/ modules/php/Game.php
git commit -m "feat: add state machine skeleton with 21 turn-loop states (Phase 3g)"
```
