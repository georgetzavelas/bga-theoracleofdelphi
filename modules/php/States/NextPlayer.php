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

        // Round end is the same boundary for both regular rotation
        // (Titan attack) and end-of-game: the first player is stable,
        // so whenever turn rotation wraps back to them the current
        // round has just completed. If a winner already reached Zeus
        // during the round, end the game now (skip the Titan attack);
        // otherwise fire the regular Titan attack before the next
        // round starts.
        $winnerId = $this->game->globals->get('winner_player_id');
        $firstPlayerId = $this->game->globals->get('first_player_id');
        $isRoundEnd = $firstPlayerId !== null
            && $nextActiveId === (int)$firstPlayerId;

        if ($winnerId !== null && $isRoundEnd) {
            return PreEndGame::class;
        }
        if ($isRoundEnd) {
            return TitanAttack::class;
        }

        return PlayerTurnStart::class;
    }
}
