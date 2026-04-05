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
        $this->game->giveExtraTime($activePlayerId);
        $this->game->globals->set('oracle_card_played', 0);
        $this->game->globals->set('selected_oracle_card_id', 0);

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
}
