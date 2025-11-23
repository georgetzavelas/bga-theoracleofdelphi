<?php

/**
 * God Advancement System
 * Manages the 6 gods and their special actions
 */
class GodManager {
    /**
     * Advance a god on the track
     */
    public function advanceGod(int $playerId, string $godColor, int $steps = 1): array {
        $god = $this->getObjectFromDB(
            "SELECT god_id, position, god_name
             FROM gods
             WHERE player_id = $playerId
             AND god_color = '$godColor'"
        );

        $currentPos = $god['position'];
        $playerCount = count($this->loadPlayersBasicInfos());

        // Calculate new position
        if ($currentPos === 0) {
            // Advancing from bottom: go to player count row
            $newPos = $playerCount;
        } else {
            // Normal advancement
            $newPos = min($currentPos + $steps, 4); // Max row is 4
        }

        // Update position
        $this->DbQuery("UPDATE gods
                        SET position = $newPos
                        WHERE god_id = {$god['god_id']}");

        // Check if reached top row (special action available)
        $specialActionAvailable = ($newPos === 4);

        return [
            'god_id' => $god['god_id'],
            'god_name' => $god['god_name'],
            'god_color' => $godColor,
            'old_position' => $currentPos,
            'new_position' => $newPos,
            'special_action_available' => $specialActionAvailable
        ];
    }

    /**
     * Use god special action (returns god to bottom or player count row)
     */
    public function useGodSpecialAction(int $playerId, string $godColor): array {
        $playerCount = count($this->loadPlayersBasicInfos());

        // Check if player has Ship Tile 3 ability (return to player count row)
        $returnRow = $this->hasShipTileAbility($playerId, 'god_advancement')
                     ? $playerCount
                     : 0;

        $this->DbQuery("UPDATE gods
                        SET position = $returnRow
                        WHERE player_id = $playerId
                        AND god_color = '$godColor'");

        // Execute the special action
        return $this->executeSpecialAction($playerId, $godColor);
    }

    /**
     * Execute god-specific special action
     */
    private function executeSpecialAction(int $playerId, string $godColor): array {
        switch ($godColor) {
            case 'blue': // Poseidon - Teleport ship
                return $this->poseidonAction($playerId);

            case 'yellow': // Apollon - Any color dice this turn
                return $this->apollonAction($playerId);

            case 'green': // Artemis - Explore island
                return $this->artemisAction($playerId);

            case 'red': // Aphrodite - Discard all injuries
                return $this->aphroditeAction($playerId);

            case 'black': // Ares - Auto-defeat adjacent monster
                return $this->aresAction($playerId);

            case 'pink': // Hermes - Load any statue from city
                return $this->hermesAction($playerId);
        }
    }

    /**
     * Poseidon: Place ship on any water space
     */
    private function poseidonAction(int $playerId): array {
        // Return available water spaces for player to choose
        $waterSpaces = $this->getObjectListFromDB(
            "SELECT space_id, hex_color
             FROM board_spaces
             WHERE space_type = 'water'"
        );

        return [
            'action' => 'teleport_ship',
            'available_spaces' => $waterSpaces,
            'requires_choice' => true
        ];
    }

    /**
     * Apollon: Draw oracle card + use any color this turn
     */
    private function apollonAction(int $playerId): array {
        // Draw 1 oracle card
        $card = $this->drawOracleCard($playerId);

        // Set temporary flag for this turn
        $this->globals->set("apollon_active_$playerId", true);

        return [
            'action' => 'any_color_dice',
            'oracle_card' => $card,
            'effect' => 'Dice and Oracle Card can be used as any color this turn'
        ];
    }

    /**
     * Artemis: Uncover face-down island tile
     */
    private function artemisAction(int $playerId): array {
        // Get all face-down islands
        $faceDownIslands = $this->getObjectListFromDB(
            "SELECT island_tile_id, space_id
             FROM island_tiles
             WHERE is_revealed = FALSE"
        );

        return [
            'action' => 'explore_island',
            'available_islands' => $faceDownIslands,
            'requires_choice' => true
        ];
    }

    /**
     * Aphrodite: Discard all injury cards
     */
    private function aphroditeAction(int $playerId): array {
        $injuryCount = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM cards
             WHERE player_id = $playerId
             AND card_type = 'injury'
             AND card_location = 'hand'"
        );

        // Discard all injuries
        $this->DbQuery("UPDATE cards
                        SET card_location = 'discard'
                        WHERE player_id = $playerId
                        AND card_type = 'injury'
                        AND card_location = 'hand'");

        return [
            'action' => 'discard_all_injuries',
            'injuries_discarded' => $injuryCount
        ];
    }

    /**
     * Ares: Defeat adjacent monster without rolling
     */
    private function aresAction(int $playerId): array {
        $shipLocation = $this->getPlayerShipLocation($playerId);

        // Find adjacent monsters
        $adjacentMonsters = $this->getAdjacentMonsters($shipLocation, $playerId);

        if (empty($adjacentMonsters)) {
            throw new BgaUserException("No adjacent monsters to defeat");
        }

        return [
            'action' => 'auto_defeat_monster',
            'available_monsters' => $adjacentMonsters,
            'requires_choice' => count($adjacentMonsters) > 1
        ];
    }

    /**
     * Hermes: Load statue from any city if adjacent to city
     */
    private function hermesAction(int $playerId): array {
        $shipLocation = $this->getPlayerShipLocation($playerId);

        // Check if adjacent to any city
        if (!$this->isAdjacentToCity($shipLocation)) {
            throw new BgaUserException("Ship must be adjacent to a City Tile");
        }

        // Get all available statues from all cities
        $availableStatues = $this->getObjectListFromDB(
            "SELECT component_id, component_color, location_id
             FROM components
             WHERE component_type = 'statue'
             AND location = 'board'"
        );

        return [
            'action' => 'load_any_statue',
            'available_statues' => $availableStatues,
            'requires_choice' => true
        ];
    }

    /**
     * Get gods available for special actions
     */
    public function getAvailableGodActions(int $playerId): array {
        return $this->getObjectListFromDB(
            "SELECT god_id, god_name, god_color
             FROM gods
             WHERE player_id = $playerId
             AND position = 4"
        );
    }

    /**
     * Other players advance gods after oracle consultation
     */
    public function othersAdvanceGods(int $activePlayerId, array $rolledColors): void {
        $allPlayers = $this->loadPlayersBasicInfos();

        foreach ($allPlayers as $pid => $player) {
            if ($pid === $activePlayerId) continue;

            // Check if any of their gods (not on lowest row) match colors
            $matchingGods = $this->getObjectListFromDB(
                "SELECT god_id, god_color, god_name, position
                 FROM gods
                 WHERE player_id = $pid
                 AND position > 0
                 AND god_color IN ('" . implode("','", $rolledColors) . "')"
            );

            if (count($matchingGods) > 0) {
                // Player MAY advance one of these gods
                $this->notify->player($pid, 'canAdvanceGod', '', [
                    'gods' => $matchingGods,
                    'rolled_colors' => $rolledColors
                ]);
            }
        }
    }
}