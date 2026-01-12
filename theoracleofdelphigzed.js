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

define([
    "dojo","dojo/_base/declare",
    "ebg/core/gamegui",
    "ebg/counter",
    g_gamethemeurl + "modules/js/HexGrid.js",
    g_gamethemeurl + "modules/js/Components.js",
    g_gamethemeurl + "modules/BX/js/DragScroller.js",
],
function (dojo, declare, gamegui, counter) {
    return declare("bgagame.theoracleofdelphigzed", ebg.core.gamegui, {

        // Game components
        hexGrid: null,
        components: null,
        boardScroller: null,

        // Current state
        currentPlayerId: null,
        selectedDieIndex: null,

        constructor: function(){
            console.log('The Oracle of Delphi constructor');

            // Global variables
            this.hexGrid = null;
            this.components = null;
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

            // Initialize hex grid
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

            // For Phase 1: Create hardcoded test board if no gamedatas
            if (!gamedatas || !gamedatas.hexes) {
                this.createTestBoard();
            } else {
                // Production: Use actual game data
                this.setupFromGameData(gamedatas);
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
         * Create a hardcoded test board for Phase 1 visual validation
         * Uses multi-hex tile images for the game board
         */
        createTestBoard: function() {
            console.log("Creating test board with multi-hex tile images");

            // Create the board using tile images
            this.createTileBasedBoard();

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
         * Create the game board using multi-hex tile images
         * The board consists of 12 island tiles (various sizes) + 6 city tiles
         */
        createTileBasedBoard: function() {
            const boardContainer = document.getElementById('delphi-hex-grid');
            console.log('Creating tile-based board, container:', boardContainer);

            if (!boardContainer) {
                console.error('Board container not found!');
                return;
            }

            boardContainer.innerHTML = '';
            boardContainer.classList.add('tile-based-board');

            // Get the game theme URL for proper image paths in BGA
            // g_gamethemeurl typically ends with '/' but we handle both cases
            let themeUrl = typeof g_gamethemeurl !== 'undefined' ? g_gamethemeurl : '';
            if (themeUrl && !themeUrl.endsWith('/')) {
                themeUrl += '/';
            }
            console.log('Theme URL:', themeUrl);

            // Define the board layout using tile images
            // Each tile has: type (6/7/9/11 hexes or city), variant (0/1/2), position, rotation
            const boardTiles = [
                // Row 1 - top tiles
                { type: '6', variant: 0, x: 0, y: 0, rotation: 0 },
                { type: '9', variant: 0, x: 380, y: 0, rotation: 0 },
                { type: '6', variant: 1, x: 760, y: 0, rotation: 0 },

                // Row 2 - middle tiles
                { type: '7', variant: 0, x: 100, y: 280, rotation: 0 },
                { type: '11', variant: 0, x: 380, y: 220, rotation: 0 },
                { type: '7', variant: 1, x: 700, y: 280, rotation: 0 },

                // Row 3 - bottom tiles
                { type: '6', variant: 2, x: 0, y: 550, rotation: 0 },
                { type: '9', variant: 1, x: 380, y: 520, rotation: 0 },
                { type: '6', variant: 0, x: 760, y: 550, rotation: 0 },

                // City tiles scattered around
                { type: 'city', color: 'red', x: 200, y: 150, rotation: 0 },
                { type: 'city', color: 'blue', x: 600, y: 150, rotation: 0 },
                { type: 'city', color: 'yellow', x: 50, y: 400, rotation: 0 },
                { type: 'city', color: 'green', x: 850, y: 400, rotation: 0 },
                { type: 'city', color: 'pink', x: 200, y: 650, rotation: 0 },
                { type: 'city', color: 'black', x: 700, y: 650, rotation: 0 },
            ];

            // Create tile elements using <img> tags for better loading feedback
            boardTiles.forEach((tile, index) => {
                const el = document.createElement('div');
                el.className = 'delphi-board-tile';
                el.id = `tile_${index}`;
                el.dataset.type = tile.type;

                let imgPath;
                if (tile.type === 'city') {
                    el.classList.add('city-tile');
                    el.dataset.color = tile.color;
                    imgPath = `img/island-city-tile/island-${tile.color}-front.png`;
                } else {
                    el.classList.add(`tile-${tile.type}-hex`);
                    el.dataset.variant = tile.variant;
                    imgPath = `img/island-${tile.type}-tiles/island-${tile.variant}-front.png`;
                }

                const fullUrl = themeUrl + imgPath;

                // Create an img element inside the div for better debugging
                const img = document.createElement('img');
                img.src = fullUrl;
                img.alt = `Tile ${tile.type}`;
                img.style.width = '100%';
                img.style.height = '100%';
                img.style.objectFit = 'contain';
                img.onerror = function() {
                    console.error(`Failed to load tile image: ${fullUrl}`);
                    el.style.backgroundColor = '#ff000033';
                };
                img.onload = function() {
                    console.log(`Loaded tile image: ${fullUrl}`);
                };
                el.appendChild(img);

                el.style.left = tile.x + 'px';
                el.style.top = tile.y + 'px';

                if (tile.rotation) {
                    el.style.transform = `rotate(${tile.rotation}deg)`;
                }

                console.log(`Created tile ${index}: ${tile.type}, img: ${fullUrl}`);
                boardContainer.appendChild(el);
            });

            // Set container size to fit all tiles
            boardContainer.style.width = '1100px';
            boardContainer.style.height = '900px';
            boardContainer.style.position = 'relative';

            console.log('Board created with', boardTiles.length, 'tiles');
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
         * Create test ships at various positions
         */
        createTestShips: function() {
            const testShips = [
                { playerId: 1, color: 'red', q: 2, r: 2 },
                { playerId: 2, color: 'blue', q: 5, r: 3 },
                { playerId: 3, color: 'green', q: 1, r: 4 },
                { playerId: 4, color: 'yellow', q: 4, r: 5 }
            ];

            testShips.forEach(ship => {
                const center = this.hexGrid.getHexCenter(ship.q, ship.r);
                if (center) {
                    this.components.createShip(ship.playerId, ship.color, center.x, center.y);
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

            const testMonsters = [
                { id: 1, type: 'cyclops', color: 'red', q: 4, r: 1 },
                { id: 2, type: 'minotaur', color: 'blue', q: 0, r: 3 },
                { id: 3, type: 'hydra', color: 'green', q: 6, r: 5 },
                { id: 4, type: 'gorgon', color: 'pink', q: 3, r: 6 }
            ];

            testMonsters.forEach(monster => {
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
