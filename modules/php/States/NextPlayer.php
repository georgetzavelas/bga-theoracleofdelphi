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

        $nextActiveId = (int)$this->game->getActivePlayerId();

        // End-game check: if a player has already landed on Zeus in the
        // final round, the game ends once turn rotation returns to them.
        // activeNextPlayer cycles through every other player first, so
        // the first time the winner becomes active again, every remaining
        // player has completed their final turn.
        $winnerId = $this->game->globals->get('winner_player_id');
        if ($winnerId !== null && $nextActiveId === (int)$winnerId) {
            return PreEndGame::class;
        }

        // Round-end check: the first player is stable, so whenever turn
        // rotation wraps back to them, the previous round has ended and
        // the Titan attacks before the new round begins.
        $firstPlayerId = $this->game->globals->get('first_player_id');
        if ($firstPlayerId !== null && $nextActiveId === (int)$firstPlayerId) {
            return TitanAttack::class;
        }

        return PlayerTurnStart::class;
    }
}
