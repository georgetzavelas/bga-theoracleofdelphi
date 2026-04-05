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

    #[PossibleAction]
    public function actCancelCombat(int $activePlayerId) {
        $oracleCardId = (int)$this->game->globals->get('combat_oracle_card_id');

        if ($oracleCardId > 0) {
            // Restore oracle card as action source (never spent — deferred)
            $this->game->globals->set('selected_oracle_card_id', $oracleCardId);
        } else {
            // Restore die as action source (never spent — deferred)
            $dieIndex = $this->game->globals->get('combat_die_index');
            if ($dieIndex !== null) {
                $this->game->globals->set('selected_die_index', $dieIndex);
            }
        }

        // Clear combat globals
        $this->game->globals->set('combat_monster_id', null);
        $this->game->globals->set('combat_strength', null);
        $this->game->globals->set('combat_roll', null);
        $this->game->globals->set('combat_die_index', null);
        $this->game->globals->set('combat_oracle_card_id', null);

        $this->notify->all("combatCancelled", clienttranslate('${player_name} cancels combat'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
        ]);

        return SelectAction::class;
    }

    function zombie(int $playerId) {
        return $this->actRollBattleDie($playerId);
    }
}
