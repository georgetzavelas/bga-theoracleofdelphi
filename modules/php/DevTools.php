<?php
declare(strict_types=1);

namespace Bga\Games\theoracleofdelphigzed;

/**
 * DevTools — server-side test helpers for seeding game state.
 *
 * Not wired into the game flow. Invoked from Game.php `debug_*` entry points
 * that are triggered from the BGA Studio debug button during development.
 */
class DevTools
{
    public function __construct(protected Game $game) {}

    /**
     * Move one copy of the given equipment card into the active player's
     * hand, pulling from the deck or the face-up display. Marks is_used = 0.
     */
    public function giveEquipment(int $cardTypeArg): void
    {
        $pid = (int)$this->game->getActivePlayerId();
        $row = $this->game->getObjectFromDB(
            "SELECT card_id FROM card
             WHERE card_type = 'equipment' AND card_type_arg = $cardTypeArg
             AND card_location IN ('deck','display')
             LIMIT 1"
        );
        if (!$row) {
            throw new \BgaUserException("No equipment card of type $cardTypeArg available");
        }
        $cardId = (int)$row['card_id'];
        $this->game->DbQuery(
            "UPDATE card SET card_location='hand', card_location_arg=$pid, is_used=0
             WHERE card_id = $cardId"
        );
        $this->game->notify->all('equipmentGrantedDev', clienttranslate('[dev] ${player_name} is given ${equipment_name}'), [
            'player_id' => $pid,
            'player_name' => $this->game->getPlayerNameById($pid),
            'card_id' => $cardId,
            'card_type_arg' => $cardTypeArg,
            'equipment_name' => $this->game->equipmentName($cardTypeArg),
        ]);
    }
}
