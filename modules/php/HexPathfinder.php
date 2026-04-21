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
     * Hexes whose entry costs 0 movement (still passable, just free).
     * Used by Equipment 014 (Shallow Runner) to make shallows
     * "not count as a space". Subset of $passableSet.
     *
     * @var array<string, true>
     */
    private array $zeroCostSet = [];

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
     * Mark the given set of hex keys as zero-cost to enter. Entries that
     * are also in the passable set will not consume movement budget when
     * traversed. Keys not in the passable set are silently ignored.
     *
     * @param array<string, true> $zeroCostSet map of "q,r" => true
     */
    public function setZeroCostHexes(array $zeroCostSet): void
    {
        $this->zeroCostSet = $zeroCostSet;
    }

    /**
     * Shortest-path search from start position, returning all reachable
     * hexes within maxRange. Uses 0-1 BFS so zero-cost hexes (see
     * setZeroCostHexes) are correctly traversed for free.
     * @return array<string, int> Map of "q,r" => distance
     */
    public function getReachableHexes(int $startQ, int $startR, int $maxRange): array
    {
        $startKey = "$startQ,$startR";
        $distances = [$startKey => 0];
        // Deque implemented as two stacks: front (unshift target) and back (push target).
        $front = [];
        $back = [[$startQ, $startR]];

        while (!empty($front) || !empty($back)) {
            if (!empty($front)) {
                [$q, $r] = array_pop($front);
            } else {
                [$q, $r] = array_shift($back);
            }
            $dist = $distances["$q,$r"];

            foreach (self::DIRECTIONS as [$dq, $dr]) {
                $nq = $q + $dq;
                $nr = $r + $dr;
                $nKey = "$nq,$nr";

                if (!isset($this->passableSet[$nKey])) continue;

                // Entering a zero-cost hex does not consume movement budget.
                $stepCost = isset($this->zeroCostSet[$nKey]) ? 0 : 1;
                $nDist = $dist + $stepCost;

                if ($nDist > $maxRange) continue;

                if (!isset($distances[$nKey]) || $nDist < $distances[$nKey]) {
                    $distances[$nKey] = $nDist;
                    if ($stepCost === 0) {
                        $front[] = [$nq, $nr];
                    } else {
                        $back[] = [$nq, $nr];
                    }
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
