<?php

/**
 * Board Layout Generation
 * Handles hexagonal board creation for first game and standard modes
 */
class BoardGenerator {
    /**
     * Generate complete board layout
     *
     * @param bool $firstGameMode - Use fixed layout or generate random
     * @param int $playerCount - Number of players (affects component distribution)
     * @return array - Board spaces, adjacency, and component placements
     */
    public function generateBoard(bool $firstGameMode, int $playerCount): array {
        if ($firstGameMode) {
            $layout = $this->getFirstGameLayout();
        } else {
            $layout = $this->generateRandomLayout();
        }

        // Generate spaces from tile layout
        $spaces = $this->generateSpaces($layout);

        // Calculate adjacency graph
        $adjacency = $this->calculateAdjacency($spaces, $layout);

        // Validate board (all water connected)
        if (!$this->validateWaterConnectivity($spaces, $adjacency)) {
            // Regeneration if invalid (standard mode only)
            if (!$firstGameMode) {
                return $this->generateBoard($firstGameMode, $playerCount);
            }
            throw new BgaSystemException("First game board layout invalid");
        }

        // Place components on board
        $components = $this->placeComponents($spaces, $playerCount);

        return [
            'spaces' => $spaces,
            'adjacency' => $adjacency,
            'components' => $components,
            'layout' => $layout
        ];
    }

    /**
     * Get fixed first game layout (rulebook recommended setup)
     * Returns predetermined tile positions for compact board
     */
    public function getFirstGameLayout(): array {
        // Axial coordinates (q, r) for hexagonal grid
        return [
            // Center triangle (tiles with holes)
            ['tile_id' => 1, 'position' => [0, 0]],
            ['tile_id' => 2, 'position' => [1, -1]],
            ['tile_id' => 3, 'position' => [-1, 1]],

            // Inner ring (large tiles)
            ['tile_id' => 4, 'position' => [2, -1]],
            ['tile_id' => 5, 'position' => [0, 2]],
            ['tile_id' => 6, 'position' => [-2, 1]],

            // Middle ring (medium tiles)
            ['tile_id' => 7, 'position' => [1, 1]],
            ['tile_id' => 8, 'position' => [-1, -1]],
            ['tile_id' => 9, 'position' => [2, 0]],

            // Outer positions (small tiles)
            ['tile_id' => 10, 'position' => [0, -2]],
            ['tile_id' => 11, 'position' => [-2, 0]],

            // Zeus tile (center, overlaps with tile 1's center)
            ['tile_id' => 12, 'position' => [0, 0], 'special' => 'zeus']
        ];
    }

    /**
     * Generate random compact board layout
     * Algorithm: Start with center, add tiles to minimize shallows
     */
    private function generateRandomLayout(): array {
        $maxAttempts = 100;

        for ($attempt = 0; $attempt < $maxAttempts; $attempt++) {
            // Start with center tiles (with holes)
            $layout = $this->placeCenterTiles();

            // Add surrounding tiles
            $layout = $this->addSurroundingTiles($layout);

            // Add Zeus tile
            $layout[] = ['tile_id' => 12, 'position' => [0, 0], 'special' => 'zeus'];

            // Calculate shallows
            $shallowCount = $this->countShallows($layout);

            // Accept if shallow count is reasonable
            if ($shallowCount <= 6) { // Threshold for acceptable layout
                return $layout;
            }
        }

        // Fallback to first game layout if can't generate good random one
        return $this->getFirstGameLayout();
    }

    /**
     * Place center triangle tiles (3 tiles with holes)
     */
    private function placeCenterTiles(): array {
        $centerTiles = [1, 2, 3]; // Tiles with center holes
        shuffle($centerTiles);

        return [
            ['tile_id' => $centerTiles[0], 'position' => [0, 0]],
            ['tile_id' => $centerTiles[1], 'position' => [1, -1]],
            ['tile_id' => $centerTiles[2], 'position' => [-1, 1]]
        ];
    }

    /**
     * Add surrounding tiles to minimize shallows
     */
    private function addSurroundingTiles(array $layout): array {
        $remainingTiles = [4, 5, 6, 7, 8, 9, 10, 11];
        shuffle($remainingTiles);

        $possiblePositions = [
            [2, -1], [0, 2], [-2, 1],  // Inner ring
            [1, 1], [-1, -1], [2, 0],  // Middle ring
            [0, -2], [-2, 0]            // Outer positions
        ];

        // Greedy placement: place tiles to maximize adjacency
        foreach ($remainingTiles as $tileId) {
            $bestPosition = null;
            $bestScore = -1;

            foreach ($possiblePositions as $idx => $pos) {
                $score = $this->calculatePlacementScore($layout, $pos);
                if ($score > $bestScore) {
                    $bestScore = $score;
                    $bestPosition = $idx;
                }
            }

            if ($bestPosition !== null) {
                $layout[] = [
                    'tile_id' => $tileId,
                    'position' => $possiblePositions[$bestPosition]
                ];
                unset($possiblePositions[$bestPosition]);
                $possiblePositions = array_values($possiblePositions); // Re-index
            }
        }

        return $layout;
    }

