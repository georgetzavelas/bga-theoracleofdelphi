<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\CombatRules;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

class CombatResult extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 33, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        $roll = (int)$this->game->globals->get('combat_roll');
        $strength = (int)$this->game->globals->get('combat_strength');

        // Victory: roll >= strength
        if (CombatRules::isVictory($roll, $strength)) {
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

            // Equipment cap check: if the victor is already at their
            // capacity (4 with the Quartermaster ship tile, else 3), skip
            // CombatVictory so the player isn't presented with a "Choose
            // Equipment Card" prompt they can't satisfy. In normal play this
            // never fires (a player can earn at most 3 monster rewards + 1
            // Quartermaster card = their capacity), so it's a safety net;
            // Zeus tile completion + action-source spending still happen in
            // resolveMonsterVictoryAtEquipmentCap.
            if ($this->game->countEquipmentInHand($activePlayerId)
                    >= $this->game->equipmentCapacityFor($activePlayerId)) {
                return $this->game->resolveMonsterVictoryAtEquipmentCap(
                    $activePlayerId, $monster
                );
            }

            return CombatVictory::class;
        }

        // Rolled 0 and lost: draw injury card. At strength 0 a rolled 0 wins
        // above and must not also be injured, which is why victory is checked
        // first — see CombatRules::drawsInjury.
        if (CombatRules::drawsInjury($roll, $strength)) {
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
                        clienttranslate('${companion_name} auto-discards ${player_name}\'s ${color_name} injury from combat'), [
                        "player_id" => $activePlayerId,
                        "player_name" => $this->game->getPlayerNameById($activePlayerId),
                        "color" => $color,
                        "color_name" => MaterialDefs::colorName((string)$color),
                        "preserve" => ["color"],
                        "count" => 1,
                        "source" => "combat",
                        "companion_name" => MaterialDefs::companionName($color, 2),
                        "i18n" => ["companion_name", "color_name"],
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
