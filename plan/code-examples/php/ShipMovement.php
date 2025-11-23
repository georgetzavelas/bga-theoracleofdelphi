<?php

/**
 * Ship Movement System
 * Handles ship navigation on hexagonal board
 */
class ShipMovement {
    /**
     * Calculate reachable spaces for ship movement
     *
     * @param int $playerId
     * @param string $dieColor - Oracle die color used
     * @return array - List of valid destination space_ids
     */
    public function getReachableSpaces(int $playerId, string $dieColor): array {
        $ship = $this->getPlayerShip($playerId);
        $baseRange = 3;

        // Apply ship tile bonuses
        $range = $baseRange + $ship->getRangeBonus();

        // Apply equipment bonuses
        $range += $this->getEquipmentRangeBonus($playerId);

        // Apply creature companion bonuses (if die color matches)
        $range += $this->getCreatureBonus($playerId, $dieColor);

        // Find all water spaces within range
        $reachable = $this->board->breadthFirstSearch(
            $ship->location,
            $range,
            ['water']  // Only water spaces allowed
        );

        // Filter to only spaces matching die color (unless creature allows any)
        if (!$this->hasAnyColorEndAbility($playerId, $dieColor)) {
            $reachable = array_filter($reachable, function($space) use ($dieColor) {
                return $space->color === $dieColor;
            });
        }

        return $reachable;
    }

    /**
     * Validate ship movement
     */
    public function validateMovement(int $playerId, int $targetSpaceId, string $dieColor): bool {
        $reachable = $this->getReachableSpaces($playerId, $dieColor);
        return in_array($targetSpaceId, array_column($reachable, 'space_id'));
    }

    /**
     * Execute ship movement
     */
    public function moveShip(int $playerId, int $targetSpaceId): void {
        // Update player ship location
        $this->DbQuery("UPDATE player SET player_ship_location = $targetSpaceId
                        WHERE player_id = $playerId");

        // Notify all players (modern API)
        $this->notify->all('shipMoved',
            clienttranslate('${player_name} moved their ship'),
            [
                'player_id' => $playerId,
                'space_id' => $targetSpaceId
                // Note: player_name auto-populated by notification decorator
            ]
        );
    }
}