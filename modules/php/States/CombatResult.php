<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

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
            $monsterId = $this->game->globals->get('combat_monster_id');
            $monster = $this->game->getObjectFromDB(
                "SELECT monster_id, monster_type, color FROM monster WHERE monster_id = $monsterId"
            );
            $this->game->DbQuery(
                "UPDATE monster SET is_defeated = 1, defeated_by_player_id = $activePlayerId
                 WHERE monster_id = $monsterId"
            );
            $this->notify->all("monsterDefeated", clienttranslate('${player_name} defeats the ${monster_tok}'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "monster_id" => $monsterId,
                "monster_type" => $monster['monster_type'],
                "monster_tok" => $monster['monster_type'],
                "monster_color" => $monster['color'],
            ]);

            // Equipment cap (3 per player) check: if the victor already
            // has 3 cards in hand, skip CombatVictory entirely so the
            // player isn't presented with a "Choose Equipment Card"
            // prompt they can't satisfy. Zeus tile completion + action-
            // source spending still need to happen — both are mirrored
            // here from the non-cap actSelectEquipment path so the
            // turn flow stays correct.
            if ($this->game->countEquipmentInHand($activePlayerId) >= 3) {
                return $this->game->resolveMonsterVictoryAtEquipmentCap(
                    $activePlayerId, $monster
                );
            }

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
                if ($this->game->playerOwnsHero($activePlayerId, $color)) {
                    // Hero auto-discard: injury never enters the hand.
                    $this->game->DbQuery(
                        "UPDATE card SET card_location = 'discard', card_location_arg = 0
                         WHERE card_id = $cardId"
                    );
                    $this->notify->all("heroAutoDiscarded",
                        clienttranslate('${companion_name} auto-discards ${player_name}\'s ${color} injury from combat'), [
                        "player_id" => $activePlayerId,
                        "player_name" => $this->game->getPlayerNameById($activePlayerId),
                        "color" => $color,
                        "count" => 1,
                        "source" => "combat",
                        "companion_name" => MaterialDefs::companionName($color, 2),
                    ]);
                } else {
                    $this->game->DbQuery(
                        "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
                         WHERE card_id = $cardId"
                    );
                    $this->game->statInc(1, 'injuries_received', $activePlayerId);
                    $this->notify->all("combatInjury", clienttranslate('${player_name} draws ${injury_tok} injury (rolled 0)'), [
                        "player_id" => $activePlayerId,
                        "player_name" => $this->game->getPlayerNameById($activePlayerId),
                        "color" => $color,
                        "injury_tok" => $color,
                    ]);
                }
            }
        }

        // Lost round — go to CombatDefeat for pay-favor-or-surrender decision
        return CombatDefeat::class;
    }

}
