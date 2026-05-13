/**
 * ClusterDefinitions.js - Hex cluster definitions for The Oracle of Delphi
 *
 * Defines the shape and content of multi-hex board pieces (clusters).
 * Uses relative axial coordinates (dq, dr) from an anchor hex at (0, 0).
 *
 * Coordinate System:
 * - Pointy-topped hexagons with axial coordinates (q, r)
 * - Anchor hex is always at relative (0, 0)
 * - All other hexes defined relative to anchor
 *
 * Direction reference (pointy-top):
 *            /\
 *    NW (0,-1)  NE (1,-1)
 *          |      |
 *   W (-1,0)      E (1,0)
 *          |      |
 *    SW (-1,1)  SE (0,1)
 *            \/
 */

define([
    "dojo",
    "dojo/_base/declare",
], function (dojo, declare) {

    // =========================================================================
    // Constants
    // =========================================================================

    const HexType = {
        WATER: 'water',
        ISLAND: 'island',
        SHALLOWS: 'shallows'
    };

    const IslandAttribute = {
        NONE: null,
        STATUE: 'statue',
        MONSTER: 'monster',
        TWO_MONSTER: 'two_monster',
        SHRINE: 'shrine',
        OFFERING: 'offering',
        TEMPLE: 'temple',
        CITY: 'city'
    };

    const WaterColor = {
        RED: 'red',
        YELLOW: 'yellow',
        GREEN: 'green',
        BLUE: 'blue',
        PINK: 'pink',
        BLACK: 'black'
    };

    // Direction vectors for pointy-top hexagons (axial coordinates)
    // Edges point to NE, E, SE, SW, W, NW (vertices point N and S)
    const DIRECTIONS = {
        NW: { dq: 0,  dr: -1, name: 'NW', opposite: 'SE' },
        NE: { dq: 1,  dr: -1, name: 'NE', opposite: 'SW' },
        E:  { dq: 1,  dr: 0,  name: 'E',  opposite: 'W'  },
        SE: { dq: 0,  dr: 1,  name: 'SE', opposite: 'NW' },
        SW: { dq: -1, dr: 1,  name: 'SW', opposite: 'NE' },
        W:  { dq: -1, dr: 0,  name: 'W',  opposite: 'E'  }
    };

    const DIRECTION_LIST = [
        DIRECTIONS.NW, DIRECTIONS.NE, DIRECTIONS.E,
        DIRECTIONS.SE, DIRECTIONS.SW, DIRECTIONS.W
    ];

    // =========================================================================
    // Cluster Definitions
    // =========================================================================

    // -------------------------------------------------------------------------
    // 3-Hex City Clusters (one per color)
    // Shape (pointy-top): Vertical triangle
    // -------------------------------------------------------------------------

    const CLUSTER_3_HEXES = {
        'city-red': {
            id: 'city-red',
            size: 3,
            color: 'red',
            hexes: [
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.CITY },
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.PINK, attribute: null }
            ],
            imagePath: 'img/cluster-3-hexes/cluster-red.webp',
            imagePathAlt: 'img/cluster-3-hexes-alternate/cluster-red.webp'
        },
        'city-yellow': {
            id: 'city-yellow',
            size: 3,
            color: 'yellow',
            hexes: [
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.CITY },
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.GREEN, attribute: null }
            ],
            imagePath: 'img/cluster-3-hexes/cluster-yellow.webp',
            imagePathAlt: 'img/cluster-3-hexes-alternate/cluster-yellow.webp'
        },
        'city-green': {
            id: 'city-green',
            size: 3,
            color: 'green',
            hexes: [
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.CITY },
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.BLUE, attribute: null }
            ],
            imagePath: 'img/cluster-3-hexes/cluster-green.webp',
            imagePathAlt: 'img/cluster-3-hexes-alternate/cluster-green.webp'
        },
        'city-blue': {
            id: 'city-blue',
            size: 3,
            color: 'blue',
            hexes: [
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.CITY },
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.GREEN, attribute: null }
            ],
            imagePath: 'img/cluster-3-hexes/cluster-blue.webp',
            imagePathAlt: 'img/cluster-3-hexes-alternate/cluster-blue.webp'
        },
        'city-pink': {
            id: 'city-pink',
            size: 3,
            color: 'pink',
            hexes: [
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.CITY },
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.BLUE, attribute: null }
            ],
            imagePath: 'img/cluster-3-hexes/cluster-pink.webp',
            imagePathAlt: 'img/cluster-3-hexes-alternate/cluster-pink.webp'
        },
        'city-black': {
            id: 'city-black',
            size: 3,
            color: 'black',
            hexes: [
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.CITY },
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.PINK, attribute: null }
            ],
            imagePath: 'img/cluster-3-hexes/cluster-black.webp',
            imagePathAlt: 'img/cluster-3-hexes-alternate/cluster-black.webp'
        }
    };

    // -------------------------------------------------------------------------
    // 7-Hex Clusters (6 variants)
    // Shape (pointy-top): Hexagonal ring + center
    // -------------------------------------------------------------------------

    const CLUSTER_7_HEXES = {
        'cluster-7-0': {
            id: 'cluster-7-0',
            size: 7,
            variant: 0,
            hexes: [
                { dq: 0, dr: 0, type: HexType.SHALLOWS, attribute: null },
                { dq: 1, dr: -1, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: 0, dr: 1, type: HexType.WATER, color: WaterColor.PINK, attribute: null },
                { dq: -1, dr: 1, type: HexType.WATER, color: WaterColor.BLUE, attribute: null },
                { dq: -1, dr: 0, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: 0, dr: -1, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null }
            ],
            imagePath: 'img/cluster-7-hexes/cluster-0.webp',
            imagePathAlt: 'img/cluster-7-hexes-alternate/cluster-0.webp'
        },
        'cluster-7-1': {
            id: 'cluster-7-1',
            size: 7,
            variant: 1,
            hexes: [
                { dq: 0, dr: 0, type: HexType.SHALLOWS, attribute: null },
                { dq: 1, dr: -1, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.BLUE, attribute: null },
                { dq: 0, dr: 1, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: -1, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.MONSTER },
                { dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'green' },
                { dq: 0, dr: -1, type: HexType.WATER, color: WaterColor.PINK, attribute: null }
            ],
            imagePath: 'img/cluster-7-hexes/cluster-1.webp',
            imagePathAlt: 'img/cluster-7-hexes-alternate/cluster-1.webp'
        },
        'cluster-7-2': {
            id: 'cluster-7-2',
            size: 7,
            variant: 2,
            hexes: [
                { dq: 0, dr: 0, type: HexType.SHALLOWS, attribute: null },
                { dq: 1, dr: -1, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: 0, dr: 1, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: -1, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.OFFERING },
                { dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'green' },
                { dq: 0, dr: -1, type: HexType.WATER, color: WaterColor.BLACK, attribute: null }
            ],
            imagePath: 'img/cluster-7-hexes/cluster-2.webp',
            imagePathAlt: 'img/cluster-7-hexes-alternate/cluster-2.webp'
        },
        'cluster-7-3': {
            id: 'cluster-7-3',
            size: 7,
            variant: 3,
            hexes: [
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: 1, dr: -1, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: 0, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.TEMPLE },
                { dq: -1, dr: 1, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.TWO_MONSTER },
                { dq: 0, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'black' },
                { dq: 1, dr: -2, type: HexType.WATER, color: WaterColor.PINK, attribute: null }
            ],
            imagePath: 'img/cluster-7-hexes/cluster-3.webp',
            imagePathAlt: 'img/cluster-7-hexes-alternate/cluster-3.webp'
        },
        'cluster-7-4': {
            id: 'cluster-7-4',
            size: 7,
            variant: 4,
            hexes: [
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: 1, dr: -1, type: HexType.WATER, color: WaterColor.BLUE, attribute: null },
                { dq: 0, dr: 1, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: -1, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.MONSTER },
                { dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'blue' },
                { dq: 0, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.TEMPLE },
                { dq: 1, dr: -2, type: HexType.WATER, color: WaterColor.BLACK, attribute: null }

            ],
            imagePath: 'img/cluster-7-hexes/cluster-4.webp',
            imagePathAlt: 'img/cluster-7-hexes-alternate/cluster-4.webp'
        },
        'cluster-7-5': {
            id: 'cluster-7-5',
            size: 7,
            variant: 5,
            hexes: [
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.TEMPLE },
                { dq: 0, dr: 1, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: -1, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.STATUE },
                { dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'blue' },
                { dq: 0, dr: -1, type: HexType.WATER, color: WaterColor.BLUE, attribute: null },
                { dq: 1, dr: -2, type: HexType.ISLAND, attribute: IslandAttribute.TWO_MONSTER }

            ],
            imagePath: 'img/cluster-7-hexes/cluster-5.webp',
            imagePathAlt: 'img/cluster-7-hexes-alternate/cluster-5.webp'
        }
    };

    // -------------------------------------------------------------------------
    // 9-Hex Clusters (3 variants)
    // Shape (pointy-top): 3x3 grid offset by row
    // -------------------------------------------------------------------------

    const CLUSTER_9_HEXES = {
        'cluster-9-0': {
            id: 'cluster-9-0',
            size: 9,
            variant: 0,
            hexes: [
                { dq: 0, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'yellow' },
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.STATUE },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: 0, dr: 1, type: HexType.WATER, color: WaterColor.PINK, attribute: null },
                { dq: -1, dr: 1, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: -1, dr: 0, type: HexType.WATER, color: WaterColor.BLUE, attribute: null },
                { dq: 0, dr: -1, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: -1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.OFFERING },
                { dq: -2, dr: 1, type: HexType.WATER, color: WaterColor.PINK, attribute: null }
            ],
            imagePath: 'img/cluster-9-hexes/cluster-0.webp',
            imagePathAlt: 'img/cluster-9-hexes-alternate/cluster-0.webp'
        },
        'cluster-9-1': {
            id: 'cluster-9-1',
            size: 9,
            variant: 1,
            hexes: [
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.PINK, attribute: null },
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.TWO_MONSTER },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: 0, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.OFFERING },
                { dq: -1, dr: 1, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: -1, dr: 0, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: 0, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'black' },
                { dq: -1, dr: -1, type: HexType.WATER, color: WaterColor.PINK, attribute: null },
                { dq: -2, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.STATUE }
            ],
            imagePath: 'img/cluster-9-hexes/cluster-1.webp',
            imagePathAlt: 'img/cluster-9-hexes-alternate/cluster-1.webp'
        },
        'cluster-9-2': {
            id: 'cluster-9-2',
            size: 9,
            variant: 2,
            hexes: [
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'red' },
                { dq: 1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.OFFERING },
                { dq: 0, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.MONSTER },
                { dq: -1, dr: 1, type: HexType.WATER, color: WaterColor.BLUE, attribute: null },
                { dq: -1, dr: 0, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: 0, dr: -1, type: HexType.WATER, color: WaterColor.PINK, attribute: null },
                { dq: -1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.STATUE },
                { dq: -2, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.TEMPLE }
            ],
            imagePath: 'img/cluster-9-hexes/cluster-2.webp',
            imagePathAlt: 'img/cluster-9-hexes-alternate/cluster-2.webp'
        }
    };

    // -------------------------------------------------------------------------
    // 11-Hex Clusters (3 variants)
    // Shape (pointy-top): Irregular blob
    // -------------------------------------------------------------------------

    const CLUSTER_11_HEXES = {
        'cluster-11-0': {
            id: 'cluster-11-0',
            size: 11,
            variant: 0,
            hexes: [
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: 1, dr: -1, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: 0, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.MONSTER },
                { dq: -1, dr: 1, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'red' },
                { dq: 0, dr: -1, type: HexType.WATER, color: WaterColor.BLUE, attribute: null },
                { dq: -2, dr: 2, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: -1, dr: 2, type: HexType.WATER, color: WaterColor.BLUE, attribute: null },
                { dq: -2, dr: 3, type: HexType.ISLAND, attribute: IslandAttribute.TEMPLE },
                { dq: -1, dr: 3, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'pink' }
            ],
            imagePath: 'img/cluster-11-hexes/cluster-0.webp',
            imagePathAlt: 'img/cluster-11-hexes-alternate/cluster-0.webp'
        },
        'cluster-11-1': {
            id: 'cluster-11-1',
            size: 11,
            variant: 1,
            hexes: [
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.PINK, attribute: null },
                { dq: 1, dr: -1, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: 1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'yellow' },
                { dq: 0, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.MONSTER },
                { dq: -1, dr: 1, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.OFFERING },
                { dq: 0, dr: -1, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: -2, dr: 2, type: HexType.WATER, color: WaterColor.BLACK, attribute: null },
                { dq: -1, dr: 2, type: HexType.WATER, color: WaterColor.BLUE, attribute: null },
                { dq: -2, dr: 3, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: -1, dr: 3, type: HexType.ISLAND, attribute: IslandAttribute.STATUE }
            ],
            imagePath: 'img/cluster-11-hexes/cluster-1.webp',
            imagePathAlt: 'img/cluster-11-hexes-alternate/cluster-1.webp'
        },
        'cluster-11-2': {
            id: 'cluster-11-2',
            size: 11,
            variant: 2,
            hexes: [
                { dq: 0, dr: 0, type: HexType.WATER, color: WaterColor.RED, attribute: null },
                { dq: 1, dr: -1, type: HexType.ISLAND, attribute: IslandAttribute.OFFERING },
                { dq: 1, dr: 0, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: 0, dr: 1, type: HexType.ISLAND, attribute: IslandAttribute.TEMPLE },
                { dq: -1, dr: 1, type: HexType.WATER, color: WaterColor.YELLOW, attribute: null },
                { dq: -1, dr: 0, type: HexType.ISLAND, attribute: IslandAttribute.STATUE },
                { dq: 0, dr: -1, type: HexType.WATER, color: WaterColor.PINK, attribute: null },
                { dq: -2, dr: 2, type: HexType.ISLAND, attribute: IslandAttribute.SHRINE, explorationColor: 'pink' },
                { dq: -1, dr: 2, type: HexType.WATER, color: WaterColor.GREEN, attribute: null },
                { dq: -2, dr: 3, type: HexType.WATER, color: WaterColor.PINK, attribute: null },
                { dq: -1, dr: 3, type: HexType.ISLAND, attribute: IslandAttribute.MONSTER }
            ],
            imagePath: 'img/cluster-11-hexes/cluster-2.webp',
            imagePathAlt: 'img/cluster-11-hexes-alternate/cluster-2.webp'
        }
    };

    // =========================================================================
    // ClusterDefinitions Class
    // =========================================================================

    return declare(null, {

        // Expose constants
        HexType: HexType,
        IslandAttribute: IslandAttribute,
        WaterColor: WaterColor,
        DIRECTIONS: DIRECTIONS,
        DIRECTION_LIST: DIRECTION_LIST,

        constructor: function() {
            this.clusters = {
                ...CLUSTER_3_HEXES,
                ...CLUSTER_7_HEXES,
                ...CLUSTER_9_HEXES,
                ...CLUSTER_11_HEXES
            };
        },

        /**
         * Get a cluster definition by ID
         */
        getCluster: function(clusterId) {
            return this.clusters[clusterId] || null;
        },

        /**
         * Get all clusters of a specific size
         */
        getClustersBySize: function(size) {
            return Object.values(this.clusters).filter(c => c.size === size);
        },

        /**
         * Get all city clusters (3-hex)
         */
        getCityClusters: function() {
            return Object.values(CLUSTER_3_HEXES);
        },

        /**
         * Get all island clusters (non-city)
         */
        getIslandClusters: function() {
            return [
                ...Object.values(CLUSTER_7_HEXES),
                ...Object.values(CLUSTER_9_HEXES),
                ...Object.values(CLUSTER_11_HEXES)
            ];
        },

        /**
         * Rotate a hex position around origin by 60° * steps (clockwise)
         */
        rotateHex: function(dq, dr, steps) {
            steps = ((steps % 6) + 6) % 6;
            if (steps === 0) return { dq, dr };

            let x = dq, z = dr, y = -x - z;

            for (let i = 0; i < steps; i++) {
                const newX = -z;
                const newY = -x;
                const newZ = -y;
                x = newX;
                y = newY;
                z = newZ;
            }

            return { dq: x, dr: z };
        },

        /**
         * Get rotated cluster hexes
         */
        getRotatedHexes: function(cluster, rotation) {
            return cluster.hexes.map(hex => ({
                ...hex,
                ...this.rotateHex(hex.dq, hex.dr, rotation)
            }));
        },

        /**
         * Get world coordinates for a placed cluster
         */
        getWorldHexes: function(cluster, anchorQ, anchorR, rotation) {
            const rotatedHexes = this.getRotatedHexes(cluster, rotation || 0);
            return rotatedHexes.map(hex => ({
                q: anchorQ + hex.dq,
                r: anchorR + hex.dr,
                type: hex.type,
                color: hex.color,
                attribute: hex.attribute
            }));
        },

        /**
         * Compute boundary edges (edges not shared with other hexes in cluster)
         */
        computeBoundaryEdges: function(cluster, rotation) {
            const rotatedHexes = this.getRotatedHexes(cluster, rotation || 0);
            const hexSet = new Set(rotatedHexes.map(h => `${h.dq},${h.dr}`));
            const boundaries = [];

            for (const hex of rotatedHexes) {
                for (const dir of DIRECTION_LIST) {
                    const neighborKey = `${hex.dq + dir.dq},${hex.dr + dir.dr}`;
                    if (!hexSet.has(neighborKey)) {
                        boundaries.push({
                            hex: { dq: hex.dq, dr: hex.dr },
                            direction: dir.name,
                            type: hex.type,
                            color: hex.color
                        });
                    }
                }
            }

            return boundaries;
        },

        /**
         * Normalize cluster so anchor is at minimum q, r position
         */
        normalizeCluster: function(hexes) {
            const minQ = Math.min(...hexes.map(h => h.dq));
            const minR = Math.min(...hexes.map(h => h.dr));

            return hexes.map(h => ({
                ...h,
                dq: h.dq - minQ,
                dr: h.dr - minR
            }));
        },

        /**
         * Calculate bounding box of a cluster
         */
        getBoundingBox: function(cluster, rotation) {
            const hexes = this.getRotatedHexes(cluster, rotation || 0);

            const minQ = Math.min(...hexes.map(h => h.dq));
            const maxQ = Math.max(...hexes.map(h => h.dq));
            const minR = Math.min(...hexes.map(h => h.dr));
            const maxR = Math.max(...hexes.map(h => h.dr));

            return {
                minQ, maxQ, minR, maxR,
                width: maxQ - minQ + 1,
                height: maxR - minR + 1
            };
        },

        /**
         * Check if two placed clusters overlap
         */
        clustersOverlap: function(cluster1, q1, r1, rot1, cluster2, q2, r2, rot2) {
            const hexes1 = this.getWorldHexes(cluster1, q1, r1, rot1);
            const hexes2 = this.getWorldHexes(cluster2, q2, r2, rot2);

            const set1 = new Set(hexes1.map(h => `${h.q},${h.r}`));

            for (const hex of hexes2) {
                if (set1.has(`${hex.q},${hex.r}`)) {
                    return true;
                }
            }

            return false;
        },

        /**
         * Find adjacent hexes between two placed clusters
         */
        findAdjacentHexes: function(cluster1, q1, r1, rot1, cluster2, q2, r2, rot2) {
            const hexes1 = this.getWorldHexes(cluster1, q1, r1, rot1);
            const hexes2 = this.getWorldHexes(cluster2, q2, r2, rot2);

            const set2 = new Map();
            hexes2.forEach(h => set2.set(`${h.q},${h.r}`, h));

            const adjacencies = [];

            for (const hex1 of hexes1) {
                for (const dir of DIRECTION_LIST) {
                    const neighborKey = `${hex1.q + dir.dq},${hex1.r + dir.dr}`;
                    if (set2.has(neighborKey)) {
                        adjacencies.push({
                            hex1: hex1,
                            hex2: set2.get(neighborKey),
                            direction: dir.name
                        });
                    }
                }
            }

            return adjacencies;
        },

        /**
         * Get all hexes with a specific attribute
         */
        getHexesByAttribute: function(cluster, attribute) {
            return cluster.hexes.filter(h => h.attribute === attribute);
        },

        /**
         * Get all water hexes of a specific color
         */
        getWaterHexesByColor: function(cluster, color) {
            return cluster.hexes.filter(h =>
                h.type === HexType.WATER && h.color === color
            );
        }
    });
});
