<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed;

class HexPathfinder
{
    /** Pointy-top axial hex neighbor directions */
    private const DIRECTIONS = [
        [0, -1], [1, -1], [1, 0],
        [0, 1], [-1, 1], [-1, 0],
    ];

    /** @var array<string, true> Set of passable hex keys "q,r" */
    private array $passableSet = [];

    /**
     * Load passable hexes from DB.
     * @param list<array{q: string, r: string}> $hexRows rows from hex table
     */
    public function loadWaterHexes(array $hexRows): void
    {
        $this->passableSet = [];
        foreach ($hexRows as $row) {
            $this->passableSet[(int)$row['q'] . ',' . (int)$row['r']] = true;
        }
    }

    /**
     * BFS from start position, returning all reachable hexes within maxRange.
     * @return array<string, int> Map of "q,r" => distance
     */
    public function getReachableHexes(int $startQ, int $startR, int $maxRange): array
    {
        $startKey = "$startQ,$startR";
        $distances = [$startKey => 0];
        $queue = [[$startQ, $startR]];
        $head = 0;

        while ($head < count($queue)) {
            [$q, $r] = $queue[$head++];
            $dist = $distances["$q,$r"];

            if ($dist >= $maxRange) {
                continue;
            }

            foreach (self::DIRECTIONS as [$dq, $dr]) {
                $nq = $q + $dq;
                $nr = $r + $dr;
                $nKey = "$nq,$nr";

                if (isset($this->passableSet[$nKey]) && !isset($distances[$nKey])) {
                    $distances[$nKey] = $dist + 1;
                    $queue[] = [$nq, $nr];
                }
            }
        }

        // Remove starting hex from results
        unset($distances[$startKey]);
        return $distances;
    }

    /**
     * Check if a specific hex is reachable within range.
     */
    public function isReachable(int $startQ, int $startR, int $targetQ, int $targetR, int $maxRange): bool
    {
        $reachable = $this->getReachableHexes($startQ, $startR, $maxRange);
        return isset($reachable["$targetQ,$targetR"]);
    }
}
