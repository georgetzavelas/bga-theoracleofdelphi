/**
 * BoardBuilder.js - Algorithm to construct a valid game board for The Oracle of Delphi
 *
 * Rules:
 * 1. Place 12 island clusters (mix of 7, 9, and 11 hex sizes)
 * 2. All water spaces must form a single connected water area
 * 3. Gaps between clusters become "shallows" (impassable)
 * 4. Place 6 city tiles (3-hex) approximately equidistantly around the board
 * 5. City tile water hexes must touch water hexes of other clusters
 *
 * Features:
 * - Random rotation for each cluster placement
 * - Backtracking when placement fails
 * - Multiple retry attempts for full board generation
 */

define([
    "dojo",
    "dojo/_base/declare",
], function (dojo, declare) {

    return declare(null, {

        clusterDefs: null,
        placedClusters: null,
        occupiedHexes: null,
        waterHexes: null,

        // Configuration
        maxBuildAttempts: 50,      // How many times to retry full board generation
        maxBacktrackDepth: 5,      // How many clusters to backtrack when stuck

        constructor: function(clusterDefinitions, options) {
            this.clusterDefs = clusterDefinitions;

            if (options) {
                if (options.maxBuildAttempts) this.maxBuildAttempts = options.maxBuildAttempts;
                if (options.maxBacktrackDepth) this.maxBacktrackDepth = options.maxBacktrackDepth;
            }

            this.reset();
        },

        /**
         * Reset the builder state
         */
        reset: function() {
            this.placedClusters = [];
            this.occupiedHexes = new Map(); // "q,r" -> hex data
            this.waterHexes = new Set();    // "q,r" keys of water hexes
        },

        /**
         * Build a complete valid game board with retry logic
         * @returns {Object} { clusters: [...], hexes: [...], valid: boolean, attempts: number }
         */
        buildBoard: function() {
            for (let attempt = 1; attempt <= this.maxBuildAttempts; attempt++) {

                this.reset();

                // Step 1: Get the island clusters (7, 9, 11 hex)
                const islandClusters = this.selectIslandClusters();

                // Step 2: Place island clusters with backtracking
                const islandSuccess = this.placeIslandClustersWithBacktracking(islandClusters);
                if (!islandSuccess) {
                    console.warn(`Attempt ${attempt}: Failed to place all island clusters`);
                    continue;
                }

                // Step 3: Place city tiles equidistantly around the board
                const citySuccess = this.placeCityTilesWithBacktracking();
                if (!citySuccess) {
                    console.warn(`Attempt ${attempt}: Failed to place all city tiles`);
                    continue;
                }

                // Step 4: Validate the board
                const valid = this.validateBoard();
                if (valid) {

                    // Find Zeus token position (shallows hex of cluster-7-0)
                    const zeusPosition = this.findZeusPosition();

                    return {
                        clusters: this.placedClusters,
                        hexes: this.getAllHexes(),
                        zeusPosition: zeusPosition,
                        valid: true,
                        attempts: attempt
                    };
                }
            }

            console.error(`Failed to build valid board after ${this.maxBuildAttempts} attempts`);
            return {
                clusters: this.placedClusters,
                hexes: this.getAllHexes(),
                valid: false,
                attempts: this.maxBuildAttempts
            };
        },

        /**
         * Select 12 island clusters (mix of 7, 9, 11 hex sizes)
         * cluster-7-0 is always included and placed first (contains Zeus shallows)
         */
        selectIslandClusters: function() {
            const clusters7 = this.clusterDefs.getClustersBySize(7);
            const clusters9 = this.clusterDefs.getClustersBySize(9);
            const clusters11 = this.clusterDefs.getClustersBySize(11);


            // cluster-7-0 must always be included (it has the Zeus shallows hex)
            const zeusCluster = this.clusterDefs.getCluster('cluster-7-0');
            if (!zeusCluster) {
                console.error('cluster-7-0 not found! Zeus token placement will fail.');
            }

            // Filter out cluster-7-0 from the 7-hex clusters since we'll add it separately
            const otherClusters7 = clusters7.filter(c => c.id !== 'cluster-7-0');

            // Shuffle each size group
            this.shuffleArray(otherClusters7);
            this.shuffleArray(clusters9);
            this.shuffleArray(clusters11);

            // Select clusters - typical distribution: 6x7-hex, 3x9-hex, 3x11-hex = 12 total
            // cluster-7-0 is always first, then 5 more 7-hex clusters
            const selected = [
                zeusCluster,  // Always first - contains Zeus shallows
                ...otherClusters7.slice(0, 5),
                ...clusters9.slice(0, 3),
                ...clusters11.slice(0, 3)
            ];

            // Shuffle only the clusters after the first one (keep Zeus cluster first)
            const rest = selected.slice(1);
            this.shuffleArray(rest);

            return [selected[0], ...rest];
        },

        /**
         * Place island clusters with backtracking support
         */
        placeIslandClustersWithBacktracking: function(clusters) {
            // Place first cluster at origin with random rotation
            const firstCluster = clusters[0];
            const firstRotation = this.randomRotation();
            this.placeCluster(firstCluster, 0, 0, firstRotation);

            // Track placement history for backtracking
            const placementStack = [{
                clusterIndex: 0,
                cluster: firstCluster,
                anchorQ: 0,
                anchorR: 0,
                rotation: firstRotation,
                triedPositions: new Set([`0,0,${firstRotation}`])
            }];

            let currentIndex = 1;

            while (currentIndex < clusters.length) {
                const cluster = clusters[currentIndex];
                const placement = this.findPlacementWithHistory(cluster, placementStack);

                if (placement) {
                    // Successfully placed
                    this.placeCluster(cluster, placement.q, placement.r, placement.rotation);
                    placementStack.push({
                        clusterIndex: currentIndex,
                        cluster: cluster,
                        anchorQ: placement.q,
                        anchorR: placement.r,
                        rotation: placement.rotation,
                        triedPositions: placement.triedPositions
                    });
                    currentIndex++;
                } else {
                    // Failed to place - backtrack
                    const backtrackSuccess = this.backtrack(placementStack, clusters, currentIndex);
                    if (!backtrackSuccess) {
                        console.warn('Backtracking failed - no valid placements found');
                        return false;
                    }
                    currentIndex = placementStack.length;
                }
            }

            return true;
        },

        /**
         * Find a placement for a cluster, tracking tried positions
         */
        findPlacementWithHistory: function(cluster, placementStack, excludePositions) {
            const triedPositions = excludePositions || new Set();
            const candidates = this.findConnectionCandidates(cluster);

            // Shuffle for randomness
            this.shuffleArray(candidates);

            for (const candidate of candidates) {
                const key = `${candidate.q},${candidate.r},${candidate.rotation}`;

                if (triedPositions.has(key)) {
                    continue;
                }

                triedPositions.add(key);

                if (this.canPlaceCluster(cluster, candidate.q, candidate.r, candidate.rotation)) {
                    if (this.wouldMaintainWaterConnectivity(cluster, candidate.q, candidate.r, candidate.rotation)) {
                        return {
                            q: candidate.q,
                            r: candidate.r,
                            rotation: candidate.rotation,
                            triedPositions: triedPositions
                        };
                    }
                }
            }

            return null;
        },

        /**
         * Backtrack by removing placed clusters and trying alternatives
         */
        backtrack: function(placementStack, clusters, failedIndex) {
            const maxBacktrack = Math.min(this.maxBacktrackDepth, placementStack.length - 1);

            for (let backtrackCount = 1; backtrackCount <= maxBacktrack; backtrackCount++) {
                // Remove the last N placements
                const removedPlacements = [];
                for (let i = 0; i < backtrackCount; i++) {
                    if (placementStack.length <= 1) break; // Keep at least the first cluster

                    const removed = placementStack.pop();
                    removedPlacements.unshift(removed);
                    this.removeCluster(removed);
                }

                // Try to find alternative placement for the cluster we backtracked to
                const retryIndex = placementStack.length;
                if (retryIndex < clusters.length) {
                    const retryCluster = clusters[retryIndex];

                    // Get the tried positions from the previous attempt at this index
                    const previousTried = removedPlacements.length > 0
                        ? removedPlacements[0].triedPositions
                        : new Set();

                    const newPlacement = this.findPlacementWithHistory(retryCluster, placementStack, previousTried);

                    if (newPlacement) {
                        this.placeCluster(retryCluster, newPlacement.q, newPlacement.r, newPlacement.rotation);
                        placementStack.push({
                            clusterIndex: retryIndex,
                            cluster: retryCluster,
                            anchorQ: newPlacement.q,
                            anchorR: newPlacement.r,
                            rotation: newPlacement.rotation,
                            triedPositions: newPlacement.triedPositions
                        });
                        return true;
                    }
                }

                // Restore removed placements if backtrack didn't help
                for (const removed of removedPlacements) {
                    this.placeCluster(removed.cluster, removed.anchorQ, removed.anchorR, removed.rotation);
                    placementStack.push(removed);
                }
            }

            return false;
        },

        /**
         * Remove a cluster from the board
         */
        removeCluster: function(placementInfo) {
            // Remove from placedClusters
            const idx = this.placedClusters.findIndex(p =>
                p.cluster.id === placementInfo.cluster.id &&
                p.anchorQ === placementInfo.anchorQ &&
                p.anchorR === placementInfo.anchorR
            );
            if (idx >= 0) {
                this.placedClusters.splice(idx, 1);
            }

            // Remove hexes
            const worldHexes = this.clusterDefs.getWorldHexes(
                placementInfo.cluster,
                placementInfo.anchorQ,
                placementInfo.anchorR,
                placementInfo.rotation
            );

            for (const hex of worldHexes) {
                const key = `${hex.q},${hex.r}`;
                this.occupiedHexes.delete(key);
                this.waterHexes.delete(key);
            }
        },

        /**
         * Find candidate positions where a cluster could connect to existing water
         * Each candidate gets a random rotation
         */
        findConnectionCandidates: function(cluster) {
            const candidates = [];
            const checked = new Set();

            // For each existing water hex, try placing the new cluster adjacent
            for (const waterKey of this.waterHexes) {
                const [wq, wr] = waterKey.split(',').map(Number);

                // Try each rotation
                for (let rotation = 0; rotation < 6; rotation++) {
                    const clusterWaterHexes = this.getClusterWaterHexes(cluster, rotation);

                    // For each water hex in the new cluster
                    for (const clusterWater of clusterWaterHexes) {
                        // Try to position so this water hex is adjacent to existing water
                        for (const dir of this.clusterDefs.DIRECTION_LIST) {
                            const anchorQ = wq + dir.dq - clusterWater.dq;
                            const anchorR = wr + dir.dr - clusterWater.dr;

                            const key = `${anchorQ},${anchorR},${rotation}`;
                            if (!checked.has(key)) {
                                checked.add(key);
                                candidates.push({ q: anchorQ, r: anchorR, rotation });
                            }
                        }
                    }
                }
            }

            return candidates;
        },

        /**
         * Get water hexes from a cluster definition with rotation applied
         */
        getClusterWaterHexes: function(cluster, rotation) {
            const rotated = this.clusterDefs.getRotatedHexes(cluster, rotation);
            return rotated.filter(h => h.type === 'water');
        },

        /**
         * Check if a cluster can be placed at the given position
         */
        canPlaceCluster: function(cluster, anchorQ, anchorR, rotation) {
            const worldHexes = this.clusterDefs.getWorldHexes(cluster, anchorQ, anchorR, rotation);

            for (const hex of worldHexes) {
                const key = `${hex.q},${hex.r}`;
                if (this.occupiedHexes.has(key)) {
                    return false;
                }
            }

            return true;
        },

        /**
         * Check if placing a cluster would maintain a single connected water area
         * Requires at least 2 adjacent hex pairs between the new cluster and existing clusters
         */
        wouldMaintainWaterConnectivity: function(cluster, anchorQ, anchorR, rotation) {
            const worldHexes = this.clusterDefs.getWorldHexes(cluster, anchorQ, anchorR, rotation);
            const newWaterHexes = worldHexes.filter(h => h.type === 'water');

            if (newWaterHexes.length === 0) {
                return true;
            }

            // Count how many hex pairs touch existing water
            let connectionCount = 0;
            for (const newWater of newWaterHexes) {
                for (const dir of this.clusterDefs.DIRECTION_LIST) {
                    const neighborKey = `${newWater.q + dir.dq},${newWater.r + dir.dr}`;
                    if (this.waterHexes.has(neighborKey)) {
                        connectionCount++;
                    }
                }
            }

            // Require at least 2 adjacent hex pairs
            return connectionCount >= 2;
        },

        /**
         * Actually place a cluster on the board
         */
        placeCluster: function(cluster, anchorQ, anchorR, rotation) {
            const worldHexes = this.clusterDefs.getWorldHexes(cluster, anchorQ, anchorR, rotation);

            this.placedClusters.push({
                cluster: cluster,
                anchorQ: anchorQ,
                anchorR: anchorR,
                rotation: rotation,
                hexes: worldHexes
            });

            for (const hex of worldHexes) {
                const key = `${hex.q},${hex.r}`;
                this.occupiedHexes.set(key, hex);

                if (hex.type === 'water') {
                    this.waterHexes.add(key);
                }
            }
        },

        /**
         * Place 6 city tiles with backtracking support
         * Cities are placed around the perimeter, attempting even distribution
         */
        placeCityTilesWithBacktracking: function() {
            const cityTiles = this.clusterDefs.getCityClusters();
            this.shuffleArray(cityTiles); // Randomize city order

            const bounds = this.getBoardBounds();
            const center = {
                q: (bounds.minQ + bounds.maxQ) / 2,
                r: (bounds.minR + bounds.maxR) / 2
            };

            const cityPlacements = [];

            for (let i = 0; i < 6; i++) {
                const cityTile = cityTiles[i];

                // Get candidates specific to this city tile
                const cityCandidates = this.getCityCandidates(cityTile);

                const placement = this.findCityPlacementFromCandidates(cityTile, cityCandidates, cityPlacements, center);

                if (!placement) {
                    // Try backtracking on city placements
                    const backtrackSuccess = this.backtrackCitiesNew(cityPlacements, cityTiles, i, center);
                    if (!backtrackSuccess) {
                        console.warn(`Failed to place city tile ${cityTile.id}`);
                        return false;
                    }
                    i = cityPlacements.length - 1; // Resume from where backtrack succeeded
                    continue;
                }

                this.placeCluster(cityTile, placement.q, placement.r, placement.rotation);
                cityPlacements.push({
                    cityIndex: i,
                    cityTile: cityTile,
                    anchorQ: placement.q,
                    anchorR: placement.r,
                    rotation: placement.rotation,
                    triedPositions: placement.triedPositions
                });
            }

            return true;
        },

        /**
         * Get candidate anchor positions for city tiles that would connect to existing water
         * Uses same approach as findConnectionCandidates - calculates where anchor needs to be
         * for city water hexes to be adjacent to existing edge water
         */
        getCityCandidates: function(cityTile) {
            const candidates = [];
            const checked = new Set();

            // Find water hexes that are on the edge (have at least one non-occupied neighbor)
            const edgeWaterHexes = [];
            for (const waterKey of this.waterHexes) {
                const [wq, wr] = waterKey.split(',').map(Number);
                let hasEmptyNeighbor = false;
                for (const dir of this.clusterDefs.DIRECTION_LIST) {
                    const neighborKey = `${wq + dir.dq},${wr + dir.dr}`;
                    if (!this.occupiedHexes.has(neighborKey)) {
                        hasEmptyNeighbor = true;
                        break;
                    }
                }
                if (hasEmptyNeighbor) {
                    edgeWaterHexes.push({ q: wq, r: wr });
                }
            }

            // For each rotation, get the city's water hexes' positions relative to anchor
            for (let rotation = 0; rotation < 6; rotation++) {
                const cityWaterHexes = this.getClusterWaterHexes(cityTile, rotation);

                // For each city water hex offset
                for (const cityWater of cityWaterHexes) {
                    // For each edge water hex, try to position so city water is adjacent to it
                    for (const edgeWater of edgeWaterHexes) {
                        for (const dir of this.clusterDefs.DIRECTION_LIST) {
                            // Calculate anchor position such that cityWater ends up adjacent to edgeWater
                            const anchorQ = edgeWater.q - dir.dq - cityWater.dq;
                            const anchorR = edgeWater.r - dir.dr - cityWater.dr;

                            const key = `${anchorQ},${anchorR},${rotation}`;
                            if (!checked.has(key)) {
                                checked.add(key);
                                candidates.push({ q: anchorQ, r: anchorR, rotation });
                            }
                        }
                    }
                }
            }

            return candidates;
        },

        /**
         * Find placement for a city tile from pre-calculated candidates
         * Candidates already include rotation, so we just need to validate and pick
         */
        findCityPlacementFromCandidates: function(cityTile, candidates, existingPlacements, center, excludePositions) {
            const triedPositions = excludePositions || new Set();
            const minCityDistance = 5; // Minimum hex distance between city anchors

            // Shuffle candidates for randomness
            const shuffledCandidates = [...candidates];
            this.shuffleArray(shuffledCandidates);

            // Sort candidates to prefer positions that are well-spaced from existing cities
            if (existingPlacements.length > 0) {
                shuffledCandidates.sort((a, b) => {
                    const minDistA = Math.min(...existingPlacements.map(p =>
                        this.hexDistance(a.q, a.r, p.anchorQ, p.anchorR)));
                    const minDistB = Math.min(...existingPlacements.map(p =>
                        this.hexDistance(b.q, b.r, p.anchorQ, p.anchorR)));
                    // Prefer positions farther from existing cities
                    return minDistB - minDistA;
                });
            }

            for (const candidate of shuffledCandidates) {
                const key = `${candidate.q},${candidate.r},${candidate.rotation}`;

                if (triedPositions.has(key)) continue;
                triedPositions.add(key);

                // Check minimum distance from other cities
                let tooClose = false;
                for (const existing of existingPlacements) {
                    const dist = this.hexDistance(candidate.q, candidate.r, existing.anchorQ, existing.anchorR);
                    if (dist < minCityDistance) {
                        tooClose = true;
                        break;
                    }
                }
                if (tooClose) continue;

                if (this.canPlaceCluster(cityTile, candidate.q, candidate.r, candidate.rotation)) {
                    if (this.cityWaterTouchesExistingWater(cityTile, candidate.q, candidate.r, candidate.rotation)) {
                        return {
                            q: candidate.q,
                            r: candidate.r,
                            rotation: candidate.rotation,
                            triedPositions: triedPositions
                        };
                    }
                }
            }

            return null;
        },

        /**
         * Backtrack city placements
         */
        backtrackCitiesNew: function(cityPlacements, cityTiles, failedIndex, center) {
            const maxBacktrack = Math.min(3, cityPlacements.length);

            for (let backtrackCount = 1; backtrackCount <= maxBacktrack; backtrackCount++) {
                const removedPlacements = [];

                for (let i = 0; i < backtrackCount; i++) {
                    if (cityPlacements.length === 0) break;
                    const removed = cityPlacements.pop();
                    removedPlacements.unshift(removed);
                    // Convert cityTile property to cluster for removeCluster
                    this.removeCluster({
                        cluster: removed.cityTile,
                        anchorQ: removed.anchorQ,
                        anchorR: removed.anchorR,
                        rotation: removed.rotation
                    });
                }

                const retryIndex = cityPlacements.length;
                if (retryIndex < 6) {
                    const retryCityTile = cityTiles[retryIndex];
                    const previousTried = removedPlacements.length > 0
                        ? removedPlacements[0].triedPositions
                        : new Set();

                    // Get fresh candidates after backtracking
                    const cityCandidates = this.getCityCandidates(retryCityTile);
                    const newPlacement = this.findCityPlacementFromCandidates(
                        retryCityTile, cityCandidates, cityPlacements, center, previousTried
                    );

                    if (newPlacement) {
                        this.placeCluster(retryCityTile, newPlacement.q, newPlacement.r, newPlacement.rotation);
                        cityPlacements.push({
                            cityIndex: retryIndex,
                            cityTile: retryCityTile,
                            anchorQ: newPlacement.q,
                            anchorR: newPlacement.r,
                            rotation: newPlacement.rotation,
                            triedPositions: newPlacement.triedPositions
                        });
                        return true;
                    }
                }

                // Restore if this backtrack level didn't work
                for (const removed of removedPlacements) {
                    this.placeCluster(removed.cityTile, removed.anchorQ, removed.anchorR, removed.rotation);
                    cityPlacements.push(removed);
                }
            }

            return false;
        },

        /**
         * Find placement for a city tile near target position
         * Ensures minimum distance from other placed cities
         */
        findCityPlacement: function(cityTile, targetQ, targetR, existingPlacements, excludePositions) {
            const triedPositions = excludePositions || new Set();
            const minCityDistance = 5; // Minimum hex distance between city anchors

            for (let searchRadius = 0; searchRadius < 15; searchRadius++) {
                const positions = this.getHexesAtDistance(targetQ, targetR, searchRadius);
                this.shuffleArray(positions);

                for (const pos of positions) {
                    // Check minimum distance from other cities
                    let tooClose = false;
                    for (const existing of existingPlacements) {
                        const dist = this.hexDistance(pos.q, pos.r, existing.anchorQ, existing.anchorR);
                        if (dist < minCityDistance) {
                            tooClose = true;
                            break;
                        }
                    }
                    if (tooClose) continue;

                    // Try random rotation order
                    const rotations = [0, 1, 2, 3, 4, 5];
                    this.shuffleArray(rotations);

                    for (const rotation of rotations) {
                        const key = `${pos.q},${pos.r},${rotation}`;

                        if (triedPositions.has(key)) {
                            continue;
                        }

                        triedPositions.add(key);

                        if (this.canPlaceCluster(cityTile, pos.q, pos.r, rotation)) {
                            if (this.cityWaterTouchesExistingWater(cityTile, pos.q, pos.r, rotation)) {
                                return {
                                    q: pos.q,
                                    r: pos.r,
                                    rotation: rotation,
                                    triedPositions: triedPositions
                                };
                            }
                        }
                    }
                }
            }

            return null;
        },

        /**
         * Calculate hex distance between two positions
         */
        hexDistance: function(q1, r1, q2, r2) {
            return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
        },

        /**
         * Backtrack city placements
         */
        backtrackCities: function(cityPlacements, cityTiles, failedIndex, center, radius, startAngle) {
            const maxBacktrack = Math.min(3, cityPlacements.length);

            for (let backtrackCount = 1; backtrackCount <= maxBacktrack; backtrackCount++) {
                const removedPlacements = [];

                for (let i = 0; i < backtrackCount; i++) {
                    if (cityPlacements.length === 0) break;

                    const removed = cityPlacements.pop();
                    removedPlacements.unshift(removed);
                    this.removeCluster(removed);
                }

                // Retry from the backtracked position
                const retryIndex = cityPlacements.length;
                if (retryIndex < 6) {
                    const retryCityTile = cityTiles[retryIndex];
                    const angle = (startAngle + retryIndex * 60) * Math.PI / 180;
                    const targetQ = Math.round(center.q + radius * Math.cos(angle));
                    const targetR = Math.round(center.r + radius * Math.sin(angle));

                    const previousTried = removedPlacements.length > 0
                        ? removedPlacements[0].triedPositions
                        : new Set();

                    const newPlacement = this.findCityPlacement(retryCityTile, targetQ, targetR, cityPlacements, previousTried);

                    if (newPlacement) {
                        this.placeCluster(retryCityTile, newPlacement.q, newPlacement.r, newPlacement.rotation);
                        cityPlacements.push({
                            cityIndex: retryIndex,
                            cityTile: retryCityTile,
                            anchorQ: newPlacement.q,
                            anchorR: newPlacement.r,
                            rotation: newPlacement.rotation,
                            triedPositions: newPlacement.triedPositions
                        });
                        return true;
                    }
                }

                // Restore if backtrack didn't help
                for (const removed of removedPlacements) {
                    this.placeCluster(removed.cityTile, removed.anchorQ, removed.anchorR, removed.rotation);
                    cityPlacements.push(removed);
                }
            }

            return false;
        },

        /**
         * Check if a city tile's water hexes touch existing water hexes
         * Requires at least 2 adjacent hex pairs between the city and existing clusters
         * Also ensures the original top two edges (NW and NE at rotation 0) of the city hex are not connected
         */
        cityWaterTouchesExistingWater: function(cityTile, anchorQ, anchorR, rotation) {
            const worldHexes = this.clusterDefs.getWorldHexes(cityTile, anchorQ, anchorR, rotation);
            const cityWaterHexes = worldHexes.filter(h => h.type === 'water');

            // Find the city hex (anchor is the city hex at dq=0, dr=0)
            const cityHex = worldHexes.find(h => h.attribute === 'city');
            if (cityHex) {
                // The original top two edges at rotation 0 are NW (index 0) and NE (index 1)
                // After rotation, these edges move around the hex
                // Direction list: [NW, NE, E, SE, SW, W] = indices [0, 1, 2, 3, 4, 5]
                // Rotation shifts edge directions by the rotation amount
                const dirList = this.clusterDefs.DIRECTION_LIST;
                const originalNwIndex = 0;
                const originalNeIndex = 1;

                // Apply rotation to find where the original top edges now point
                const rotatedNwIndex = (originalNwIndex + rotation) % 6;
                const rotatedNeIndex = (originalNeIndex + rotation) % 6;

                const rotatedNwDir = dirList[rotatedNwIndex];
                const rotatedNeDir = dirList[rotatedNeIndex];

                const nwNeighborKey = `${cityHex.q + rotatedNwDir.dq},${cityHex.r + rotatedNwDir.dr}`;
                const neNeighborKey = `${cityHex.q + rotatedNeDir.dq},${cityHex.r + rotatedNeDir.dr}`;

                // If either original top edge is connected to an existing hex, reject this placement
                if (this.occupiedHexes.has(nwNeighborKey) || this.occupiedHexes.has(neNeighborKey)) {
                    return false;
                }
            }

            // Count how many hex pairs touch existing water
            let connectionCount = 0;
            for (const cityWater of cityWaterHexes) {
                for (const dir of this.clusterDefs.DIRECTION_LIST) {
                    const neighborKey = `${cityWater.q + dir.dq},${cityWater.r + dir.dr}`;
                    if (this.waterHexes.has(neighborKey)) {
                        connectionCount++;
                    }
                }
            }

            // Require at least 2 adjacent hex pairs
            return connectionCount >= 2;
        },

        /**
         * Get all hexes at exactly a given distance from a center point
         */
        getHexesAtDistance: function(centerQ, centerR, distance) {
            if (distance === 0) {
                return [{ q: centerQ, r: centerR }];
            }

            const results = [];
            let q = centerQ + distance;
            let r = centerR - distance;

            const directions = this.clusterDefs.DIRECTION_LIST;
            for (let i = 0; i < 6; i++) {
                for (let j = 0; j < distance; j++) {
                    results.push({ q, r });
                    q += directions[(i + 2) % 6].dq;
                    r += directions[(i + 2) % 6].dr;
                }
            }

            return results;
        },

        /**
         * Get bounding box of current board
         */
        getBoardBounds: function() {
            let minQ = Infinity, maxQ = -Infinity;
            let minR = Infinity, maxR = -Infinity;

            for (const [key] of this.occupiedHexes) {
                const [q, r] = key.split(',').map(Number);
                minQ = Math.min(minQ, q);
                maxQ = Math.max(maxQ, q);
                minR = Math.min(minR, r);
                maxR = Math.max(maxR, r);
            }

            return { minQ, maxQ, minR, maxR };
        },

        /**
         * Validate the complete board
         */
        validateBoard: function() {
            if (!this.isWaterConnected()) {
                console.error('Validation failed: Water is not fully connected');
                return false;
            }

            const islandCount = this.placedClusters.filter(p =>
                p.cluster.size === 7 || p.cluster.size === 9 || p.cluster.size === 11
            ).length;
            const cityCount = this.placedClusters.filter(p => p.cluster.size === 3).length;

            if (islandCount !== 12) {
                console.error(`Validation failed: Expected 12 island clusters, got ${islandCount}`);
                return false;
            }

            if (cityCount !== 6) {
                console.error(`Validation failed: Expected 6 city tiles, got ${cityCount}`);
                return false;
            }

            return true;
        },

        /**
         * Check if all water hexes form a single connected region
         */
        isWaterConnected: function() {
            if (this.waterHexes.size === 0) {
                return true;
            }

            const start = this.waterHexes.values().next().value;
            const visited = new Set();
            const queue = [start];
            visited.add(start);

            while (queue.length > 0) {
                const current = queue.shift();
                const [q, r] = current.split(',').map(Number);

                for (const dir of this.clusterDefs.DIRECTION_LIST) {
                    const neighborKey = `${q + dir.dq},${r + dir.dr}`;
                    if (this.waterHexes.has(neighborKey) && !visited.has(neighborKey)) {
                        visited.add(neighborKey);
                        queue.push(neighborKey);
                    }
                }
            }

            return visited.size === this.waterHexes.size;
        },

        /**
         * Get all hexes as a flat array
         */
        getAllHexes: function() {
            return Array.from(this.occupiedHexes.values());
        },

        /**
         * Generate a random rotation (0-5)
         */
        randomRotation: function() {
            return Math.floor(Math.random() * 6);
        },

        /**
         * Shuffle an array in place (Fisher-Yates)
         */
        shuffleArray: function(array) {
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        },

        /**
         * Find the Zeus token position (shallows hex from cluster-7-0)
         * Returns {q, r} world coordinates of the shallows hex
         */
        findZeusPosition: function() {
            // Find the cluster-7-0 placement
            const zeusClusterPlacement = this.placedClusters.find(p => p.cluster.id === 'cluster-7-0');

            if (!zeusClusterPlacement) {
                console.error('cluster-7-0 not found in placed clusters! Zeus position unknown.');
                return null;
            }

            // The shallows hex in cluster-7-0 is at local position (0, 0)
            // Get the world position considering anchor and rotation
            const worldHexes = this.clusterDefs.getWorldHexes(
                zeusClusterPlacement.cluster,
                zeusClusterPlacement.anchorQ,
                zeusClusterPlacement.anchorR,
                zeusClusterPlacement.rotation
            );

            // Find the shallows hex
            const shallowsHex = worldHexes.find(h => h.type === 'shallows');

            if (!shallowsHex) {
                console.error('Shallows hex not found in cluster-7-0! Zeus position unknown.');
                return null;
            }

            return { q: shallowsHex.q, r: shallowsHex.r };
        },

        /**
         * Debug: Print board state to console
         */
        debugPrint: function() {

            const bounds = this.getBoardBounds();

            this.placedClusters.forEach((p, i) => {
            });
        }
    });
});
