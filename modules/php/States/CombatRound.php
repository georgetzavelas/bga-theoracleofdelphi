<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\Games\theoracleofdelphigzed\Game;

class CombatRound extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 32,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} is in combat'),
            descriptionMyTurn: clienttranslate('Roll the Battle Die'),
        );
    }

    #[PossibleAction]
    public function actPass(int $activePlayerId) {
        $this->notify->all("combatRoll", clienttranslate('${player_name} rolls battle die (placeholder)'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return CombatResult::class;
    }

    function zombie(int $playerId) {
        return $this->actPass($playerId);
    }
}
