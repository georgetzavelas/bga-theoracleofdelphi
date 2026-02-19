<?php
/**
 * HexUtils.php - Hex coordinate utilities for The Oracle of Delphi
 *
 * Provides hex distance calculation and ring/range operations
 * for axial coordinate system (q, r) with pointy-topped hexagons.
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
}
