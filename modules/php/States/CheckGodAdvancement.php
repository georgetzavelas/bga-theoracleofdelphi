<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class CheckGodAdvancement extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 9,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} may advance a god'),
            descriptionMyTurn: clienttranslate('${you} may advance a god from the oracle roll'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("skipGodAdvancement", clienttranslate('${player_name} skips god advancement'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return CheckInjuries::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
