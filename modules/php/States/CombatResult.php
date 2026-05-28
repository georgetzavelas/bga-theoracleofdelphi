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
            $this->notify->all("monsterDefeated", clienttranslate('${player_name} defeats the ${monster_type}!'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "monster_id" => $monsterId,
                "monster_type" => $monster['monster_type'],
                "monster_color" => $monster['color'],
            ]);

            // Equipment cap (3 per player) check: if the victor already
            // has 3 cards in hand, skip CombatVictory entirely so the
            // player isn't presented with a "Choose Equipment Card"
            // prompt they can't satisfy. Zeus tile completion + action-
            // source spending still need to happen — both are mirrored
            // here from the non-cap actSelectEquipment path so the
            // turn flow stays correct.
            $equipmentCount = (int)$this->game->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM card
                 WHERE card_type = 'equipment' AND card_location = 'hand'
                 AND card_location_arg = $activePlayerId"
            );
            if ($equipmentCount >= 3) {
                return $this->resolveVictoryAtEquipmentCap(
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
                    $this->notify->all("combatInjury", clienttranslate('${player_name} draws an injury card (rolled 0)'), [
                        "player_id" => $activePlayerId,
                        "player_name" => $this->game->getPlayerNameById($activePlayerId),
                        "color" => $color,
                    ]);
                }
            }
        }

        // Lost round — go to CombatDefeat for pay-favor-or-surrender decision
        return CombatDefeat::class;
    }

    /**
     * Skip CombatVictory's equipment-pick when the player is already at
     * the 3-card cap. Mirrors the post-pick logic in
     * CombatVictory::actSelectEquipment: Zeus-tile completion + matching
     * notifications + action-source spending + Ares vs normal transition.
     * No equipment is moved, the display isn't refilled, and one-time /
     * Blessed-Reward (card 011) post-pick reactions are skipped because
     * those fire off the picked card — there's no card here.
     */
    private function resolveVictoryAtEquipmentCap(int $activePlayerId, array $monster): string
    {
        $monsterType = $monster['monster_type'];

        // Complete a matching Zeus tile (specific type match, or fall
        // back to a white tile when the type isn't already represented).
        $completedTileId = $this->game->completeZeusTileForType(
            $activePlayerId, 'monster', $monsterType
        );

        // Game-log notification: explain why no card was awarded.
        $this->notify->all("equipmentCapReached",
            clienttranslate('${player_name} is at the 3-card Equipment limit and does not gain a card from this victory'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "cap" => 3,
            ]
        );

        if ($completedTileId !== null) {
            $tasksCompleted = (int)$this->game->getUniqueValueFromDB(
                "SELECT tasks_completed FROM player WHERE player_id = $activePlayerId"
            );
            $this->notify->all("taskCompleted", clienttranslate('${player_name} completes a Zeus tile!'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "tile_id" => $completedTileId,
                "tasks_completed" => $tasksCompleted,
                "task_type" => "monster",
                "color" => $monster['color'],
                "completion_value" => $monster['color'],
            ]);
        }

        // Spend the action source / Ares cleanup, mirroring the branch
        // in CombatVictory::actSelectEquipment. Globals usage matches
        // that handler so the turn flow stays identical between
        // capped + uncapped victories.
        $isAresDefeat = (int)$this->game->globals->get('ares_auto_defeat');

        if ($isAresDefeat) {
            $this->game->globals->set('ares_auto_defeat', null);
            $this->clearCombatGlobals();
            return PlayerActions::class;
        }

        // Restore the deferred die / oracle-card source so spendActionSource
        // can finalise it, then transition through the normal post-combat path.
        $oracleCardId = (int)$this->game->globals->get('combat_oracle_card_id');
        if ($oracleCardId > 0) {
            $this->game->globals->set('selected_oracle_card_id', $oracleCardId);
        } else {
            $dieIndex = $this->game->globals->get('combat_die_index');
            $this->game->globals->set('selected_die_index', $dieIndex);
        }
        $this->game->spendActionSource($activePlayerId);
        $this->clearCombatGlobals();

        return $this->game->nextStateAfterDieAction($activePlayerId);
    }

    private function clearCombatGlobals(): void
    {
        $this->game->globals->set('combat_monster_id', null);
        $this->game->globals->set('combat_strength', null);
        $this->game->globals->set('combat_roll', null);
        $this->game->globals->set('combat_die_index', null);
        $this->game->globals->set('combat_oracle_card_id', null);
    }
}
