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
