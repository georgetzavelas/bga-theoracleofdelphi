/**
 * BoardRenderer.js - Renders the game board using cluster images
 *
 * Takes placement data from BoardBuilder and renders cluster images
 * at the correct positions with proper rotation.
 */

define([
    "dojo",
    "dojo/_base/declare",
], function (dojo, declare) {

    return declare(null, {

        // Configuration
        hexWidth: 60,       // Width of hex in pixels
        hexHeight: 69,      // Height of hex in pixels (for pointy-top)
        imageHexWidth: 444, // Hex width in source images
        imageScale: null,   // Calculated: hexWidth / imageHexWidth
        themeUrl: '',       // BGA theme URL for image paths
        containerEl: null,  // Container element for board

        // Cluster image paths mapping
        CLUSTER_IMAGES: {
            'cluster-7-0': 'img/cluster-7-hexes/cluster-0.webp',
            'cluster-7-1': 'img/cluster-7-hexes/cluster-1.webp',
            'cluster-7-2': 'img/cluster-7-hexes/cluster-2.webp',
            'cluster-7-3': 'img/cluster-7-hexes/cluster-3.webp',
            'cluster-7-4': 'img/cluster-7-hexes/cluster-4.webp',
            'cluster-7-5': 'img/cluster-7-hexes/cluster-5.webp',
            'cluster-9-0': 'img/cluster-9-hexes/cluster-0.webp',
            'cluster-9-1': 'img/cluster-9-hexes/cluster-1.webp',
            'cluster-9-2': 'img/cluster-9-hexes/cluster-2.webp',
            'cluster-11-0': 'img/cluster-11-hexes/cluster-0.webp',
            'cluster-11-1': 'img/cluster-11-hexes/cluster-1.webp',
            'cluster-11-2': 'img/cluster-11-hexes/cluster-2.webp',
            'city-red': 'img/cluster-3-hexes/cluster-red.webp',
            'city-yellow': 'img/cluster-3-hexes/cluster-yellow.webp',
            'city-green': 'img/cluster-3-hexes/cluster-green.webp',
            'city-blue': 'img/cluster-3-hexes/cluster-blue.webp',
            'city-pink': 'img/cluster-3-hexes/cluster-pink.webp',
            'city-black': 'img/cluster-3-hexes/cluster-black.webp'
        },

        // Image dimensions and anchor positions (in source image pixels)
        // anchorX, anchorY = center of the anchor hex within the image
        CLUSTER_IMAGE_DIMS: {
            // 7-hex clusters 0,1,2: anchor is the center hex (shallows)
            'cluster-7-0': { w: 1342, h: 1290, anchorX: 671, anchorY: 645 },
            'cluster-7-1': { w: 1342, h: 1290, anchorX: 671, anchorY: 645 },
            'cluster-7-2': { w: 1342, h: 1290, anchorX: 671, anchorY: 645 },
            // 7-hex clusters 3,4,5: different shape, anchor not at visual center
            'cluster-7-3': { w: 1121, h: 1683, anchorX: 671, anchorY: 1040 },
            'cluster-7-4': { w: 1121, h: 1683, anchorX: 671, anchorY: 1040 },
            'cluster-7-5': { w: 1121, h: 1683, anchorX: 671, anchorY: 1040 },
            // 9-hex clusters
            'cluster-9-0': { w: 1572, h: 1293, anchorX: 897, anchorY: 646 },
            'cluster-9-1': { w: 1572, h: 1293, anchorX: 897, anchorY: 646 },
            'cluster-9-2': { w: 1572, h: 1293, anchorX: 897, anchorY: 646 },
            // 11-hex clusters
            'cluster-11-0': { w: 1346, h: 2073, anchorX: 673, anchorY: 642 },
            'cluster-11-1': { w: 1346, h: 2073, anchorX: 673, anchorY: 642 },
            'cluster-11-2': { w: 1346, h: 2073, anchorX: 673, anchorY: 642 },
            // 3-hex city clusters: anchor is the left water hex
            'city-red': { w: 892, h: 964, anchorX: 222, anchorY: 714 },
            'city-yellow': { w: 892, h: 964, anchorX: 222, anchorY: 714 },
            'city-green': { w: 892, h: 964, anchorX: 222, anchorY: 714 },
            'city-blue': { w: 892, h: 964, anchorX: 222, anchorY: 714 },
            'city-pink': { w: 892, h: 964, anchorX: 222, anchorY: 714 },
            'city-black': { w: 892, h: 964, anchorX: 222, anchorY: 714 }
        },

        /**
         * Constructor
         * @param {string|Element} container - Container element or ID
         * @param {Object} options - Configuration options
         */
        constructor: function(container, options) {
            this.containerEl = typeof container === 'string'
                ? document.getElementById(container)
                : container;

            if (options) {
                if (options.hexWidth) this.hexWidth = options.hexWidth;
                if (options.hexHeight) this.hexHeight = options.hexHeight;
                if (options.themeUrl) this.themeUrl = options.themeUrl;
            }

            // Calculate image scale
            this.imageScale = this.hexWidth / this.imageHexWidth;

            // Ensure themeUrl ends with /
            if (this.themeUrl && !this.themeUrl.endsWith('/')) {
                this.themeUrl += '/';
            }
        },

        /**
         * Convert axial hex coordinates to pixel position (pointy-top)
         * @param {number} q - Axial q coordinate
         * @param {number} r - Axial r coordinate
         * @returns {Object} {x, y} pixel coordinates
         */
        hexToPixel: function(q, r) {
            const x = this.hexWidth * (q + r * 0.5);
            const y = this.hexHeight * 0.75 * r;
            return { x, y };
        },

        /**
         * Convert pixel position to axial hex coordinates (pointy-top, inverse of hexToPixel)
         * @param {number} px - Pixel x (relative to board origin, before offset)
         * @param {number} py - Pixel y (relative to board origin, before offset)
         * @returns {Object} {q, r} rounded axial coordinates
         */
        pixelToHex: function(px, py) {
            var r = py / (this.hexHeight * 0.75);
            var q = (px / this.hexWidth) - r * 0.5;
            return this.hexRound(q, r);
        },

        /**
         * Round fractional axial coordinates to nearest hex
         */
        hexRound: function(q, r) {
            var s = -q - r;
            var rq = Math.round(q);
            var rr = Math.round(r);
            var rs = Math.round(s);
            var qDiff = Math.abs(rq - q);
            var rDiff = Math.abs(rr - r);
            var sDiff = Math.abs(rs - s);
            if (qDiff > rDiff && qDiff > sDiff) {
                rq = -rr - rs;
            } else if (rDiff > sDiff) {
                rr = -rq - rs;
            }
            return { q: rq, r: rr };
        },

        /**
         * Render the board from BoardBuilder result
         * @param {Object} result - Result from BoardBuilder.buildBoard()
         * @param {Object} options - Rendering options
         */
        render: function(result, options) {
            options = options || {};
            const padding = options.padding || 100;

            if (!this.containerEl) {
                console.error('BoardRenderer: Container element not found');
                return;
            }

            // Clear existing content
            this.containerEl.innerHTML = '';

            // Calculate board bounds from hex data
            const bounds = this.calculateBounds(result.hexes);

            // Calculate offset to center the board with padding
            const offsetX = -bounds.minX + padding;
            const offsetY = -bounds.minY + padding;

            // Set container size
            const containerWidth = bounds.maxX - bounds.minX + padding * 2;
            const containerHeight = bounds.maxY - bounds.minY + padding * 2;
            this.containerEl.style.width = containerWidth + 'px';
            this.containerEl.style.height = containerHeight + 'px';
            this.containerEl.style.position = 'relative';

            // Render each cluster as an image
            result.clusters.forEach((placement, index) => {
                this.renderClusterImage(placement, offsetX, offsetY, index);
            });


            return {
                width: containerWidth,
                height: containerHeight,
                offsetX: offsetX,
                offsetY: offsetY
            };
        },

        /**
         * Calculate pixel bounds from hex data
         * @param {Array} hexes - Array of hex data with q, r coordinates
         * @returns {Object} {minX, maxX, minY, maxY}
         */
        calculateBounds: function(hexes) {
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;

            hexes.forEach(hex => {
                const pos = this.hexToPixel(hex.q, hex.r);
                minX = Math.min(minX, pos.x);
                maxX = Math.max(maxX, pos.x + this.hexWidth);
                minY = Math.min(minY, pos.y);
                maxY = Math.max(maxY, pos.y + this.hexHeight);
            });

            return { minX, maxX, minY, maxY };
        },

        /**
         * Render a single cluster image
         * @param {Object} placement - Cluster placement data
         * @param {number} offsetX - X offset for centering
         * @param {number} offsetY - Y offset for centering
         * @param {number} index - Cluster index for z-ordering
         */
        renderClusterImage: function(placement, offsetX, offsetY, index) {
            const clusterId = placement.cluster.id;
            const imagePath = this.CLUSTER_IMAGES[clusterId];
            const dims = this.CLUSTER_IMAGE_DIMS[clusterId];

            if (!imagePath || !dims) {
                console.warn(`BoardRenderer: No image config for cluster: ${clusterId}`);
                return;
            }

            // Calculate anchor hex center position in pixels
            const anchorPixel = this.hexToPixel(placement.anchorQ, placement.anchorR);
            const anchorCenterX = anchorPixel.x + offsetX + this.hexWidth / 2;
            const anchorCenterY = anchorPixel.y + offsetY + this.hexHeight / 2;

            // Scale the image dimensions
            const scaledWidth = dims.w * this.imageScale;
            const scaledHeight = dims.h * this.imageScale;

            // Scale the anchor position within the image
            const scaledAnchorX = dims.anchorX * this.imageScale;
            const scaledAnchorY = dims.anchorY * this.imageScale;

            // Calculate rotation
            const rotationDeg = placement.rotation * 60;

            // Position the image so anchor point aligns with hex center
            const imageLeft = anchorCenterX - scaledAnchorX;
            const imageTop = anchorCenterY - scaledAnchorY;

            // Create container element
            const imgContainer = document.createElement('div');
            imgContainer.className = 'cluster-image';
            imgContainer.id = `cluster_${index}_${clusterId}`;
            imgContainer.dataset.clusterId = clusterId;
            imgContainer.dataset.anchorQ = placement.anchorQ;
            imgContainer.dataset.anchorR = placement.anchorR;
            imgContainer.dataset.rotation = placement.rotation;

            imgContainer.style.left = imageLeft + 'px';
            imgContainer.style.top = imageTop + 'px';
            imgContainer.style.zIndex = index;

            // Set transform origin to anchor point for correct rotation
            imgContainer.style.transformOrigin = `${scaledAnchorX}px ${scaledAnchorY}px`;
            imgContainer.style.transform = `rotate(${rotationDeg}deg)`;

            // Create image element
            const img = document.createElement('img');
            img.src = this.themeUrl + imagePath;
            img.alt = clusterId;
            img.style.width = scaledWidth + 'px';
            img.style.height = scaledHeight + 'px';

            // Clip image to the union of its own hex polygons, so decorative pixels
            // that extend beyond the cluster's hexes never cover adjacent clusters.
            // Clip-path is applied in the image's local (pre-transform) coordinate
            // system, so it rotates with the parent div's CSS transform.
            img.style.clipPath = this._buildClusterClipPath(placement.cluster, scaledAnchorX, scaledAnchorY);

            img.onerror = () => {
                console.error(`BoardRenderer: Failed to load image: ${this.themeUrl + imagePath}`);
            };

            imgContainer.appendChild(img);
            this.containerEl.appendChild(imgContainer);
        },

        /**
         * Build a CSS clip-path `path(...)` that masks the image to the union of the
         * cluster's own hex polygons (in image-local displayed pixel coordinates).
         * Each hex contributes one subpath (M...L...L...L...L...L...Z); subpaths
         * are unioned by the default nonzero fill rule, so adjacent hexes merge
         * along their shared edges without seams.
         *
         * @param {Object} cluster - Cluster definition (must have .hexes)
         * @param {number} scaledAnchorX - Anchor x in displayed image pixels
         * @param {number} scaledAnchorY - Anchor y in displayed image pixels
         * @returns {string} CSS clip-path value
         */
        _buildClusterClipPath: function(cluster, scaledAnchorX, scaledAnchorY) {
            const W = this.hexWidth;
            const H = this.hexHeight;
            const halfW = W / 2;
            const halfH = H / 2;
            const quarterH = H / 4;
            // Tiny outward dilation to cover sub-pixel AA seams between adjacent hexes.
            // Safe: neighbor-cluster gap is ~60px, so 0.5px can't re-introduce overlap.
            const pad = 0.5;
            // Pointy-top hex, 6 vertex offsets from center, clockwise from top.
            const vertexOffsets = [
                [0,              -halfH - pad],
                [halfW + pad,    -quarterH],
                [halfW + pad,    quarterH],
                [0,              halfH + pad],
                [-halfW - pad,   quarterH],
                [-halfW - pad,   -quarterH]
            ];

            const subpaths = cluster.hexes.map((h) => {
                const cx = scaledAnchorX + W * (h.dq + h.dr / 2);
                const cy = scaledAnchorY + H * 0.75 * h.dr;
                const v = vertexOffsets.map(([ox, oy]) =>
                    `${(cx + ox).toFixed(1)} ${(cy + oy).toFixed(1)}`
                );
                return `M${v[0]}L${v[1]}L${v[2]}L${v[3]}L${v[4]}L${v[5]}Z`;
            });

            return `path('${subpaths.join('')}')`;
        },

        /**
         * Get the pixel position for a hex coordinate (useful for placing game pieces)
         * @param {number} q - Axial q coordinate
         * @param {number} r - Axial r coordinate
         * @param {number} offsetX - Board X offset
         * @param {number} offsetY - Board Y offset
         * @returns {Object} {x, y} center pixel position
         */
        getHexCenter: function(q, r, offsetX, offsetY) {
            const pos = this.hexToPixel(q, r);
            return {
                x: pos.x + offsetX + this.hexWidth / 2,
                y: pos.y + offsetY + this.hexHeight / 2
            };
        },

        /**
         * Render from saved placement data (for loading existing games)
         * @param {Array} placements - Array of {clusterId, anchorQ, anchorR, rotation}
         * @param {Array} hexes - Array of hex data for bounds calculation
         * @param {Object} clusterDefs - ClusterDefinitions instance
         */
        renderFromPlacements: function(placements, hexes, clusterDefs) {
            // Convert simple placement data back to full cluster objects
            const clusters = placements.map(p => ({
                cluster: clusterDefs.getCluster(p.clusterId),
                anchorQ: p.anchorQ,
                anchorR: p.anchorR,
                rotation: p.rotation
            }));

            return this.render({ clusters, hexes });
        }
    });
});
