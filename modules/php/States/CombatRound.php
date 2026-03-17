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

    public function getArgs(): array
    {
        $playerId = (int)$this->game->getActivePlayerId();
        $monsterId = $this->game->globals->get('combat_monster_id');
        $monster = $this->game->getObjectFromDB(
            "SELECT monster_type, color FROM monster WHERE monster_id = $monsterId"
        );
        $shieldValue = (int)$this->game->getUniqueValueFromDB(
            "SELECT shield_value FROM player WHERE player_id = $playerId"
        );
        return [
            'strength' => $this->game->globals->get('combat_strength'),
            'monster_type' => $monster ? $monster['monster_type'] : null,
            'monster_color' => $monster ? $monster['color'] : null,
            'shield_value' => $shieldValue,
        ];
    }

    #[PossibleAction]
    public function actRollBattleDie(int $activePlayerId) {
        $roll = bga_rand(0, 9);
        $this->game->globals->set('combat_roll', $roll);

        $strength = $this->game->globals->get('combat_strength');

        $this->notify->all("battleDieRolled", clienttranslate('${player_name} rolls ${roll} (need ${strength})'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "roll" => $roll,
            "strength" => $strength,
        ]);

        return CombatResult::class;
    }

    function zombie(int $playerId) {
        return $this->actRollBattleDie($playerId);
    }
}
