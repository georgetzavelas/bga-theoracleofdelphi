<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;
use Bga\GameFramework\StateType;
use Bga\GameFramework\States\PossibleAction;
use Bga\GameFramework\UserException;
use Bga\Games\theoracleofdelphi\Game;
use Bga\Games\theoracleofdelphi\MaterialDefs;

/**
 * Pre-round-1 detour for any player whose ship tile (id 1) gives them
 * a starting Equipment card. The player picks one of the six face-up
 * Equipment cards in the display rather than getting a randomly-
 * assigned top-of-deck card.
 *
 * Activation pattern mirrors DiscardZeusTile (the fewer_tasks detour):
 *   • Game::applyShipTileBonuses sets the per-player global flag
 *     `pending_starting_equipment_<pid>` during initial setup.
 *   • RoundStart::onEnteringState looks for the next pending player and
 *     routes them here before round 1 begins.
 *   • This state's actSelectEquipment moves the chosen card to hand,
 *     refills the display from the deck, and clears the flag — then
 *     returns to RoundStart so the next pending player (or the
 *     fewer_tasks detour, or PlayerTurnStart) can run.
 */
class SelectStartingEquipment extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game,
            id: 6,
            type: StateType::ACTIVE_PLAYER,
            description: clienttranslate('${actplayer} is choosing a starting Equipment card as their Ship Tile ability'),
            descriptionMyTurn: clienttranslate('Your ship tile requires you to choose a starting Equipment card from the display'),
        );
    }

    public function getArgs(): array
    {
        $equipment = $this->game->getObjectListFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'equipment' AND card_location = 'display'
             ORDER BY card_location_arg ASC"
        );
        return [
            'equipmentDisplay' => $equipment,
        ];
    }

    #[PossibleAction]
    public function actSelectEquipment(int $card_id, int $activePlayerId) {
        // Validate the card is in the face-up display.
        $card = $this->game->getObjectFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_id = $card_id AND card_type = 'equipment' AND card_location = 'display'"
        );
        if (!$card) {
            throw new UserException(clienttranslate('Invalid equipment card'));
        }

        // Move equipment card to player's hand.
        $this->game->DbQuery(
            "UPDATE card SET card_location = 'hand', card_location_arg = $activePlayerId
             WHERE card_id = $card_id"
        );
        $this->game->statInc(1, 'equipment_cards_acquired', $activePlayerId);

        // Refill the display from the top of the equipment deck.
        $newCard = $this->game->getObjectFromDB(
            "SELECT card_id, card_type_arg FROM card
             WHERE card_type = 'equipment' AND card_location = 'deck'
             ORDER BY card_location_arg ASC LIMIT 1"
        );
        if ($newCard) {
            $newCardId = (int)$newCard['card_id'];
            $this->game->DbQuery(
                "UPDATE card SET card_location = 'display' WHERE card_id = $newCardId"
            );
        }

        // Same notification shape as CombatVictory's equipment pick so
        // the JS handler (notif_equipmentSelected) covers both paths.
        $equipmentDef = MaterialDefs::EQUIPMENT_CARDS[(int)$card['card_type_arg']] ?? null;
        $this->notify->all("equipmentSelected", clienttranslate('${player_name} takes a starting equipment card'), [
            "player_id" => $activePlayerId,
            "player_name" => $this->game->getPlayerNameById($activePlayerId),
            "card_id" => (int)$card['card_id'],
            "card_type_arg" => (int)$card['card_type_arg'],
            "description" => $equipmentDef['description'] ?? '',
            "new_display_card" => $newCard ? [
                'card_id' => (int)$newCard['card_id'],
                'card_type_arg' => (int)$newCard['card_type_arg'],
            ] : null,
        ]);

        // Pending flag cleared so RoundStart's detour stops re-firing.
        $this->game->globals->set('pending_starting_equipment_' . $activePlayerId, null);

        return RoundStart::class;
    }

    function zombie(int $playerId) {
        // Auto-pick the first card in the display so a disconnected
        // player can't stall the pre-round-1 setup.
        $card = $this->game->getObjectFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'equipment' AND card_location = 'display'
             ORDER BY card_location_arg ASC LIMIT 1"
        );
        if ($card) {
            return $this->actSelectEquipment((int)$card['card_id'], $playerId);
        }
        // No display cards (shouldn't happen at game start) — clear the
        // flag so the detour doesn't loop and let RoundStart proceed.
        $this->game->globals->set('pending_starting_equipment_' . $playerId, null);
        return RoundStart::class;
    }
}
