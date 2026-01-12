/**
 * Components.js - Game component factories for The Oracle of Delphi
 *
 * Creates and manages visual game pieces: ships, monsters, dice, cards, etc.
 */

define([
    "dojo",
    "dojo/_base/declare",
], function (dojo, declare) {
    return declare("delphi.Components", null, {

        // Reference to game object for notifications
        game: null,

        // Component containers
        boardPieces: null,
        playerBoard: null,

        // Component registries (initialized in constructor)
        ships: null,
        monsters: null,
        dice: null,
        statues: null,
        offerings: null,
        cards: null,
        godTokens: null,

        /**
         * Constructor
         * @param {Object} game - Reference to main game object
         */
        constructor: function(game) {
            this.game = game;
            this.boardPieces = document.getElementById('delphi-board-pieces');
            this.playerBoard = document.getElementById('delphi-player-board');

            // Initialize Maps in constructor (not at property level for Dojo compatibility)
            this.ships = new Map();
            this.monsters = new Map();
            this.dice = new Map();
            this.statues = new Map();
            this.offerings = new Map();
            this.cards = new Map();
            this.godTokens = new Map();
        },

        // =====================================================
        // SHIPS
        // =====================================================

        /**
         * Create a ship component
         * @param {number} playerId - Player ID
         * @param {string} color - Ship color (red, yellow, green, blue)
         * @param {number} x - Pixel x position
         * @param {number} y - Pixel y position
         * @returns {Element} Ship element
         */
        createShip: function(playerId, color, x, y) {
            const el = document.createElement('div');
            el.className = `delphi-ship ship-${color}`;
            el.id = `ship_${playerId}`;
            el.dataset.player = playerId;
            el.style.left = (x - 30) + 'px'; // Center the ship
            el.style.top = (y - 20) + 'px';

            this.boardPieces.appendChild(el);
            this.ships.set(playerId, el);

            return el;
        },

        /**
         * Move a ship to new position
         * @param {number} playerId - Player ID
         * @param {number} x - Target pixel x
         * @param {number} y - Target pixel y
         * @param {boolean} animate - Whether to animate the movement
         */
        moveShip: function(playerId, x, y, animate = true) {
            const el = this.ships.get(playerId);
            if (!el) return;

            if (!animate) {
                el.style.transition = 'none';
            }

            el.style.left = (x - 30) + 'px';
            el.style.top = (y - 20) + 'px';

            if (!animate) {
                // Force reflow then restore transition
                el.offsetHeight;
                el.style.transition = '';
            }
        },

        /**
         * Select/highlight a ship
         * @param {number} playerId - Player ID
         */
        selectShip: function(playerId) {
            this.ships.forEach(ship => ship.classList.remove('ship-selected'));
            const el = this.ships.get(playerId);
            if (el) el.classList.add('ship-selected');
        },

        /**
         * Deselect all ships
         */
        deselectShips: function() {
            this.ships.forEach(ship => ship.classList.remove('ship-selected'));
        },

        // =====================================================
        // MONSTERS
        // =====================================================

        /**
         * Create a monster component
         * @param {number} id - Monster ID
         * @param {string} type - Monster type (cyclops, minotaur, etc.)
         * @param {string} color - Associated color
         * @param {number} x - Pixel x position
         * @param {number} y - Pixel y position
         * @returns {Element} Monster element
         */
        createMonster: function(id, type, color, x, y) {
            const el = document.createElement('div');
            el.className = `delphi-monster monster-${type}`;
            el.id = `monster_${id}`;
            el.dataset.type = type;
            el.dataset.color = color;
            el.style.left = (x - 25) + 'px';
            el.style.top = (y - 25) + 'px';

            this.boardPieces.appendChild(el);
            this.monsters.set(id, el);

            return el;
        },

        /**
         * Mark a monster as targetable
         * @param {number} id - Monster ID
         */
        setMonsterTargetable: function(id) {
            const el = this.monsters.get(id);
            if (el) el.classList.add('monster-targetable');
        },

        /**
         * Clear targetable state from all monsters
         */
        clearTargetableMonsters: function() {
            this.monsters.forEach(m => m.classList.remove('monster-targetable'));
        },

        /**
         * Remove a monster (when defeated)
         * @param {number} id - Monster ID
         */
        removeMonster: function(id) {
            const el = this.monsters.get(id);
            if (el) {
                el.style.opacity = '0';
                el.style.transform = 'scale(0)';
                setTimeout(() => {
                    el.remove();
                    this.monsters.delete(id);
                }, 300);
            }
        },

        // =====================================================
        // ORACLE DICE
        // =====================================================

        /**
         * Create oracle dice for a player
         * @param {number} playerId - Player ID
         * @param {Array} colors - Array of 3 colors
         * @returns {Array} Array of die elements
         */
        createOracleDice: function(playerId, colors) {
            const container = document.getElementById('delphi-oracle-dice');
            const elements = [];

            colors.forEach((color, index) => {
                const el = document.createElement('div');
                el.className = `delphi-die die-${color} die-available`;
                el.id = `die_${playerId}_${index}`;
                el.dataset.color = color;
                el.dataset.index = index;
                el.dataset.player = playerId;

                container.appendChild(el);
                this.dice.set(`${playerId}_${index}`, el);
                elements.push(el);
            });

            this.positionDiceOnWheel(playerId);
            return elements;
        },

        /**
         * Position dice in the center of the oracle wheel
         * Dice are displayed via CSS flex container - no individual positioning needed
         * @param {number} playerId - Player ID
         */
        positionDiceOnWheel: function(playerId) {
            // Clear any inline styles and let CSS flex layout handle positioning
            for (let i = 0; i < 3; i++) {
                const el = this.dice.get(`${playerId}_${i}`);
                if (el) {
                    el.style.position = '';
                    el.style.left = '';
                    el.style.top = '';
                }
            }
        },

        /**
         * Select a die
         * @param {number} playerId - Player ID
         * @param {number} index - Die index (0-2)
         */
        selectDie: function(playerId, index) {
            this.dice.forEach(die => die.classList.remove('die-selected'));
            const el = this.dice.get(`${playerId}_${index}`);
            if (el) el.classList.add('die-selected');
        },

        /**
         * Mark a die as used
         * @param {number} playerId - Player ID
         * @param {number} index - Die index
         */
        useDie: function(playerId, index) {
            const el = this.dice.get(`${playerId}_${index}`);
            if (el) {
                el.classList.remove('die-selected', 'die-available');
                el.classList.add('die-used');
            }
        },

        /**
         * Animate dice roll
         * @param {number} playerId - Player ID
         * @param {Array} newColors - New colors after roll
         * @returns {Promise} Resolves when animation completes
         */
        animateDiceRoll: function(playerId, newColors) {
            return new Promise(resolve => {
                const diceElements = [];
                for (let i = 0; i < 3; i++) {
                    const el = this.dice.get(`${playerId}_${i}`);
                    if (el) diceElements.push(el);
                }

                // Add rolling animation
                diceElements.forEach(el => el.classList.add('die-rolling'));

                setTimeout(() => {
                    // Update colors
                    diceElements.forEach((el, i) => {
                        el.classList.remove('die-rolling', 'die-used');
                        el.classList.add('die-available');

                        // Remove old color class
                        const oldColor = el.dataset.color;
                        el.classList.remove(`die-${oldColor}`);

                        // Add new color
                        const newColor = newColors[i];
                        el.classList.add(`die-${newColor}`);
                        el.dataset.color = newColor;
                    });

                    this.positionDiceOnWheel(playerId);
                    resolve();
                }, 500);
            });
        },

        // =====================================================
        // STATUES & OFFERINGS
        // =====================================================

        /**
         * Create a statue
         * @param {number} id - Statue ID
         * @param {string} color - Statue color
         * @param {string} location - 'city', 'cargo', or 'raised'
         * @returns {Element} Statue element
         */
        createStatue: function(id, color, location) {
            const el = document.createElement('div');
            el.className = `delphi-statue statue-${color}`;
            el.id = `statue_${id}`;
            el.dataset.color = color;
            el.dataset.location = location;

            this.statues.set(id, el);
            return el;
        },

        /**
         * Create an offering cube
         * @param {number} id - Offering ID
         * @param {string} color - Offering color
         * @param {string} location - 'island', 'cargo', or 'delivered'
         * @returns {Element} Offering element
         */
        createOffering: function(id, color, location) {
            const el = document.createElement('div');
            el.className = `delphi-offering offering-${color}`;
            el.id = `offering_${id}`;
            el.dataset.color = color;
            el.dataset.location = location;

            this.offerings.set(id, el);
            return el;
        },

        // =====================================================
        // CARDS
        // =====================================================

        /**
         * Create an equipment card
         * @param {number} id - Card ID
         * @param {string} imgUrl - Card image URL
         * @param {Element} container - Container element
         * @returns {Element} Card element
         */
        createEquipmentCard: function(id, imgUrl, container) {
            const el = document.createElement('div');
            el.className = 'delphi-equipment-card';
            el.id = `equipment_${id}`;
            el.dataset.cardId = id;
            el.style.backgroundImage = `url(${imgUrl})`;

            container.appendChild(el);
            this.cards.set(`equipment_${id}`, el);

            return el;
        },

        /**
         * Create an oracle card
         * @param {number} id - Card ID
         * @param {string} color - Card color
         * @param {Element} container - Container element
         * @returns {Element} Card element
         */
        createOracleCard: function(id, color, container) {
            const el = document.createElement('div');
            el.className = `delphi-oracle-card oracle-${color}`;
            el.id = `oracle_${id}`;
            el.dataset.color = color;

            container.appendChild(el);
            this.cards.set(`oracle_${id}`, el);

            return el;
        },

        // =====================================================
        // GOD TRACK
        // =====================================================

        /**
         * Initialize god track (no longer needs dynamic row creation)
         * The template now has fixed structure with 6 columns x 5 rows + starting row
         * @param {number} playerCount - Number of players (for reference)
         */
        initGodTrack: function(playerCount) {
            // Structure is now in template - just store player count for reference
            this.godTrackPlayerCount = playerCount;
        },

        /**
         * Create a god token
         * @param {number} playerId - Player ID
         * @param {string} godName - God name (apollo, artemis, poseidon, aphrodite, hermes, ares)
         * @param {string} playerColor - Player's color
         * @returns {Element} God token element
         */
        createGodToken: function(playerId, godName, playerColor) {
            const el = document.createElement('div');
            el.className = `delphi-god-token god-${godName}`;
            el.id = `god_${playerId}_${godName}`;
            el.dataset.god = godName;
            el.dataset.player = playerId;
            // Add player color border to distinguish tokens in multiplayer
            el.style.borderColor = playerColor;

            this.godTokens.set(`${playerId}_${godName}`, el);
            return el;
        },

        /**
         * Position a god token on the track
         * @param {number} playerId - Player ID
         * @param {string} godName - God name
         * @param {number} row - Track row (0 = starting row, 1-5 = advancement track)
         */
        positionGodToken: function(playerId, godName, row) {
            const token = this.godTokens.get(`${playerId}_${godName}`) ||
                          document.getElementById(`god_${playerId}_${godName}`);

            if (!token) return;

            let targetCell;

            if (row === 0) {
                // Starting row (row 0) is in the separate #delphi-god-start-row
                targetCell = document.querySelector(`#delphi-god-start-row .god-start-cell[data-god="${godName}"]`);
            } else {
                // Rows 1-5 are in the main god track columns
                const column = document.querySelector(`#delphi-god-track .god-column[data-god="${godName}"]`);
                if (column) {
                    targetCell = column.querySelector(`.god-cell[data-row="${row}"]`);
                }
            }

            if (targetCell) {
                targetCell.appendChild(token);
            }
        },

        /**
         * Place all god tokens at starting positions (row 0)
         * @param {number} playerId - Player ID
         * @param {string} playerColor - Player's color
         */
        initializePlayerGods: function(playerId, playerColor) {
            const gods = ['apollo', 'artemis', 'poseidon', 'aphrodite', 'hermes', 'ares'];
            console.log('Initializing god tokens for player', playerId, 'with color', playerColor);

            gods.forEach(godName => {
                const token = this.createGodToken(playerId, godName, playerColor);
                console.log('Created god token:', godName, token);
                const targetCell = document.querySelector(`#delphi-god-start-row .god-start-cell[data-god="${godName}"]`);
                console.log('Target cell for', godName, ':', targetCell);
                this.positionGodToken(playerId, godName, 0); // Start at row 0
            });
        },

        /**
         * Advance a god token by one row
         * @param {number} playerId - Player ID
         * @param {string} godName - God name
         * @returns {number} New row position
         */
        advanceGodToken: function(playerId, godName) {
            const token = this.godTokens.get(`${playerId}_${godName}`);
            if (!token || !token.parentElement) return -1;

            // Determine current row
            let currentRow = 0;
            const parent = token.parentElement;

            if (parent.classList.contains('god-start-cell')) {
                currentRow = 0;
            } else if (parent.dataset.row) {
                currentRow = parseInt(parent.dataset.row);
            }

            // Advance to next row (max is 6)
            const newRow = Math.min(currentRow + 1, 6);
            this.positionGodToken(playerId, godName, newRow);

            return newRow;
        },

        // =====================================================
        // SHIELD TRACK
        // =====================================================

        /**
         * Set shield value
         * @param {number} value - Shield value (0-5)
         */
        setShieldValue: function(value) {
            const slots = document.querySelectorAll('.shield-slot');
            slots.forEach(slot => {
                slot.classList.remove('active');
                if (parseInt(slot.dataset.value) <= value) {
                    slot.classList.add('active');
                }
            });
        },

        // =====================================================
        // ZEUS TILES
        // =====================================================

        /**
         * Create Zeus tile elements
         * @param {Array} tiles - Array of {id, type, color, completed}
         */
        createZeusTiles: function(tiles) {
            const groups = {
                'shrine': document.querySelector('.zeus-group[data-type="shrines"] .zeus-slots'),
                'statue': document.querySelector('.zeus-group[data-type="statues"] .zeus-slots'),
                'offering': document.querySelector('.zeus-group[data-type="offerings"] .zeus-slots'),
                'monster': document.querySelector('.zeus-group[data-type="monsters"] .zeus-slots')
            };

            tiles.forEach(tile => {
                const container = groups[tile.type];
                if (container) {
                    const el = document.createElement('div');
                    el.className = `delphi-zeus-tile zeus-${tile.type}`;
                    el.id = `zeus_${tile.id}`;
                    el.dataset.type = tile.type;
                    el.dataset.color = tile.color || '';
                    el.dataset.completed = tile.completed ? 'true' : 'false';

                    // Set background image based on type
                    if (tile.imgUrl) {
                        el.style.backgroundImage = `url(${tile.imgUrl})`;
                    }

                    container.appendChild(el);
                }
            });
        },

        /**
         * Mark a Zeus tile as completed
         * @param {number} tileId - Tile ID
         */
        completeZeusTile: function(tileId) {
            const el = document.getElementById(`zeus_${tileId}`);
            if (el) {
                el.dataset.completed = 'true';
            }
        },

        // =====================================================
        // UTILITY
        // =====================================================

        /**
         * Clear all components
         */
        clearAll: function() {
            this.ships.forEach(el => el.remove());
            this.ships.clear();

            this.monsters.forEach(el => el.remove());
            this.monsters.clear();

            this.dice.forEach(el => el.remove());
            this.dice.clear();

            this.statues.forEach(el => el.remove());
            this.statues.clear();

            this.offerings.forEach(el => el.remove());
            this.offerings.clear();

            this.cards.forEach(el => el.remove());
            this.cards.clear();
        }
    });
});
