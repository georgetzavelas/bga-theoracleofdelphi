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

        // New card area registries
        oracleCards: null,        // Cards in hand (by color for stacking)
        injuryCards: null,        // Cards in injury area (by color for stacking)
        equipmentCards: null,     // Equipment cards owned
        companionCards: null,     // Companion cards owned
        zeusTiles: null,          // Zeus tiles on board
        cargoItems: null,         // Items in ship storage
        defeatedMonsters: null,   // Monsters defeated

        // Favor tokens count
        favorTokenCount: 0,

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
            this.monstersByHex = new Map(); // Track monsters per hex for stacking
            this.dice = new Map();
            this.statues = new Map();
            this.offerings = new Map();
            this.cards = new Map();
            this.godTokens = new Map();

            // New card area maps
            this.oracleCards = new Map();      // key: color, value: {count, element}
            this.injuryCards = new Map();      // key: color, value: {count, element}
            this.equipmentCards = new Map();   // key: id, value: element
            this.companionCards = new Map();   // key: id, value: element
            this.zeusTiles = new Map();        // key: id, value: element
            this.cargoItems = new Map();       // key: slotIndex, value: {type, color, element}
            this.defeatedMonsters = new Map(); // key: slotIndex, value: {color, element}
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
         * @param {string} type - Monster type (cyclops, minotaur, etc.) - color is defined in CSS per type
         * @param {number} x - Pixel x position (hex center)
         * @param {number} y - Pixel y position (hex center)
         * @param {number} q - Hex q coordinate (optional, for stacking)
         * @param {number} r - Hex r coordinate (optional, for stacking)
         * @returns {Element} Monster element
         */
        createMonster: function(id, type, x, y, q, r) {
            const el = document.createElement('div');
            el.className = `delphi-monster monster-${type}`;
            el.id = `monster_${id}`;
            el.dataset.type = type;

            // Calculate stacking for multiple monsters on same hex
            const hexKey = (q !== undefined && r !== undefined) ? `${q},${r}` : `${x},${y}`;

            if (!this.monstersByHex.has(hexKey)) {
                this.monstersByHex.set(hexKey, []);
            }
            this.monstersByHex.get(hexKey).push(id);

            // Center the tile (45px / 2 = 22.5, round to 23)
            el.style.left = (x - 25) + 'px';  // 20 (center) + 10 (left offset)
            el.style.top = (y - 30) + 'px';   // 20 (center) + 10 (up offset)

            // Store hex position and center coords for 3D recalculation
            el.dataset.hexKey = hexKey;
            el.dataset.centerY = y;

            this.boardPieces.appendChild(el);
            this.monsters.set(id, el);

            // Recalculate 3D transforms for all monsters in this stack
            this.updateMonsterStack3D(hexKey);

            return el;
        },

        /**
         * Update 3D transforms for all monsters in a hex stack
         * All monsters tilt back uniformly with perspective
         * @param {string} hexKey - The hex key identifier
         */
        updateMonsterStack3D: function(hexKey) {
            const stack = this.monstersByHex.get(hexKey);
            if (!stack) return;

            const stackSize = stack.length;
            const depthSpacing = 10; // pixels between each monster in Z
            const uniformTilt = 22; // all monsters tilt at same angle

            stack.forEach((monsterId, index) => {
                const el = this.monsters.get(monsterId);
                if (!el) return;

                // Position from top: 0 = top, higher = lower in stack
                const positionFromTop = (stackSize - 1) - index;

                // All monsters have same tilt, but different depth positions
                const translateZ = -positionFromTop * depthSpacing; // push back in Z
                const translateY = positionFromTop * 8; // offset down slightly

                el.style.zIndex = 15 + index;
                el.style.transform = `perspective(200px) rotateX(${uniformTilt}deg) rotateZ(-30deg) translateZ(${translateZ}px) translateY(${translateY}px)`;
            });
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
         * Create an oracle card (legacy method for compatibility)
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
        // ORACLE CARDS AREA (Left side, stacking bottom to top)
        // =====================================================

        /**
         * Add an oracle card to the player's hand
         * Cards of same color stack with count badge
         * @param {string} color - Card color
         */
        addOracleCardToHand: function(color) {
            const container = document.getElementById('delphi-oracle-cards-area');
            if (!container) return;

            const existing = this.oracleCards.get(color);
            if (existing) {
                // Increment count for existing color stack
                existing.count++;
                const badge = existing.element.querySelector('.card-count-badge');
                if (badge) badge.textContent = existing.count;
            } else {
                // Create new card for this color
                const el = document.createElement('div');
                el.className = `delphi-oracle-card oracle-${color}`;
                el.dataset.color = color;

                // Add count badge
                const badge = document.createElement('div');
                badge.className = 'card-count-badge';
                badge.textContent = '1';
                el.appendChild(badge);

                container.appendChild(el);
                this.oracleCards.set(color, { count: 1, element: el });
            }
        },

        /**
         * Remove an oracle card from the player's hand
         * @param {string} color - Card color
         * @returns {boolean} True if card was removed
         */
        removeOracleCardFromHand: function(color) {
            const existing = this.oracleCards.get(color);
            if (!existing || existing.count <= 0) return false;

            existing.count--;
            const badge = existing.element.querySelector('.card-count-badge');

            if (existing.count <= 0) {
                // Remove the element entirely
                existing.element.remove();
                this.oracleCards.delete(color);
            } else {
                // Update the badge
                if (badge) badge.textContent = existing.count;
            }
            return true;
        },

        /**
         * Play an oracle card (move to played area, rotated)
         * @param {string} color - Card color
         */
        playOracleCard: function(color) {
            const playedArea = document.getElementById('delphi-played-oracle-card');
            if (!playedArea) return;

            // Clear any existing played card
            playedArea.innerHTML = '';

            // Remove from hand
            if (this.removeOracleCardFromHand(color)) {
                // Create wrapper (sized for rotated card, handles hover)
                const wrapper = document.createElement('div');
                wrapper.className = 'played-oracle-wrapper';

                // Create played card element
                const el = document.createElement('div');
                el.className = `delphi-oracle-card oracle-${color}`;
                el.dataset.color = color;

                wrapper.appendChild(el);
                playedArea.appendChild(wrapper);
            }
        },

        /**
         * Clear the played oracle card (at end of turn)
         */
        clearPlayedOracleCard: function() {
            const playedArea = document.getElementById('delphi-played-oracle-card');
            if (playedArea) playedArea.innerHTML = '';
        },

        /**
         * Get oracle card count for a color
         * @param {string} color - Card color
         * @returns {number} Count of cards
         */
        getOracleCardCount: function(color) {
            const existing = this.oracleCards.get(color);
            return existing ? existing.count : 0;
        },

        // =====================================================
        // INJURY CARDS AREA (Bottom left, stacking right to left)
        // =====================================================

        /**
         * Add an injury card
         * Cards of same color stack with count badge
         * @param {string} color - Card color
         */
        addInjuryCard: function(color) {
            const container = document.getElementById('delphi-injury-cards-area');
            if (!container) return;

            const existing = this.injuryCards.get(color);
            if (existing) {
                // Increment count for existing color stack
                existing.count++;
                const badge = existing.element.querySelector('.card-count-badge');
                if (badge) badge.textContent = existing.count;
            } else {
                // Create new card for this color
                const el = document.createElement('div');
                el.className = `delphi-injury-card injury-${color}`;
                el.dataset.color = color;

                // Add count badge
                const badge = document.createElement('div');
                badge.className = 'card-count-badge';
                badge.textContent = '1';
                el.appendChild(badge);

                container.appendChild(el);
                this.injuryCards.set(color, { count: 1, element: el });
            }
        },

        /**
         * Remove an injury card
         * @param {string} color - Card color
         * @returns {boolean} True if card was removed
         */
        removeInjuryCard: function(color) {
            const existing = this.injuryCards.get(color);
            if (!existing || existing.count <= 0) return false;

            existing.count--;
            const badge = existing.element.querySelector('.card-count-badge');

            if (existing.count <= 0) {
                existing.element.remove();
                this.injuryCards.delete(color);
            } else {
                if (badge) badge.textContent = existing.count;
            }
            return true;
        },

        /**
         * Remove all injury cards of a specific color
         * @param {string} color - Card color
         */
        removeAllInjuryCardsOfColor: function(color) {
            const existing = this.injuryCards.get(color);
            if (existing) {
                existing.element.remove();
                this.injuryCards.delete(color);
            }
        },

        /**
         * Get total injury card count
         * @returns {number} Total injury cards
         */
        getTotalInjuryCount: function() {
            let total = 0;
            this.injuryCards.forEach(data => total += data.count);
            return total;
        },

        /**
         * Get injury card count for a specific color
         * @param {string} color - Card color
         * @returns {number} Count of cards
         */
        getInjuryCardCount: function(color) {
            const existing = this.injuryCards.get(color);
            return existing ? existing.count : 0;
        },

        // =====================================================
        // EQUIPMENT CARDS AREA (Bottom right, with gaps)
        // =====================================================

        /**
         * Add an equipment card
         * @param {number} id - Card ID
         * @param {string} imgUrl - Card image URL
         */
        addEquipmentCard: function(id, imgUrl) {
            const container = document.getElementById('delphi-equipment-cards-area');
            if (!container) return;

            // Max 4 equipment cards
            if (this.equipmentCards.size >= 4) return;

            const el = document.createElement('div');
            el.className = 'delphi-equipment-card';
            el.id = `equipment_${id}`;
            el.dataset.cardId = id;
            el.style.backgroundImage = `url(${imgUrl})`;

            container.appendChild(el);
            this.equipmentCards.set(id, el);
        },

        /**
         * Remove an equipment card
         * @param {number} id - Card ID
         */
        removeEquipmentCard: function(id) {
            const el = this.equipmentCards.get(id);
            if (el) {
                el.remove();
                this.equipmentCards.delete(id);
            }
        },

        // =====================================================
        // COMPANION CARDS AREA (Right side, stacking top to bottom)
        // =====================================================

        /**
         * Add a companion card
         * @param {number} id - Card ID
         * @param {string} type - Companion type (hero, demigod, creature)
         * @param {string} color - Card color
         * @param {string} imgUrl - Card image URL
         */
        addCompanionCard: function(id, type, color, imgUrl) {
            const container = document.getElementById('delphi-companion-cards-area');
            if (!container) return;

            // Max 3 companion cards
            if (this.companionCards.size >= 3) return;

            const el = document.createElement('div');
            el.className = `delphi-companion-card companion-${type}`;
            el.id = `companion_${id}`;
            el.dataset.cardId = id;
            el.dataset.type = type;
            el.dataset.color = color;
            el.style.backgroundImage = `url(${imgUrl})`;

            container.appendChild(el);
            this.companionCards.set(id, el);
        },

        /**
         * Remove a companion card
         * @param {number} id - Card ID
         */
        removeCompanionCard: function(id) {
            const el = this.companionCards.get(id);
            if (el) {
                el.remove();
                this.companionCards.delete(id);
            }
        },

        // =====================================================
        // FAVOR TOKENS (Top right, stacked with count)
        // =====================================================

        /**
         * Set favor token count
         * @param {number} count - Number of favor tokens
         */
        setFavorTokenCount: function(count) {
            this.favorTokenCount = count;
            const badge = document.querySelector('#delphi-favor-tokens-area .favor-count-badge');
            if (badge) badge.textContent = count;

            // Show/hide token stack based on count
            const stack = document.querySelector('#delphi-favor-tokens-area .favor-token-stack');
            if (stack) {
                stack.style.opacity = count > 0 ? '1' : '0.3';
            }
        },

        /**
         * Add favor tokens
         * @param {number} amount - Amount to add
         */
        addFavorTokens: function(amount) {
            this.setFavorTokenCount(this.favorTokenCount + amount);
        },

        /**
         * Remove favor tokens
         * @param {number} amount - Amount to remove
         * @returns {boolean} True if tokens were removed
         */
        removeFavorTokens: function(amount) {
            if (this.favorTokenCount < amount) return false;
            this.setFavorTokenCount(this.favorTokenCount - amount);
            return true;
        },

        /**
         * Get current favor token count
         * @returns {number} Favor token count
         */
        getFavorTokenCount: function() {
            return this.favorTokenCount;
        },

        // =====================================================
        // SHIP TILE AND STORAGE
        // =====================================================

        /**
         * Set ship tile
         * @param {number} id - Ship tile ID
         * @param {string} imgUrl - Tile image URL
         * @param {boolean} hasExpandedStorage - Whether this tile grants extra storage
         */
        setShipTile: function(id, imgUrl, hasExpandedStorage) {
            const slot = document.getElementById('delphi-ship-tile-slot');
            if (!slot) return;

            slot.innerHTML = '';
            const el = document.createElement('div');
            el.className = 'delphi-ship-tile';
            el.id = `ship_tile_${id}`;
            el.dataset.tileId = id;
            el.style.backgroundImage = `url(${imgUrl})`;
            slot.appendChild(el);

            // Handle expanded storage
            const storageContainer = document.getElementById('delphi-ship-storage');
            if (storageContainer) {
                if (hasExpandedStorage) {
                    storageContainer.classList.add('expanded-storage');
                } else {
                    storageContainer.classList.remove('expanded-storage');
                }
            }
        },

        /**
         * Add item to ship storage
         * @param {string} type - 'statue' or 'offering'
         * @param {string} color - Item color
         * @returns {number} Slot index used, or -1 if storage full
         */
        addToShipStorage: function(type, color) {
            const storageContainer = document.getElementById('delphi-ship-storage');
            if (!storageContainer) return -1;

            const maxSlots = storageContainer.classList.contains('expanded-storage') ? 4 : 2;

            // Find first empty slot
            for (let i = 0; i < maxSlots; i++) {
                if (!this.cargoItems.has(i)) {
                    const slot = storageContainer.querySelector(`.storage-slot[data-index="${i}"]`);
                    if (slot) {
                        const el = document.createElement('div');
                        el.className = `delphi-cargo-item cargo-${type} cargo-${color}`;
                        el.dataset.type = type;
                        el.dataset.color = color;
                        slot.appendChild(el);
                        this.cargoItems.set(i, { type, color, element: el });
                        return i;
                    }
                }
            }
            return -1; // Storage full
        },

        /**
         * Remove item from ship storage
         * @param {number} slotIndex - Slot index to clear
         */
        removeFromShipStorage: function(slotIndex) {
            const item = this.cargoItems.get(slotIndex);
            if (item) {
                item.element.remove();
                this.cargoItems.delete(slotIndex);
            }
        },

        /**
         * Get ship storage contents
         * @returns {Array} Array of {slotIndex, type, color}
         */
        getShipStorageContents: function() {
            const contents = [];
            this.cargoItems.forEach((item, index) => {
                contents.push({ slotIndex: index, type: item.type, color: item.color });
            });
            return contents;
        },

        /**
         * Check if ship storage is full
         * @returns {boolean} True if full
         */
        isShipStorageFull: function() {
            const storageContainer = document.getElementById('delphi-ship-storage');
            if (!storageContainer) return true;

            const maxSlots = storageContainer.classList.contains('expanded-storage') ? 4 : 2;
            return this.cargoItems.size >= maxSlots;
        },

        // =====================================================
        // DEFEATED MONSTERS (Lower right of player board)
        // =====================================================

        /**
         * Add a defeated monster
         * @param {string} type - Monster type (cyclops, minotaur, chimera, hydra, gorgon, siren)
         * @param {string} color - Monster color (red, yellow, green, blue, pink, black)
         * @returns {number} Slot index used, or -1 if all slots full
         */
        addDefeatedMonster: function(type, color) {
            const container = document.getElementById('delphi-defeated-monsters');
            if (!container) return -1;

            // Max 3 defeated monsters
            for (let i = 0; i < 3; i++) {
                if (!this.defeatedMonsters.has(i)) {
                    const slot = container.querySelector(`.defeated-monster-slot[data-index="${i}"]`);
                    if (slot) {
                        const el = document.createElement('div');
                        el.className = `delphi-defeated-monster monster-${type}`;
                        el.dataset.type = type;
                        el.dataset.color = color;
                        slot.appendChild(el);
                        this.defeatedMonsters.set(i, { type, color, element: el });
                        return i;
                    }
                }
            }
            return -1; // All slots full
        },

        /**
         * Get defeated monster count
         * @returns {number} Number of defeated monsters
         */
        getDefeatedMonsterCount: function() {
            return this.defeatedMonsters.size;
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
        // ZEUS TILES (4 groups of 3 above player board)
        // =====================================================

        /**
         * Create Zeus tile elements in the new layout
         * @param {Array} tiles - Array of {id, type, color, completed}
         */
        createZeusTiles: function(tiles) {
            // Group tiles by type
            const tilesByType = {
                'shrine': tiles.filter(t => t.type === 'shrine'),
                'statue': tiles.filter(t => t.type === 'statue'),
                'offering': tiles.filter(t => t.type === 'offering'),
                'monster': tiles.filter(t => t.type === 'monster')
            };

            // Find the group containers
            const groups = document.querySelectorAll('.zeus-tile-group');

            groups.forEach(group => {
                const type = group.dataset.type;
                const typeTiles = tilesByType[type] || [];
                const slots = group.querySelectorAll('.zeus-tile-slot');

                typeTiles.forEach((tile, index) => {
                    if (slots[index]) {
                        const el = document.createElement('div');
                        el.className = `delphi-zeus-tile zeus-${tile.type}`;
                        el.id = `zeus_${tile.id}`;
                        el.dataset.type = tile.type;
                        el.dataset.color = tile.color || 'white';
                        el.dataset.completed = tile.completed ? 'true' : 'false';

                        // Set background image if provided
                        if (tile.imgUrl) {
                            el.style.backgroundImage = `url(${tile.imgUrl})`;
                        }

                        slots[index].appendChild(el);
                        this.zeusTiles.set(tile.id, el);
                    }
                });
            });
        },

        /**
         * Mark a Zeus tile as completed (fades out the tile)
         * @param {number} tileId - Tile ID
         */
        completeZeusTile: function(tileId) {
            const el = this.zeusTiles.get(tileId) || document.getElementById(`zeus_${tileId}`);
            if (el) {
                el.dataset.completed = 'true';
                // Animate the completion
                el.style.transition = 'opacity 0.5s, transform 0.5s';
                setTimeout(() => {
                    el.style.opacity = '0';
                    el.style.transform = 'scale(0.8)';
                }, 100);
            }
        },

        /**
         * Remove a Zeus tile (after task completed)
         * @param {number} tileId - Tile ID
         */
        removeZeusTile: function(tileId) {
            const el = this.zeusTiles.get(tileId) || document.getElementById(`zeus_${tileId}`);
            if (el) {
                el.style.transition = 'opacity 0.3s, transform 0.3s';
                el.style.opacity = '0';
                el.style.transform = 'scale(0)';
                setTimeout(() => {
                    el.remove();
                    this.zeusTiles.delete(tileId);
                }, 300);
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

            // Clear new card areas
            this.oracleCards.forEach(data => data.element.remove());
            this.oracleCards.clear();

            this.injuryCards.forEach(data => data.element.remove());
            this.injuryCards.clear();

            this.equipmentCards.forEach(el => el.remove());
            this.equipmentCards.clear();

            this.companionCards.forEach(el => el.remove());
            this.companionCards.clear();

            this.zeusTiles.forEach(el => el.remove());
            this.zeusTiles.clear();

            this.cargoItems.forEach(data => data.element.remove());
            this.cargoItems.clear();

            this.defeatedMonsters.forEach(data => data.element.remove());
            this.defeatedMonsters.clear();

            // Reset favor tokens
            this.setFavorTokenCount(0);

            // Clear played oracle card
            this.clearPlayedOracleCard();

            // Clear ship tile slot
            const shipTileSlot = document.getElementById('delphi-ship-tile-slot');
            if (shipTileSlot) shipTileSlot.innerHTML = '';
        }
    });
});
