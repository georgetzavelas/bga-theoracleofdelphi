<?php
/**
 * HexUtils.php - Hex coordinate utilities for The Oracle of Delphi
 *
 * Provides hex distance calculation and ring/range operations
 * for axial (q, r) coordinates with pointy-topped hexagons.
 */

class HexUtils
{
    /**
     * Calculate hex distance between two positions.
     * Uses the cube coordinate Manhattan distance formula.
     */
    public static function hexDistance(int $q1, int $r1, int $q2, int $r2): int
    {
        return (int)((abs($q1 - $q2) + abs($q1 + $r1 - $q2 - $r2) + abs($r1 - $r2)) / 2);
    }

    /**
     * Get all hexes at exactly a given distance from a center point.
     * Traces the hex ring at the specified distance.
     */
    public static function getHexesAtDistance(int $centerQ, int $centerR, int $distance): array
    {
        if ($distance === 0) {
            return [['q' => $centerQ, 'r' => $centerR]];
        }

        $results = [];
        $q = $centerQ + $distance;
        $r = $centerR - $distance;

        $directions = ClusterDefinitions::DIRECTION_LIST;
        for ($i = 0; $i < 6; $i++) {
            for ($j = 0; $j < $distance; $j++) {
                $results[] = ['q' => $q, 'r' => $r];
                $dir = $directions[($i + 2) % 6];
                $q += $dir['dq'];
                $r += $dir['dr'];
            }
        }

        return $results;
    }

    /**
     * Identify the "artificial shallows": empty hexes fully enclosed by the
     * assembled board (the holes between cluster tiles), as opposed to the
     * open ocean off the board edge.
     *
     * Only cluster hexes are stored in the hex table; the gaps between
     * clusters have no hex of their own. This finds them so they can be
     * modelled as tile_type='shallows' — impassable to a normal ship, free
     * to cross for a Shallow Runner (Equipment 014) owner.
     *
     * Algorithm (flood-fill the outside): take the axial bounding box of the
     * occupied hexes, expand by a one-hex margin, then flood from a margin
     * corner through EMPTY hexes only. Every empty hex the flood reaches is
     * open to the ocean; any empty hex inside the bounding box the flood
     * does NOT reach is walled in by occupied hexes — an enclosed gap. Uses
     * the same six-neighbour adjacency as the ship pathfinder, so "enclosed"
     * matches "a ship could route through it".
     *
     * @param list<array{q: int|string, r: int|string}> $occupiedHexes
     * @return list<array{q: int, r: int}> enclosed gap hexes ("q,r")
     */
    public static function findEnclosedGapHexes(array $occupiedHexes): array
    {
        if (empty($occupiedHexes)) {
            return [];
        }

        $occupied = [];
        $minQ = PHP_INT_MAX; $maxQ = PHP_INT_MIN;
        $minR = PHP_INT_MAX; $maxR = PHP_INT_MIN;
        foreach ($occupiedHexes as $hex) {
            $q = (int)$hex['q'];
            $r = (int)$hex['r'];
            $occupied["$q,$r"] = true;
            $minQ = min($minQ, $q); $maxQ = max($maxQ, $q);
            $minR = min($minR, $r); $maxR = max($maxR, $r);
        }

        // One-hex margin so the outside flood can wrap the whole perimeter.
        $loQ = $minQ - 1; $hiQ = $maxQ + 1;
        $loR = $minR - 1; $hiR = $maxR + 1;

        $directions = ClusterDefinitions::DIRECTION_LIST;

        // Flood the ocean from a corner that is guaranteed empty (q < minQ).
        $outside = ["$loQ,$loR" => true];
        $queue = [[$loQ, $loR]];
        while (!empty($queue)) {
            [$q, $r] = array_shift($queue);
            foreach ($directions as $dir) {
                $nq = $q + $dir['dq'];
                $nr = $r + $dir['dr'];
                if ($nq < $loQ || $nq > $hiQ || $nr < $loR || $nr > $hiR) {
                    continue;
                }
                $nKey = "$nq,$nr";
                if (isset($occupied[$nKey]) || isset($outside[$nKey])) {
                    continue;
                }
                $outside[$nKey] = true;
                $queue[] = [$nq, $nr];
            }
        }

        // Enclosed = empty hexes inside the occupied bounding box that the
        // ocean flood never reached.
        $gaps = [];
        for ($q = $minQ; $q <= $maxQ; $q++) {
            for ($r = $minR; $r <= $maxR; $r++) {
                $key = "$q,$r";
                if (isset($occupied[$key]) || isset($outside[$key])) {
                    continue;
                }
                $gaps[] = ['q' => $q, 'r' => $r];
            }
        }
        return $gaps;
    }
}
