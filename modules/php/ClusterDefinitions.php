<?php
/**
 * ClusterDefinitions.php - Hex cluster definitions for The Oracle of Delphi
 *
 * Direct port of ClusterDefinitions.js.
 * Defines the shape and content of multi-hex board pieces (clusters).
 * Uses relative axial coordinates (dq, dr) from an anchor hex at (0, 0).
 *
 * Coordinate System:
 * - Pointy-topped hexagons with axial coordinates (q, r)
 * - Anchor hex is always at relative (0, 0)
 * - All other hexes defined relative to anchor
 */

class ClusterDefinitions
{
    // Hex types
    const HEX_TYPE = [
        'WATER' => 'water',
        'ISLAND' => 'island',
        'SHALLOWS' => 'shallows',
    ];

    // Island attributes
    const ISLAND_ATTRIBUTE = [
        'NONE' => null,
        'STATUE' => 'statue',
        'MONSTER' => 'monster',
        'TWO_MONSTER' => 'two_monster',
        'SHRINE' => 'shrine',
        'OFFERING' => 'offering',
        'TEMPLE' => 'temple',
        'CITY' => 'city',
    ];

    // Water colors
    const WATER_COLOR = [
        'RED' => 'red',
        'YELLOW' => 'yellow',
        'GREEN' => 'green',
        'BLUE' => 'blue',
        'PINK' => 'pink',
        'BLACK' => 'black',
    ];

    // Direction vectors for pointy-top hexagons (axial coordinates)
    // Order: NW, NE, E, SE, SW, W
    const DIRECTION_LIST = [
        ['dq' => 0,  'dr' => -1], // NW
        ['dq' => 1,  'dr' => -1], // NE
        ['dq' => 1,  'dr' => 0],  // E
        ['dq' => 0,  'dr' => 1],  // SE
        ['dq' => -1, 'dr' => 1],  // SW
        ['dq' => -1, 'dr' => 0],  // W
    ];

    private array $clusters;

    public function __construct()
    {
        $this->clusters = array_merge(
            self::CLUSTER_3_HEXES,
            self::CLUSTER_7_HEXES,
            self::CLUSTER_9_HEXES,
            self::CLUSTER_11_HEXES
        );
    }

    /**
     * Get a cluster definition by ID
     */
    public function getCluster(string $id): ?array
    {
        return $this->clusters[$id] ?? null;
    }

    /**
     * Get all clusters of a specific size
     */
    public function getClustersBySize(int $size): array
    {
        return array_values(array_filter($this->clusters, fn($c) => $c['size'] === $size));
    }

    /**
     * Get all city clusters (3-hex)
     */
    public function getCityClusters(): array
    {
        return array_values(self::CLUSTER_3_HEXES);
    }

    /**
     * Get all island clusters (non-city: 7, 9, 11 hex)
     */
    public function getIslandClusters(): array
    {
        return array_values(array_merge(
            self::CLUSTER_7_HEXES,
            self::CLUSTER_9_HEXES,
            self::CLUSTER_11_HEXES
        ));
    }

    /**
     * Rotate a hex position around origin by 60deg * steps (clockwise)
     * Uses cube coordinate rotation: (x, y, z) -> (-z, -x, -y) per step
     */
    public function rotateHex(int $dq, int $dr, int $steps): array
    {
        $steps = (($steps % 6) + 6) % 6;
        if ($steps === 0) {
            return ['dq' => $dq, 'dr' => $dr];
        }

        $x = $dq;
        $z = $dr;
        $y = -$x - $z;

        for ($i = 0; $i < $steps; $i++) {
            $newX = -$z;
            $newY = -$x;
            $newZ = -$y;
            $x = $newX;
            $y = $newY;
            $z = $newZ;
        }

        return ['dq' => $x, 'dr' => $z];
    }

