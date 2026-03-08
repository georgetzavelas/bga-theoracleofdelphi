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
