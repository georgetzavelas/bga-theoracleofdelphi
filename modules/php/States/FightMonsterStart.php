<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

class FightMonsterStart extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 31, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $this->notify->all("combatStart", clienttranslate('${player_name} engages a monster!'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);
        return CombatRound::class;
    }
}
