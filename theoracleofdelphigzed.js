/**
 *------
 * BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
 * theoracleofdelphigzed implementation : © George Tzavelas
 *
 * This code has been produced on the BGA studio platform for use on http://boardgamearena.com.
 * See http://en.boardgamearena.com/#!doc/Studio for more information.
 * -----
 *
 * theoracleofdelphigzed.js
 *
 * The Oracle of Delphi user interface script
 */

// Cache bust version - increment when JS modules change
var DELPHI_JS_VERSION = "v9";

define([
    "dojo","dojo/_base/declare",
    "ebg/core/gamegui",
    "ebg/counter",
    g_gamethemeurl + "modules/js/HexGrid.js?" + DELPHI_JS_VERSION,
    g_gamethemeurl + "modules/js/Components.js?" + DELPHI_JS_VERSION,
    g_gamethemeurl + "modules/js/ClusterDefinitions.js?" + DELPHI_JS_VERSION,
    g_gamethemeurl + "modules/js/BoardBuilder.js?" + DELPHI_JS_VERSION,
    g_gamethemeurl + "modules/js/BoardRenderer.js?" + DELPHI_JS_VERSION,
    g_gamethemeurl + "modules/BX/js/DragScroller.js?" + DELPHI_JS_VERSION,
],
function (dojo, declare, gamegui, counter) {
    return declare("bgagame.theoracleofdelphigzed", ebg.core.gamegui, {

        // Game components
        hexGrid: null,
        components: null,
        boardScroller: null,
        boardRenderer: null,
        boardBuilder: null,
        clusterDefs: null,

        // Board state
        boardOffsetX: 0,
        boardOffsetY: 0,
        boardHexes: null,

        // Current state
        currentPlayerId: null,
        selectedDieIndex: null,

        constructor: function(){
            console.log('The Oracle of Delphi constructor');

            // Global variables
            this.hexGrid = null;
            this.components = null;
            this.boardRenderer = null;
            this.boardBuilder = null;
            this.clusterDefs = null;
            this.selectedDieIndex = null;
        },

        /*
            setup:

            This method must set up the game user interface according to current game situation.
            Called when game interface is displayed to a player (start or refresh).
        */

        setup: function( gamedatas )
        {
            console.log( "Starting game setup", gamedatas );
            console.log("delphi namespace:", typeof delphi !== 'undefined' ? delphi : 'undefined');
            console.log("g_gamethemeurl:", g_gamethemeurl);

            // Initialize cluster definitions and board builder
            console.log("Creating ClusterDefinitions...");
            this.clusterDefs = new delphi.ClusterDefinitions();
            console.log("ClusterDefinitions created:", this.clusterDefs);

            console.log("Creating BoardBuilder...");
            this.boardBuilder = new delphi.BoardBuilder(this.clusterDefs);
            console.log("BoardBuilder created:", this.boardBuilder);

            // Initialize board renderer
            console.log("Creating BoardRenderer for container 'delphi-hex-grid'...");
            console.log("Container element exists:", document.getElementById('delphi-hex-grid'));
            this.boardRenderer = new delphi.BoardRenderer('delphi-hex-grid', {
                hexWidth: 60,
                hexHeight: 69,
                themeUrl: g_gamethemeurl
            });
            console.log("BoardRenderer created:", this.boardRenderer);

            // Initialize hex grid (for game piece positioning)
            this.hexGrid = new delphi.HexGrid('delphi-hex-grid', 'delphi-board-pieces', {
                hexSize: 80,
                hexHeight: 92
            });

            // Initialize components manager
            this.components = new delphi.Components(this);

            // Set up monster interaction handlers (event delegation — works for dynamic monsters)
            this.setupMonsterInteractions();

            // Initialize board scroller
            this.boardScroller = new bx.DragScroller('delphi-board-container');

            // Set up zoom controls
            this.setupZoomControls();

            // Check if we have saved board placements from server
            if (gamedatas && gamedatas.boardPlacements && gamedatas.boardPlacements.length > 0) {
                // Restore board from saved placements
                this.restoreBoardFromPlacements(gamedatas.boardPlacements);
            } else if (gamedatas && gamedatas.hexes) {
                // Legacy: Use actual game data
                this.setupFromGameData(gamedatas);
            } else {
                // Generate new board for testing/new game
                this.createTestBoard();
            }

            // Board click handler: detect hex from pixel and handle ship movement
            this.setupBoardClickHandler();

            // Dialog close buttons
            document.querySelectorAll('.dialog-close').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var dialog = btn.closest('.delphi-dialog');
                    if (dialog) dialog.classList.remove('active');
                });
            });

            // Setup game notifications
            this.setupNotifications();

            // Setup test toolbar (dev only)
            this.setupTestToolbar();

            console.log( "Ending game setup" );
        },

        /**
         * Set up zoom controls
         */
        setupZoomControls: function() {
            const zoomIn = document.getElementById('delphi-zoom-in');
            const zoomOut = document.getElementById('delphi-zoom-out');
            const zoomFit = document.getElementById('delphi-zoom-fit');

            if (zoomIn) {
                zoomIn.addEventListener('click', () => this.hexGrid.zoomIn());
            }
            if (zoomOut) {
                zoomOut.addEventListener('click', () => this.hexGrid.zoomOut());
            }
            if (zoomFit) {
                zoomFit.addEventListener('click', () => this.hexGrid.zoomFit());
            }
        },

        /**
         * Set up board click handler for hex detection and ship movement
         */
        setupBoardClickHandler: function() {
            var self = this;
            var hexGrid = document.getElementById('delphi-hex-grid');
            if (!hexGrid) return;

            hexGrid.addEventListener('click', function(e) {
                // Don't handle clicks on ships, monsters, shrines, etc.
                if (e.target.closest('.delphi-ship') ||
                    e.target.closest('.delphi-monster') ||
                    e.target.closest('.delphi-shrine')) {
                    return;
                }

                // Get click position relative to the hex-grid container
                var rect = hexGrid.getBoundingClientRect();
                var px = e.clientX - rect.left;
                var py = e.clientY - rect.top;

                // Convert to hex coordinates
                var hex = self.pixelToHexCoords(px, py);
                if (!hex) return;

                // Verify this hex exists on the board
                var hexData = self.boardHexes && self.boardHexes.find(function(h) {
                    return h.q === hex.q && h.r === hex.r;
                });
                if (!hexData) return;

                self.onHexClick(hex.q, hex.r, hexData.type, hexData.color);
            });
        },

        /**
         * Set up the collapsible test toolbar (dev only — remove before production)
         */
        setupTestToolbar: function() {
            var self = this;
            var toggle = document.getElementById('delphi-test-toggle');
            var actions = document.getElementById('delphi-test-actions');

            if (!toggle || !actions) return;

            // Toggle visibility
            toggle.addEventListener('click', function() {
                actions.classList.toggle('hidden');
                toggle.innerHTML = actions.classList.contains('hidden')
                    ? 'Test Tools &#9660;'
                    : 'Test Tools &#9650;';
            });

            // Route button clicks by data-action
            actions.addEventListener('click', function(e) {
                var btn = e.target.closest('.test-btn');
                if (!btn) return;

                var action = btn.dataset.action;
                switch (action) {
                    case 'rollDice':
                        self.testRollOracleDice();
                        break;
                    case 'rollBattleDie':
                        self.testRollBattleDie();
                        break;
                    case 'showShipRange':
                        self.testShowShipRange();
                        break;
                    case 'resetShips':
                        self.testResetShipsToZeus();
                        break;
                    case 'flipShrines':
                        self.testFlipAllShrines();
                        break;
                    case 'regenerateBoard':
                        self.testRegenerateBoard();
                        break;
                }
            });
        },

        /**
         * Test action: Roll oracle dice with random colors
         */
        testRollOracleDice: function() {
            var colors = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];
            var newColors = [];
            for (var i = 0; i < 3; i++) {
                newColors.push(colors[Math.floor(Math.random() * colors.length)]);
            }
            console.log('Test rolling oracle dice:', newColors);
            this.components.animateDiceRoll(1, newColors);
        },

        /**
         * Test action: Roll battle die (D10) with random result
         */
        testRollBattleDie: function() {
            var result = Math.floor(Math.random() * 10);
            console.log('Test rolling battle die, result:', result);

            // Create the die if it doesn't exist
            if (!this.components.battleDieRotor) {
                this.components.createBattleDie();
            }

            // Show the combat dialog for testing
            var dialog = document.getElementById('delphi-combat-dialog');
            if (dialog) {
                dialog.classList.add('active');
            }

            this.components.rollBattleDie(result);
        },

        /**
         * Test action: Select first ship and show its movement range
         */
        testShowShipRange: function() {
            // Select player 1's ship
            var pos = this.shipPositions && this.shipPositions[1];
            if (pos) {
                this.components.selectShip(1);
                this.showShipRange(1, pos.q, pos.r);
            } else {
                console.warn('No ship position found for player 1');
            }
        },

        /**
         * Test action: Reset all ships to Zeus/shallows starting position
         */
        testResetShipsToZeus: function() {
            var self = this;
            var zeus = this.zeusPosition;
            if (!zeus) {
                console.warn('No Zeus position stored');
                return;
            }

            var center = this.getHexCenterPixel(zeus.q, zeus.r);
            if (!center) return;

            var colors = ['red', 'blue', 'green', 'yellow'];
            colors.forEach(function(color, index) {
                var playerId = index + 1;
                var offset = self.SHIP_CLUSTER_OFFSETS[index];
                self.components.moveShip(playerId, center.x + offset.dx, center.y + offset.dy, true);
                self.shipPositions[playerId] = { q: zeus.q, r: zeus.r };
            });

            this.clearRangeOverlays();
            this.components.deselectShips();
        },

        /**
         * Test action: Flip all shrines (toggle)
         */
        testFlipAllShrines: function() {
            this.components.shrines.forEach(function(el, id) {
                el.classList.toggle('shrine-revealed');
            });
        },

        /**
         * Test action: Regenerate the board
         */
        testRegenerateBoard: function() {
            // Clear existing board
            this.clearRangeOverlays();
            document.getElementById('delphi-hex-grid').innerHTML = '';
            document.getElementById('delphi-board-pieces').innerHTML = '';
            this.components.ships.clear();
            this.components.monsters.clear();
            this.components.shrines.clear();
            this.components.dice.clear();
            this.shipPositions = {};
            this.currentShipRange = null;
            this.currentShipId = null;

            // Rebuild
            this.createTestBoard();
        },

        /**
         * Create a dynamically generated test board using BoardBuilder
         * Uses multi-hex cluster images for the game board
         */
        createTestBoard: function() {
            console.log("Creating test board with BoardBuilder");
            console.log("BoardBuilder instance:", this.boardBuilder);
            console.log("BoardRenderer instance:", this.boardRenderer);
            console.log("ClusterDefs instance:", this.clusterDefs);

            // Build the board using BoardBuilder
            const result = this.boardBuilder.buildBoard();
            console.log("BoardBuilder result:", result);

            if (!result.valid) {
                console.error('Failed to build board:', result);
                return;
            }

            console.log(`Board built successfully with ${result.clusters.length} clusters`);

            // Render the board using BoardRenderer
            console.log("About to render with BoardRenderer");
            console.log("BoardRenderer container:", this.boardRenderer.containerEl);
            const renderResult = this.boardRenderer.render(result, { padding: 100 });
            console.log("Render result:", renderResult);

            // Store offsets for piece positioning
            this.boardOffsetX = renderResult.offsetX;
            this.boardOffsetY = renderResult.offsetY;
            this.boardHexes = result.hexes;

            // Store the placements for later reference (e.g., saving to server)
            this.boardPlacements = result.clusters.map(p => ({
                clusterId: p.cluster.id,
                anchorQ: p.anchorQ,
                anchorR: p.anchorR,
                rotation: p.rotation
            }));

            // Position the Zeus token on the shallows hex
            if (result.zeusPosition) {
                this.zeusPosition = result.zeusPosition;
                this.positionZeusToken(result.zeusPosition.q, result.zeusPosition.r);
            }

            // Create ships at Zeus/shallows starting position
            this.createTestShips();

            // Create sample monsters
            this.createTestMonsters();

            // Create and distribute offering cubes on offering islands
            this.createTestOfferings();

            // Create statues on city island hexes
            this.createTestStatues();

            // Create and distribute temples on temple islands
            this.createTestTemples();

            // Create shrine overlays on shrine hexes
            this.createTestShrines();

            // Create oracle dice
            this.createTestDice();

            // Set up player board
            this.setupTestPlayerBoard();
        },

        /**
         * Restore board from saved placements (for loading existing games)
         * @param {Array} placements - Array of {clusterId, anchorQ, anchorR, rotation}
         */
        restoreBoardFromPlacements: function(placements) {
            console.log("Restoring board from saved placements");

            // Reconstruct hex data from placements
            const hexes = [];
            placements.forEach(p => {
                const cluster = this.clusterDefs.getCluster(p.clusterId);
                if (cluster) {
                    const worldHexes = this.clusterDefs.getWorldHexes(cluster, p.anchorQ, p.anchorR, p.rotation);
                    hexes.push(...worldHexes);
                }
            });

            // Convert placements to full cluster objects for renderer
            const clusters = placements.map(p => ({
                cluster: this.clusterDefs.getCluster(p.clusterId),
                anchorQ: p.anchorQ,
                anchorR: p.anchorR,
                rotation: p.rotation
            }));

            // Render the board
            const renderResult = this.boardRenderer.render({ clusters, hexes }, { padding: 100 });

            // Store offsets for piece positioning
            this.boardOffsetX = renderResult.offsetX;
            this.boardOffsetY = renderResult.offsetY;
            this.boardHexes = hexes;
            this.boardPlacements = placements;
        },

        /**
         * Set up click handlers for hexes
         */
        setupHexClickHandlers: function() {
            const hexes = document.querySelectorAll('.delphi-hex');
            hexes.forEach(hex => {
                hex.addEventListener('click', (e) => {
                    const q = parseInt(hex.dataset.q);
                    const r = parseInt(hex.dataset.r);
                    console.log(`Clicked hex (${q}, ${r})`, hex.dataset);
                    this.onHexClick(q, r, hex.dataset.type, hex.dataset.color);
                });
            });
        },

        /**
         * Handle hex click
         */
        onHexClick: function(q, r, type, color) {
            console.log('Hex clicked: q=' + q + ', r=' + r + ', type=' + type + ', color=' + color);

            // If a ship is selected and this hex is in range, move the ship there
            if (this.currentShipId && this.currentShipRange) {
                var key = q + ',' + r;
                if (this.currentShipRange.distances.has(key) && this.currentShipRange.distances.get(key) > 0) {
                    this.moveShipToHex(this.currentShipId, q, r);
                    return;
                }
            }

            // Clear range highlights if clicking outside range
            this.clearRangeOverlays();
            this.components.deselectShips();
            this.currentShipRange = null;
            this.currentShipId = null;
        },

        /**
         * Get pixel center for a hex coordinate using board offsets
         * @param {number} q - Hex q coordinate
         * @param {number} r - Hex r coordinate
         * @returns {Object|null} {x, y} pixel position or null
         */
        getHexCenterPixel: function(q, r) {
            if (this.boardRenderer) {
                return this.boardRenderer.getHexCenter(q, r, this.boardOffsetX, this.boardOffsetY);
            }
            // Fallback to hexGrid if available
            return this.hexGrid ? this.hexGrid.getHexCenter(q, r) : null;
        },

        /**
         * Convert a pixel position (relative to hex-grid container) to hex coordinates
         * @param {number} px - Pixel x relative to container
         * @param {number} py - Pixel y relative to container
         * @returns {Object|null} {q, r} or null
         */
        pixelToHexCoords: function(px, py) {
            if (this.boardRenderer) {
                // Remove board offsets to get raw hex-space pixel coords
                return this.boardRenderer.pixelToHex(
                    px - this.boardOffsetX,
                    py - this.boardOffsetY
                );
            }
            return this.hexGrid ? this.hexGrid.pixelToHex(px, py) : null;
        },

        /**
         * Position the Zeus token on the board at the specified hex coordinates
         * @param {number} q - Hex q coordinate
         * @param {number} r - Hex r coordinate
         */
        positionZeusToken: function(q, r) {
            const zeusToken = document.getElementById('delphi-zeus-token');
            if (!zeusToken) {
                console.error('Zeus token element not found');
                return;
            }

            const center = this.getHexCenterPixel(q, r);
            if (center) {
                // Center the token on the hex (token is 50x50px)
                zeusToken.style.left = (center.x - 25) + 'px';
                zeusToken.style.top = (center.y - 25) + 'px';
                console.log(`Zeus token positioned at hex (${q}, ${r}) -> pixel (${center.x}, ${center.y})`);
            } else {
                console.error(`Could not get pixel position for hex (${q}, ${r})`);
            }
        },

        // Ship offset positions for clustering on same hex (2x2 grid pattern)
        SHIP_CLUSTER_OFFSETS: [
            { dx: -16, dy: -10 },   // top-left
            { dx: 16,  dy: -10 },   // top-right
            { dx: -16, dy: 10 },    // bottom-left
            { dx: 16,  dy: 10 }     // bottom-right
        ],

        /**
         * Create test ships at Zeus/shallows starting position with offset clustering
         */
        createTestShips: function() {
            var self = this;
            var colors = ['red', 'blue', 'green', 'yellow'];
            var zeus = this.zeusPosition;
            this.shipPositions = {};

            if (zeus) {
                var center = this.getHexCenterPixel(zeus.q, zeus.r);
                if (center) {
                    colors.forEach(function(color, index) {
                        var offset = self.SHIP_CLUSTER_OFFSETS[index];
                        self.components.createShip(
                            index + 1, color,
                            center.x + offset.dx,
                            center.y + offset.dy
                        );
                        self.shipPositions[index + 1] = { q: zeus.q, r: zeus.r };
                    });
                }
            } else {
                // Fallback: place on random water hexes
                var waterHexes = this.boardHexes ?
                    this.boardHexes.filter(function(h) { return h.type === 'water'; }).slice(0, 4) :
                    [{ q: 2, r: 2 }, { q: 5, r: 3 }, { q: 1, r: 4 }, { q: 4, r: 5 }];
                waterHexes.forEach(function(hex, index) {
                    var center = self.getHexCenterPixel(hex.q, hex.r);
                    if (center) {
                        self.components.createShip(index + 1, colors[index], center.x, center.y);
                        self.shipPositions[index + 1] = { q: hex.q, r: hex.r };
                    }
                });
            }

            // Ship click handler (event delegation on board pieces)
            this.components.boardPieces.addEventListener('click', function(e) {
                var shipEl = e.target.closest('.delphi-ship');
                if (shipEl) {
                    e.stopPropagation();
                    var playerId = parseInt(shipEl.dataset.player);
                    self.onShipClick(playerId);
                }
            });
        },

        /**
         * Handle ship click — show water movement range (3 hexes, water only)
         */
        onShipClick: function(playerId) {
            console.log('Ship clicked: player ' + playerId);
            this.components.selectShip(playerId);

            var pos = this.shipPositions && this.shipPositions[playerId];
            if (!pos) return;

            this.showShipRange(playerId, pos.q, pos.r);
        },

        /**
         * Show movement range for a ship at given hex coordinates.
         * Creates hex overlay elements on the board for visual feedback.
         */
        showShipRange: function(playerId, q, r) {
            var self = this;
            this.clearRangeOverlays();

            // Build a set of water hex keys for passability check
            var waterKeys = new Set();
            if (this.boardHexes) {
                this.boardHexes.forEach(function(h) {
                    if (h.type === 'water') {
                        waterKeys.add(h.q + ',' + h.r);
                    }
                });
            }

            // BFS: 3 steps, water only (still needed for click-to-move validation)
            var result = this.hexGrid.getReachableHexes(q, r, 3, function(nq, nr) {
                return waterKeys.has(nq + ',' + nr);
            });

            this.currentShipRange = result;
            this.currentShipId = playerId;

            // Get ship pixel center as line origin
            var shipCenter = this.getHexCenterPixel(q, r);
            if (!shipCenter) return;

            // Create SVG overlay for directional range lines
            var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('class', 'ship-range-svg');
            // Match container size
            var container = this.components.boardPieces;
            svg.setAttribute('width', container.offsetWidth || '100%');
            svg.setAttribute('height', container.offsetHeight || '100%');

            // Walk each of the 6 hex directions and draw a polyline
            var directions = this.hexGrid.directions;
            for (var d = 0; d < directions.length; d++) {
                var dir = directions[d];
                var points = [shipCenter.x + ',' + shipCenter.y];

                for (var step = 1; step <= 3; step++) {
                    var hexQ = q + dir.q * step;
                    var hexR = r + dir.r * step;
                    var key = hexQ + ',' + hexR;
                    if (!result.distances.has(key)) break; // blocked
                    var center = self.getHexCenterPixel(hexQ, hexR);
                    if (!center) break;
                    points.push(center.x + ',' + center.y);
                }

                if (points.length > 1) {
                    var polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                    polyline.setAttribute('class', 'ship-range-line');
                    polyline.setAttribute('points', points.join(' '));
                    svg.appendChild(polyline);
                }
            }

            container.appendChild(svg);
            this._rangeSvg = svg;
        },

        /**
         * Remove range SVG overlay
         */
        clearRangeOverlays: function() {
            if (this._rangeSvg) {
                this._rangeSvg.remove();
                this._rangeSvg = null;
            }
        },

        /**
         * Move ship to a hex and update its stored position
         */
        moveShipToHex: function(playerId, q, r) {
            var center = this.getHexCenterPixel(q, r);
            if (center) {
                this.components.moveShip(playerId, center.x, center.y, true);
                if (!this.shipPositions) this.shipPositions = {};
                this.shipPositions[playerId] = { q: q, r: r };
            }

            // Clear range highlights
            this.clearRangeOverlays();
            this.components.deselectShips();
            this.currentShipRange = null;
            this.currentShipId = null;
        },

        /**
         * Create test monsters at various positions
         */
        createTestMonsters: function() {
            const monsterTypes = ['cyclops', 'minotaur', 'chimera', 'hydra', 'gorgon', 'siren'];

            // Find island hexes with monster attribute from the board
            const monsterHexes = this.boardHexes ?
                this.boardHexes.filter(h => h.attribute === 'monster' || h.attribute === 'two_monster') :
                [];

            // Helper to get random item from array
            const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];

            // Create 3 random monsters on each monster hex for visual testing
            const testMonsters = [];
            let monsterId = 1;

            if (monsterHexes.length > 0) {
                monsterHexes.forEach(hex => {
                    // Stack 3 random monsters on each hex
                    for (let i = 0; i < 3; i++) {
                        testMonsters.push({
                            id: monsterId++,
                            type: randomItem(monsterTypes),
                            q: hex.q,
                            r: hex.r
                        });
                    }
                });
            } else {
                // Fallback positions if no board hexes
                const fallbackHexes = [
                    { q: 4, r: 1 },
                    { q: 0, r: 3 },
                    { q: 6, r: 5 },
                    { q: 3, r: 6 }
                ];
                fallbackHexes.forEach(hex => {
                    for (let i = 0; i < 3; i++) {
                        testMonsters.push({
                            id: monsterId++,
                            type: randomItem(monsterTypes),
                            q: hex.q,
                            r: hex.r
                        });
                    }
                });
            }

            testMonsters.forEach(monster => {
                const center = this.getHexCenterPixel(monster.q, monster.r);
                if (center) {
                    this.components.createMonster(
                        monster.id,
                        monster.type,
                        center.x,
                        center.y,
                        monster.q,
                        monster.r
                    );
                }
            });

        },

        /**
         * Create and distribute offering cubes across offering islands
         */
        createTestOfferings: function() {
            // Find offering island hexes from the board
            const offeringHexes = this.boardHexes ?
                this.boardHexes.filter(h => h.attribute === 'offering') :
                [];

            if (offeringHexes.length === 0) {
                console.warn('No offering islands found on the board');
                return;
            }

            // Run the distribution algorithm: 24 cubes, 4 per island, no same color per island
            const assignments = this.components.distributeOfferings(offeringHexes);

            // Place each offering on the board
            assignments.forEach(offering => {
                const center = this.getHexCenterPixel(offering.q, offering.r);
                if (center) {
                    const hexKey = offering.q + ',' + offering.r;
                    this.components.createOffering(
                        offering.id,
                        offering.color,
                        center.x,
                        center.y,
                        offering.slotIndex,
                        hexKey
                    );
                }
            });
        },

        createTestStatues: function() {
            if (!this.boardPlacements || !this.clusterDefs) {
                console.warn('No board placements or cluster definitions for statues');
                return;
            }

            // Build a set of city hex positions from placements (rotation-aware)
            var cityHexPositions = {};  // "q,r" -> {color, rotation}
            var self = this;
            this.boardPlacements.forEach(function(p) {
                if (p.clusterId && p.clusterId.indexOf('city-') === 0) {
                    var color = p.clusterId.replace('city-', '');
                    var cluster = self.clusterDefs.getCluster(p.clusterId);
                    if (!cluster) return;

                    var worldHexes = self.clusterDefs.getWorldHexes(cluster, p.anchorQ, p.anchorR, p.rotation);
                    worldHexes.forEach(function(h) {
                        if (h.attribute === 'city') {
                            cityHexPositions[h.q + ',' + h.r] = { color: color, rotation: p.rotation };
                        }
                    });
                }
            });

            // Match against boardHexes for resolved positions
            var cities = [];
            if (this.boardHexes) {
                this.boardHexes.forEach(function(h) {
                    if (h.attribute === 'city') {
                        var key = h.q + ',' + h.r;
                        var data = cityHexPositions[key];
                        if (data) {
                            cities.push({ color: data.color, q: h.q, r: h.r, rotation: data.rotation });
                        }
                    }
                });
            }

            console.log('City statues: found ' + cities.length + ' cities', cities);

            if (cities.length === 0) {
                console.warn('No city hexes found on the board');
                return;
            }

            var assignments = this.components.buildStatueAssignments(cities);

            assignments.forEach(function(statue) {
                var center = self.getHexCenterPixel(statue.q, statue.r);
                if (center) {
                    self.components.createStatue(
                        statue.id,
                        statue.color,
                        center.x,
                        center.y,
                        statue.slotIndex,
                        statue.rotation
                    );
                }
            });
        },

        createTestTemples: function() {
            var templeHexes = this.boardHexes ?
                this.boardHexes.filter(function(h) { return h.attribute === 'temple'; }) :
                [];

            if (templeHexes.length === 0) {
                console.warn('No temple islands found on the board');
                return;
            }

            var assignments = this.components.distributeTemples(templeHexes);

            var self = this;
            assignments.forEach(function(temple) {
                var center = self.getHexCenterPixel(temple.q, temple.r);
                if (center) {
                    self.components.createTemple(
                        temple.id,
                        temple.color,
                        center.x,
                        center.y
                    );
                }
            });
        },

        createTestShrines: function() {
            var shrineHexes = this.boardHexes ?
                this.boardHexes.filter(function(h) { return h.attribute === 'shrine'; }) :
                [];

            if (shrineHexes.length === 0) {
                console.warn('No shrine hexes found on the board');
                return;
            }

            var assignments = this.components.distributeShrines(shrineHexes);

            var self = this;
            assignments.forEach(function(shrine) {
                var center = self.getHexCenterPixel(shrine.q, shrine.r);
                if (center) {
                    self.components.createShrine(
                        shrine.id,
                        shrine.overlay,
                        center.x,
                        center.y
                    );
                }
            });

            // Click handler for shrine flipping (event delegation) — toggles reveal
            this.components.boardPieces.addEventListener('click', function(e) {
                var shrineEl = e.target.closest('.delphi-shrine');
                if (shrineEl) {
                    var id = parseInt(shrineEl.dataset.shrineId, 10);
                    self.components.flipShrine(id);
                }
            });
        },

        /**
         * Prototype: place a blue temple + 4 blue offerings on the first temple hex
         */
        createTestTempleWithOfferings: function() {
            var templeHexes = this.boardHexes ?
                this.boardHexes.filter(function(h) { return h.attribute === 'temple'; }) :
                [];

            if (templeHexes.length === 0) {
                console.warn('No temple hexes found for prototype');
                return;
            }

            // Use the first temple hex
            var hex = templeHexes[0];
            var center = this.getHexCenterPixel(hex.q, hex.r);
            if (!center) return;

            var hexKey = hex.q + ',' + hex.r;

            // Place a blue temple at center
            this.components.createTemple(100, 'blue', center.x, center.y);

            // Place 4 blue offerings at cardinal positions around it
            for (var i = 0; i < 4; i++) {
                this.components.createTempleOffering(
                    100 + i,
                    'blue',
                    center.x,
                    center.y,
                    i,
                    hexKey
                );
            }
        },

        /**
         * Handle monster click (game action when targetable)
         */
        onMonsterClick: function(monsterId) {
            console.log(`Monster clicked: ${monsterId}`);
            // Toggle targetable state for demonstration
            this.components.setMonsterTargetable(monsterId);
        },

        /**
         * Set up all monster interaction handlers via event delegation on #delphi-board-pieces.
         * Called once in setup() — works for dynamically added monsters too.
         */
        setupMonsterInteractions: function() {
            const boardPieces = document.getElementById('delphi-board-pieces');
            const self = this;

            // --- CLICK: inspect panel or game action (desktop) ---
            boardPieces.addEventListener('click', function(e) {
                const monsterEl = e.target.closest('.delphi-monster');
                if (!monsterEl) return;
                e.stopPropagation();

                const id = parseInt(monsterEl.id.split('_')[1]);
                const hexKey = monsterEl.dataset.hexKey;

                // If in a targetable game state, handle game action
                if (monsterEl.classList.contains('monster-targetable')) {
                    self.onMonsterClick(id);
                    return;
                }

                // Otherwise, open inspection panel
                self.components.showMonsterInspectPanel(hexKey);
            });

            // --- MOBILE TOUCH HANDLERS ---
            let touchTimer = null;

            boardPieces.addEventListener('touchstart', function(e) {
                const monsterEl = e.target.closest('.delphi-monster');
                if (!monsterEl) return;

                // Long press timer (500ms) → open inspect panel
                touchTimer = setTimeout(function() {
                    touchTimer = null;
                    const hexKey = monsterEl.dataset.hexKey;
                    self.components.showMonsterInspectPanel(hexKey);
                }, 500);
            }, { passive: true });

            boardPieces.addEventListener('touchend', function(e) {
                const monsterEl = e.target.closest('.delphi-monster');
                if (!monsterEl) return;

                if (touchTimer) {
                    // Short tap (< 500ms): treat as click
                    clearTimeout(touchTimer);
                    touchTimer = null;

                    const id = parseInt(monsterEl.id.split('_')[1]);
                    const hexKey = monsterEl.dataset.hexKey;

                    // If targetable, treat as game action
                    if (monsterEl.classList.contains('monster-targetable')) {
                        self.onMonsterClick(id);
                    } else {
                        // Open inspection panel
                        self.components.showMonsterInspectPanel(hexKey);
                    }
                }
            }, { passive: true });

            boardPieces.addEventListener('touchmove', function(e) {
                // Cancel long press if finger moves
                if (touchTimer) {
                    clearTimeout(touchTimer);
                    touchTimer = null;
                }
            }, { passive: true });

            // Click outside to dismiss inspect panel
            document.addEventListener('click', function(e) {
                if (!e.target.closest('.delphi-monster') &&
                    !e.target.closest('.monster-inspect-content')) {
                    self.components.hideMonsterInspectPanel();
                }
            });
        },

        /**
         * Create test oracle dice
         */
        createTestDice: function() {
            // Create dice with random colors
            const testColors = ['red', 'blue', 'green'];
            this.components.createOracleDice(1, testColors);

            // Set up dice click handlers
            document.querySelectorAll('.delphi-die').forEach(die => {
                die.addEventListener('click', (e) => {
                    const index = parseInt(die.dataset.index);
                    this.onDieClick(index);
                });
            });
        },

        /**
         * Handle die click
         */
        onDieClick: function(index) {
            console.log(`Die clicked: index ${index}`);
            this.components.selectDie(1, index);
            this.selectedDieIndex = index;
        },

        /**
         * Set up test player board with ALL possible card areas populated
         * This shows the full layout with maximum items for visual testing
         */
        setupTestPlayerBoard: function() {
            // Initialize god track for 4 players
            this.components.initGodTrack(4);

            // Initialize god tokens for test player at starting positions (row 0)
            this.components.initializePlayerGods(1, '#E53935'); // Red player - all gods start at row 0

            // Set shield value (test at value 3, red player)
            this.components.setShieldValue(3, 'red');

            // Create sample Zeus tiles (4 groups of 3) - all 12 tiles
            // For test player (red), shrines use red-player images
            const playerColor = 'red';
            const shrineLetters = {
                red: ['omega', 'phi', 'psi'],
                yellow: ['omega', 'psi', 'sigma'],
                green: ['phi', 'psi', 'sigma'],
                blue: ['omega', 'phi', 'sigma']
            };
            const playerShrines = shrineLetters[playerColor] || shrineLetters.red;

            // Offerings - randomly select 3 from 5 available
            const allOfferings = ['any', 'blue', 'green', 'pink', 'yellow'];
            const shuffledOfferings = allOfferings.sort(() => Math.random() - 0.5);
            const selectedOfferings = shuffledOfferings.slice(0, 3);

            // Monsters - randomly select 3 from 5 available
            const allMonsters = ['any', 'chimera', 'cyclops', 'minotaur', 'siren'];
            const shuffledMonsters = allMonsters.sort(() => Math.random() - 0.5);
            const selectedMonsters = shuffledMonsters.slice(0, 3);

            const testTiles = [
                // Shrines - player color specific
                { id: 1, type: 'shrine', color: 'red', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/shrines/${playerColor}-player-${playerShrines[0]}.jpg` },
                { id: 2, type: 'shrine', color: 'blue', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/shrines/${playerColor}-player-${playerShrines[1]}.jpg` },
                { id: 3, type: 'shrine', color: 'green', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/shrines/${playerColor}-player-${playerShrines[2]}.jpg` },
                // Statues - all use same player-specific image
                { id: 4, type: 'statue', color: 'yellow', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/statues/${playerColor}-player.jpg` },
                { id: 5, type: 'statue', color: 'pink', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/statues/${playerColor}-player.jpg` },
                { id: 6, type: 'statue', color: 'black', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/statues/${playerColor}-player.jpg` },
                // Offerings - randomly selected 3 from 5 available
                { id: 7, type: 'offering', color: 'blue', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/offerings/${playerColor}-player-${selectedOfferings[0]}.jpg` },
                { id: 8, type: 'offering', color: 'green', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/offerings/${playerColor}-player-${selectedOfferings[1]}.jpg` },
                { id: 9, type: 'offering', color: 'black', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/offerings/${playerColor}-player-${selectedOfferings[2]}.jpg` },
                // Monsters - randomly selected 3 from 5 available
                { id: 10, type: 'monster', color: 'red', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/monsters/${playerColor}-player-${selectedMonsters[0]}.jpg` },
                { id: 11, type: 'monster', color: 'yellow', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/monsters/${playerColor}-player-${selectedMonsters[1]}.jpg` },
                { id: 12, type: 'monster', color: 'pink', completed: false, imgUrl: g_gamethemeurl + `img/zeus-tiles/monsters/${playerColor}-player-${selectedMonsters[2]}.jpg` }
            ];
            this.components.createZeusTiles(testTiles);

            // Test Oracle Cards (left side) - all 6 colors with stacking
            this.components.addOracleCardToHand('red');
            this.components.addOracleCardToHand('red');    // Stack of 2 red
            this.components.addOracleCardToHand('blue');
            this.components.addOracleCardToHand('blue');
            this.components.addOracleCardToHand('green');
            this.components.addOracleCardToHand('green');
            this.components.addOracleCardToHand('green');  // Stack of 3 green
            this.components.addOracleCardToHand('yellow');
            this.components.addOracleCardToHand('pink');
            this.components.addOracleCardToHand('black');
            this.components.addOracleCardToHand('black');  // Stack of 2 black

            // Test Played Oracle Card (top left, rotated)
            this.components.playOracleCard('blue');

            // Test Injury Cards (bottom left) - multiple colors with stacking
            this.components.addInjuryCard('black');
            this.components.addInjuryCard('blue');
            this.components.addInjuryCard('red');
            this.components.addInjuryCard('yellow');
            this.components.addInjuryCard('yellow');       // Stack of 2 yellow
            this.components.addInjuryCard('green');
            this.components.addInjuryCard('pink');
            this.components.addInjuryCard('pink');
            this.components.addInjuryCard('pink');         // Stack of 3 pink

            // Test Favor Tokens (top right) - a good amount
            this.components.setFavorTokenCount(7);

            // Test Equipment Cards (bottom right) - max 4 cards with actual images
            this.components.addEquipmentCard(1, g_gamethemeurl + 'img/equipment/card-001.jpg');
            this.components.addEquipmentCard(2, g_gamethemeurl + 'img/equipment/card-005.jpg');
            this.components.addEquipmentCard(3, g_gamethemeurl + 'img/equipment/card-010.jpg');
            this.components.addEquipmentCard(4, g_gamethemeurl + 'img/equipment/card-015.jpg');

            // Test Companion Cards (right side) - max 3 cards with actual images
            this.components.addCompanionCard(1, 'hero', 'red', g_gamethemeurl + 'img/companion/red-card-0.png');
            this.components.addCompanionCard(2, 'demigod', 'blue', g_gamethemeurl + 'img/companion/blue-card-1.png');
            this.components.addCompanionCard(3, 'creature', 'green', g_gamethemeurl + 'img/companion/green-card-2.png');

            // Test Ship Tile (on ship area at 8 degrees rotation)
            // Using a ship tile that grants expanded storage (4 slots)
            this.components.setShipTile(1, g_gamethemeurl + 'img/ship-tiles/ship-2.jpg', true);

            // Test Ship Storage - fill all 4 slots (expanded storage)
            this.components.addToShipStorage('statue', 'red');
            this.components.addToShipStorage('offering', 'blue');
            this.components.addToShipStorage('statue', 'yellow');
            this.components.addToShipStorage('offering', 'green');

            // Test Defeated Monsters - fill all 3 slots (type, color)
            this.components.addDefeatedMonster('cyclops', 'red');
            this.components.addDefeatedMonster('minotaur', 'blue');
            this.components.addDefeatedMonster('hydra', 'green');
        },

        /**
         * Setup from actual game data (for production use)
         */
        setupFromGameData: function(gamedatas) {
            // Create hex grid from data
            if (gamedatas.hexes) {
                this.hexGrid.createGrid(gamedatas.hexes);
            }

            // Create ships
            if (gamedatas.ships) {
                Object.values(gamedatas.ships).forEach(ship => {
                    const center = this.hexGrid.getHexCenter(ship.q, ship.r);
                    if (center) {
                        this.components.createShip(ship.player_id, ship.color, center.x, center.y);
                    }
                });
            }

            // Create monsters
            if (gamedatas.monsters) {
                Object.values(gamedatas.monsters).forEach(monster => {
                    const center = this.hexGrid.getHexCenter(monster.q, monster.r);
                    if (center) {
                        this.components.createMonster(
                            monster.id,
                            monster.type,
                            center.x,
                            center.y,
                            monster.q,
                            monster.r
                        );
                    }
                });
            }

            // Set up player board
            if (gamedatas.currentPlayer) {
                const player = gamedatas.currentPlayer;
                this.components.setShieldValue(player.shield || 0, player.color || 'blue');
                document.getElementById('delphi-favor-count').textContent = player.favor || 0;
            }
        },


        ///////////////////////////////////////////////////
        //// Game & client states

        onEnteringState: function( stateName, args )
        {
            console.log( 'Entering state: '+stateName, args );

            switch( stateName )
            {
                case 'playerActions':
                    // Highlight available actions
                    break;

                case 'selectAction':
                    // Show possible targets based on selected die
                    break;

                case 'combatRound':
                    // Show combat dialog
                    break;
            }
        },

        onLeavingState: function( stateName )
        {
            console.log( 'Leaving state: '+stateName );

            switch( stateName )
            {
                case 'playerActions':
                    this.clearRangeOverlays();
                    this.components.deselectShips();
                    break;

                case 'selectAction':
                    this.clearRangeOverlays();
                    break;
            }
        },

        onUpdateActionButtons: function( stateName, args )
        {
            console.log( 'onUpdateActionButtons: '+stateName, args );

            if( this.isCurrentPlayerActive() )
            {
                switch( stateName )
                {
                    case 'playerActions':
                        this.statusBar.addActionButton(_('End Turn'), () => this.onEndTurn(), { color: 'secondary' });
                        break;

                    case 'combatRound':
                        this.statusBar.addActionButton(_('Roll'), () => this.onRollBattleDie(), { color: 'primary' });
                        break;

                    case 'combatResult':
                        if (args && args.canContinue) {
                            this.statusBar.addActionButton(_('Continue Fight'), () => this.onContinueFight());
                        }
                        this.statusBar.addActionButton(_('Surrender'), () => this.onSurrender(), { color: 'secondary' });
                        break;
                }
            }
        },

        ///////////////////////////////////////////////////
        //// Player's action

        onEndTurn: function() {
            console.log('End turn clicked');
            this.bgaPerformAction("actEndTurn", {});
        },

        onRollBattleDie: function() {
            console.log('Roll battle die clicked');
            this.bgaPerformAction("actRollBattleDie", {});
        },

        onContinueFight: function() {
            console.log('Continue fight clicked');
            this.bgaPerformAction("actContinueFight", {});
        },

        onSurrender: function() {
            console.log('Surrender clicked');
            this.bgaPerformAction("actSurrender", {});
        },

        ///////////////////////////////////////////////////
        //// Reaction to cometD notifications

        setupNotifications: function()
        {
            console.log( 'notifications subscriptions setup' );
            this.bgaSetupPromiseNotifications();
        },

        notif_shipMoved: async function(args) {
            console.log('notif_shipMoved', args);
            var center = this.getHexCenterPixel(args.q, args.r);
            if (center) {
                this.components.moveShip(args.player_id, center.x, center.y, true);
                // Update stored position
                if (!this.shipPositions) this.shipPositions = {};
                this.shipPositions[args.player_id] = { q: args.q, r: args.r };
            }
        },

        notif_monsterDefeated: async function(args) {
            console.log('notif_monsterDefeated', args);
            this.components.removeMonster(args.monster_id);
        },

        notif_diceRolled: async function(args) {
            console.log('notif_diceRolled', args);
            await this.components.animateDiceRoll(args.player_id, args.colors);
        },

        notif_shieldChanged: async function(args) {
            console.log('notif_shieldChanged', args);
            this.components.setShieldValue(args.value, args.playerColor);
        },

        notif_taskCompleted: async function(args) {
            console.log('notif_taskCompleted', args);
            this.components.completeZeusTile(args.tile_id);
        }
   });
});
