<?php
/**
 * BoardGenerator.php - Board generation algorithm for The Oracle of Delphi
 *
 * Direct port of BoardBuilder.js. Generates a valid game board by placing
 * 12 island clusters and 6 city tiles with backtracking.
 *
 * Pure generator: returns board data as arrays. Does NOT write to DB.
 * Accepts a callable $randFn for testability (defaults to bga_rand).
 */

require_once(__DIR__ . '/ClusterDefinitions.php');
require_once(__DIR__ . '/HexUtils.php');

class BoardGenerator
{
    // Pixel-space hex dimensions (must match BoardRenderer.js's hexWidth/hexHeight).
    // Used only for landscape-bias scoring; does NOT affect rendering.
    private const HEX_WIDTH_PX = 60.0;
    private const HEX_HEIGHT_PX = 69.0;

    // Landscape-bias scoring constants
    private const TARGET_ASPECT_RATIO = 1.5;
    private const ASPECT_SCORE_JITTER = 0.02;
    private const MIN_CLUSTERS_FOR_BIAS = 2;

    private ClusterDefinitions $clusterDefs;

    /** @var array<string, array> "q,r" -> hex data */
    private array $occupiedHexes = [];

    /** @var array<string, true> "q,r" -> true (used as set) */
    private array $waterHexes = [];

    /** @var array placement records */
    private array $placedClusters = [];

    private int $maxBuildAttempts;
    private int $maxBacktrackDepth;

    /** @var callable (int $min, int $max) -> int */
    private $randFn;

    public function __construct(array $options = [])
    {
        $this->clusterDefs = new ClusterDefinitions();
        $this->maxBuildAttempts = $options['maxBuildAttempts'] ?? 50;
        $this->maxBacktrackDepth = $options['maxBacktrackDepth'] ?? 5;

        // Default to bga_rand if available, otherwise mt_rand
        if (isset($options['randFn'])) {
            $this->randFn = $options['randFn'];
        } elseif (function_exists('bga_rand')) {
            $this->randFn = 'bga_rand';
        } else {
            $this->randFn = 'mt_rand';
        }

        $this->reset();
    }

    private function reset(): void
    {
        $this->placedClusters = [];
        $this->occupiedHexes = [];
        $this->waterHexes = [];
    }

    private function rand(int $min, int $max): int
    {
        return ($this->randFn)($min, $max);
    }

    // =========================================================================
    // Main entry point
    // =========================================================================

    /**
     * Generate a complete valid game board.
     * @return array{clusters: array, hexes: array, zeusPosition: ?array, valid: bool, attempts: int}
     */
    public function generate(): array
    {
        for ($attempt = 1; $attempt <= $this->maxBuildAttempts; $attempt++) {
            $this->reset();

            // Step 1: Select island clusters
            $islandClusters = $this->selectIslandClusters();

            // Step 2: Place island clusters with backtracking
            if (!$this->placeIslandClustersWithBacktracking($islandClusters)) {
                continue;
            }

            // Step 3: Place city tiles
            if (!$this->placeCityTilesWithBacktracking()) {
                continue;
            }

            // Step 4: Validate
            if ($this->validateBoard()) {
                $zeusPosition = $this->findZeusPosition();
                return [
                    'clusters' => $this->placedClusters,
                    'hexes' => array_values($this->occupiedHexes),
                    'zeusPosition' => $zeusPosition,
                    'valid' => true,
                    'attempts' => $attempt,
                ];
            }
        }

        return [
            'clusters' => $this->placedClusters,
            'hexes' => array_values($this->occupiedHexes),
            'zeusPosition' => null,
            'valid' => false,
            'attempts' => $this->maxBuildAttempts,
        ];
    }

    // =========================================================================
    // Cluster selection
    // =========================================================================

