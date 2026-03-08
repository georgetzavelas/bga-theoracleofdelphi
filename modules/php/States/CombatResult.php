<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class CombatResult extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 33,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} combat result'),
            descriptionMyTurn: clienttranslate('Continue fighting or surrender'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("surrender", clienttranslate('${player_name} surrenders (placeholder)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
