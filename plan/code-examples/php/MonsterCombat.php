<?php

/**
 * Monster Combat System
 * Handles fighting monsters with Battle Die
 */
class MonsterCombat {
    /**
     * Initiate monster fight
     */
    public function startFight(int $playerId, string $monsterColor): array {
        $monster = $this->getMonster($monsterColor, $playerId);
        $shield = $this->getPlayerShieldStrength($playerId);

        $monsterStrength = 9 - $shield;

        // Store combat state in globals
        $this->globals->set('combat_state', [
            'player_id' => $playerId,
            'monster_color' => $monsterColor,
            'monster_strength' => $monsterStrength,
            'rounds' => 0
        ]);

        return [
            'monster_color' => $monsterColor,
            'monster_strength' => $monsterStrength,
            'shield_strength' => $shield,
            'target_roll' => $monsterStrength
        ];
    }

    /**
     * Process combat round
     */
    public function combatRound(int $playerId, int $battleDieRoll, bool $continueFighting): array {
        $combatState = $this->globals->get('combat_state');
        $combatState['rounds']++;

        // Check if roll defeats monster
        if ($battleDieRoll >= $combatState['monster_strength']) {
            return $this->defeatMonster($playerId, $combatState);
        }

        // Roll 0 = draw injury
        if ($battleDieRoll === 0) {
            $this->drawInjuryCard($playerId);
        }

        // Continue fighting?
        if ($continueFighting) {
            // Pay 1 Favor Token
            if (!$this->payFavorTokens($playerId, 1)) {
                return ['result' => 'surrender', 'reason' => 'insufficient_favor'];
            }

            // Reduce monster strength by 1
            $combatState['monster_strength']--;
            $this->globals->set('combat_state', $combatState);

            return [
                'result' => 'continue',
                'new_target' => $combatState['monster_strength'],
                'rounds' => $combatState['rounds']
            ];
        } else {
            // Surrender
            $this->globals->delete('combat_state');
            return ['result' => 'surrender'];
        }
    }

    /**
     * Complete monster defeat
     */
    private function defeatMonster(int $playerId, array $combatState): array {
        $monsterColor = $combatState['monster_color'];

        // Mark monster as defeated
        $this->DbQuery("UPDATE components
                        SET location = 'completed', player_id = $playerId
                        WHERE component_type = 'monster'
                        AND component_color = '$monsterColor'
                        AND player_id IS NULL");

        // Complete Zeus Tile
        $zeusReward = $this->completeZeusTile($playerId, 'monster', $monsterColor);

        // Take Equipment Card reward
        $equipmentCard = $this->drawEquipmentCard($playerId);

        // Clean up combat state
        $this->globals->delete('combat_state');

        return [
            'result' => 'victory',
            'zeus_reward' => $zeusReward,
            'equipment_card' => $equipmentCard
        ];
    }
}