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
var DELPHI_JS_VERSION = "v31";

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
    g_gamethemeurl + "modules/js/DevTools.js?" + DELPHI_JS_VERSION,
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
        devTools: null,

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

            // Initialize dev tools (test/demo mode)
            this.devTools = new delphi.DevTools(this);

            // Check if we have saved board placements from server
            if (gamedatas && gamedatas.boardPlacements && gamedatas.boardPlacements.length > 0) {
                // Server-generated board
                this.restoreBoardFromPlacements(gamedatas.boardPlacements);
                if (gamedatas.zeusPosition) {
                    this.zeusPosition = {
                        q: parseInt(gamedatas.zeusPosition.q),
                        r: parseInt(gamedatas.zeusPosition.r)
                    };
                    this.positionZeusToken(this.zeusPosition.q, this.zeusPosition.r);
                }
                // Create ships from real player data
                if (gamedatas.players) {
                    this.createShipsFromGamedata(gamedatas.players);
                }
                // Create oracle dice from real player data
                if (gamedatas.oracleDice) {
                    this.createOracleDiceFromGamedata(gamedatas.oracleDice);
                }
                // Create monsters from real server data
                this.setupMonstersFromGamedata(gamedatas);
                // Place remaining test pieces (offerings, statues, temples) until real data available
                this.devTools.createTestOfferings();
                this.devTools.createTestStatues();
                this.devTools.createTestTemples();
            } else if (gamedatas && gamedatas.hexes) {
                // Legacy: Use actual game data
                this.setupFromGameData(gamedatas);
            } else {
                // Pure client-side dev mode (no server)
                this.devTools.createTestBoard();
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
            this.devTools.setupTestToolbar();

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
            var container = document.getElementById('delphi-board-container');
            var hexGrid = document.getElementById('delphi-hex-grid');
            if (!container || !hexGrid) return;

            container.addEventListener('click', function(e) {
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
         * Restore board from saved placements (for loading existing games)
         * @param {Array} placements - Array of {clusterId, anchorQ, anchorR, rotation}
         */
        restoreBoardFromPlacements: function(placements) {
            console.log("Restoring board from saved placements");

            // Normalize placement values (DB returns strings, need integers)
            placements = placements.map(p => ({
                clusterId: p.clusterId,
                anchorQ: parseInt(p.anchorQ),
                anchorR: parseInt(p.anchorR),
                rotation: parseInt(p.rotation)
            }));

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

            // If in moveShip state with server-provided reachable hexes, call server
            if (this._moveShipReachable) {
                var key = q + ',' + r;
                if (this._moveShipReachable.has(key)) {
                    this.bgaPerformAction("actConfirmMove", { q: q, r: r });
                    return;
                }
            }

            // If a ship is selected and this hex is in range (dev/preview mode)
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
                // Remove board offsets and half-hex centering to invert getHexCenter
                return this.boardRenderer.pixelToHex(
                    px - this.boardOffsetX - this.boardRenderer.hexWidth / 2,
                    py - this.boardOffsetY - this.boardRenderer.hexHeight / 2
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

        // Map BGA hex color codes to ship CSS color names
        BGA_COLOR_TO_SHIP: {
            'dc3545': 'red',
            'ffc107': 'yellow',
            '28a745': 'green',
            '007bff': 'blue'
        },

        /**
         * Handle ship click — show water movement range (3 hexes, water only)
         */
        onShipClick: function(playerId) {
            console.log('Ship clicked: player ' + playerId);

            // During active game states, ship clicks are handled by the state flow, not here
            if (this.isCurrentPlayerActive()) {
                return;
            }

            // Toggle: clicking the already-selected ship deselects it
            if (this.currentShipId === playerId) {
                this.clearRangeOverlays();
                this.components.deselectShips();
                this.currentShipRange = null;
                this.currentShipId = null;
                return;
            }

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
         * Show pulsing overlay markers on reachable hexes
         */
        _showReachableOverlays: function(reachable) {
            this._clearReachableOverlays();
            var self = this;
            this._reachableOverlays = [];
            var container = document.getElementById('delphi-hex-grid');

            reachable.forEach(function(h) {
                var center = self.getHexCenterPixel(h.q, h.r);
                if (center) {
                    var el = document.createElement('div');
                    el.className = 'hex-reachable-marker';
                    el.style.left = (center.x - 27) + 'px';
                    el.style.top = (center.y - 27) + 'px';
                    container.appendChild(el);
                    self._reachableOverlays.push(el);
                }
            });
        },

        /**
         * Remove reachable hex overlay markers
         */
        _clearReachableOverlays: function() {
            if (this._reachableOverlays) {
                this._reachableOverlays.forEach(function(el) { el.remove(); });
                this._reachableOverlays = null;
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
         * Create oracle dice from server gamedatas for the current player
         */
        createOracleDiceFromGamedata: function(oracleDice) {
            var self = this;
            var myId = this.player_id;
            var myDice = oracleDice.filter(function(d) {
                return parseInt(d.playerId) === myId;
            });
            var colors = myDice.map(function(d) { return d.color; });
            if (colors.length > 0) {
                this.components.createOracleDice(myId, colors);
                // Mark used dice
                myDice.forEach(function(d) {
                    if (parseInt(d.isUsed)) {
                        self.components.useDie(myId, parseInt(d.dieIndex));
                    }
                });
            }
        },

        /**
         * Create ships from server gamedatas (real player data)
         */
        createShipsFromGamedata: function(players) {
            var self = this;
            this.shipPositions = {};

            // Set up ship click handler (event delegation)
            this.components.boardPieces.addEventListener('click', function(e) {
                var shipEl = e.target.closest('.delphi-ship');
                if (shipEl) {
                    e.stopPropagation();
                    var playerId = parseInt(shipEl.dataset.player);
                    self.onShipClick(playerId);
                }
            });

            Object.keys(players).forEach(function(pid) {
                var p = players[pid];
                var q = parseInt(p.shipQ);
                var r = parseInt(p.shipR);
                var color = self.BGA_COLOR_TO_SHIP[p.playerColor] || 'red';
                var center = self.getHexCenterPixel(q, r);
                if (center) {
                    self.components.createShip(
                        parseInt(pid), color,
                        center.x,
                        center.y
                    );
                    self.shipPositions[parseInt(pid)] = { q: q, r: r };
                }
            });
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
         * Handle die click
         */
        onDieClick: function(index) {
            console.log(`Die clicked: index ${index}`);
            this.components.selectDie(1, index);
            this.selectedDieIndex = index;
        },

        /**
         * Create monsters from server gamedatas
         */
        setupMonstersFromGamedata: function(gamedatas) {
            if (!gamedatas.monsters) return;
            Object.values(gamedatas.monsters).forEach(monster => {
                if (parseInt(monster.isDefeated)) return;
                var mq = parseInt(monster.hexQ);
                var mr = parseInt(monster.hexR);
                var center = this.getHexCenterPixel(mq, mr);
                if (center) {
                    this.components.createMonster(
                        monster.id,
                        monster.monsterType,
                        center.x,
                        center.y,
                        mq,
                        mr
                    );
                }
            });
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
                    if (parseInt(monster.isDefeated)) return;
                    var mq = parseInt(monster.hexQ);
                    var mr = parseInt(monster.hexR);
                    const center = this.hexGrid.getHexCenter(mq, mr);
                    if (center) {
                        this.components.createMonster(
                            monster.id,
                            monster.monsterType,
                            center.x,
                            center.y,
                            mq,
                            mr
                        );
                    }
                });
            }

            // Set up player board
            if (gamedatas.currentPlayer) {
                const player = gamedatas.currentPlayer;
                this.components.setShieldValue(player.shield || 0, player.color || 'blue');
                var favorBadge = document.querySelector('.favor-count-badge');
                if (favorBadge) favorBadge.textContent = player.favor || 0;
            }
        },


        ///////////////////////////////////////////////////
        //// Game & client states

        onEnteringState: function( stateName, args )
        {
            console.log( 'Entering state: '+stateName, args );

            switch( stateName )
            {
                case 'PlayerActions':
                    console.log('playerActions check:', 'active=' + this.isCurrentPlayerActive(), 'args.args=', args.args);
                    if (this.isCurrentPlayerActive() && args.args && args.args.dice) {
                        this._setupDieClickHandlers(args.args.dice);
                    }
                    break;

                case 'SelectAction':
                    // Show possible targets based on selected die
                    break;

                case 'MoveShip':
                    if (this.isCurrentPlayerActive() && args.args) {
                        // Auto-select the current player's ship
                        this.components.selectShip(this.player_id);

                        var reachable = args.args.reachableHexes;
                        if (reachable && reachable.length > 0) {
                            this._showReachableOverlays(reachable);
                            this._moveShipReachable = new Set(reachable.map(function(h) {
                                return h.q + ',' + h.r;
                            }));
                        }
                    }
                    break;

                case 'CombatRound':
                case 'CombatDefeat':
                    if (!this.isCurrentPlayerActive()) break;
                    this._populateCombatDialog(args.args || {});
                    break;
                case 'CombatVictory':
                    // Dialog stays as-is; victory text shown in action bar
                    break;
            }
        },

        onLeavingState: function( stateName )
        {
            console.log( 'Leaving state: '+stateName );

            switch( stateName )
            {
                case 'PlayerActions':
                    this._teardownDieClickHandlers();
                    this.clearRangeOverlays();
                    this.components.deselectShips();
                    break;

                case 'SelectAction':
                    this.clearRangeOverlays();
                    break;

                case 'MoveShip':
                    this._clearReachableOverlays();
                    this.components.deselectShips();
                    this._moveShipReachable = null;
                    break;

                case 'CombatRound':
                case 'CombatDefeat':
                    break;
                case 'CombatVictory':
                    document.getElementById('delphi-equipment-strip').style.display = 'none';
                    document.getElementById('delphi-combat-dialog').classList.remove('active');
                    this.components.clearBattleDie();
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
                    case 'PlayerActions':
                        this.statusBar.addActionButton(_('End Turn'), () => this.onEndTurn(), { color: 'secondary' });
                        break;

                    case 'SelectAction':
                        this.statusBar.addActionButton(_('Move Ship'), () => {
                            this.bgaPerformAction("actMoveShip", {});
                        });
                        if (args && args.fightableMonsters && args.fightableMonsters.length > 0) {
                            var monsters = args.fightableMonsters;
                            if (monsters.length === 1) {
                                this.statusBar.addActionButton(_('Fight Monster'), () => {
                                    this.bgaPerformAction("actFightMonster", { monster_id: monsters[0].monster_id });
                                }, { color: 'red' });
                            } else {
                                monsters.forEach(m => {
                                    this.statusBar.addActionButton(_('Fight ' + m.monster_type), () => {
                                        this.bgaPerformAction("actFightMonster", { monster_id: m.monster_id });
                                    }, { color: 'red' });
                                });
                            }
                        }
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actCancelDieSelection", {});
                        }, { color: 'secondary' });
                        break;

                    case 'MoveShip':
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actPass", {});
                        }, { color: 'secondary' });
                        break;

                    case 'CombatRound':
                        var strengthText = (args && args.strength !== undefined) ? ' (need ' + args.strength + '+)' : '';
                        this.statusBar.addActionButton(_('Roll Battle Die') + strengthText, () => this.onRollBattleDie(), { color: 'primary' });
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actCancelCombat", {});
                        }, { color: 'secondary' });
                        break;

                    case 'CombatDefeat':
                        if (args && args.canContinue) {
                            this.statusBar.addActionButton(
                                _('Pay 1 Favor to continue') + ' (' + args.favorTokens + ' left)',
                                () => this.onContinueFight()
                            );
                        }
                        this.statusBar.addActionButton(_('Surrender'), () => this.onSurrender(), { color: 'secondary' });
                        break;

                    case 'CombatVictory':
                        var victoryMonster = (args && args.monster_type) || 'Monster';
                        victoryMonster = victoryMonster.charAt(0).toUpperCase() + victoryMonster.slice(1);
                        var titleEl = document.getElementById('pagemaintitletext');
                        if (titleEl) titleEl.innerHTML = 'You defeated the ' + victoryMonster + '!';
                        var self = this;
                        this._equipmentCards = args.equipmentDisplay || [];
                        this.statusBar.addActionButton(_('Select Equipment Card'), function() {
                            document.getElementById('delphi-combat-dialog').classList.remove('active');
                            self.components.clearBattleDie();
                            self._showEquipmentStrip();
                        }, { color: 'primary' });
                        break;
                }
            }
        },

        ///////////////////////////////////////////////////
        //// Player's action

        /**
         * Set up oracle die click handlers for die selection in playerActions state
         */
        _setupDieClickHandlers: function(dice) {
            var self = this;
            this._dieClickHandlers = [];
            console.log('_setupDieClickHandlers: player_id=' + this.player_id + ', dice=', dice);
            dice.forEach(function(die) {
                var elId = 'die_' + self.player_id + '_' + die.die_index;
                console.log('  Looking for element: ' + elId + ', is_used=' + die.is_used, document.getElementById(elId));
                if (parseInt(die.is_used) === 0) {
                    var dieEl = document.getElementById(elId);
                    if (dieEl) {
                        dieEl.classList.add('die-selectable');
                        var handler = function() {
                            self.bgaPerformAction("actSelectDie", { die_index: parseInt(die.die_index) });
                        };
                        dieEl.addEventListener('click', handler);
                        self._dieClickHandlers.push({ el: dieEl, handler: handler });
                    }
                }
            });
        },

        /**
         * Remove oracle die click handlers
         */
        _teardownDieClickHandlers: function() {
            if (this._dieClickHandlers) {
                this._dieClickHandlers.forEach(function(item) {
                    item.el.classList.remove('die-selectable');
                    item.el.removeEventListener('click', item.handler);
                });
                this._dieClickHandlers = null;
            }
        },

        onEndTurn: function() {
            console.log('End turn clicked');
            this.bgaPerformAction("actEndTurn", {});
        },

        _populateCombatDialog: function(combatArgs) {
            var dialog = document.getElementById('delphi-combat-dialog');
            dialog.classList.add('active');
            // Set title
            var mName = combatArgs.monster_type || 'Monster';
            mName = mName.charAt(0).toUpperCase() + mName.slice(1);
            var titleEl = document.getElementById('combat-title');
            if (titleEl) titleEl.textContent = 'Fighting the ' + mName;
            // Set monster image
            var imgEl = document.getElementById('combat-monster-image');
            if (imgEl && combatArgs.monster_type) {
                imgEl.style.backgroundImage = "url('" + g_gamethemeurl + "img/monsters/" + combatArgs.monster_type + ".jpg')";
            }
            // Set shield and target values
            var shieldEl = document.getElementById('combat-shield-value');
            if (shieldEl) shieldEl.textContent = combatArgs.shield_value != null ? combatArgs.shield_value : 0;
            var targetEl = document.getElementById('combat-target-value');
            if (targetEl) targetEl.textContent = combatArgs.strength != null ? combatArgs.strength : '';
            // Show roll result if available
            var resultRow = document.getElementById('combat-result-row');
            var resultEl = document.getElementById('combat-roll-result');
            if (combatArgs.roll != null) {
                if (resultRow) resultRow.style.display = '';
                if (resultEl) resultEl.textContent = combatArgs.roll;
            } else {
                if (resultRow) resultRow.style.display = 'none';
                if (resultEl) resultEl.textContent = '';
            }
        },

        _showEquipmentStrip: function() {
            var strip = document.getElementById('delphi-equipment-strip');
            var container = document.getElementById('equipment-strip-cards');
            container.innerHTML = '';
            var self = this;
            this._selectedEquipmentId = null;

            // Update action bar text, remove buttons
            var titleEl = document.getElementById('pagemaintitletext');
            if (titleEl) titleEl.innerHTML = 'Select one Equipment card';
            var actionBar = document.getElementById('generalactions');
            if (actionBar) actionBar.innerHTML = '';

            // Build card elements
            this._equipmentCards.forEach(function(card) {
                var cardEl = document.createElement('div');
                cardEl.className = 'equipment-card';
                cardEl.dataset.cardId = card.card_id;
                var cardNum = String(card.card_type_arg).padStart(3, '0');
                cardEl.style.backgroundImage = "url('" + g_gamethemeurl + "img/equipment/card-" + cardNum + ".jpg')";
                cardEl.addEventListener('click', function() {
                    self._selectEquipmentCard(parseInt(card.card_id));
                });
                container.appendChild(cardEl);
            });

            strip.style.display = '';
            // Insert after the page title / action bar
            var pageTitle = document.getElementById('page-title');
            if (pageTitle && pageTitle.parentNode) {
                pageTitle.parentNode.insertBefore(strip, pageTitle.nextSibling);
            }
        },

        _selectEquipmentCard: function(cardId) {
            this._selectedEquipmentId = cardId;
            // Update checkmark overlays
            var cards = document.querySelectorAll('#equipment-strip-cards .equipment-card');
            cards.forEach(function(el) {
                var existing = el.querySelector('.equipment-check-overlay');
                if (parseInt(el.dataset.cardId) === cardId) {
                    if (!existing) {
                        var overlay = document.createElement('div');
                        overlay.className = 'equipment-check-overlay';
                        overlay.innerHTML = '&#10003;';
                        el.appendChild(overlay);
                    }
                } else {
                    if (existing) existing.remove();
                }
            });
            // Show Confirm / Cancel in action bar
            var self = this;
            var actionBar = document.getElementById('generalactions');
            if (actionBar) actionBar.innerHTML = '';
            this.statusBar.addActionButton(_('Confirm'), function() {
                self.bgaPerformAction("actSelectEquipment", { card_id: cardId });
            }, { color: 'primary' });
            this.statusBar.addActionButton(_('Cancel'), function() {
                self._deselectEquipmentCard();
            }, { color: 'secondary' });
        },

        _deselectEquipmentCard: function() {
            this._selectedEquipmentId = null;
            // Remove all check overlays
            var overlays = document.querySelectorAll('#equipment-strip-cards .equipment-check-overlay');
            overlays.forEach(function(el) { el.remove(); });
            // Restore action bar text, remove buttons
            var titleEl = document.getElementById('pagemaintitletext');
            if (titleEl) titleEl.innerHTML = 'Select one Equipment card';
            var actionBar = document.getElementById('generalactions');
            if (actionBar) actionBar.innerHTML = '';
        },

        onRollBattleDie: function() {
            console.log('Roll battle die clicked');
            this.bgaPerformAction("actRollBattleDie", {});
        },

        onContinueFight: function() {
            console.log('Continue fight clicked');
            this.bgaPerformAction("actPayFavor", {});
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
                var isMe = (args.player_id == this.player_id);
                this.components.moveShip(args.player_id, center.x, center.y, isMe);
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
        },

        notif_dieSelected: async function(args) {
            console.log('notif_dieSelected', args);
            this.components.selectDie(parseInt(args.player_id), parseInt(args.die_index));
        },

        notif_dieCancelled: async function(args) {
            console.log('notif_dieCancelled', args);
            this.components.selectDie(parseInt(args.player_id), -1); // deselect all
        },

        notif_dieUsed: async function(args) {
            console.log('notif_dieUsed', args);
            this.components.useDie(parseInt(args.player_id), parseInt(args.die_index));
        },

        notif_combatStart: async function(args) {
            console.log('notif_combatStart', args);
            // Dialog population now handled by onEnteringState for CombatRound
        },

        notif_battleDieRolled: async function(args) {
            console.log('notif_battleDieRolled', args);
            try {
                await Promise.race([
                    this.components.rollBattleDie(parseInt(args.roll)),
                    new Promise(resolve => setTimeout(resolve, 5000))
                ]);
            } catch (e) {
                console.error('Battle die animation failed:', e);
            }
            // Show roll result in stats area
            var resultRow = document.getElementById('combat-result-row');
            if (resultRow) resultRow.style.display = '';
            var resultEl = document.getElementById('combat-roll-result');
            if (resultEl) resultEl.textContent = args.roll;
        },

        notif_combatInjury: async function(args) {
            console.log('notif_combatInjury', args);
            if (args.player_id == this.player_id) {
                this.components.addInjuryCard(args.color);
            }
        },

        notif_combatContinue: async function(args) {
            console.log('notif_combatContinue', args);
            if (args.player_id == this.player_id) {
                var badge = document.querySelector('.favor-count-badge');
                if (badge) badge.textContent = args.favor_remaining;
            }
        },

        notif_combatSurrender: async function(args) {
            console.log('notif_combatSurrender', args);
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
        },

        notif_combatCancelled: async function(args) {
            console.log('notif_combatCancelled', args);
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
            // Restore the die visually
            if (args.die_index != null) {
                this.components.restoreDie(parseInt(args.player_id), parseInt(args.die_index));
            }
        },

        notif_equipmentSelected: async function(args) {
            console.log('notif_equipmentSelected', args);
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
        },

        notif_consultOracle: async function(args) {
            console.log('notif_consultOracle', args);
        },

        notif_endTurn: async function(args) {
            console.log('notif_endTurn', args);
        }
   });
});