    /**
     * Calculate placement score (higher = better adjacency, fewer shallows)
     */
    private function calculatePlacementScore(array $layout, array $position): int {
        $adjacentTiles = 0;

        // Check 6 hexagonal neighbors
        $neighbors = $this->getHexNeighbors($position);

        foreach ($neighbors as $neighbor) {
            if ($this->positionOccupied($layout, $neighbor)) {
                $adjacentTiles++;
            }
        }

        return $adjacentTiles;
    }

    /**
     * Get 6 hexagonal neighbor coordinates
     */
    private function getHexNeighbors(array $pos): array {
        [$q, $r] = $pos;

        return [
            [$q + 1, $r],     // East
            [$q + 1, $r - 1], // Northeast
            [$q, $r - 1],     // Northwest
            [$q - 1, $r],     // West
            [$q - 1, $r + 1], // Southwest
            [$q, $r + 1]      // Southeast
        ];
    }

    /**
     * Check if position is occupied in layout
     */
    private function positionOccupied(array $layout, array $position): bool {
        foreach ($layout as $tile) {
            if ($tile['position'] === $position) {
                return true;
            }
        }
        return false;
    }

    /**
     * Count shallows (holes between tiles)
     */
    private function countShallows(array $layout): int {
        $shallows = 0;
        $positions = array_column($layout, 'position');

        foreach ($positions as $pos) {
            $neighbors = $this->getHexNeighbors($pos);

            foreach ($neighbors as $neighbor) {
                if (!in_array($neighbor, $positions)) {
                    $shallows++;
                }
            }
        }

        return $shallows / 2; // Each shallow counted twice
    }

    /**
     * Validate that all water spaces are connected
     */
    private function validateWaterConnectivity(array $spaces, array $adjacency): bool {
        $waterSpaces = array_filter($spaces, fn($s) => $s['space_type'] === 'water');

        if (empty($waterSpaces)) {
            return false;
        }

        // Flood fill from first water space
        $startSpace = array_key_first($waterSpaces);
        $visited = $this->floodFill($startSpace, $waterSpaces, $adjacency);

        // All water spaces should be reachable
        return count($visited) === count($waterSpaces);
    }

    /**
     * Flood fill algorithm for connectivity check
     */
    private function floodFill(int $start, array $validSpaces, array $adjacency): array {
        $visited = [$start => true];
        $queue = [$start];

        while (!empty($queue)) {
            $current = array_shift($queue);

            foreach ($adjacency[$current] ?? [] as $neighbor) {
                if (!isset($visited[$neighbor]) && isset($validSpaces[$neighbor])) {
                    $visited[$neighbor] = true;
                    $queue[] = $neighbor;
                }
            }
        }

        return $visited;
    }

    /**
     * Generate individual hex spaces from tile layout
     */
    private function generateSpaces(array $layout): array {
        $spaces = [];
        $spaceId = 1;

        foreach ($layout as $tile) {
            $tileData = BOARD_TILES[$tile['tile_id']];

            // Generate water and island spaces for this tile
            $tileSpaces = $this->generateTileSpaces(
                $tile['tile_id'],
                $tile['position'],
                $spaceId
            );

            $spaces = array_merge($spaces, $tileSpaces);
            $spaceId += count($tileSpaces);
        }

        return $spaces;
    }

    /**
     * Generate spaces for individual tile
     */
    private function generateTileSpaces(int $tileId, array $position, int $startId): array {
        // Implementation depends on specific tile layouts
        // Each tile has defined hex spaces with colors and types
        // This is a simplified version

        $tileData = BOARD_TILES[$tileId];
        $spaces = [];

        // Generate water spaces
        for ($i = 0; $i < $tileData['water_spaces']; $i++) {
            $spaces[] = [
                'space_id' => $startId + $i,
                'space_type' => 'water',
                'tile_id' => $tileId,
                'hex_color' => $this->getWaterSpaceColor($tileId, $i)
            ];
        }

        // Generate island spaces
        $offset = $tileData['water_spaces'];
        for ($i = 0; $i < $tileData['island_spaces']; $i++) {
            $spaces[] = [
                'space_id' => $startId + $offset + $i,
                'space_type' => 'island',
                'tile_id' => $tileId,
                'hex_color' => null
            ];
        }

        return $spaces;
    }
}