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
