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

    return declare("delphi.BoardRenderer", null, {

        // Configuration
        hexWidth: 60,       // Width of hex in pixels
        hexHeight: 69,      // Height of hex in pixels (for pointy-top)
        imageHexWidth: 444, // Hex width in source images
        imageScale: null,   // Calculated: hexWidth / imageHexWidth
        themeUrl: '',       // BGA theme URL for image paths
        containerEl: null,  // Container element for board

        // Cluster image paths mapping
        CLUSTER_IMAGES: {
            'cluster-7-0': 'img/cluster-7-hexes/cluster-0.png',
            'cluster-7-1': 'img/cluster-7-hexes/cluster-1.png',
            'cluster-7-2': 'img/cluster-7-hexes/cluster-2.png',
            'cluster-7-3': 'img/cluster-7-hexes/cluster-3.png',
            'cluster-7-4': 'img/cluster-7-hexes/cluster-4.png',
            'cluster-7-5': 'img/cluster-7-hexes/cluster-5.png',
            'cluster-9-0': 'img/cluster-9-hexes/cluster-0.png',
            'cluster-9-1': 'img/cluster-9-hexes/cluster-1.png',
            'cluster-9-2': 'img/cluster-9-hexes/cluster-2.png',
            'cluster-11-0': 'img/cluster-11-hexes/cluster-0.png',
            'cluster-11-1': 'img/cluster-11-hexes/cluster-1.png',
            'cluster-11-2': 'img/cluster-11-hexes/cluster-2.png',
            'city-red': 'img/cluster-3-hexes/cluster-red.png',
            'city-yellow': 'img/cluster-3-hexes/cluster-yellow.png',
            'city-green': 'img/cluster-3-hexes/cluster-green.png',
            'city-blue': 'img/cluster-3-hexes/cluster-blue.png',
            'city-pink': 'img/cluster-3-hexes/cluster-pink.png',
            'city-black': 'img/cluster-3-hexes/cluster-black.png'
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

        // Debug instrumentation (temporary): log image load/decode lifecycle
        // so we can diagnose intermittent partial-cluster render bugs on reload.
        // Toggle off by setting window.DELPHI_BOARD_DEBUG = false before render.
        _renderSeq: 0,

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

            const debug = (typeof window !== 'undefined')
                ? window.DELPHI_BOARD_DEBUG !== false
                : true;
            const seq = ++this._renderSeq;
            const t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

            if (debug) {
                console.log(`[board-render #${seq}] BEGIN - ${result.clusters.length} clusters, ${result.hexes.length} hexes`);
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

            if (debug) {
                console.log(`[board-render #${seq}] container ${containerWidth}x${containerHeight}, offset (${offsetX.toFixed(1)}, ${offsetY.toFixed(1)})`);
            }

            // Track per-image lifecycle for this render
            const loadTracker = debug ? {
                seq: seq,
                t0: t0,
                total: result.clusters.length,
                loaded: 0,
                decoded: 0,
                failed: 0,
                pending: new Set()
            } : null;

            // Render each cluster as an image
            result.clusters.forEach((placement, index) => {
                this.renderClusterImage(placement, offsetX, offsetY, index, loadTracker);
            });

            if (debug) {
                console.log(`[board-render #${seq}] END (sync) - queued ${result.clusters.length} clusters in ${(performance.now() - t0).toFixed(1)}ms`);
            }

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
        renderClusterImage: function(placement, offsetX, offsetY, index, loadTracker) {
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
            const fullSrc = this.themeUrl + imagePath;
            img.alt = clusterId;
            img.style.width = scaledWidth + 'px';
            img.style.height = scaledHeight + 'px';

            const tracker = loadTracker;
            const tImgStart = tracker ? performance.now() : 0;

            img.onerror = () => {
                if (tracker) {
                    tracker.failed++;
                    tracker.pending.delete(index);
                    console.error(`[board-render #${tracker.seq}] ERROR idx=${index} ${clusterId} src=${fullSrc} dt=${(performance.now() - tImgStart).toFixed(1)}ms`);
                } else {
                    console.error(`BoardRenderer: Failed to load image: ${fullSrc}`);
                }
            };

            if (tracker) {
                tracker.pending.add(index);

                img.onload = () => {
                    const dt = (performance.now() - tImgStart).toFixed(1);
                    const expectedW = dims.w;
                    const expectedH = dims.h;
                    const natW = img.naturalWidth;
                    const natH = img.naturalHeight;
                    const mismatch = (natW !== expectedW || natH !== expectedH);
                    const prefix = mismatch ? 'LOAD-DIM-MISMATCH' : 'load';
                    console.log(`[board-render #${tracker.seq}] ${prefix} idx=${index} ${clusterId} nat=${natW}x${natH} (exp ${expectedW}x${expectedH}) complete=${img.complete} dt=${dt}ms`);

                    tracker.loaded++;

                    // Also try to decode explicitly so we can spot decode failures
                    // that the browser normally swallows (the suspected root cause).
                    if (typeof img.decode === 'function') {
                        const tDecodeStart = performance.now();
                        img.decode().then(() => {
                            tracker.decoded++;
                            tracker.pending.delete(index);
                            console.log(`[board-render #${tracker.seq}] decode-ok idx=${index} ${clusterId} decodeDt=${(performance.now() - tDecodeStart).toFixed(1)}ms (${tracker.decoded}/${tracker.total})`);
                            this._maybeLogRenderComplete(tracker);
                        }).catch((err) => {
                            tracker.failed++;
                            tracker.pending.delete(index);
                            console.error(`[board-render #${tracker.seq}] DECODE-FAIL idx=${index} ${clusterId} err=${err && err.message || err}`);
                            this._maybeLogRenderComplete(tracker);
                        });
                    } else {
                        tracker.decoded++;
                        tracker.pending.delete(index);
                        this._maybeLogRenderComplete(tracker);
                    }
                };
            }

            // Setting src AFTER onload/onerror are wired so handlers fire even for cached images.
            img.src = fullSrc;

            if (tracker && img.complete && img.naturalWidth > 0) {
                // Image was already in memory cache; onload may not fire. Log synchronously.
                console.log(`[board-render #${tracker.seq}] cache-hit idx=${index} ${clusterId} nat=${img.naturalWidth}x${img.naturalHeight}`);
            }

            imgContainer.appendChild(img);
            this.containerEl.appendChild(imgContainer);
        },

        /**
         * Log a final summary line when all pending images have finished (load + decode).
         * Called from per-image onload/onerror/decode callbacks.
         * Also runs the post-render layout diagnostic.
         */
        _maybeLogRenderComplete: function(tracker) {
            if (!tracker || tracker.pending.size > 0) return;
            const dt = (performance.now() - tracker.t0).toFixed(1);
            console.log(`[board-render #${tracker.seq}] ALL-DONE loaded=${tracker.loaded} decoded=${tracker.decoded} failed=${tracker.failed} total=${tracker.total} totalDt=${dt}ms`);
            // Run layout diagnostic after a frame so the browser has had a chance to lay out & paint.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    this._diagnoseLayout(tracker.seq);
                });
            });
        },

        /**
         * Walk every cluster-image node and capture layout/visibility info.
         * Also walks the ancestor chain of the container to find clipping parents.
         */
        _diagnoseLayout: function(seq) {
            if (!this.containerEl) return;
            const tag = `[board-render #${seq} LAYOUT]`;
            const nodes = this.containerEl.querySelectorAll('.cluster-image');

            // 1. Ancestor chain of the container (what could clip/transform cluster images)
            const ancestors = [];
            let el = this.containerEl;
            while (el && el !== document.body) {
                const cs = getComputedStyle(el);
                ancestors.push({
                    sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className ? '.' + String(el.className).split(/\s+/).join('.') : ''),
                    overflow: cs.overflow,
                    overflowX: cs.overflowX,
                    overflowY: cs.overflowY,
                    transform: cs.transform,
                    clipPath: cs.clipPath,
                    mask: cs.mask || cs.webkitMask,
                    contain: cs.contain,
                    filter: cs.filter,
                    width: el.clientWidth,
                    height: el.clientHeight,
                    scrollW: el.scrollWidth,
                    scrollH: el.scrollHeight
                });
                el = el.parentElement;
            }
            console.log(`${tag} ancestor chain:`, ancestors);

            // 2. Per-cluster layout
            const rows = [];
            nodes.forEach((node) => {
                const img = node.querySelector('img');
                const cs = getComputedStyle(node);
                const imgCs = img ? getComputedStyle(img) : null;
                const rect = node.getBoundingClientRect();
                const imgRect = img ? img.getBoundingClientRect() : null;
                rows.push({
                    id: node.id,
                    clusterId: node.dataset.clusterId,
                    anchorQ: node.dataset.anchorQ,
                    anchorR: node.dataset.anchorR,
                    rotation: node.dataset.rotation,
                    zIndex: cs.zIndex,
                    opacity: cs.opacity,
                    visibility: cs.visibility,
                    display: cs.display,
                    transform: cs.transform,
                    transformOrigin: cs.transformOrigin,
                    clipPath: cs.clipPath,
                    mask: cs.mask || cs.webkitMask,
                    filter: cs.filter,
                    left: node.style.left,
                    top: node.style.top,
                    nodeRect: `${rect.left.toFixed(0)},${rect.top.toFixed(0)} ${rect.width.toFixed(0)}x${rect.height.toFixed(0)}`,
                    imgRect: imgRect ? `${imgRect.left.toFixed(0)},${imgRect.top.toFixed(0)} ${imgRect.width.toFixed(0)}x${imgRect.height.toFixed(0)}` : 'NO IMG',
                    imgComplete: img ? img.complete : null,
                    imgNatW: img ? img.naturalWidth : null,
                    imgNatH: img ? img.naturalHeight : null,
                    imgCssW: imgCs ? imgCs.width : null,
                    imgCssH: imgCs ? imgCs.height : null,
                    imgOpacity: imgCs ? imgCs.opacity : null,
                    imgVisibility: imgCs ? imgCs.visibility : null,
                    imgFilter: imgCs ? imgCs.filter : null,
                    imgClipPath: imgCs ? imgCs.clipPath : null
                });
            });
            console.log(`${tag} ${rows.length} cluster nodes:`);
            console.table(rows);

            // 3. Anomaly scan - flag anything that looks suspicious
            const warnings = [];
            rows.forEach(r => {
                if (r.opacity !== '1') warnings.push(`${r.id}: opacity=${r.opacity}`);
                if (r.visibility !== 'visible') warnings.push(`${r.id}: visibility=${r.visibility}`);
                if (r.display === 'none') warnings.push(`${r.id}: display=none`);
                if (r.clipPath && r.clipPath !== 'none') warnings.push(`${r.id}: clipPath=${r.clipPath}`);
                if (r.mask && r.mask !== 'none') warnings.push(`${r.id}: mask=${r.mask}`);
                if (r.filter && r.filter !== 'none') warnings.push(`${r.id}: filter=${r.filter}`);
                if (r.imgClipPath && r.imgClipPath !== 'none') warnings.push(`${r.id} img: clipPath=${r.imgClipPath}`);
                if (r.imgOpacity && r.imgOpacity !== '1') warnings.push(`${r.id} img: opacity=${r.imgOpacity}`);
            });
            if (warnings.length) {
                console.warn(`${tag} ANOMALIES:`, warnings);
            } else {
                console.log(`${tag} no obvious CSS anomalies on cluster nodes.`);
            }

            // 4. Store render metadata globally for manual inspection.
            try {
                window.__delphiBoardDebug = {
                    seq: seq,
                    renderer: this,
                    ancestors: ancestors,
                    clusters: rows
                };
                console.log(`${tag} snapshot stored at window.__delphiBoardDebug`);
            } catch (e) { /* noop */ }
        },

        /**
         * Dump the current DOM state of rendered clusters to the console.
         * Call as window.boardRenderer.debugDumpRenderState() after reproducing the bug.
         */
        debugDumpRenderState: function() {
            if (!this.containerEl) {
                console.log('[board-render] no container');
                return;
            }
            const nodes = this.containerEl.querySelectorAll('.cluster-image');
            console.log(`[board-render] DUMP: ${nodes.length} cluster-image nodes`);
            nodes.forEach((node) => {
                const img = node.querySelector('img');
                if (!img) {
                    console.log(`  ${node.id}: NO IMG`);
                    return;
                }
                console.log(`  ${node.id}: complete=${img.complete} nat=${img.naturalWidth}x${img.naturalHeight} currentSrc=${img.currentSrc || '(none)'} transform=${node.style.transform}`);
            });
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
