/**
 * HexGrid.js - Hexagonal grid rendering and utilities for The Oracle of Delphi
 *
 * Uses axial coordinate system (q, r) with flat-topped hexagons
 */

define([
    "dojo",
    "dojo/_base/declare",
], function (dojo, declare) {
    return declare("delphi.HexGrid", null, {

        // Configuration
        hexSize: 80,        // Width of hex
        hexHeight: 92,      // Height of hex (for flat-top: height = width * sqrt(3)/2 * 2)
        containerEl: null,
        piecesEl: null,
        currentZoom: 1,
        minZoom: 0.5,
        maxZoom: 1.5,

        // Hex neighbor directions (flat-top axial)
        directions: [
            { q: +1, r: 0 },   // East
            { q: +1, r: -1 },  // Northeast
            { q: 0, r: -1 },   // Northwest
            { q: -1, r: 0 },   // West
            { q: -1, r: +1 },  // Southwest
            { q: 0, r: +1 }    // Southeast
        ],

        /**
         * Constructor
         * @param {string|Element} gridContainer - Container element or ID for hex grid
         * @param {string|Element} piecesContainer - Container element or ID for pieces overlay
         * @param {Object} options - Configuration options
         */
        constructor: function(gridContainer, piecesContainer, options) {
            this.containerEl = typeof gridContainer === 'string'
                ? document.getElementById(gridContainer)
                : gridContainer;

            this.piecesEl = typeof piecesContainer === 'string'
                ? document.getElementById(piecesContainer)
                : piecesContainer;

            if (options) {
                if (options.hexSize) this.hexSize = options.hexSize;
                if (options.hexHeight) this.hexHeight = options.hexHeight;
                if (options.minZoom) this.minZoom = options.minZoom;
                if (options.maxZoom) this.maxZoom = options.maxZoom;
            }

            this.hexes = new Map(); // Store hex elements by "q,r" key
        },

        /**
         * Convert axial coordinates to pixel position (flat-top hexes)
         * @param {number} q - Axial q coordinate
         * @param {number} r - Axial r coordinate
         * @returns {Object} {x, y} pixel coordinates
         */
        hexToPixel: function(q, r) {
            const size = this.hexSize / 2;
            const x = size * (3/2 * q);
            const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
            return { x: x, y: y };
        },

        /**
         * Convert pixel position to axial coordinates
         * @param {number} x - Pixel x coordinate
         * @param {number} y - Pixel y coordinate
         * @returns {Object} {q, r} axial coordinates (rounded to nearest hex)
         */
        pixelToHex: function(x, y) {
            const size = this.hexSize / 2;
            const q = (2/3 * x) / size;
            const r = (-1/3 * x + Math.sqrt(3)/3 * y) / size;
            return this.hexRound(q, r);
        },

        /**
         * Round fractional axial coordinates to nearest hex
         * @param {number} q - Fractional q
         * @param {number} r - Fractional r
         * @returns {Object} {q, r} rounded coordinates
         */
        hexRound: function(q, r) {
            const s = -q - r; // Convert to cube coordinates

            let rq = Math.round(q);
            let rr = Math.round(r);
            let rs = Math.round(s);

            const qDiff = Math.abs(rq - q);
            const rDiff = Math.abs(rr - r);
            const sDiff = Math.abs(rs - s);

            // Reset the component with largest diff
            if (qDiff > rDiff && qDiff > sDiff) {
                rq = -rr - rs;
            } else if (rDiff > sDiff) {
                rr = -rq - rs;
            }

            return { q: rq, r: rr };
        },

        /**
         * Get all neighbor coordinates of a hex
         * @param {number} q - Axial q coordinate
         * @param {number} r - Axial r coordinate
         * @returns {Array} Array of {q, r} neighbor coordinates
         */
        getNeighbors: function(q, r) {
            return this.directions.map(dir => ({
                q: q + dir.q,
                r: r + dir.r
            }));
        },

        /**
         * Calculate distance between two hexes
         * @param {number} q1 - First hex q
         * @param {number} r1 - First hex r
         * @param {number} q2 - Second hex q
         * @param {number} r2 - Second hex r
         * @returns {number} Distance in hex steps
         */
        hexDistance: function(q1, r1, q2, r2) {
            return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
        },

        /**
         * Get all hexes within a certain range
         * @param {number} centerQ - Center hex q
         * @param {number} centerR - Center hex r
         * @param {number} range - Range in hex steps
         * @returns {Array} Array of {q, r} coordinates within range
         */
        getHexesInRange: function(centerQ, centerR, range) {
            const results = [];
            for (let q = -range; q <= range; q++) {
                for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
                    results.push({
                        q: centerQ + q,
                        r: centerR + r
                    });
                }
            }
            return results;
        },

        /**
         * Create the hex grid from data
         * @param {Array} hexData - Array of hex definitions {q, r, type, color}
         */
        createGrid: function(hexData) {
            // Clear existing hexes
            this.containerEl.innerHTML = '';
            this.hexes.clear();

            // Calculate bounds for centering
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            hexData.forEach(hex => {
                const pos = this.hexToPixel(hex.q, hex.r);
                minX = Math.min(minX, pos.x);
                maxX = Math.max(maxX, pos.x + this.hexSize);
                minY = Math.min(minY, pos.y);
                maxY = Math.max(maxY, pos.y + this.hexHeight);
            });

            // Offset to ensure all hexes are visible
            const offsetX = -minX + 50;
            const offsetY = -minY + 50;

            // Create hex elements
            hexData.forEach(hex => {
                const pos = this.hexToPixel(hex.q, hex.r);
                const el = this.createHexElement(hex, pos.x + offsetX, pos.y + offsetY);
                this.containerEl.appendChild(el);
                this.hexes.set(`${hex.q},${hex.r}`, el);
            });

            // Set container size
            const width = maxX - minX + 100;
            const height = maxY - minY + 100;
            this.containerEl.style.width = width + 'px';
            this.containerEl.style.height = height + 'px';
        },

        /**
         * Create a single hex DOM element
         * @param {Object} hex - Hex data {q, r, type, color}
         * @param {number} x - Pixel x position
         * @param {number} y - Pixel y position
         * @returns {Element} The hex DOM element
         */
        createHexElement: function(hex, x, y) {
            const el = document.createElement('div');
            el.className = `delphi-hex hex-${hex.color || 'blue'}`;
            el.id = `hex_${hex.q}_${hex.r}`;
            el.dataset.q = hex.q;
            el.dataset.r = hex.r;
            el.dataset.type = hex.type || 'water';
            el.dataset.color = hex.color || 'blue';
            // Add symbol for Greek symbol on water hexes (sigma, psi, phi, omega)
            if (hex.symbol) {
                el.dataset.symbol = hex.symbol;
            }
            el.style.left = x + 'px';
            el.style.top = y + 'px';

            return el;
        },

        /**
         * Get hex element by coordinates
         * @param {number} q - Axial q coordinate
         * @param {number} r - Axial r coordinate
         * @returns {Element|null} The hex element or null
         */
        getHexElement: function(q, r) {
            return this.hexes.get(`${q},${r}`) || null;
        },

        /**
         * Get pixel position for placing a piece on a hex (centered)
         * @param {number} q - Axial q coordinate
         * @param {number} r - Axial r coordinate
         * @returns {Object} {x, y} pixel coordinates for piece center
         */
        getHexCenter: function(q, r) {
            const hexEl = this.getHexElement(q, r);
            if (!hexEl) return null;

            const left = parseFloat(hexEl.style.left);
            const top = parseFloat(hexEl.style.top);

            return {
                x: left + this.hexSize / 2,
                y: top + this.hexHeight / 2
            };
        },

        /**
         * Highlight hexes as valid move destinations
         * @param {Array} coords - Array of {q, r} coordinates to highlight
         */
        highlightValidHexes: function(coords) {
            coords.forEach(coord => {
                const el = this.getHexElement(coord.q, coord.r);
                if (el) {
                    el.classList.add('hex-valid');
                }
            });
        },

        /**
         * Clear all hex highlights
         */
        clearHighlights: function() {
            this.hexes.forEach(el => {
                el.classList.remove('hex-valid');
            });
        },

        /**
         * Set zoom level
         * @param {number} zoom - Zoom factor (0.5 to 1.5)
         */
        setZoom: function(zoom) {
            this.currentZoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
            this.containerEl.style.transform = `scale(${this.currentZoom})`;
            this.containerEl.style.transformOrigin = 'top left';
        },

        /**
         * Zoom in by a step
         */
        zoomIn: function() {
            this.setZoom(this.currentZoom + 0.1);
        },

        /**
         * Zoom out by a step
         */
        zoomOut: function() {
            this.setZoom(this.currentZoom - 0.1);
        },

        /**
         * Reset zoom to fit content
         */
        zoomFit: function() {
            this.setZoom(1);
        },

        /**
         * Generate a sample hex grid for testing
         * @param {number} radius - Grid radius
         * @returns {Array} Array of hex data
         */
        generateTestGrid: function(radius) {
            const colors = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];
            const hexData = [];

            for (let q = -radius; q <= radius; q++) {
                const r1 = Math.max(-radius, -q - radius);
                const r2 = Math.min(radius, -q + radius);
                for (let r = r1; r <= r2; r++) {
                    hexData.push({
                        q: q,
                        r: r,
                        type: 'water',
                        color: colors[Math.floor(Math.random() * colors.length)]
                    });
                }
            }

            return hexData;
        },

        /**
         * Pathfinding: Get all hexes reachable within a number of steps
         * @param {number} startQ - Start q coordinate
         * @param {number} startR - Start r coordinate
         * @param {number} maxSteps - Maximum movement range
         * @param {Function} isPassable - Function(q, r) returning true if hex is passable
         * @returns {Map} Map of "q,r" -> distance
         */
        getReachableHexes: function(startQ, startR, maxSteps, isPassable) {
            const visited = new Map();
            const frontier = [{ q: startQ, r: startR, dist: 0 }];
            visited.set(`${startQ},${startR}`, 0);

            while (frontier.length > 0) {
                const current = frontier.shift();

                if (current.dist >= maxSteps) continue;

                const neighbors = this.getNeighbors(current.q, current.r);
                for (const neighbor of neighbors) {
                    const key = `${neighbor.q},${neighbor.r}`;

                    if (!visited.has(key) && (!isPassable || isPassable(neighbor.q, neighbor.r))) {
                        const newDist = current.dist + 1;
                        visited.set(key, newDist);
                        frontier.push({ q: neighbor.q, r: neighbor.r, dist: newDist });
                    }
                }
            }

            return visited;
        }
    });
});