    /**
     * Select 12 island clusters: cluster-7-0 always first (Zeus shallows),
     * then 5 more 7-hex, 3 nine-hex, 3 eleven-hex.
     */
    private function selectIslandClusters(): array
    {
        $clusters7 = $this->clusterDefs->getClustersBySize(7);
        $clusters9 = $this->clusterDefs->getClustersBySize(9);
        $clusters11 = $this->clusterDefs->getClustersBySize(11);

        $zeusCluster = $this->clusterDefs->getCluster('cluster-7-0');
        $otherClusters7 = array_values(array_filter($clusters7, fn($c) => $c['id'] !== 'cluster-7-0'));

        $this->shuffleArray($otherClusters7);
        $this->shuffleArray($clusters9);
        $this->shuffleArray($clusters11);

        $selected = array_merge(
            [$zeusCluster],
            array_slice($otherClusters7, 0, 5),
            array_slice($clusters9, 0, 3),
            array_slice($clusters11, 0, 3)
        );

        // Shuffle everything after the first (keep Zeus cluster first)
        $rest = array_slice($selected, 1);
        $this->shuffleArray($rest);

        return array_merge([$selected[0]], $rest);
    }

    // =========================================================================
    // Island cluster placement with backtracking
    // =========================================================================

    private function placeIslandClustersWithBacktracking(array $clusters): bool
    {
        // Place first cluster at origin with random rotation
        $firstCluster = $clusters[0];
        $firstRotation = $this->randomRotation();
        $this->placeCluster($firstCluster, 0, 0, $firstRotation);

        $placementStack = [[
            'clusterIndex' => 0,
            'cluster' => $firstCluster,
            'anchorQ' => 0,
            'anchorR' => 0,
            'rotation' => $firstRotation,
            'triedPositions' => ["0,0,{$firstRotation}" => true],
        ]];

        $currentIndex = 1;

        while ($currentIndex < count($clusters)) {
            $cluster = $clusters[$currentIndex];
            $placement = $this->findPlacementWithHistory($cluster, $placementStack);

            if ($placement !== null) {
                $this->placeCluster($cluster, $placement['q'], $placement['r'], $placement['rotation']);
                $placementStack[] = [
                    'clusterIndex' => $currentIndex,
                    'cluster' => $cluster,
                    'anchorQ' => $placement['q'],
                    'anchorR' => $placement['r'],
                    'rotation' => $placement['rotation'],
                    'triedPositions' => $placement['triedPositions'],
                ];
                $currentIndex++;
            } else {
                if (!$this->backtrack($placementStack, $clusters, $currentIndex)) {
                    return false;
                }
                $currentIndex = count($placementStack);
            }
        }

        return true;
    }

    /**
     * Find a placement for a cluster, tracking tried positions.
     */
    private function findPlacementWithHistory(array $cluster, array $_placementStack, ?array $excludePositions = null): ?array
    {
        $triedPositions = $excludePositions ?? [];
        $candidates = $this->findConnectionCandidates($cluster);
        $this->shuffleArray($candidates);

        foreach ($candidates as $candidate) {
            $key = "{$candidate['q']},{$candidate['r']},{$candidate['rotation']}";

            if (isset($triedPositions[$key])) {
                continue;
            }
            $triedPositions[$key] = true;

            if ($this->canPlaceCluster($cluster, $candidate['q'], $candidate['r'], $candidate['rotation'])) {
                if ($this->wouldMaintainWaterConnectivity($cluster, $candidate['q'], $candidate['r'], $candidate['rotation'])) {
                    return [
                        'q' => $candidate['q'],
                        'r' => $candidate['r'],
                        'rotation' => $candidate['rotation'],
                        'triedPositions' => $triedPositions,
                    ];
                }
            }
        }

        return null;
    }

