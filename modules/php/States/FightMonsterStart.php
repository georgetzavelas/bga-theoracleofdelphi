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
        $monsterId = $this->game->globals->get('combat_monster_id');
        $monster = $this->game->getObjectFromDB(
            "SELECT monster_id, color, monster_type, hex_q, hex_r
             FROM monster WHERE monster_id = $monsterId"
        );

        // Calculate starting combat strength: 9 - shield
        $shieldValue = (int)$this->game->getUniqueValueFromDB(
            "SELECT shield_value FROM player WHERE player_id = $activePlayerId"
        );
        $combatStrength = max(0, 9 - $shieldValue);
        $this->game->globals->set('combat_strength', $combatStrength);

        // Save action source for combat cancel/resolve (defer spending until combat ends)
        $dieIndex = $this->game->globals->get('selected_die_index');
        $this->game->globals->set('combat_die_index', $dieIndex);
        $oracleCardId = (int)$this->game->globals->get('selected_oracle_card_id');
        $this->game->globals->set('combat_oracle_card_id', $oracleCardId);

        $this->notify->all("combatStart", clienttranslate('${player_name} fights a ${monster_type}!'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "monster_id" => (int)$monster['monster_id'],
            "monster_type" => $monster['monster_type'],
            "color" => $monster['color'],
            "strength" => $combatStrength,
            "shield_value" => $shieldValue,
        ]);

        return CombatRound::class;
    }
}
