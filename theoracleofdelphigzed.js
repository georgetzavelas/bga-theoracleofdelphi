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
var DELPHI_JS_VERSION = "v6";

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

            // Position the Zeus token on the shallows hex
            if (result.zeusPosition) {
                this.positionZeusToken(result.zeusPosition.q, result.zeusPosition.r);
            }

            // Create sample ships
            this.createTestShips();

            // Create sample monsters
            this.createTestMonsters();

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
         * Set up test player board with ALL possible card areas populated
         * This shows the full layout with maximum items for visual testing
         */
        setupTestPlayerBoard: function() {
            // Initialize god track for 4 players
            this.components.initGodTrack(4);

            // Initialize god tokens for test player at starting positions (row 0)
            this.components.initializePlayerGods(1, '#E53935'); // Red player - all gods start at row 0

            // Set shield value (test at value 3)
            this.components.setShieldValue(3);

            // Create sample Zeus tiles (4 groups of 3) - all 12 tiles
            const testTiles = [
                { id: 1, type: 'shrine', color: 'red', completed: false },
                { id: 2, type: 'shrine', color: 'blue', completed: false },
                { id: 3, type: 'shrine', color: 'green', completed: true }, // One completed
                { id: 4, type: 'statue', color: 'yellow', completed: false },
                { id: 5, type: 'statue', color: 'pink', completed: false },
                { id: 6, type: 'statue', color: 'black', completed: false },
                { id: 7, type: 'offering', color: 'blue', completed: false },
                { id: 8, type: 'offering', color: 'green', completed: false },
                { id: 9, type: 'offering', color: 'black', completed: false },
                { id: 10, type: 'monster', color: 'red', completed: false },
                { id: 11, type: 'monster', color: 'yellow', completed: false },
                { id: 12, type: 'monster', color: 'pink', completed: false }
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
            this.components.setShipTile(1, g_gamethemeurl + 'img/ship-tiles/ship-3.jpg', true);

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