    /**
     * Get rotated cluster hexes
     */
    public function getRotatedHexes(array $cluster, int $rotation): array
    {
        return array_map(function ($hex) use ($rotation) {
            $rotated = $this->rotateHex($hex['dq'], $hex['dr'], $rotation);
            return array_merge($hex, $rotated);
        }, $cluster['hexes']);
    }

    /**
     * Get world coordinates for a placed cluster
     */
    public function getWorldHexes(array $cluster, int $anchorQ, int $anchorR, int $rotation = 0): array
    {
        $rotatedHexes = $this->getRotatedHexes($cluster, $rotation);
        return array_map(function ($hex) use ($anchorQ, $anchorR) {
            return [
                'q' => $anchorQ + $hex['dq'],
                'r' => $anchorR + $hex['dr'],
                'type' => $hex['type'],
                'color' => $hex['color'] ?? null,
                'attribute' => $hex['attribute'] ?? null,
            ];
        }, $rotatedHexes);
    }

    // =========================================================================
    // 3-Hex City Clusters (one per color)
    // =========================================================================

    const CLUSTER_3_HEXES = [
        'city-red' => [
            'id' => 'city-red',
            'size' => 3,
            'color' => 'red',
            'hexes' => [
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'city', 'color' => null],
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
            ],
        ],
        'city-yellow' => [
            'id' => 'city-yellow',
            'size' => 3,
            'color' => 'yellow',
            'hexes' => [
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'city', 'color' => null],
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'green', 'attribute' => null],
            ],
        ],
        'city-green' => [
            'id' => 'city-green',
            'size' => 3,
            'color' => 'green',
            'hexes' => [
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'city', 'color' => null],
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
            ],
        ],
        'city-blue' => [
            'id' => 'city-blue',
            'size' => 3,
            'color' => 'blue',
            'hexes' => [
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'city', 'color' => null],
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'green', 'attribute' => null],
            ],
        ],
        'city-pink' => [
            'id' => 'city-pink',
            'size' => 3,
            'color' => 'pink',
            'hexes' => [
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'city', 'color' => null],
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
            ],
        ],
        'city-black' => [
            'id' => 'city-black',
            'size' => 3,
            'color' => 'black',
            'hexes' => [
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'city', 'color' => null],
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
            ],
        ],
    ];

    // =========================================================================
    // 7-Hex Clusters (6 variants)
    // =========================================================================

    const CLUSTER_7_HEXES = [
        'cluster-7-0' => [
            'id' => 'cluster-7-0',
            'size' => 7,
            'variant' => 0,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'shallows', 'attribute' => null, 'color' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
            ],
        ],
        'cluster-7-1' => [
            'id' => 'cluster-7-1',
            'size' => 7,
            'variant' => 1,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'shallows', 'attribute' => null, 'color' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'island', 'attribute' => 'monster', 'color' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
            ],
        ],
        'cluster-7-2' => [
            'id' => 'cluster-7-2',
            'size' => 7,
            'variant' => 2,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'shallows', 'attribute' => null, 'color' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'island', 'attribute' => 'offering', 'color' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'water', 'color' => 'black', 'attribute' => null],
            ],
        ],
        'cluster-7-3' => [
            'id' => 'cluster-7-3',
            'size' => 7,
            'variant' => 3,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'island', 'attribute' => 'temple', 'color' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'two_monster', 'color' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => 1, 'dr' => -2, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
            ],
        ],
        'cluster-7-4' => [
            'id' => 'cluster-7-4',
            'size' => 7,
            'variant' => 4,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'island', 'attribute' => 'monster', 'color' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'island', 'attribute' => 'temple', 'color' => null],
                ['dq' => 1, 'dr' => -2, 'type' => 'water', 'color' => 'black', 'attribute' => null],
            ],
        ],
        'cluster-7-5' => [
            'id' => 'cluster-7-5',
            'size' => 7,
            'variant' => 5,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'temple', 'color' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'island', 'attribute' => 'statue', 'color' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
                ['dq' => 1, 'dr' => -2, 'type' => 'island', 'attribute' => 'two_monster', 'color' => null],
            ],
        ],
    ];

    // =========================================================================
    // 9-Hex Clusters (3 variants)
    // =========================================================================

    const CLUSTER_9_HEXES = [
        'cluster-9-0' => [
            'id' => 'cluster-9-0',
            'size' => 9,
            'variant' => 0,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'statue', 'color' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => -1, 'dr' => -1, 'type' => 'island', 'attribute' => 'offering', 'color' => null],
                ['dq' => -2, 'dr' => 1, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
            ],
        ],
        'cluster-9-1' => [
            'id' => 'cluster-9-1',
            'size' => 9,
            'variant' => 1,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'two_monster', 'color' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'island', 'attribute' => 'offering', 'color' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => -1, 'dr' => -1, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
                ['dq' => -2, 'dr' => 1, 'type' => 'island', 'attribute' => 'statue', 'color' => null],
            ],
        ],
        'cluster-9-2' => [
            'id' => 'cluster-9-2',
            'size' => 9,
            'variant' => 2,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'island', 'attribute' => 'offering', 'color' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'island', 'attribute' => 'monster', 'color' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
                ['dq' => -1, 'dr' => -1, 'type' => 'island', 'attribute' => 'statue', 'color' => null],
                ['dq' => -2, 'dr' => 1, 'type' => 'island', 'attribute' => 'temple', 'color' => null],
            ],
        ],
    ];

    // =========================================================================
    // 11-Hex Clusters (3 variants)
    // =========================================================================

    const CLUSTER_11_HEXES = [
        'cluster-11-0' => [
            'id' => 'cluster-11-0',
            'size' => 11,
            'variant' => 0,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'island', 'attribute' => 'monster', 'color' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
                ['dq' => -2, 'dr' => 2, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => -1, 'dr' => 2, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
                ['dq' => -2, 'dr' => 3, 'type' => 'island', 'attribute' => 'temple', 'color' => null],
                ['dq' => -1, 'dr' => 3, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
            ],
        ],
        'cluster-11-1' => [
            'id' => 'cluster-11-1',
            'size' => 11,
            'variant' => 1,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'island', 'attribute' => 'monster', 'color' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'offering', 'color' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => -2, 'dr' => 2, 'type' => 'water', 'color' => 'black', 'attribute' => null],
                ['dq' => -1, 'dr' => 2, 'type' => 'water', 'color' => 'blue', 'attribute' => null],
                ['dq' => -2, 'dr' => 3, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => -1, 'dr' => 3, 'type' => 'island', 'attribute' => 'statue', 'color' => null],
            ],
        ],
        'cluster-11-2' => [
            'id' => 'cluster-11-2',
            'size' => 11,
            'variant' => 2,
            'hexes' => [
                ['dq' => 0, 'dr' => 0, 'type' => 'water', 'color' => 'red', 'attribute' => null],
                ['dq' => 1, 'dr' => -1, 'type' => 'island', 'attribute' => 'offering', 'color' => null],
                ['dq' => 1, 'dr' => 0, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => 0, 'dr' => 1, 'type' => 'island', 'attribute' => 'temple', 'color' => null],
                ['dq' => -1, 'dr' => 1, 'type' => 'water', 'color' => 'yellow', 'attribute' => null],
                ['dq' => -1, 'dr' => 0, 'type' => 'island', 'attribute' => 'statue', 'color' => null],
                ['dq' => 0, 'dr' => -1, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
                ['dq' => -2, 'dr' => 2, 'type' => 'island', 'attribute' => 'shrine', 'color' => null],
                ['dq' => -1, 'dr' => 2, 'type' => 'water', 'color' => 'green', 'attribute' => null],
                ['dq' => -2, 'dr' => 3, 'type' => 'water', 'color' => 'pink', 'attribute' => null],
                ['dq' => -1, 'dr' => 3, 'type' => 'island', 'attribute' => 'monster', 'color' => null],
            ],
        ],
    ];
}
