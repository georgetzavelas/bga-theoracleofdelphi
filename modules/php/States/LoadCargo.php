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