    /**
     * Backtrack by removing placed clusters and trying alternatives.
     */
    private function backtrack(array &$placementStack, array $clusters, int $_failedIndex): bool
    {
        $maxBacktrack = min($this->maxBacktrackDepth, count($placementStack) - 1);

        for ($backtrackCount = 1; $backtrackCount <= $maxBacktrack; $backtrackCount++) {
            $removedPlacements = [];

            for ($i = 0; $i < $backtrackCount; $i++) {
                if (count($placementStack) <= 1) break;
                $removed = array_pop($placementStack);
                array_unshift($removedPlacements, $removed);
                $this->removeCluster($removed);
            }

            $retryIndex = count($placementStack);
            if ($retryIndex < count($clusters)) {
                $retryCluster = $clusters[$retryIndex];
                $previousTried = !empty($removedPlacements) ? $removedPlacements[0]['triedPositions'] : [];

                $newPlacement = $this->findPlacementWithHistory($retryCluster, $placementStack, $previousTried);

                if ($newPlacement !== null) {
                    $this->placeCluster($retryCluster, $newPlacement['q'], $newPlacement['r'], $newPlacement['rotation']);
                    $placementStack[] = [
                        'clusterIndex' => $retryIndex,
                        'cluster' => $retryCluster,
                        'anchorQ' => $newPlacement['q'],
                        'anchorR' => $newPlacement['r'],
                        'rotation' => $newPlacement['rotation'],
                        'triedPositions' => $newPlacement['triedPositions'],
                    ];
                    return true;
                }
            }

            // Restore removed placements if this backtrack level didn't work
            foreach ($removedPlacements as $removed) {
                $this->placeCluster($removed['cluster'], $removed['anchorQ'], $removed['anchorR'], $removed['rotation']);
                $placementStack[] = $removed;
            }
        }

        return false;
    }

    // =========================================================================
    // Cluster placement / removal
    // =========================================================================

    private function placeCluster(array $cluster, int $anchorQ, int $anchorR, int $rotation): void
    {
        $worldHexes = $this->clusterDefs->getWorldHexes($cluster, $anchorQ, $anchorR, $rotation);

        $this->placedClusters[] = [
            'cluster' => $cluster,
            'anchorQ' => $anchorQ,
            'anchorR' => $anchorR,
            'rotation' => $rotation,
            'hexes' => $worldHexes,
        ];

        foreach ($worldHexes as $hex) {
            $key = "{$hex['q']},{$hex['r']}";
            $this->occupiedHexes[$key] = $hex;

            if ($hex['type'] === 'water') {
                $this->waterHexes[$key] = true;
            }
        }
    }

    private function removeCluster(array $placementInfo): void
    {
        // Remove from placedClusters
        foreach ($this->placedClusters as $idx => $p) {
            if ($p['cluster']['id'] === $placementInfo['cluster']['id']
                && $p['anchorQ'] === $placementInfo['anchorQ']
                && $p['anchorR'] === $placementInfo['anchorR']
            ) {
                array_splice($this->placedClusters, $idx, 1);
                break;
            }
        }

        // Remove hexes
        $worldHexes = $this->clusterDefs->getWorldHexes(
            $placementInfo['cluster'],
            $placementInfo['anchorQ'],
            $placementInfo['anchorR'],
            $placementInfo['rotation']
        );

        foreach ($worldHexes as $hex) {
            $key = "{$hex['q']},{$hex['r']}";
            unset($this->occupiedHexes[$key]);
            unset($this->waterHexes[$key]);
        }
    }

    // =========================================================================
    // Connection candidates
    // =========================================================================

    /**
     * Find candidate positions where a cluster could connect to existing water.
     * Each candidate includes a rotation.
     */
    private function findConnectionCandidates(array $cluster): array
    {
        $candidates = [];
        $checked = [];
        $directions = ClusterDefinitions::DIRECTION_LIST;

        foreach ($this->waterHexes as $waterKey => $_) {
            [$wq, $wr] = array_map('intval', explode(',', $waterKey));

            for ($rotation = 0; $rotation < 6; $rotation++) {
                $clusterWaterHexes = $this->getClusterWaterHexes($cluster, $rotation);

                foreach ($clusterWaterHexes as $clusterWater) {
                    foreach ($directions as $dir) {
                        $anchorQ = $wq + $dir['dq'] - $clusterWater['dq'];
                        $anchorR = $wr + $dir['dr'] - $clusterWater['dr'];

                        $key = "{$anchorQ},{$anchorR},{$rotation}";
                        if (!isset($checked[$key])) {
                            $checked[$key] = true;
                            $candidates[] = ['q' => $anchorQ, 'r' => $anchorR, 'rotation' => $rotation];
                        }
                    }
                }
            }
        }

        return $candidates;
    }

