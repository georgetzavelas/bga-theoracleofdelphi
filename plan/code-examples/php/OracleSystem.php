<?php

/**
 * Oracle Dice System
 * Handles dice rolling, placement, and recoloring
 */
class OracleSystem {
    const ORACLE_POSITIONS = [
        1 => 'blue',    // Poseidon
        2 => 'yellow',  // Apollon
        3 => 'green',   // Artemis
        4 => 'red',     // Aphrodite
        5 => 'black',   // Ares
        6 => 'pink'     // Hermes
    ];

    /**
     * Roll oracle dice for player
     */
    public function rollDice(int $playerId): array {
        $rolls = [];

        for ($dieNum = 1; $dieNum <= 3; $dieNum++) {
            // Roll d6 (1-6)
            $position = bga_rand(1, 6);
            $color = self::ORACLE_POSITIONS[$position];

            // Update database
            $this->DbQuery("UPDATE oracle_dice
                            SET die_color = '$color',
                                oracle_position = $position,
                                is_used = FALSE
                            WHERE player_id = $playerId
                            AND die_number = $dieNum");

            $rolls[] = [
                'die_number' => $dieNum,
                'position' => $position,
                'color' => $color
            ];
        }

        return $rolls;
    }

    /**
     * Recolor a die (move clockwise on oracle)
     */
    public function recolorDie(int $playerId, int $dieNumber, int $steps): array {
        // Check if player has bidirectional ability (Ship Tile 8)
        $canGoCounterclockwise = $this->hasShipTileAbility($playerId, 'bidirectional_recolor');

        // Get current position
        $die = $this->getObjectFromDB(
            "SELECT oracle_position FROM oracle_dice
             WHERE player_id = $playerId AND die_number = $dieNumber"
        );

        $currentPos = $die['oracle_position'];

        // Calculate new position (wraps around 1-6)
        if ($steps > 0) {
            // Clockwise
            $newPos = (($currentPos - 1 + $steps) % 6) + 1;
        } else {
            // Counterclockwise (only if allowed)
            if (!$canGoCounterclockwise) {
                throw new BgaUserException("Cannot move counterclockwise");
            }
            $newPos = (($currentPos - 1 + $steps + 6) % 6) + 1;
        }

        $newColor = self::ORACLE_POSITIONS[$newPos];

        // Calculate cost (apply discount from Ship Tile 7)
        $costPerStep = $this->hasShipTileAbility($playerId, 'recolor_discount') ? 0 : 1;
        $totalCost = abs($steps) * $costPerStep;

        // Pay favor tokens
        if (!$this->payFavorTokens($playerId, $totalCost)) {
            throw new BgaUserException("Insufficient Favor Tokens");
        }

        // Update die
        $this->DbQuery("UPDATE oracle_dice
                        SET die_color = '$newColor',
                            oracle_position = $newPos
                        WHERE player_id = $playerId
                        AND die_number = $dieNumber");

        return [
            'die_number' => $dieNumber,
            'old_position' => $currentPos,
            'new_position' => $newPos,
            'new_color' => $newColor,
            'cost' => $totalCost
        ];
    }

    /**
     * Use a die for an action
     */
    public function useDie(int $playerId, int $dieNumber): void {
        $this->DbQuery("UPDATE oracle_dice
                        SET is_used = TRUE
                        WHERE player_id = $playerId
                        AND die_number = $dieNumber");
    }

    /**
     * Get available (unused) dice
     */
    public function getAvailableDice(int $playerId): array {
        return $this->getObjectListFromDB(
            "SELECT die_number, oracle_position, die_color
             FROM oracle_dice
             WHERE player_id = $playerId
             AND is_used = FALSE"
        );
    }
}