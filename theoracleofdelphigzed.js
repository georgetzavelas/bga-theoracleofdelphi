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
var DELPHI_JS_VERSION = "v3";

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

            // Setup game notifications
            this.setupNotifications();

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

            // Create sample ships
            this.createTestShips();

            // Create sample monsters
            this.createTestMonsters();

            // Create oracle dice
            this.createTestDice();

            // Set up player board
            this.setupTestPlayerBoard();

            // Create equipment display
            this.createTestEquipmentDisplay();
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
            // For Phase 1: Just log and show visual feedback
            console.log(`Hex clicked: q=${q}, r=${r}, type=${type}, color=${color}`);

            // Clear previous highlights
            this.hexGrid.clearHighlights();

            // Highlight neighbors for demonstration
            const neighbors = this.hexGrid.getNeighbors(q, r);
            this.hexGrid.highlightValidHexes(neighbors);
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
         * Create test ships at various positions
         */
        createTestShips: function() {
            // Find some water hexes from the board to place ships
            const waterHexes = this.boardHexes ?
                this.boardHexes.filter(h => h.type === 'water').slice(0, 4) :
                [{ q: 2, r: 2 }, { q: 5, r: 3 }, { q: 1, r: 4 }, { q: 4, r: 5 }];

            const colors = ['red', 'blue', 'green', 'yellow'];

            waterHexes.forEach((hex, index) => {
                const center = this.getHexCenterPixel(hex.q, hex.r);
                if (center) {
                    this.components.createShip(index + 1, colors[index], center.x, center.y);
                }
            });

            // Set up ship click handlers
            document.querySelectorAll('.delphi-ship').forEach(ship => {
                ship.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const playerId = parseInt(ship.dataset.player);
                    this.onShipClick(playerId);
                });
            });
        },

        /**
         * Handle ship click
         */
        onShipClick: function(playerId) {
            console.log(`Ship clicked: player ${playerId}`);
            this.components.selectShip(playerId);
        },

        /**
         * Create test monsters at various positions
         */
        createTestMonsters: function() {
            const monsterTypes = ['cyclops', 'minotaur', 'chimera', 'hydra', 'gorgon', 'siren'];
            const colors = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];

            // Find island hexes with monster attribute from the board
            const monsterHexes = this.boardHexes ?
                this.boardHexes.filter(h => h.attribute === 'monster' || h.attribute === 'two_monster').slice(0, 4) :
                [];

            // Create monsters on monster hexes, or use fallback positions
            const testMonsters = monsterHexes.length > 0 ?
                monsterHexes.map((hex, i) => ({
                    id: i + 1,
                    type: monsterTypes[i % monsterTypes.length],
                    color: colors[i % colors.length],
                    q: hex.q,
                    r: hex.r
                })) :
                [
                    { id: 1, type: 'cyclops', color: 'red', q: 4, r: 1 },
                    { id: 2, type: 'minotaur', color: 'blue', q: 0, r: 3 },
                    { id: 3, type: 'hydra', color: 'green', q: 6, r: 5 },
                    { id: 4, type: 'gorgon', color: 'pink', q: 3, r: 6 }
                ];

            testMonsters.forEach(monster => {
                const center = this.getHexCenterPixel(monster.q, monster.r);
                if (center) {
                    this.components.createMonster(
                        monster.id,
                        monster.type,
                        monster.color,
                        center.x,
                        center.y
                    );
                }
            });

            // Set up monster click handlers
            document.querySelectorAll('.delphi-monster').forEach(monster => {
                monster.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = parseInt(monster.id.split('_')[1]);
                    this.onMonsterClick(id);
                });
            });
        },

        /**
         * Handle monster click
         */
        onMonsterClick: function(monsterId) {
            console.log(`Monster clicked: ${monsterId}`);
            // Toggle targetable state for demonstration
            this.components.setMonsterTargetable(monsterId);
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
         * Set up test player board
         */
        setupTestPlayerBoard: function() {
            // Initialize god track for 4 players
            this.components.initGodTrack(4);

            // Initialize god tokens for test player at starting positions (row 0)
            this.components.initializePlayerGods(1, '#E53935'); // Red player - all gods start at row 0

            // Set shield value
            this.components.setShieldValue(2);

            // Create sample Zeus tiles
            const testTiles = [
                { id: 1, type: 'shrine', color: 'red', completed: false },
                { id: 2, type: 'shrine', color: 'blue', completed: true },
                { id: 3, type: 'shrine', color: 'green', completed: false },
                { id: 4, type: 'statue', color: 'red', completed: false },
                { id: 5, type: 'statue', color: 'yellow', completed: false },
                { id: 6, type: 'statue', color: 'pink', completed: true },
                { id: 7, type: 'offering', color: 'blue', completed: false },
                { id: 8, type: 'offering', color: 'green', completed: false },
                { id: 9, type: 'offering', color: 'black', completed: false },
                { id: 10, type: 'monster', color: 'red', completed: true },
                { id: 11, type: 'monster', color: 'blue', completed: false },
                { id: 12, type: 'monster', color: 'green', completed: false }
            ];
            this.components.createZeusTiles(testTiles);

            // Set favor token count
            document.getElementById('delphi-favor-count').textContent = '5';

            // Add injury count
            document.querySelector('.injury-count').textContent = '2';
        },

        /**
         * Create test equipment display
         */
        createTestEquipmentDisplay: function() {
            const container = document.getElementById('delphi-equipment-cards');

            // Create 6 equipment cards
            for (let i = 0; i < 6; i++) {
                const cardNum = String(i).padStart(3, '0');
                this.components.createEquipmentCard(
                    i,
                    `img/equipment/card-${cardNum}.jpg`,
                    container
                );
            }

            // Create some oracle cards in hand
            const handContainer = document.querySelector('#delphi-oracle-hand .card-container');
            const oracleColors = ['red', 'blue', 'yellow'];
            oracleColors.forEach((color, i) => {
                this.components.createOracleCard(i, color, handContainer);
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
                    const center = this.hexGrid.getHexCenter(monster.q, monster.r);
                    if (center) {
                        this.components.createMonster(
                            monster.id,
                            monster.type,
                            monster.color,
                            center.x,
                            center.y
                        );
                    }
                });
            }

            // Set up player board
            if (gamedatas.currentPlayer) {
                const player = gamedatas.currentPlayer;
                this.components.setShieldValue(player.shield || 0);
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
                    this.hexGrid.clearHighlights();
                    this.components.deselectShips();
                    break;

                case 'selectAction':
                    this.hexGrid.clearHighlights();
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
            const center = this.hexGrid.getHexCenter(args.q, args.r);
            if (center) {
                this.components.moveShip(args.player_id, center.x, center.y, true);
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
            this.components.setShieldValue(args.value);
        },

        notif_taskCompleted: async function(args) {
            console.log('notif_taskCompleted', args);
            this.components.completeZeusTile(args.tile_id);
        }
   });
});