    private function getClusterWaterHexes(array $cluster, int $rotation): array
    {
        $rotated = $this->clusterDefs->getRotatedHexes($cluster, $rotation);
        return array_values(array_filter($rotated, fn($h) => $h['type'] === 'water'));
    }

    // =========================================================================
    // Placement validation
    // =========================================================================

    private function canPlaceCluster(array $cluster, int $anchorQ, int $anchorR, int $rotation): bool
    {
        $worldHexes = $this->clusterDefs->getWorldHexes($cluster, $anchorQ, $anchorR, $rotation);

        foreach ($worldHexes as $hex) {
            $key = "{$hex['q']},{$hex['r']}";
            if (isset($this->occupiedHexes[$key])) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if placing a cluster would maintain water connectivity.
     * Requires at least 2 adjacent hex pairs between new and existing water.
     */
    private function wouldMaintainWaterConnectivity(array $cluster, int $anchorQ, int $anchorR, int $rotation): bool
    {
        $worldHexes = $this->clusterDefs->getWorldHexes($cluster, $anchorQ, $anchorR, $rotation);
        $newWaterHexes = array_filter($worldHexes, fn($h) => $h['type'] === 'water');

        if (empty($newWaterHexes)) {
            return true;
        }

        $connectionCount = 0;
        $directions = ClusterDefinitions::DIRECTION_LIST;

        foreach ($newWaterHexes as $newWater) {
            foreach ($directions as $dir) {
                $neighborKey = ($newWater['q'] + $dir['dq']) . ',' . ($newWater['r'] + $dir['dr']);
                if (isset($this->waterHexes[$neighborKey])) {
                    $connectionCount++;
                }
            }
        }

        return $connectionCount >= 2;
    }

    // =========================================================================
    // City tile placement with backtracking
    // =========================================================================

    private function placeCityTilesWithBacktracking(): bool
    {
        $cityTiles = $this->clusterDefs->getCityClusters();
        $this->shuffleArray($cityTiles);

        $bounds = $this->getBoardBounds();
        $center = [
            'q' => ($bounds['minQ'] + $bounds['maxQ']) / 2,
            'r' => ($bounds['minR'] + $bounds['maxR']) / 2,
        ];

        $cityPlacements = [];

        for ($i = 0; $i < 6; $i++) {
            $cityTile = $cityTiles[$i];
            $cityCandidates = $this->getCityCandidates($cityTile);
            $placement = $this->findCityPlacementFromCandidates($cityTile, $cityCandidates, $cityPlacements, $center);

            if ($placement === null) {
                if (!$this->backtrackCitiesNew($cityPlacements, $cityTiles, $i, $center)) {
                    return false;
                }
                $i = count($cityPlacements) - 1;
                continue;
            }

            $this->placeCluster($cityTile, $placement['q'], $placement['r'], $placement['rotation']);
            $cityPlacements[] = [
                'cityIndex' => $i,
                'cityTile' => $cityTile,
                'anchorQ' => $placement['q'],
                'anchorR' => $placement['r'],
                'rotation' => $placement['rotation'],
                'triedPositions' => $placement['triedPositions'],
            ];
        }

        return true;
    }

    /**
     * Get candidate anchor positions for city tiles that connect to existing edge water.
     */
    private function getCityCandidates(array $cityTile): array
    {
        $candidates = [];
        $checked = [];
        $directions = ClusterDefinitions::DIRECTION_LIST;

        // Find water hexes on the edge (at least one non-occupied neighbor)
        $edgeWaterHexes = [];
        foreach ($this->waterHexes as $waterKey => $_) {
            [$wq, $wr] = array_map('intval', explode(',', $waterKey));
            foreach ($directions as $dir) {
                $neighborKey = ($wq + $dir['dq']) . ',' . ($wr + $dir['dr']);
                if (!isset($this->occupiedHexes[$neighborKey])) {
                    $edgeWaterHexes[] = ['q' => $wq, 'r' => $wr];
                    break;
                }
            }
        }

        for ($rotation = 0; $rotation < 6; $rotation++) {
            $cityWaterHexes = $this->getClusterWaterHexes($cityTile, $rotation);

            foreach ($cityWaterHexes as $cityWater) {
                foreach ($edgeWaterHexes as $edgeWater) {
                    foreach ($directions as $dir) {
                        $anchorQ = $edgeWater['q'] - $dir['dq'] - $cityWater['dq'];
                        $anchorR = $edgeWater['r'] - $dir['dr'] - $cityWater['dr'];

                        $key = "{$anchorQ},{$anchorR},{$rotation}";
                        if (!isset($checked[$key])) {
                            $checked[$key] = true;
                            $candidates[] = ['q' => $anchorQ, 'r' => $anchorR, 'rotation' => $rotation];
                        }
                    }
                }
            }
        }

        return $candidates;
    }

    /**
     * Find placement for a city tile from pre-calculated candidates.
     */
    private function findCityPlacementFromCandidates(
        array $cityTile,
        array $candidates,
        array $existingPlacements,
        array $_center,
        ?array $excludePositions = null
    ): ?array {
        $triedPositions = $excludePositions ?? [];
        $minCityDistance = 5;

        $this->shuffleArray($candidates);

        // Sort to prefer positions well-spaced from existing cities
        if (!empty($existingPlacements)) {
            usort($candidates, function ($a, $b) use ($existingPlacements) {
                $minDistA = PHP_INT_MAX;
                $minDistB = PHP_INT_MAX;
                foreach ($existingPlacements as $p) {
                    $dA = HexUtils::hexDistance($a['q'], $a['r'], $p['anchorQ'], $p['anchorR']);
                    $dB = HexUtils::hexDistance($b['q'], $b['r'], $p['anchorQ'], $p['anchorR']);
                    if ($dA < $minDistA) $minDistA = $dA;
                    if ($dB < $minDistB) $minDistB = $dB;
                }
                return $minDistB - $minDistA; // Prefer farther
            });
        }

        foreach ($candidates as $candidate) {
            $key = "{$candidate['q']},{$candidate['r']},{$candidate['rotation']}";

            if (isset($triedPositions[$key])) continue;
            $triedPositions[$key] = true;

            // Check minimum distance from other cities
            $tooClose = false;
            foreach ($existingPlacements as $existing) {
                $dist = HexUtils::hexDistance($candidate['q'], $candidate['r'], $existing['anchorQ'], $existing['anchorR']);
                if ($dist < $minCityDistance) {
                    $tooClose = true;
                    break;
                }
            }
            if ($tooClose) continue;

            if ($this->canPlaceCluster($cityTile, $candidate['q'], $candidate['r'], $candidate['rotation'])) {
                if ($this->cityWaterTouchesExistingWater($cityTile, $candidate['q'], $candidate['r'], $candidate['rotation'])) {
                    return [
                        'q' => $candidate['q'],
                        'r' => $candidate['r'],
                        'rotation' => $candidate['rotation'],
                        'triedPositions' => $triedPositions,
                    ];
                }
            }
        }

        return null;
    }

    /**
     * Backtrack city placements.
     */
    private function backtrackCitiesNew(array &$cityPlacements, array $cityTiles, int $_failedIndex, array $center): bool
    {
        $maxBacktrack = min(3, count($cityPlacements));

        for ($backtrackCount = 1; $backtrackCount <= $maxBacktrack; $backtrackCount++) {
            $removedPlacements = [];

            for ($i = 0; $i < $backtrackCount; $i++) {
                if (empty($cityPlacements)) break;
                $removed = array_pop($cityPlacements);
                array_unshift($removedPlacements, $removed);
                $this->removeCluster([
                    'cluster' => $removed['cityTile'],
                    'anchorQ' => $removed['anchorQ'],
                    'anchorR' => $removed['anchorR'],
                    'rotation' => $removed['rotation'],
                ]);
            }

            $retryIndex = count($cityPlacements);
            if ($retryIndex < 6) {
                $retryCityTile = $cityTiles[$retryIndex];
                $previousTried = !empty($removedPlacements) ? $removedPlacements[0]['triedPositions'] : [];

                $cityCandidates = $this->getCityCandidates($retryCityTile);
                $newPlacement = $this->findCityPlacementFromCandidates(
                    $retryCityTile, $cityCandidates, $cityPlacements, $center, $previousTried
                );

                if ($newPlacement !== null) {
                    $this->placeCluster($retryCityTile, $newPlacement['q'], $newPlacement['r'], $newPlacement['rotation']);
                    $cityPlacements[] = [
                        'cityIndex' => $retryIndex,
                        'cityTile' => $retryCityTile,
                        'anchorQ' => $newPlacement['q'],
                        'anchorR' => $newPlacement['r'],
                        'rotation' => $newPlacement['rotation'],
                        'triedPositions' => $newPlacement['triedPositions'],
                    ];
                    return true;
                }
            }

            // Restore if this backtrack level didn't work
            foreach ($removedPlacements as $removed) {
                $this->placeCluster($removed['cityTile'], $removed['anchorQ'], $removed['anchorR'], $removed['rotation']);
                $cityPlacements[] = $removed;
            }
        }

        return false;
    }

    /**
     * Check if city water hexes touch existing water (>= 2 pairs)
     * and that the city island hex's "top" edges (NW/NE at rotation 0) aren't connected.
     */
    private function cityWaterTouchesExistingWater(array $cityTile, int $anchorQ, int $anchorR, int $rotation): bool
    {
        $worldHexes = $this->clusterDefs->getWorldHexes($cityTile, $anchorQ, $anchorR, $rotation);
        $cityWaterHexes = array_filter($worldHexes, fn($h) => $h['type'] === 'water');
        $directions = ClusterDefinitions::DIRECTION_LIST;

        // Find the city hex and check its rotated top edges aren't connected
        $cityHex = null;
        foreach ($worldHexes as $h) {
            if (($h['attribute'] ?? null) === 'city') {
                $cityHex = $h;
                break;
            }
        }

        if ($cityHex !== null) {
            // Original NW=index 0, NE=index 1; rotation shifts them
            $rotatedNwIndex = (0 + $rotation) % 6;
            $rotatedNeIndex = (1 + $rotation) % 6;

            $rotatedNwDir = $directions[$rotatedNwIndex];
            $rotatedNeDir = $directions[$rotatedNeIndex];

            $nwNeighborKey = ($cityHex['q'] + $rotatedNwDir['dq']) . ',' . ($cityHex['r'] + $rotatedNwDir['dr']);
            $neNeighborKey = ($cityHex['q'] + $rotatedNeDir['dq']) . ',' . ($cityHex['r'] + $rotatedNeDir['dr']);

            if (isset($this->occupiedHexes[$nwNeighborKey]) || isset($this->occupiedHexes[$neNeighborKey])) {
                return false;
            }
        }

        // Count water-to-water adjacencies
        $connectionCount = 0;
        foreach ($cityWaterHexes as $cityWater) {
            foreach ($directions as $dir) {
                $neighborKey = ($cityWater['q'] + $dir['dq']) . ',' . ($cityWater['r'] + $dir['dr']);
                if (isset($this->waterHexes[$neighborKey])) {
                    $connectionCount++;
                }
            }
        }

        return $connectionCount >= 2;
    }

    // =========================================================================
    // Board validation
    // =========================================================================

    private function validateBoard(): bool
    {
        if (!$this->isWaterConnected()) {
            return false;
        }

        $islandCount = 0;
        $cityCount = 0;
        foreach ($this->placedClusters as $p) {
            $size = $p['cluster']['size'];
            if ($size === 7 || $size === 9 || $size === 11) {
                $islandCount++;
            } elseif ($size === 3) {
                $cityCount++;
            }
        }

        return $islandCount === 12 && $cityCount === 6;
    }

    /**
     * Check if all water hexes form a single connected region (BFS).
     */
    private function isWaterConnected(): bool
    {
        if (empty($this->waterHexes)) {
            return true;
        }

        $start = array_key_first($this->waterHexes);
        $visited = [$start => true];
        $queue = [$start];
        $directions = ClusterDefinitions::DIRECTION_LIST;

        while (!empty($queue)) {
            $current = array_shift($queue);
            [$q, $r] = array_map('intval', explode(',', $current));

            foreach ($directions as $dir) {
                $neighborKey = ($q + $dir['dq']) . ',' . ($r + $dir['dr']);
                if (isset($this->waterHexes[$neighborKey]) && !isset($visited[$neighborKey])) {
                    $visited[$neighborKey] = true;
                    $queue[] = $neighborKey;
                }
            }
        }

        return count($visited) === count($this->waterHexes);
    }

    // =========================================================================
    // Zeus position
    // =========================================================================

    private function findZeusPosition(): ?array
    {
        $zeusPlacement = null;
        foreach ($this->placedClusters as $p) {
            if ($p['cluster']['id'] === 'cluster-7-0') {
                $zeusPlacement = $p;
                break;
            }
        }

        if ($zeusPlacement === null) {
            return null;
        }

        $worldHexes = $this->clusterDefs->getWorldHexes(
            $zeusPlacement['cluster'],
            $zeusPlacement['anchorQ'],
            $zeusPlacement['anchorR'],
            $zeusPlacement['rotation']
        );

        foreach ($worldHexes as $h) {
            if ($h['type'] === 'shallows') {
                return ['q' => $h['q'], 'r' => $h['r']];
            }
        }

        return null;
    }

    // =========================================================================
    // Board bounds
    // =========================================================================

    private function getBoardBounds(): array
    {
        $minQ = PHP_INT_MAX;
        $maxQ = PHP_INT_MIN;
        $minR = PHP_INT_MAX;
        $maxR = PHP_INT_MIN;

        foreach ($this->occupiedHexes as $key => $_) {
            [$q, $r] = array_map('intval', explode(',', $key));
            if ($q < $minQ) $minQ = $q;
            if ($q > $maxQ) $maxQ = $q;
            if ($r < $minR) $minR = $r;
            if ($r > $maxR) $maxR = $r;
        }

        return ['minQ' => $minQ, 'maxQ' => $maxQ, 'minR' => $minR, 'maxR' => $maxR];
    }

    // =========================================================================
    // Utilities
    // =========================================================================

    /**
     * Project axial hex coordinates (q, r) to pixel space.
     * Mirrors BoardRenderer.js hexToPixel() for pointy-top hexes.
     * Used only for landscape-bias scoring.
     */
    private function projectHexToPixel(int $q, int $r): array
    {
        $x = self::HEX_WIDTH_PX * ($q + $r * 0.5);
        $y = self::HEX_HEIGHT_PX * 0.75 * $r;
        return ['x' => $x, 'y' => $y];
    }

    private function shuffleArray(array &$arr): void
    {
        $n = count($arr);
        for ($i = $n - 1; $i > 0; $i--) {
            $j = $this->rand(0, $i);
            [$arr[$i], $arr[$j]] = [$arr[$j], $arr[$i]];
        }
    }

    private function randomRotation(): int
    {
        return $this->rand(0, 5);
    }
}
