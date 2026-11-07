<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi;

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
     * The route the ship sails from start to target, for the client's
     * hex-by-hex move animation.
     *
     * Cheapest in movement first (so it matches the distance the move was
     * charged for), then fewest hexes, so a Shallow Runner owner does not
     * wander through free shallows when a shorter equal-cost line exists.
     * Ties after that go to the first neighbour in DIRECTIONS order, which
     * keeps the route deterministic for every viewer.
     *
     * @return list<array{0: int, 1: int}>|null [q, r] steps from start to
     *         target inclusive, or null if the target is out of range.
     */
    public function findPath(int $startQ, int $startR, int $targetQ, int $targetR, int $maxRange): ?array
    {
        $startKey = "$startQ,$startR";
        $targetKey = "$targetQ,$targetR";
        if ($startKey === $targetKey) return null;

        // Dijkstra on (cost, hops). Hops never reach 1000 on a real board,
        // so one integer priority orders both.
        $best = [$startKey => [0, 0]];
        $parent = [];
        $queue = new \SplPriorityQueue();
        $queue->setExtractFlags(\SplPriorityQueue::EXTR_DATA);
        $seq = PHP_INT_MAX;
        $queue->insert([$startQ, $startR, 0, 0], [0, $seq--]);

        while (!$queue->isEmpty()) {
            [$q, $r, $cost, $hops] = $queue->extract();
            $key = "$q,$r";
            if ($best[$key] !== [$cost, $hops]) continue;
            if ($key === $targetKey) break;

            foreach (self::DIRECTIONS as [$dq, $dr]) {
                $nq = $q + $dq;
                $nr = $r + $dr;
                $nKey = "$nq,$nr";
                if (!isset($this->passableSet[$nKey])) continue;

                $nCost = $cost + (isset($this->zeroCostSet[$nKey]) ? 0 : 1);
                if ($nCost > $maxRange) continue;
                $nHops = $hops + 1;

                if (!isset($best[$nKey]) || [$nCost, $nHops] < $best[$nKey]) {
                    $best[$nKey] = [$nCost, $nHops];
                    $parent[$nKey] = $key;
                    // Lower priority value wins: negate, and the sequence
                    // number keeps equal priorities in insertion order.
                    $queue->insert([$nq, $nr, $nCost, $nHops], [-($nCost * 1000 + $nHops), $seq--]);
                }
            }
        }

        if (!isset($parent[$targetKey])) return null;

        $path = [];
        for ($key = $targetKey; $key !== $startKey; $key = $parent[$key]) {
            [$q, $r] = explode(',', $key);
            $path[] = [(int)$q, (int)$r];
        }
        $path[] = [$startQ, $startR];
        return array_reverse($path);
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
