<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class CombatResult extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 33, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $roll = $this->game->globals->get('combat_roll');
        $strength = $this->game->globals->get('combat_strength');

        // Victory: roll >= strength
        if ($roll >= $strength) {
            return CombatVictory::class;
        }

        // Rolled 0: draw injury card
        if ($roll === 0) {
            $monsterId = $this->game->globals->get('combat_monster_id');
            $monster = $this->game->getObjectFromDB(
                "SELECT color FROM monster WHERE monster_id = $monsterId"
            );
            $color = $monster['color'];
            $colorIdx = MaterialDefs::COLOR_INDEX[$color];

            $injuryCard = $this->game->getObjectFromDB(
                "SELECT card_id FROM card
                 WHERE card_type = 'injury' AND card_type_arg = $colorIdx AND card_location = 'deck'
                 ORDER BY card_location_arg ASC LIMIT 1"
            );
            if ($injuryCard) {
                $cardId = $injuryCard['card_id'];
                $this->game->DbQuery(
                    "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
                     WHERE card_id = $cardId"
                );
                $this->notify->all("combatInjury", clienttranslate('${player_name} draws an injury card (rolled 0)'), [
                    "player_id" => $activePlayerId,
                    "player_name" => $this->game->getPlayerNameById($activePlayerId),
                    "color" => $color,
                ]);
            }
        }

        // Lost round — go to CombatDefeat for pay-favor-or-surrender decision
        return CombatDefeat::class;
    }
}
