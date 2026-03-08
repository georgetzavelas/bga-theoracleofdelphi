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
