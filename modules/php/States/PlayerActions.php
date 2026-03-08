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
