<?php

/**
 * Task Completion System
 * Manages Zeus Tiles and task rewards
 */
class TaskManager {
    /**
     * Complete a Zeus Tile and award reward
     */
    public function completeZeusTile(int $playerId, string $taskType, string $color): array {
        // Find matching Zeus Tile
        $zeusId = $this->getObjectFromDB(
            "SELECT zeus_tile_id, required_color
             FROM zeus_tiles
             WHERE player_id = $playerId
             AND task_type = '$taskType'
             AND is_completed = FALSE
             AND (required_color = '$color' OR required_color IS NULL OR required_color = 'any')
             LIMIT 1"
        );

        if (!$zeusId) {
            throw new BgaUserException("No matching Zeus Tile found");
        }

        // Mark as completed
        $this->DbQuery("UPDATE zeus_tiles
                        SET is_completed = TRUE
                        WHERE zeus_tile_id = {$zeusId['zeus_tile_id']}");

        // Award task-specific reward
        $reward = $this->awardTaskReward($playerId, $taskType, $color);

        // Update player progress
        $this->DbQuery("UPDATE player
                        SET player_score_aux = player_score_aux + 1
                        WHERE player_id = $playerId");

        // Check if all tasks complete
        $remainingTasks = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM zeus_tiles
             WHERE player_id = $playerId AND is_completed = FALSE"
        );

        return [
            'zeus_tile_id' => $zeusId['zeus_tile_id'],
            'reward' => $reward,
            'remaining_tasks' => $remainingTasks,
            'can_return_to_zeus' => ($remainingTasks === 0)
        ];
    }

    /**
     * Award rewards based on task type
     */
    private function awardTaskReward(int $playerId, string $taskType, string $color): array {
        switch ($taskType) {
            case 'shrine':
                // Advance any God by 1 step
                return ['type' => 'god_step', 'amount' => 1, 'god' => 'any'];

            case 'statue':
                // Take Companion Card matching statue color
                $companion = $this->takeCompanionCard($playerId, $color);
                return ['type' => 'companion', 'card' => $companion];

            case 'offering':
                // Take 3 Favor Tokens
                $this->addFavorTokens($playerId, 3);
                return ['type' => 'favor', 'amount' => 3];

            case 'monster':
                // Take Equipment Card from display
                $equipment = $this->drawEquipmentCard($playerId);
                return ['type' => 'equipment', 'card' => $equipment];
        }
    }

    /**
     * Check if player can return to Zeus
     */
    public function canReturnToZeus(int $playerId): bool {
        $remaining = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM zeus_tiles
             WHERE player_id = $playerId AND is_completed = FALSE"
        );

        return $remaining === 0;
    }

    /**
     * Setup Zeus Tiles for player
     * Handles both First Game Mode (8 tiles) and Standard Mode (12 tiles)
     */
    public function setupZeusTiles(int $playerId, bool $firstGameMode): void {
        $tiles = [
            // 3 Shrines
            ['type' => 'shrine', 'color' => null],
            ['type' => 'shrine', 'color' => null],
            ['type' => 'shrine', 'color' => null],

            // 3 Statues (colors chosen by player)
            ['type' => 'statue', 'color' => 'any'],
            ['type' => 'statue', 'color' => 'any'],
            ['type' => 'statue', 'color' => 'any'],

            // 3 Offerings (2 random colors + 1 any)
            ['type' => 'offering', 'color' => $this->getRandomOfferingColor()],
            ['type' => 'offering', 'color' => $this->getRandomOfferingColor()],
            ['type' => 'offering', 'color' => 'any'],

            // 3 Monsters (2 random colors + 1 any)
            ['type' => 'monster', 'color' => $this->getRandomMonsterColor()],
            ['type' => 'monster', 'color' => $this->getRandomMonsterColor()],
            ['type' => 'monster', 'color' => 'any'],
        ];

        // First Game Mode: Remove 1 shrine, 1 statue, 1 colored offering, 1 colored monster
        if ($firstGameMode) {
            $tilesToRemove = [
                ['type' => 'shrine', 'index' => 2],    // Remove 3rd shrine
                ['type' => 'statue', 'index' => 2],    // Remove 3rd statue
                ['type' => 'offering', 'index' => 0],  // Remove first colored offering
                ['type' => 'monster', 'index' => 0],   // Remove first colored monster
            ];

            // Filter out removed tiles
            $tiles = array_filter($tiles, function($tile, $idx) use ($tilesToRemove) {
                foreach ($tilesToRemove as $remove) {
                    $typeMatches = ($tile['type'] === $remove['type']);
                    $indexMatches = ($this->getIndexInType($tiles, $idx) === $remove['index']);
                    if ($typeMatches && $indexMatches) {
                        return false;
                    }
                }
                return true;
            }, ARRAY_FILTER_USE_BOTH);
        }

        // Insert tiles into database
        foreach ($tiles as $idx => $tile) {
            $taskNumber = $this->calculateTaskNumber($tiles, $idx, $tile['type']);

            $this->DbQuery("INSERT INTO zeus_tiles
                (player_id, task_type, task_number, required_color, is_completed)
                VALUES ($playerId, '{$tile['type']}', $taskNumber,
                        " . ($tile['color'] ? "'{$tile['color']}'" : "NULL") . ", FALSE)");
        }
    }
}