<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphigzed\Game;

class CombatVictory extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 44,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} defeated a monster'),
            descriptionMyTurn: clienttranslate('Choose an Equipment Card'),
        );
    }

    public function getArgs(): array
    {
        $monsterId = $this->game->globals->get('combat_monster_id');
        $monster = $this->game->getObjectFromDB(
            "SELECT monster_id, monster_type, color FROM monster WHERE monster_id = $monsterId"
        );

        $equipment = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'equipment' AND card_location = 'display'
             ORDER BY card_location_arg ASC"
        );

        $playerId = (int)$this->game->getActivePlayerId();
        $shieldValue = (int)$this->game->getUniqueValueFromDB(
            "SELECT shield_value FROM player WHERE player_id = $playerId"
        );
        return [
            'monster' => $monster,
            'equipmentDisplay' => $equipment,
            'monster_type' => $monster ? $monster['monster_type'] : null,
            'strength' => $this->game->globals->get('combat_strength'),
            'roll' => $this->game->globals->get('combat_roll'),
            'shield_value' => $shieldValue,
        ];
    }

    #[PossibleAction]
    public function actSelectEquipment(int $card_id, int $activePlayerId) {
        // Validate card is in display
        $card = $this->game->getObjectFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_id = $card_id AND card_type = 'equipment' AND card_location = 'display'"
        );
        if (!$card) {
            throw new UserException(clienttranslate('Invalid equipment card'));
        }

        $monsterId = $this->game->globals->get('combat_monster_id');
        $monster = $this->game->getObjectFromDB(
            "SELECT monster_id, monster_type, color FROM monster WHERE monster_id = $monsterId"
        );

        // Complete matching Zeus tile (prefer specific type match, fall back to "any")
        $monsterType = $monster['monster_type'];
        $safeType = addslashes($monsterType);
        $zeusTile = $this->game->getObjectFromDB(
            "SELECT tile_id FROM zeus_tile
             WHERE player_id = $activePlayerId AND task_type = 'monster'
             AND task_color = '$safeType' AND is_completed = 0
             LIMIT 1"
        );
        if (!$zeusTile) {
            // Try "any" monster tile
            $zeusTile = $this->game->getObjectFromDB(
                "SELECT tile_id FROM zeus_tile
                 WHERE player_id = $activePlayerId AND task_type = 'monster'
                 AND task_color IS NULL AND is_completed = 0
                 LIMIT 1"
            );
        }
        $completedTileId = null;
        if ($zeusTile) {
            $tileId = $zeusTile['tile_id'];
            $this->game->DbQuery("UPDATE zeus_tile SET is_completed = 1 WHERE tile_id = $tileId");
            $this->game->DbQuery(
                "UPDATE player SET tasks_completed = tasks_completed + 1 WHERE player_id = $activePlayerId"
            );
            $completedTileId = (int)$tileId;
        }

        // Move equipment card to player
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
             WHERE card_id = $card_id"
        );

        // Refill display from deck
        $newCard = $this->game->getObjectFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'equipment' AND card_location = 'deck'
             ORDER BY card_location_arg ASC LIMIT 1"
        );
        if ($newCard) {
            $newCardId = $newCard['card_id'];
            $this->game->DbQuery(
                "UPDATE card SET card_location = 'display' WHERE card_id = $newCardId"
            );
        }

        if ($completedTileId !== null) {
            $this->notify->all("taskCompleted", clienttranslate('${player_name} completes a Zeus tile!'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "tile_id" => $completedTileId,
            ]);
        }

        $this->notify->all("equipmentSelected", clienttranslate('${player_name} takes an Equipment Card'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_id" => $card_id,
            "card_type_arg" => (int)$card['card_type_arg'],
            "new_display_card" => $newCard ? [
                'card_id' => (int)$newCard['card_id'],
                'card_type_arg' => (int)$newCard['card_type_arg'],
            ] : null,
        ]);

        // If Ares auto-defeat, don't spend a die — it's a free action
        $isAresDefeat = (int)$this->game->globals->get('ares_auto_defeat');
        if ($isAresDefeat) {
            $this->game->globals->set('ares_auto_defeat', null);
            $this->clearCombatGlobals();
            return PlayerActions::class;
        }

        // Spend the action source (die or oracle card) now that combat resolved
        $this->restoreActionSourceForSpending();
        $this->game->spendActionSource($activePlayerId);

        $this->clearCombatGlobals();
        return $this->afterCombatTransition($activePlayerId);
    }

    /**
     * Restore the deferred action source globals so spendActionSource() can process them.
     */
    private function restoreActionSourceForSpending(): void
    {
        $oracleCardId = (int)$this->game->globals->get('combat_oracle_card_id');
        if ($oracleCardId > 0) {
            $this->game->globals->set('selected_oracle_card_id', $oracleCardId);
        } else {
            $dieIndex = $this->game->globals->get('combat_die_index');
            $this->game->globals->set('selected_die_index', $dieIndex);
        }
    }

    private function clearCombatGlobals(): void
    {
        $this->game->globals->set('combat_monster_id', null);
        $this->game->globals->set('combat_strength', null);
        $this->game->globals->set('combat_roll', null);
        $this->game->globals->set('combat_die_index', null);
        $this->game->globals->set('combat_oracle_card_id', null);
    }

    private function afterCombatTransition(int $playerId): string
    {
        if ($this->game->allDiceUsed($playerId)) {
            return ConsultOracle::class;
        }
        return PlayerActions::class;
    }

    function zombie(int $playerId) {
        // Auto-select first available equipment card
        $card = $this->game->getObjectFromDB(
            "SELECT card_id FROM card WHERE card_type = 'equipment' AND card_location = 'display' LIMIT 1"
        );
        if ($card) {
            return $this->actSelectEquipment((int)$card['card_id'], $playerId);
        }
        $this->restoreActionSourceForSpending();
        $this->game->spendActionSource($playerId);
        $this->clearCombatGlobals();
        return $this->afterCombatTransition($playerId);
    }
}
