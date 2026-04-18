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

        // End-game check: if a player has already landed on Zeus in the
        // final round, the game ends once turn rotation returns to them.
        // activeNextPlayer cycles through every other player first, so
        // the first time the winner becomes active again, every remaining
        // player has completed their final turn.
        $winnerId = $this->game->globals->get('winner_player_id');
        if ($winnerId !== null) {
            $nextActiveId = (int)$this->game->getActivePlayerId();
            if ($nextActiveId === (int)$winnerId) {
                return PreEndGame::class;
            }
        }

        return PlayerTurnStart::class;
    }
}
