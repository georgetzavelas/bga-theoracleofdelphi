<?php

/**
 * Injury and Recovery System
 * Manages injury cards and recovery mechanics
 */
class InjuryManager {
    /**
     * Draw injury cards
     */
    public function drawInjuryCards(int $playerId, int $count): array {
        $drawn = [];

        for ($i = 0; $i < $count; $i++) {
            $card = $this->drawCardFromDeck('injury', $playerId);
            $drawn[] = $card;
        }

        return $drawn;
    }

    /**
     * Check if player must recover
     * Returns true if 3 of same color OR 6+ total injuries
     */
    public function mustRecover(int $playerId): bool {
        $injuries = $this->getPlayerInjuryCards($playerId);
        $total = count($injuries);

        // Check for 6 total (or 8 with special equipment)
        $recoveryThreshold = $this->getRecoveryThreshold($playerId);
        if ($total >= $recoveryThreshold) {
            return true;
        }

        // Check for 3 (or 4 with special equipment) of same color
        $colorThreshold = $this->getColorRecoveryThreshold($playerId);
        $colorCounts = [];

        foreach ($injuries as $card) {
            $color = $card['card_type_arg']; // Color is stored in type_arg
            $colorCounts[$color] = ($colorCounts[$color] ?? 0) + 1;

            if ($colorCounts[$color] >= $colorThreshold) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get recovery threshold (affected by equipment cards)
     * Default: 6 total or 3 of same color
     * With equipment: 8 total or 4 of same color
     */
    private function getRecoveryThreshold(int $playerId): int {
        $hasRecoveryEquipment = $this->playerHasEquipment($playerId, 'recovery_threshold');
        return $hasRecoveryEquipment ? 8 : 6;
    }

    private function getColorRecoveryThreshold(int $playerId): int {
        $hasRecoveryEquipment = $this->playerHasEquipment($playerId, 'recovery_threshold');
        return $hasRecoveryEquipment ? 4 : 3;
    }

    /**
     * Check if player has no injuries (reward trigger)
     */
    public function hasNoInjuries(int $playerId): bool {
        $count = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM cards
             WHERE player_id = $playerId
             AND card_type = 'injury'
             AND card_location = 'hand'"
        );

        return $count === 0;
    }

    /**
     * Player recovers by discarding 3 injuries
     */
    public function recover(int $playerId, array $cardIds): void {
        if (count($cardIds) !== 3) {
            throw new BgaUserException("Must discard exactly 3 injury cards");
        }

        // Validate cards belong to player
        $validCards = $this->getObjectListFromDB(
            "SELECT card_id FROM cards
             WHERE card_id IN (" . implode(',', $cardIds) . ")
             AND player_id = $playerId
             AND card_type = 'injury'
             AND card_location = 'hand'"
        );

        if (count($validCards) !== 3) {
            throw new BgaUserException("Invalid injury cards selected");
        }

        // Discard selected cards
        $this->discardInjuryCards($playerId, $cardIds);

        // Notify recovery
        $this->notify->all('playerRecovered',
            clienttranslate('${player_name} recovered from injuries'),
            [
                'player_id' => $playerId,
                'cards_discarded' => 3
            ]
        );
    }

    /**
     * Discard injury cards
     */
    public function discardInjuryCards(int $playerId, array $cardIds): void {
        $cardIdList = implode(',', $cardIds);

        $this->DbQuery("UPDATE cards
                        SET card_location = 'discard'
                        WHERE card_id IN ($cardIdList)
                        AND player_id = $playerId
                        AND card_type = 'injury'");
    }

    /**
     * Discard all injuries of specific color
     * Used by Heroes and color-specific actions
     */
    public function discardInjuriesByColor(int $playerId, string $color): int {
        // Get color ID from injury card definition
        $colorId = $this->getInjuryColorId($color);

        $count = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM cards
             WHERE player_id = $playerId
             AND card_type = 'injury'
             AND card_type_arg = $colorId
             AND card_location = 'hand'"
        );

        if ($count > 0) {
            $this->DbQuery("UPDATE cards
                            SET card_location = 'discard'
                            WHERE player_id = $playerId
                            AND card_type = 'injury'
                            AND card_type_arg = $colorId
                            AND card_location = 'hand'");
        }

        return $count;
    }

    /**
     * Get player's current injury cards
     */
    public function getPlayerInjuryCards(int $playerId): array {
        return $this->getObjectListFromDB(
            "SELECT card_id, card_type_arg as color
             FROM cards
             WHERE player_id = $playerId
             AND card_type = 'injury'
             AND card_location = 'hand'"
        );
    }

    /**
     * Can player discard injuries with Hero card?
     */
    public function canDiscardWithHero(int $playerId, string $heroColor): bool {
        // Check if player has matching hero
        $hasHero = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM cards
             WHERE player_id = $playerId
             AND card_type = 'companion'
             AND card_location = 'active'
             AND card_type_arg = " . $this->getHeroId($heroColor)
        );

        if (!$hasHero) {
            return false;
        }

        // Check if there are injuries of this color
        $colorId = $this->getInjuryColorId($heroColor);
        $injuries = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM cards
             WHERE player_id = $playerId
             AND card_type = 'injury'
             AND card_type_arg = $colorId
             AND card_location = 'hand'"
        );

        return $injuries > 0;
    }

    /**
     * Titan attacks all players
     * Called at end of round by last player
     */
    public function titanAttack(int $titanStrength): void {
        $players = $this->loadPlayersBasicInfos();

        foreach ($players as $playerId => $player) {
            $shieldStrength = $this->getPlayerShieldStrength($playerId);

            if ($titanStrength === 6) {
                // Titan rolls 6: everyone draws 2 injuries
                $injuries = $this->drawInjuryCards($playerId, 2);

                $this->notify->all('titanAttack',
                    clienttranslate('Titan rolls 6! ${player_name} draws 2 Injury Cards'),
                    [
                        'player_id' => $playerId,
                        'injuries' => $injuries,
                        'titan_strength' => 6
                    ]
                );
            } else if ($shieldStrength < $titanStrength) {
                // Shield too weak: draw 1 injury
                $injuries = $this->drawInjuryCards($playerId, 1);

                $this->notify->all('titanAttack',
                    clienttranslate('${player_name}\'s shield (${shield}) < Titan (${titan}): draws 1 Injury Card'),
                    [
                        'player_id' => $playerId,
                        'injuries' => $injuries,
                        'shield' => $shieldStrength,
                        'titan' => $titanStrength
                    ]
                );
            } else {
                // Shield blocks attack
                $this->notify->all('titanBlocked',
                    clienttranslate('${player_name}\'s shield (${shield}) blocks Titan (${titan})'),
                    [
                        'player_id' => $playerId,
                        'shield' => $shieldStrength,
                        'titan' => $titanStrength
                    ]
                );
            }
        }
    }
}