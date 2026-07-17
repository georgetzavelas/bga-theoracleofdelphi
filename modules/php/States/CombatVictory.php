<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

class CombatVictory extends \Bga\GameFramework\States\GameState
{
    use UndoableState;

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
        return array_merge([
            'monster' => $monster,
            'equipmentDisplay' => $equipment,
            'monster_type' => $monster ? $monster['monster_type'] : null,
            'strength' => $this->game->globals->get('combat_strength'),
            'roll' => $this->game->globals->get('combat_roll'),
            'shield_value' => $shieldValue,
            // Ares' auto-defeat bypasses CombatRound entirely (no
            // actual die roll), so the client should NOT render the
            // shield/target/result strip — the strength=0/roll=10
            // values are placeholder synthesis, not a real fight.
            'auto_defeat' => (int)$this->game->globals->get('ares_auto_defeat') === 1,
        ], $this->undoArgs());
    }

    #[PossibleAction]
    public function actSelectEquipment(int $card_id, int $activePlayerId) {
        $this->game->sealUndo();  // equipment reward committed
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

        // Complete matching Zeus tile (specific type match, or fall back to
        // a white tile when the type isn't already represented by a sibling).
        $monsterType = $monster['monster_type'];
        $completedTileId = $this->game->completeZeusTileForType(
            $activePlayerId, 'monster', $monsterType
        );

        // Move equipment card to player
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
             WHERE card_id = $card_id"
        );
        $this->game->statInc(1, 'equipment_cards_acquired', $activePlayerId);

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
            $tasksCompleted = (int)$this->game->getUniqueValueFromDB(
                "SELECT tasks_completed FROM player WHERE player_id = $activePlayerId"
            );
            $this->notify->all("taskCompleted", clienttranslate('${player_name} completes ${zeus_tok}, ${tasks_completed}/12 Zeus tiles completed'), [
                "player_id" => $activePlayerId,
                "player_name" => $this->game->getPlayerNameById($activePlayerId),
                "tile_id" => $completedTileId,
                "tasks_completed" => $tasksCompleted,
                "task_type" => "monster",
                "color" => $monster['color'],
                "completion_value" => $monster['color'],
                "zeus_tok" => "a Zeus tile",
                "zeus_img" => $this->game->zeusTileImgKey($completedTileId),
                "preserve" => ["zeus_img"],
            ]);
        }

        $equipmentDef = \Bga\Games\theoracleofdelphi\MaterialDefs::EQUIPMENT_CARDS[(int)$card['card_type_arg']] ?? null;
        $this->notify->all("equipmentSelected", clienttranslate('${player_name} takes an equipment card ${equipment_name}'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_id" => $card_id,
            "card_type_arg" => (int)$card['card_type_arg'],
            "equipment_name" => $this->game->equipmentName((int)$card['card_type_arg']),
            "description" => $equipmentDef['description'] ?? '',
            "new_display_card" => $newCard ? [
                'card_id' => (int)$newCard['card_id'],
                'card_type_arg' => (int)$newCard['card_type_arg'],
            ] : null,
        ]);

        // Compute the normal post-combat "next state" first (spending the
        // die or flagging Ares), then overlay one-time equipment activation
        // on top. This keeps die-consumption semantics identical whether
        // or not the picked card has a one-time effect.
        $cardTypeArg = (int)$card['card_type_arg'];
        $isAresDefeat = (int)$this->game->globals->get('ares_auto_defeat');

        if ($isAresDefeat) {
            $this->game->globals->set('ares_auto_defeat', null);
            $this->clearCombatGlobals();
            // Route through nextStateAfterDieAction (as the normal-combat
            // branch below does, minus the die spend) so the deferred Ares
            // god reset — pending_god_reset='ares', set in
            // UseGodAbility::actDefeatMonster — is actually consumed and
            // Ares drops to the bottom of its track. Returning
            // PlayerActions directly here skipped that site entirely, so
            // Ares stayed on the top row and could be used again for free.
            // Ares is a god power, not a die, so we still don't
            // spendActionSource. Control returns to PlayerActions; the player
            // ends the turn explicitly via actEndTurn.
            $nextState = $this->afterCombatTransition($activePlayerId);
        } else {
            // Spend the action source (die or oracle card) now that combat resolved
            $this->restoreActionSourceForSpending();
            $this->game->spendActionSource($activePlayerId);
            $this->clearCombatGlobals();
            $nextState = $this->afterCombatTransition($activePlayerId);
        }

        // Per rulebook, one-time equipment activates immediately on receipt.
        // Mixed cards (e.g. 016) have a one-time component that also fires now.
        $equipmentDef = MaterialDefs::EQUIPMENT_CARDS[$cardTypeArg] ?? null;
        $type = $equipmentDef['type'] ?? null;
        if ($type === 'one_time' || $type === 'mixed') {
            $subState = $this->game->applyOneTimeEquipmentEffect(
                $activePlayerId, $card_id, $cardTypeArg
            );
            if ($subState !== null) {
                // Sub-state needs to know where to return once it finishes.
                $this->game->globals->set('equipment_post_activation_state', $nextState);
                // Card 011 (Blessed Reward): the picked one-time card and
                // Blessed Reward both open a sub-state routed through the single
                // post-activation slot. Defer the god step — it fires from
                // Game::resolvePostActivationExit once this one-time sub-state
                // resolves, then control returns to $nextState. Chains cleanly
                // whether the one-time effect is itself a god advance (7/21) or
                // an island/offering/statue picker (13/16/17/18/19/20).
                if ($this->game->playerOwnsEquipment($activePlayerId, 11, false)) {
                    $this->game->globals->set('pending_blessed_reward_type', 'monster');
                }
                return $subState;
            }
        }

        // Card 011 (Blessed Reward): if owned, advance 1 god as a
        // post-reward reaction. Fired AFTER the one-time activation path
        // so that when the picked card has no sub-state, card 011 can
        // cleanly transition to ChooseGodAdvancement and return to
        // $nextState on finish.
        $reaction = $this->game->maybeGrantBlessedRewardGodStep(
            $activePlayerId, $nextState, 'monster'
        );
        if ($reaction !== null) {
            return $reaction;
        }

        return $nextState;
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
        return $this->game->nextStateAfterDieAction($playerId);
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
