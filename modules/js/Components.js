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
        // 3D dice library state
        _diceLibsLoaded: false,
        _diceLibsLoading: false,
        _diceLibsCallbacks: null,
        _diceBox: null,

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
            this.temples = new Map();
            this.shrines = new Map();
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

            // 3D dice callback queue
            this._diceLibsCallbacks = [];

            // Start loading 3D dice libraries upfront
            this._loadDiceLibraries();
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
        createShip: function(playerId, color, x, y, isMine) {
            const el = document.createElement('div');
            el.className = `delphi-ship ship-${color}`;
            if (isMine) el.classList.add('my-ship');
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

        // Monster type color lookup
        MONSTER_COLORS: {
            cyclops:  '#E53935',
            minotaur: '#424242',
            chimera:  '#FDD835',
            hydra:    '#D81B60',
            gorgon:   '#43A047',
            siren:    '#1E88E5'
        },

        // Monster type to oracle die color name
        MONSTER_DIE_COLOR: {
            cyclops:  'red',
            minotaur: 'black',
            chimera:  'yellow',
            hydra:    'pink',
            gorgon:   'green',
            siren:    'blue'
        },

        /**
         * Get the color for a monster type
         * @param {string} type - Monster type name
         * @returns {string} Hex color string
         */
        getMonsterColor: function(type) {
            return this.MONSTER_COLORS[type] || '#888';
        },

        /**
         * Create a monster component as a 3D extruded tile slab
         * @param {number} id - Monster ID
         * @param {string} type - Monster type (cyclops, minotaur, etc.)
         * @param {number} x - Pixel x position (hex center)
         * @param {number} y - Pixel y position (hex center)
         * @param {number} q - Hex q coordinate (optional, for stacking)
         * @param {number} r - Hex r coordinate (optional, for stacking)
         * @returns {Element} Monster element
         */
        createMonster: function(id, type, x, y, q, r) {
            id = String(id);
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

            // Center the 38x38 tile on the hex
            el.style.left = (x - 19) + 'px';
            el.style.top = (y - 19) + 'px';

            // Store hex position for stacking and interactions
            el.dataset.hexKey = hexKey;
            el.dataset.centerY = y;

            // Build 3D tile structure: wrapper + top face + front side + right side
            var tile3d = document.createElement('div');
            tile3d.className = 'monster-tile-3d';

            // Top face (artwork surface)
            var topFace = document.createElement('div');
            topFace.className = 'monster-face monster-face-top';
            var artDiv = document.createElement('div');
            artDiv.className = 'monster-face-art';
            topFace.appendChild(artDiv);

            // Front face (bottom edge — visible from rotateX tilt)
            var frontFace = document.createElement('div');
            frontFace.className = 'monster-face monster-face-front';

            // Right face (right edge — visible from rotateZ rotation)
            var rightFace = document.createElement('div');
            rightFace.className = 'monster-face monster-face-right';

            tile3d.appendChild(topFace);
            tile3d.appendChild(frontFace);
            tile3d.appendChild(rightFace);
            el.appendChild(tile3d);

            this.boardPieces.appendChild(el);
            this.monsters.set(id, el);

            // Recalculate 3D transforms for all monsters in this stack
            this.updateMonsterStack3D(hexKey);

            // Trigger placement animation
            var stack = this.monstersByHex.get(hexKey);
            var posFromBottom = stack.indexOf(id);
            var totalShift = (stack.length - 1) * 4;
            var centerOffset = totalShift / 2;
            var targetZ = posFromBottom * 7;
            var targetY = -posFromBottom * 4 + centerOffset;
            tile3d.style.setProperty('--target-z', targetZ + 'px');
            tile3d.style.setProperty('--target-y', targetY + 'px');
            tile3d.classList.add('monster-placing');
            tile3d.addEventListener('animationend', function handler() {
                tile3d.classList.remove('monster-placing');
                tile3d.removeEventListener('animationend', handler);
            }, { once: true });

            return el;
        },

        /**
         * Update 3D transforms for all monsters in a hex stack.
         * Targets the inner .monster-tile-3d wrapper for tilt + depth positioning.
         * @param {string} hexKey - The hex key identifier
         */
        updateMonsterStack3D: function(hexKey) {
            var stack = this.monstersByHex.get(hexKey);
            if (!stack) return;

            var TILE_DEPTH = 7; // px per tile side height
            var STACK_SHIFT = 4; // vertical shift per tile
            var stackSize = stack.length;

            // Offset so the visual center of the stack aligns with the hex center
            var totalShift = (stackSize - 1) * STACK_SHIFT;
            var centerOffset = totalShift / 2;

            stack.forEach(function(monsterId, index) {
                var el = this.monsters.get(monsterId);
                if (!el) return;

                // index 0 = bottom of stack, last index = top
                var posFromBottom = index;

                // Higher in stack = higher z-index
                el.style.zIndex = 15 + index;

                // Apply tilt + depth offset to the inner 3D wrapper
                var tile3d = el.querySelector('.monster-tile-3d');
                if (tile3d) {
                    var translateZ = posFromBottom * TILE_DEPTH;
                    var translateY = -posFromBottom * STACK_SHIFT + centerOffset;

                    tile3d.style.transform =
                        'perspective(200px) rotateX(22deg) rotateZ(-30deg) ' +
                        'translateZ(' + translateZ + 'px) translateY(' + translateY + 'px)';
                }
            }.bind(this));
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
         * Remove a monster (when defeated) with lift-and-fade animation
         * @param {number} id - Monster ID
         */
        removeMonster: function(id) {
            id = String(id);
            var el = this.monsters.get(id);
            if (!el) return;

            var hexKey = el.dataset.hexKey;
            var tile3d = el.querySelector('.monster-tile-3d');

            // Trigger lift-and-fade animation
            if (tile3d) {
                tile3d.classList.add('monster-removing');
            }

            // After animation completes, clean up DOM and stack data
            var self = this;
            setTimeout(function() {
                el.remove();
                self.monsters.delete(id);

                // Remove from hex stack and recalculate remaining tiles
                if (hexKey && self.monstersByHex.has(hexKey)) {
                    var stack = self.monstersByHex.get(hexKey);
                    var idx = stack.indexOf(id);
                    if (idx !== -1) stack.splice(idx, 1);
                    if (stack.length === 0) {
                        self.monstersByHex.delete(hexKey);
                    } else {
                        self.updateMonsterStack3D(hexKey);
                    }
                }
            }, 400);
        },

        // =====================================================
        // MONSTER HOVER PREVIEW
        // =====================================================

        _hoverPreviewEl: null,
        _hoverPreviewVisible: false,

        /**
         * Initialize the singleton hover preview element
         */
        initHoverPreview: function() {
            this._hoverPreviewEl = document.createElement('div');
            this._hoverPreviewEl.id = 'monster-hover-preview';
            this._hoverPreviewEl.className = 'monster-hover-preview';
            document.getElementById('delphi-board-container').appendChild(this._hoverPreviewEl);
        },

        /**
         * Build a single 3D tile face set for the preview at a given scale
         * @param {string} type - Monster type
         * @param {number} scale - Scale multiplier (e.g. 2 for 2x)
         * @returns {Element} The 3D tile wrapper element
         */
        _buildPreviewTile3D: function(type, scale) {
            var tileSize = 40 * scale;
            var depth = 7 * scale;
            var borderRadius = Math.round(4 * scale) + 'px';
            var artInset = Math.round(2 * scale) + 'px';

            var tile3d = document.createElement('div');
            tile3d.className = 'monster-tile-3d-preview monster-' + type;
            tile3d.style.width = tileSize + 'px';
            tile3d.style.height = tileSize + 'px';
            tile3d.style.transformStyle = 'preserve-3d';

            // Top face
            var topFace = document.createElement('div');
            topFace.className = 'monster-face monster-face-top';
            topFace.style.width = tileSize + 'px';
            topFace.style.height = tileSize + 'px';
            topFace.style.borderRadius = borderRadius;
            topFace.style.transform = 'translateZ(' + depth + 'px)';

            var artDiv = document.createElement('div');
            artDiv.className = 'monster-face-art';
            artDiv.style.top = artInset;
            artDiv.style.left = artInset;
            artDiv.style.right = artInset;
            artDiv.style.bottom = artInset;
            artDiv.style.borderRadius = Math.round(3 * scale) + 'px';
            topFace.appendChild(artDiv);

            // Front face
            var frontFace = document.createElement('div');
            frontFace.className = 'monster-face monster-face-front';
            frontFace.style.width = tileSize + 'px';
            frontFace.style.height = depth + 'px';
            frontFace.style.transformOrigin = 'top center';
            frontFace.style.transform = 'rotateX(-90deg) translateY(-' + depth + 'px)';
            frontFace.style.top = tileSize + 'px';
            frontFace.style.left = '0';

            // Right face
            var rightFace = document.createElement('div');
            rightFace.className = 'monster-face monster-face-right';
            rightFace.style.width = depth + 'px';
            rightFace.style.height = tileSize + 'px';
            rightFace.style.transformOrigin = 'left center';
            rightFace.style.transform = 'rotateY(90deg)';
            rightFace.style.top = '0';
            rightFace.style.left = tileSize + 'px';

            tile3d.appendChild(topFace);
            tile3d.appendChild(frontFace);
            tile3d.appendChild(rightFace);

            return tile3d;
        },

        /**
         * Show enlarged 2x hover preview of the full stack near the cursor
         * @param {number} monsterId - ID of the hovered monster
         * @param {number} clientX - Mouse/touch clientX
         * @param {number} clientY - Mouse/touch clientY
         */
        showMonsterHoverPreview: function(monsterId, clientX, clientY) {
            if (!this._hoverPreviewEl) this.initHoverPreview();

            var monsterEl = this.monsters.get(monsterId);
            if (!monsterEl) return;

            var hexKey = monsterEl.dataset.hexKey;
            var stack = this.monstersByHex.get(hexKey);
            if (!stack || stack.length === 0) return;

            // Clear previous preview content
            this._hoverPreviewEl.innerHTML = '';

            var SCALE = 2;
            var TILE_SIZE = 40 * SCALE;   // 80px
            var TILE_DEPTH = 7 * SCALE;   // 14px
            var PERSPECTIVE = 200 * SCALE; // 400px

            // Build each tile in the stack at 2x
            for (var i = 0; i < stack.length; i++) {
                var srcEl = this.monsters.get(stack[i]);
                if (!srcEl) continue;
                var type = srcEl.dataset.type;

                var wrapper = document.createElement('div');
                wrapper.className = 'monster-preview-tile';
                wrapper.style.position = 'absolute';
                wrapper.style.bottom = (i * TILE_DEPTH + 10) + 'px';
                wrapper.style.left = '10px';
                wrapper.style.width = TILE_SIZE + 'px';
                wrapper.style.height = TILE_SIZE + 'px';

                var tile3d = this._buildPreviewTile3D(type, SCALE);
                tile3d.style.transform =
                    'perspective(' + PERSPECTIVE + 'px) rotateX(22deg) rotateZ(-30deg) ' +
                    'translateZ(' + (i * TILE_DEPTH) + 'px) translateY(' + (-i * (4 * SCALE)) + 'px)';

                wrapper.appendChild(tile3d);
                this._hoverPreviewEl.appendChild(wrapper);
            }

            // Size the preview container
            var totalHeight = TILE_SIZE + (stack.length - 1) * TILE_DEPTH + 20;
            this._hoverPreviewEl.style.width = (TILE_SIZE + 40) + 'px';
            this._hoverPreviewEl.style.height = totalHeight + 'px';

            // Position near the cursor
            this._positionPreview(clientX, clientY, totalHeight);

            // Show with fade-in
            this._hoverPreviewEl.classList.add('visible');
            this._hoverPreviewVisible = true;
        },

        /**
         * Position the hover preview relative to the board container
         */
        _positionPreview: function(clientX, clientY, height) {
            var boardContainer = document.getElementById('delphi-board-container');
            var boardRect = boardContainer.getBoundingClientRect();
            var scrollLeft = boardContainer.scrollLeft || 0;
            var scrollTop = boardContainer.scrollTop || 0;

            this._hoverPreviewEl.style.left = (clientX - boardRect.left + scrollLeft + 25) + 'px';
            this._hoverPreviewEl.style.top = (clientY - boardRect.top + scrollTop - (height || 100) / 2) + 'px';
        },

        /**
         * Hide the hover preview
         */
        hideMonsterHoverPreview: function() {
            if (this._hoverPreviewEl) {
                this._hoverPreviewEl.classList.remove('visible');
                this._hoverPreviewVisible = false;
            }
        },

        /**
         * Update hover preview position on mouse move
         * @param {number} clientX
         * @param {number} clientY
         */
        updateHoverPreviewPosition: function(clientX, clientY) {
            if (!this._hoverPreviewVisible || !this._hoverPreviewEl) return;
            var height = parseInt(this._hoverPreviewEl.style.height) || 100;
            this._positionPreview(clientX, clientY, height);
        },

        // =====================================================
        // MONSTER INSPECT PANEL
        // =====================================================

        _inspectPanelEl: null,
        _inspectPanelHexKey: null,

        /**
         * Initialize the singleton inspection panel
         */
        initInspectPanel: function() {
            var panel = document.createElement('div');
            panel.id = 'monster-inspect-panel';
            panel.className = 'monster-inspect-panel';

            var backdrop = document.createElement('div');
            backdrop.className = 'monster-inspect-backdrop';
            var self = this;
            backdrop.addEventListener('click', function() {
                self.hideMonsterInspectPanel();
            });

            var content = document.createElement('div');
            content.className = 'monster-inspect-content';

            panel.appendChild(backdrop);
            panel.appendChild(content);
            document.getElementById('delphi-board-container').appendChild(panel);

            this._inspectPanelEl = panel;
        },

        /**
         * Show the inspection panel for a monster stack
         * @param {string} hexKey - Hex key of the stack to inspect
         */
        showMonsterInspectPanel: function(hexKey) {
            if (!this._inspectPanelEl) this.initInspectPanel();

            // Toggle off if same stack
            if (this._inspectPanelHexKey === hexKey) {
                this.hideMonsterInspectPanel();
                return;
            }

            var stack = this.monstersByHex.get(hexKey);
            if (!stack || stack.length === 0) return;

            var content = this._inspectPanelEl.querySelector('.monster-inspect-content');
            content.innerHTML = '';

            // Build tiles laid out horizontally (top → bottom, left → right)
            for (var i = stack.length - 1; i >= 0; i--) {
                var srcEl = this.monsters.get(stack[i]);
                if (!srcEl) continue;
                var type = srcEl.dataset.type;
                var color = this.getMonsterColor(type);

                // Monster name label
                var labelText = type.charAt(0).toUpperCase() + type.slice(1);

                var tile = document.createElement('div');
                tile.className = 'monster-inspect-tile';
                tile.style.animationDelay = ((stack.length - 1 - i) * 80) + 'ms';
                tile.style.borderColor = color;

                var art = document.createElement('div');
                art.className = 'monster-inspect-art monster-art-' + type;

                var label = document.createElement('div');
                label.className = 'monster-inspect-label';
                label.textContent = labelText;

                var dieColor = this.MONSTER_DIE_COLOR[type];
                var dieIcon = document.createElement('div');
                dieIcon.className = 'monster-inspect-die die-color-' + (dieColor || 'red');

                tile.appendChild(art);
                tile.appendChild(label);
                tile.appendChild(dieIcon);
                content.appendChild(tile);
            }

            // Position the panel near the hex — flip to the left of the
            // monster if the right-side placement would overflow the board.
            var firstEl = this.monsters.get(stack[0]);
            if (firstEl) {
                var boardContainer = document.getElementById('delphi-board-container');
                var boardRect = boardContainer.getBoundingClientRect();
                var monsterRect = firstEl.getBoundingClientRect();
                var scrollLeft = boardContainer.scrollLeft || 0;
                var scrollTop = boardContainer.scrollTop || 0;

                var monsterLeftInContainer = monsterRect.left - boardRect.left + scrollLeft;
                var monsterTopInContainer = monsterRect.top - boardRect.top + scrollTop;
                var panelWidth = content.offsetWidth;
                var viewportRight = scrollLeft + boardContainer.clientWidth;
                var rightPlacement = monsterLeftInContainer + 60;
                var leftPlacement = monsterLeftInContainer - panelWidth - 20;

                var left;
                if (rightPlacement + panelWidth <= viewportRight) {
                    left = rightPlacement;
                } else if (leftPlacement >= scrollLeft) {
                    left = leftPlacement;
                } else {
                    left = Math.max(scrollLeft, viewportRight - panelWidth);
                }

                content.style.left = left + 'px';
                content.style.top = (monsterTopInContainer - 20) + 'px';
            }

            this._inspectPanelEl.classList.add('visible');
            this._inspectPanelHexKey = hexKey;
        },

        /**
         * Hide the inspection panel
         */
        hideMonsterInspectPanel: function() {
            if (this._inspectPanelEl) {
                this._inspectPanelEl.classList.remove('visible');
                this._inspectPanelHexKey = null;
            }
        },

        // =====================================================
        // ORACLE DICE
        // =====================================================

        // Color-to-face mapping for 3D dice: face 1=red, 2=yellow, 3=green, 4=blue, 5=pink, 6=black
        COLOR_TO_FACE: { red: 1, yellow: 2, green: 3, blue: 4, pink: 5, black: 6 },

        /**
         * Create 3D oracle dice for a player
         * @param {number} playerId - Player ID
         * @param {Array} colors - Array of 3 colors
         * @returns {Array} Array of die elements
         */
        createOracleDice: function(playerId, colors) {
            const container = document.getElementById('delphi-oracle-dice');
            const elements = [];

            colors.forEach((color, index) => {
                // Outer die wrapper
                const el = document.createElement('div');
                el.className = 'delphi-die die-available';
                el.id = `die_${playerId}_${index}`;
                el.dataset.color = color;
                el.dataset.index = index;
                el.dataset.player = playerId;
                el.dataset.roll = this.COLOR_TO_FACE[color] || 1;

                // Inner cube (holds the 6 faces, receives rotation transforms)
                const inner = document.createElement('div');
                inner.className = 'die-inner';

                // Create 6 faces
                for (let side = 1; side <= 6; side++) {
                    const face = document.createElement('div');
                    face.className = 'die-face';
                    face.dataset.side = side;
                    inner.appendChild(face);
                }

                el.appendChild(inner);
                container.appendChild(el);
                this.dice.set(`${playerId}_${index}`, el);
                elements.push(el);
            });

            // Show correct initial face without animation
            requestAnimationFrame(() => {
                elements.forEach(el => {
                    const inner = el.querySelector('.die-inner');
                    inner.style.transition = 'none';
                    el.classList.add('even-roll');
                    // Force reflow to apply transform instantly
                    inner.offsetHeight;
                    inner.style.transition = '';
                });
            });

            return elements;
        },

        /**
         * Select a die
         * @param {number} playerId - Player ID
         * @param {number} index - Die index (0-2)
         */
        selectDie: function(playerId, index) {
            const el = this.dice.get(`${playerId}_${index}`);
            const wasSelected = el && el.classList.contains('die-selected');
            this.dice.forEach(die => die.classList.remove('die-selected'));
            if (el && !wasSelected) el.classList.add('die-selected');
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
         * Visually move a die to a new color slot on the oracle wheel.
         * @param {number} playerId - Player ID
         * @param {number} dieIndex - Die index (0, 1, 2)
         * @param {string} newColor - Target color name
         */
        recolorDie: function(playerId, dieIndex, newColor) {
            var dieEl = this.dice.get(playerId + '_' + dieIndex);
            if (!dieEl) return;

            // Update die data attribute and class
            var oldColor = dieEl.dataset.color;
            dieEl.classList.remove('die-' + oldColor);
            dieEl.classList.add('die-' + newColor);
            dieEl.dataset.color = newColor;

            // Animate the face to show the new color
            var targetFace = this.COLOR_TO_FACE[newColor] || 1;
            var wasEven = dieEl.classList.contains('even-roll');
            dieEl.classList.remove('even-roll', 'odd-roll');
            dieEl.dataset.roll = targetFace;
            dieEl.offsetHeight; // force reflow
            dieEl.classList.add(wasEven ? 'odd-roll' : 'even-roll');
        },

        /**
         * Restore a used die back to available state
         * @param {number} playerId - Player ID
         * @param {number} index - Die index
         */
        restoreDie: function(playerId, index) {
            const el = this.dice.get(`${playerId}_${index}`);
            if (el) {
                el.classList.remove('die-used');
                el.classList.add('die-available');
            }
        },

        /**
         * Animate 3D dice roll — alternates spin direction each roll
         * @param {number} playerId - Player ID
         * @param {Array} newColors - New colors after roll
         * @returns {Promise} Resolves when animation completes
         */
        animateDiceRoll: function(playerId, newColors) {
            return new Promise(resolve => {
                const diceElements = [];
                for (let i = 0; i < 3; i++) {
                    const el = this.dice.get(`${playerId}_${i}`);
                    if (el) diceElements.push({ el: el, index: i });
                }

                // First restore dice from used/transparent state
                diceElements.forEach(({ el }) => {
                    el.classList.remove('die-used');
                    el.classList.add('die-available');
                });

                // Brief pause so the player sees the restoration before the roll
                setTimeout(() => {
                    // Apply all data-attribute changes first, so the subsequent
                    // class swap is the only trigger for the CSS transition.
                    const plans = diceElements.map(({ el, index }) => {
                        const newColor = newColors[index];
                        const targetFace = this.COLOR_TO_FACE[newColor] || 1;
                        const wasEven = el.classList.contains('even-roll');
                        const wasOdd  = el.classList.contains('odd-roll');
                        const newClass = wasEven ? 'odd-roll' : 'even-roll';
                        const oldClass = wasEven ? 'even-roll' : (wasOdd ? 'odd-roll' : null);
                        el.dataset.roll = targetFace;
                        el.dataset.color = newColor;
                        return { el, oldClass, newClass };
                    });

                    // One reflow for the whole group, not per-die, to commit the
                    // data-attribute changes in a single frame.
                    if (diceElements[0]) void diceElements[0].el.offsetHeight;

                    // Atomic class swap: classList.replace keeps a roll class
                    // applied at all times. The previous code removed both roll
                    // classes and then added one, which left the die in a
                    // no-rotation state for a single frame and caused a visible
                    // flash to the face-1 pose before the transition started.
                    plans.forEach(({ el, oldClass, newClass }) => {
                        if (oldClass) {
                            el.classList.replace(oldClass, newClass);
                        } else {
                            el.classList.add(newClass);
                        }
                    });

                    // Wait for the 1.2s CSS transition to finish
                    setTimeout(() => {
                        resolve();
                    }, 1300);
                }, 400);
            });
        },

        // =====================================================
        // 3D DICE LIBRARY LOADING
        // =====================================================

        /**
         * Load Three.js, Cannon.js, teal.js, dice.js via sequential <script> injection.
         * Resolves immediately if already loaded.
         * @param {Function} [callback] - Called when all libs are ready
         */
        _loadDiceLibraries: function(callback) {
            if (this._diceLibsLoaded) {
                if (callback) callback();
                return;
            }

            if (callback) this._diceLibsCallbacks.push(callback);

            if (this._diceLibsLoading) return;
            this._diceLibsLoading = true;

            var self = this;
            var baseUrl = (typeof g_gamethemeurl !== 'undefined' ? g_gamethemeurl : '') + 'modules/js/libs/';
            var cacheBust = typeof DELPHI_JS_VERSION !== 'undefined' ? '?' + DELPHI_JS_VERSION : '';
            var scripts = ['three.min.js', 'dice.js'];
            var index = 0;

            function loadNext() {
                if (index >= scripts.length) {
                    // All loaded — configure DICE
                    if (typeof DICE !== 'undefined' && DICE.configure) {
                        DICE.configure({ sound_enabled: false });
                    }
                    self._diceLibsLoaded = true;
                    self._diceLibsLoading = false;
                    // Fire all pending callbacks
                    var cbs = self._diceLibsCallbacks.splice(0);
                    for (var i = 0; i < cbs.length; i++) cbs[i]();
                    return;
                }

                var script = document.createElement('script');
                script.src = baseUrl + scripts[index] + cacheBust;
                script.onload = function() {
                    index++;
                    loadNext();
                };
                script.onerror = function() {
                    console.error('Failed to load dice library: ' + scripts[index]);
                    index++;
                    loadNext();
                };
                document.head.appendChild(script);
            }

            loadNext();
        },

        // =====================================================
        // D10 BATTLE DIE (3D pentagonal trapezohedron via DICE library)
        // =====================================================

        /**
         * Create the 3D D10 battle die in the combat dialog.
         * Initializes a DICE.dice_box inside #combat-battle-die.
         * @param {Function} [callback] - Called when the dice box is ready
         */
        createBattleDie: function(callback) {
            var container = document.getElementById('combat-battle-die');
            if (!container) {
                if (callback) callback();
                return;
            }

            var self = this;

            // Ensure container has proper dimensions for the canvas
            container.innerHTML = '';
            container.style.width = '200px';
            container.style.height = '200px';

            this._loadDiceLibraries(function() {
                if (typeof DICE === 'undefined') {
                    console.error('DICE library not available');
                    if (callback) callback();
                    return;
                }

                // Create the dice box (Three.js scene + Cannon.js physics)
                self._diceBox = new DICE.dice_box(container);
                self._diceBox.setDice('1d9');
                self.battleDieResult = null;

                if (callback) callback();
            });
        },

        /**
         * Roll the 3D D10 battle die with physics animation.
         * @param {number} result - The predetermined result value (0-9)
         * @returns {Promise} Resolves with the result when animation completes
         */
        rollBattleDie: function(result) {
            var self = this;

            return new Promise(function(resolve) {
                function doRoll() {
                    if (!self._diceBox) {
                        console.error('Dice box not initialized');
                        resolve(result);
                        return;
                    }

                    self._diceBox.setDice('1d9');

                    self._diceBox.start_throw(
                        // before_roll: return predetermined result
                        function(notation) {
                            return [result];
                        },
                        // after_roll: animation finished
                        function(notation) {
                            self.battleDieResult = result;

                            var resultEl = document.getElementById('combat-roll-result');
                            if (resultEl) {
                                resultEl.textContent = result;
                            }

                            resolve(result);
                        }
                    );
                }

                // Ensure dice box exists
                if (!self._diceBox) {
                    self.createBattleDie(doRoll);
                } else {
                    doRoll();
                }
            });
        },

        /**
         * Clear the 3D dice box (when dialog closes)
         */
        clearBattleDie: function() {
            if (this._diceBox) {
                this._diceBox.clear();
            }
        },

        // =====================================================
        // STATUES & OFFERINGS
        // =====================================================

        // Triangle layout for city statues: top-center, bottom-left, bottom-right
        STATUE_TRIANGLE_OFFSETS: [
            { dx: 0,   dy: -28 },  // top center
            { dx: -18, dy: 0 },   // bottom left
            { dx: 18,  dy: 0 }    // bottom right
        ],

        // Pedestal offsets for statue islands: [0]=E, [1]=SW, [2]=NW
        // ~1/3 of the way from center to edge (pointy-top, size=40)
        STATUE_PEDESTAL_OFFSETS: [
            { dx: 11,  dy: 0 },    // E
            { dx: -6,  dy: 13 },   // SW
            { dx: -6,  dy: -13 }   // NW
        ],

        // Pedestal colors per statue island cluster (matches PHP MaterialDefs::STATUE_ISLAND_COLORS)
        STATUE_ISLAND_COLORS: {
            'cluster-7-5':  ['pink', 'blue', 'red'],
            'cluster-9-0':  ['green', 'red', 'yellow'],
            'cluster-9-1':  ['blue', 'black', 'yellow'],
            'cluster-9-2':  ['pink', 'green', 'yellow'],
            'cluster-11-1': ['green', 'black', 'blue'],
            'cluster-11-2': ['pink', 'black', 'red'],
        },

        STATUE_COLORS: ['red', 'yellow', 'green', 'blue', 'pink', 'black'],

        /**
         * Build statue assignments from city-color-hex mappings.
         * @param {Array} cities - Array of {color, q, r, rotation} for each city hex
         * @returns {Array} Array of {id, color, q, r, slotIndex, rotation}
         */
        buildStatueAssignments: function(cities) {
            var assignments = [];
            var idCounter = 1;

            cities.forEach(function(city) {
                for (var s = 0; s < 3; s++) {
                    assignments.push({
                        id: idCounter++,
                        color: city.color,
                        q: city.q,
                        r: city.r,
                        slotIndex: s,
                        rotation: city.rotation || 0
                    });
                }
            });

            return assignments;
        },

        /**
         * Rotate a 2D offset by a hex rotation step (60° increments).
         * @param {number} dx - X offset
         * @param {number} dy - Y offset
         * @param {number} rotation - Hex rotation step (0-5, each = 60°)
         * @returns {{dx: number, dy: number}} Rotated offset
         */
        rotateOffset: function(dx, dy, rotation) {
            if (!rotation) return { dx: dx, dy: dy };
            var angle = rotation * Math.PI / 3;  // 60° in radians per step
            var cos = Math.cos(angle);
            var sin = Math.sin(angle);
            return {
                dx: Math.round(dx * cos - dy * sin),
                dy: Math.round(dx * sin + dy * cos)
            };
        },

        /**
         * Create a statue on the board
         * @param {number} id - Statue ID
         * @param {string} color - Statue color
         * @param {number} x - Hex center X pixel
         * @param {number} y - Hex center Y pixel
         * @param {number} slotIndex - Triangle slot (0=top, 1=bottom-left, 2=bottom-right)
         * @param {number} rotation - Cluster rotation (0-5, 60° steps)
         * @returns {Element} Statue element
         */
        createStatue: function(id, color, x, y, slotIndex, rotation) {
            var el = document.createElement('div');
            el.className = 'delphi-statue statue-' + color;
            el.id = 'statue_' + id;
            el.dataset.statueId = id;
            el.dataset.color = color;
            el.dataset.slotIndex = slotIndex;

            // Position using triangle offset, rotated to match cluster orientation
            var offset = this.STATUE_TRIANGLE_OFFSETS[slotIndex] || { dx: 0, dy: 0 };
            var rotated = this.rotateOffset(offset.dx, offset.dy, rotation);
            el.style.left = (x + rotated.dx) + 'px';
            el.style.top = (y + rotated.dy) + 'px';

            // Staggered placement animation
            el.style.animationDelay = (slotIndex * 100) + 'ms';

            this.boardPieces.appendChild(el);
            this.statues.set(id, el);

            return el;
        },

        /**
         * Remove a statue with lift-and-fade animation
         * @param {number} id - Statue ID
         */
        removeStatue: function(id) {
            var el = this.statues.get(id);
            if (!el) return;

            el.classList.add('statue-removing');

            var self = this;
            setTimeout(function() {
                el.remove();
                self.statues.delete(id);
            }, 400);
        },

        // Diamond layout offsets for 4 cubes on a hex (top, right, bottom, left)
        // Offsets from hex center in pixels
        OFFERING_DIAMOND_OFFSETS: [
            { dx: 0,   dy: -18 },  // top
            { dx: 18,  dy: 0 },    // right
            { dx: 0,   dy: 18 },   // bottom
            { dx: -18, dy: 0 }     // left
        ],

        // Cardinal offsets for small offerings around a centered temple
        TEMPLE_OFFERING_OFFSETS: [
            { dx: 0,   dy: -23 },  // top
            { dx: 23,  dy: 0 },    // right
            { dx: 0,   dy: 23 },   // bottom
            { dx: -23, dy: 0 }     // left
        ],

        OFFERING_COLORS: ['red', 'yellow', 'green', 'blue', 'pink', 'black'],

        /**
         * Randomly distribute 24 offering cubes across 6 islands.
         * 4 cubes per island, no two cubes of the same color on the same island.
         * @param {Array} offeringHexes - Array of {q, r} hex objects for the 6 offering islands
         * @returns {Array} Array of {id, color, q, r, slotIndex} assignments
         */
        distributeOfferings: function(offeringHexes) {
            if (offeringHexes.length !== 6) {
                console.warn('Expected 6 offering islands, got ' + offeringHexes.length);
            }

            var colors = this.OFFERING_COLORS.slice(); // ['red','yellow','green','blue','pink','black']
            var numIslands = offeringHexes.length;

            // Build a pool: 4 copies of each color (24 total)
            // We need to assign 4 cubes to each island, no same color per island.
            //
            // Strategy: Create a 6×4 matrix. Each row = island, each cell = a color.
            // Constraint: no duplicate color in any row, and each color appears exactly 4 times total.
            //
            // Approach: For each of 4 rounds, create a permutation of the 6 colors
            // and assign one color per island. Then check each island has no duplicates.
            // If a conflict arises, reshuffle that round.

            var assignments; // [islandIdx][slotIdx] = colorString
            var maxAttempts = 100;
            var attempt = 0;
            var valid = false;

            while (!valid && attempt < maxAttempts) {
                attempt++;
                assignments = [];
                for (var i = 0; i < numIslands; i++) {
                    assignments[i] = [];
                }
                valid = true;

                for (var round = 0; round < 4; round++) {
                    // Shuffle the 6 colors for this round
                    var perm = colors.slice();
                    for (var s = perm.length - 1; s > 0; s--) {
                        var j = Math.floor(Math.random() * (s + 1));
                        var tmp = perm[s];
                        perm[s] = perm[j];
                        perm[j] = tmp;
                    }

                    // Try to assign, checking for no duplicate per island
                    // Use backtracking swap if needed
                    var roundAssignment = perm.slice();
                    var roundValid = true;

                    for (var isl = 0; isl < numIslands; isl++) {
                        if (assignments[isl].indexOf(roundAssignment[isl]) !== -1) {
                            // Conflict: this island already has this color.
                            // Try swapping with another island that doesn't conflict.
                            var swapped = false;
                            for (var other = isl + 1; other < numIslands; other++) {
                                if (assignments[isl].indexOf(roundAssignment[other]) === -1 &&
                                    assignments[other].indexOf(roundAssignment[isl]) === -1) {
                                    // Swap
                                    var t = roundAssignment[isl];
                                    roundAssignment[isl] = roundAssignment[other];
                                    roundAssignment[other] = t;
                                    swapped = true;
                                    break;
                                }
                            }
                            if (!swapped) {
                                // Can't resolve — retry entire distribution
                                roundValid = false;
                                break;
                            }
                        }
                    }

                    if (!roundValid) {
                        valid = false;
                        break;
                    }

                    for (var isl2 = 0; isl2 < numIslands; isl2++) {
                        assignments[isl2].push(roundAssignment[isl2]);
                    }
                }
            }

            if (!valid) {
                console.error('Failed to distribute offerings after ' + maxAttempts + ' attempts');
                return [];
            }

            // Convert to flat array of offering assignments
            var result = [];
            var offeringId = 1;
            for (var isle = 0; isle < numIslands; isle++) {
                for (var slot = 0; slot < assignments[isle].length; slot++) {
                    result.push({
                        id: offeringId++,
                        color: assignments[isle][slot],
                        q: offeringHexes[isle].q,
                        r: offeringHexes[isle].r,
                        slotIndex: slot
                    });
                }
            }

            return result;
        },

        // Track offerings per hex for removal/interaction
        offeringsByHex: null,

        /**
         * Create an offering cube as a 3D extruded slab and place it on the board
         * @param {number} id - Offering ID
         * @param {string} color - Offering color
         * @param {number} x - Pixel x position (hex center)
         * @param {number} y - Pixel y position (hex center)
         * @param {number} slotIndex - Diamond position index (0=top, 1=right, 2=bottom, 3=left)
         * @param {string} hexKey - Hex key for tracking
         * @returns {Element} Offering element
         */
        createOffering: function(id, color, x, y, slotIndex, hexKey) {
            var el = document.createElement('div');
            el.className = 'delphi-offering offering-' + color;
            el.id = 'offering_' + id;
            el.dataset.color = color;
            el.dataset.hexKey = hexKey;
            el.dataset.slotIndex = slotIndex;

            // Position using diamond offset from hex center
            var offset = this.OFFERING_DIAMOND_OFFSETS[slotIndex] || { dx: 0, dy: 0 };
            el.style.left = (x + offset.dx - 10) + 'px';  // 10 = half of 20px cube width
            el.style.top = (y + offset.dy - 11) + 'px';   // 11 = half of 22px cube height

            // Build faux-isometric cube: 3 clip-path faces
            var cube = document.createElement('div');
            cube.className = 'offering-cube';

            var topFace = document.createElement('div');
            topFace.className = 'offering-face offering-face-top';

            var rightFace = document.createElement('div');
            rightFace.className = 'offering-face offering-face-right';

            var leftFace = document.createElement('div');
            leftFace.className = 'offering-face offering-face-left';

            cube.appendChild(topFace);
            cube.appendChild(rightFace);
            cube.appendChild(leftFace);
            el.appendChild(cube);

            this.boardPieces.appendChild(el);
            this.offerings.set(id, el);

            // Track offerings per hex
            if (!this.offeringsByHex) this.offeringsByHex = new Map();
            if (!this.offeringsByHex.has(hexKey)) {
                this.offeringsByHex.set(hexKey, []);
            }
            this.offeringsByHex.get(hexKey).push(id);

            // Placement animation with staggered delay per slot
            cube.style.animationDelay = (slotIndex * 100) + 'ms';
            cube.classList.add('offering-placing');
            cube.addEventListener('animationend', function handler() {
                cube.classList.remove('offering-placing');
                cube.removeEventListener('animationend', handler);
            }, { once: true });

            return el;
        },

        /**
         * Remove an offering cube with lift-and-fade animation
         * @param {number} id - Offering ID
         */
        removeOffering: function(id) {
            var el = this.offerings.get(id);
            if (!el) return;

            var hexKey = el.dataset.hexKey;
            var cube = el.querySelector('.offering-cube');

            if (cube) {
                cube.classList.add('offering-removing');
            }

            var self = this;
            setTimeout(function() {
                el.remove();
                self.offerings.delete(id);

                if (hexKey && self.offeringsByHex && self.offeringsByHex.has(hexKey)) {
                    var stack = self.offeringsByHex.get(hexKey);
                    var idx = stack.indexOf(id);
                    if (idx !== -1) stack.splice(idx, 1);
                    if (stack.length === 0) {
                        self.offeringsByHex.delete(hexKey);
                    }
                }
            }, 400);
        },

        // =====================================================
        // TEMPLES
        // =====================================================

        TEMPLE_COLORS: ['red', 'yellow', 'green', 'blue', 'pink', 'black'],

        /**
         * Randomly distribute 6 temples across 6 temple islands (1:1 mapping)
         * @param {Array} templeHexes - Array of hex objects with attribute 'temple'
         * @returns {Array} Array of {id, color, q, r}
         */
        distributeTemples: function(templeHexes) {
            // Shuffle colors using Fisher-Yates
            var colors = this.TEMPLE_COLORS.slice();
            for (var i = colors.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = colors[i];
                colors[i] = colors[j];
                colors[j] = temp;
            }

            var assignments = [];
            for (var k = 0; k < templeHexes.length && k < colors.length; k++) {
                assignments.push({
                    id: k + 1,
                    color: colors[k],
                    q: templeHexes[k].q,
                    r: templeHexes[k].r
                });
            }
            return assignments;
        },

        /**
         * Create a temple piece on the board
         * @param {number} id - Temple ID
         * @param {string} color - Temple color
         * @param {number} x - Center X pixel position
         * @param {number} y - Center Y pixel position
         * @returns {Element} Temple element
         */
        createTemple: function(id, color, x, y) {
            var el = document.createElement('div');
            el.className = 'delphi-temple temple-' + color;
            el.id = 'temple_' + id;
            el.dataset.templeId = id;
            el.dataset.color = color;
            el.style.left = x + 'px';
            el.style.top = y + 'px';

            this.boardPieces.appendChild(el);
            this.temples.set(id, el);

            return el;
        },

        /**
         * Remove a temple with lift-and-fade animation
         * @param {number} id - Temple ID
         */
        removeTemple: function(id) {
            var el = this.temples.get(id);
            if (!el) return;

            el.classList.add('temple-removing');

            var self = this;
            setTimeout(function() {
                el.remove();
                self.temples.delete(id);
            }, 400);
        },

        /**
         * Create a small offering cube positioned around a temple
         * @param {number} id - Offering ID
         * @param {string} color - Offering color
         * @param {number} x - Hex center X pixel
         * @param {number} y - Hex center Y pixel
         * @param {number} slotIndex - Cardinal slot (0=top, 1=right, 2=bottom, 3=left)
         * @param {string} hexKey - Hex key "q,r"
         * @returns {Element} Offering element
         */
        createTempleOffering: function(id, color, x, y, slotIndex, hexKey) {
            var el = document.createElement('div');
            el.className = 'delphi-offering offering-' + color + ' offering-small';
            el.id = 'temple_offering_' + id;
            el.dataset.color = color;
            el.dataset.hexKey = hexKey;
            el.dataset.slotIndex = slotIndex;

            // Position using cardinal offsets around temple center
            var offset = this.TEMPLE_OFFERING_OFFSETS[slotIndex] || { dx: 0, dy: 0 };
            el.style.left = (x + offset.dx - 8) + 'px';   // 8 = half of 16px width
            el.style.top = (y + offset.dy - 9) + 'px';    // 9 = half of 18px height

            // Build faux-isometric cube
            var cube = document.createElement('div');
            cube.className = 'offering-cube';

            var topFace = document.createElement('div');
            topFace.className = 'offering-face offering-face-top';

            var rightFace = document.createElement('div');
            rightFace.className = 'offering-face offering-face-right';

            var leftFace = document.createElement('div');
            leftFace.className = 'offering-face offering-face-left';

            cube.appendChild(topFace);
            cube.appendChild(rightFace);
            cube.appendChild(leftFace);
            el.appendChild(cube);

            this.boardPieces.appendChild(el);
            this.offerings.set('temple_' + id, el);

            // Placement animation with staggered delay
            cube.style.animationDelay = (slotIndex * 100) + 'ms';
            cube.classList.add('offering-placing');
            cube.addEventListener('animationend', function handler() {
                cube.classList.remove('offering-placing');
                cube.removeEventListener('animationend', handler);
            });

            return el;
        },

        // =====================================================
        // SHRINES
        // =====================================================

        // All 12 shrine overlays: 4 colors × 3 symbols each
        SHRINE_OVERLAYS: [
            'blue-omega', 'blue-phi', 'blue-sigma',
            'green-phi', 'green-psi', 'green-sigma',
            'red-omega', 'red-phi', 'red-psi',
            'yellow-omega', 'yellow-psi', 'yellow-sigma'
        ],

        /**
         * Randomly distribute 12 shrine overlays across 12 shrine hexes (1:1).
         * @param {Array} shrineHexes - Array of hex objects with attribute 'shrine'
         * @returns {Array} Array of {id, overlay, color, symbol, q, r}
         */
        distributeShrines: function(shrineHexes) {
            // Fisher-Yates shuffle of overlays
            var overlays = this.SHRINE_OVERLAYS.slice();
            for (var i = overlays.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var temp = overlays[i];
                overlays[i] = overlays[j];
                overlays[j] = temp;
            }

            var assignments = [];
            for (var k = 0; k < shrineHexes.length && k < overlays.length; k++) {
                var parts = overlays[k].split('-');
                assignments.push({
                    id: k + 1,
                    overlay: overlays[k],
                    color: parts[0],
                    symbol: parts[1],
                    q: shrineHexes[k].q,
                    r: shrineHexes[k].r
                });
            }
            return assignments;
        },

        /**
         * Create a shrine overlay on the board (face-down initially).
         * @param {number} id - Shrine ID
         * @param {string} overlay - Overlay key (e.g. 'blue-omega')
         * @param {number} x - Hex center X pixel
         * @param {number} y - Hex center Y pixel
         * @returns {Element} Shrine element
         */
        createShrine: function(id, overlay, x, y) {
            var el = document.createElement('div');
            el.className = 'delphi-shrine shrine-' + overlay;
            el.id = 'shrine_' + id;
            el.dataset.shrineId = id;
            el.dataset.overlay = overlay;
            el.style.left = x + 'px';
            el.style.top = y + 'px';

            // Flipper container
            var flipper = document.createElement('div');
            flipper.className = 'shrine-flipper';

            // Front face (clouds background)
            var front = document.createElement('div');
            front.className = 'shrine-face shrine-face-front';

            // Back face (colored shrine — image set via CSS class on parent)
            var back = document.createElement('div');
            back.className = 'shrine-face shrine-face-back';

            flipper.appendChild(front);
            flipper.appendChild(back);
            el.appendChild(flipper);

            this.boardPieces.appendChild(el);
            this.shrines.set(id, el);

            return el;
        },

        /**
         * Toggle a shrine between hidden (clouds) and revealed (colored) side.
         * @param {number} id - Shrine ID
         */
        flipShrine: function(id) {
            var el = this.shrines.get(id);
            if (!el) return;
            el.classList.toggle('shrine-revealed');
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
        addOracleCardToHand: function(color, isWild) {
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

                // Mark wild card
                if (isWild) {
                    el.classList.add('oracle-card-wild');
                }

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
         * Clear all injury cards from the injury area (e.g. Aphrodite ability)
         */
        clearAllInjuryCards: function() {
            const container = document.getElementById('delphi-injury-cards-area');
            if (container) {
                container.innerHTML = '';
            }
            this.injuryCards.forEach(data => data.element.remove());
            this.injuryCards.clear();
        },

        /**
         * Set oracle dice wild state (Apollo ability)
         * @param {boolean} active - Whether wild mode is active
         */
        setDiceWild: function(active) {
            var diceContainer = document.getElementById('delphi-oracle-dice');
            if (diceContainer) {
                if (active) {
                    diceContainer.classList.add('dice-wild-active');
                } else {
                    diceContainer.classList.remove('dice-wild-active');
                }
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
         * Add an equipment card to the hand strip.
         *
         * @param {number} id - Card ID
         * @param {string} imgUrl - Card image URL
         * @param {Object} [opts] - Optional config
         * @param {Function} [opts.onClick] - Click callback, invoked with (id)
         * @param {boolean} [opts.isUsed] - If truthy, renders with .used class
         * @param {Object} [opts.gameModule] - The game module (used to bind
         *                                     the rich tooltip via
         *                                     addTooltipHtml). Required if
         *                                     cardTypeArg is provided.
         * @param {number} [opts.cardTypeArg] - card_type_arg (0-21) used by
         *                                      the tooltip builder.
         */
        addEquipmentCard: function(id, imgUrl, opts) {
            const container = document.getElementById('delphi-equipment-cards-area');
            if (!container) return;

            // Max 4 equipment cards
            if (this.equipmentCards.size >= 4) return;

            opts = opts || {};

            const el = document.createElement('div');
            el.className = 'delphi-equipment-card';
            el.id = `equipment_${id}`;
            el.dataset.cardId = id;
            el.style.backgroundImage = `url(${imgUrl})`;

            if (opts.onClick) {
                el.tabIndex = 0;
                el.setAttribute('role', 'button');
                el.addEventListener('click', function() {
                    opts.onClick(id);
                });
                el.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        opts.onClick(id);
                    }
                });
            }
            if (opts.isUsed) {
                el.classList.add('used');
            }

            container.appendChild(el);
            this.equipmentCards.set(id, el);

            // Bind rich HTML tooltip via BGA's addTooltipHtml. Must happen
            // after the element is in the DOM so BGA can resolve it by id.
            if (opts.gameModule && typeof opts.cardTypeArg === 'number') {
                var html = opts.gameModule._buildEquipmentTooltipHtml(opts.cardTypeArg);
                opts.gameModule.addTooltipHtml(el.id, html);
            }

            return el;
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

                        // Offerings use drawn isometric cubes (matching board pieces)
                        // Add offering-${color} class so face color selectors apply
                        if (type === 'offering') {
                            el.classList.add(`offering-${color}`);
                            var cube = document.createElement('div');
                            cube.className = 'offering-cube';
                            cube.appendChild(Object.assign(document.createElement('div'), { className: 'offering-face offering-face-top' }));
                            cube.appendChild(Object.assign(document.createElement('div'), { className: 'offering-face offering-face-right' }));
                            cube.appendChild(Object.assign(document.createElement('div'), { className: 'offering-face offering-face-left' }));
                            el.appendChild(cube);
                        }

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

            // Grey out unused rows for 2-3 player games
            // PLAYER_COUNT_ROW: 2p→3, 3p→2, 4p→1
            var startRow = {2: 3, 3: 2, 4: 1}[playerCount] || 1;
            if (startRow > 1) {
                var cells = document.querySelectorAll('#delphi-god-track .god-cell');
                cells.forEach(function(cell) {
                    var row = parseInt(cell.dataset.row);
                    if (row < startRow) {
                        cell.classList.add('god-cell-unused');
                    }
                });
            }
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
        GOD_INFO: {
            aphrodite: { ability: 'discard_all_injuries' },
            apollo:    { ability: 'dice_wild' },
            ares:      { ability: 'auto_defeat_monster', prerequisite: 'Ship must be adjacent to a monster' },
            artemis:   { ability: 'free_explore_island', prerequisite: 'Unrevealed islands must remain' },
            hermes:    { ability: 'grab_any_statue', prerequisite: 'Ship must be adjacent to a city with cargo space' },
            poseidon:  { ability: 'teleport_ship' },
        },

        initializePlayerGods: function(playerId, playerColor) {
            const gods = ['apollo', 'artemis', 'poseidon', 'aphrodite', 'hermes', 'ares'];
            console.log('Initializing god tokens for player', playerId, 'with color', playerColor);

            gods.forEach(godName => {
                const token = this.createGodToken(playerId, godName, playerColor);
                console.log('Created god token:', godName, token);
                const targetCell = document.querySelector(`#delphi-god-start-row .god-start-cell[data-god="${godName}"]`);
                console.log('Target cell for', godName, ':', targetCell);
                this.positionGodToken(playerId, godName, 0); // Start at row 0

                // Add ability tooltip
                var info = this.GOD_INFO[godName];
                if (info && this.game) {
                    var label = godName.charAt(0).toUpperCase() + godName.slice(1);
                    var desc = this.game.getGodAbilityDescription(info.ability);
                    var tooltip = label + ': ' + desc;
                    if (info.prerequisite) {
                        tooltip += ' (' + info.prerequisite + ')';
                    }
                    this.game.addTooltip(token.id, tooltip, '');
                }
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
         * Set shield value - single marker on one position
         * @param {number} value - Shield value (0-5)
         * @param {string} [playerColor] - Player color for shield image (red, yellow, green, blue)
         */
        setShieldValue: function(value, playerColor) {
            const slots = document.querySelectorAll('.shield-slot');
            slots.forEach(slot => {
                slot.classList.remove('active', 'shield-red', 'shield-yellow', 'shield-green', 'shield-blue');
                if (parseInt(slot.dataset.value) === value) {
                    slot.classList.add('active');
                    if (playerColor) {
                        slot.classList.add('shield-' + playerColor);
                    }
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

                        if (tile.completed) {
                            el.style.opacity = '0';
                            el.style.transform = 'scale(0.8)';
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

            // Clear 3D battle die
            this.clearBattleDie();
            this._diceBox = null;

            // Clear ship tile slot
            const shipTileSlot = document.getElementById('delphi-ship-tile-slot');
            if (shipTileSlot) shipTileSlot.innerHTML = '';
        },

        // =====================================================
        //  PLAYER PANEL
        // =====================================================

        playerPanel: {
            SHRINE_GLYPHS: {
                omega: 'Ω', phi: 'Φ', sigma: 'Σ', psi: 'Ψ',
            },
            GOD_ORDER: ['poseidon', 'apollo', 'artemis', 'aphrodite', 'ares', 'hermes'],
            init: function(playerId, gamedatas) {
                var slot = document.getElementById('player_board_' + playerId);
                if (!slot) {
                    console.warn('[player-panel] no player_board slot for', playerId);
                    return null;
                }
                var panel = document.createElement('div');
                panel.id = 'pp-root-' + playerId;
                panel.className = 'delphi-pp';
                panel.dataset.player = playerId;
                slot.appendChild(panel);
                return panel;
            },
            getRoot: function(playerId) {
                return document.getElementById('pp-root-' + playerId);
            },

            renderHeader: function(playerId, gamedatas) {
                var root = this.getRoot(playerId);
                if (!root) return;
                var p = gamedatas.players[playerId];
                if (!p) return;
                var taskTotal = (gamedatas.panelState && gamedatas.panelState[playerId])
                    ? gamedatas.panelState[playerId].taskTotal : 12;
                var done = parseInt(p.tasksCompleted || p.tasks_completed || 0, 10);
                var elo = p.elo != null ? p.elo : (p.player_elo || '');
                var flag = p.flag || (p.country ? this._countryFlag(p.country) : '');
                var device = p.device_icon || '';
                var avatarUrl = p.avatar_url || (p.avatar ? g_gamethemeurl + 'img/avatars/' + p.avatar : '');

                var headerHtml = ''
                    + '<div class="delphi-pp-header" id="pp-header-' + playerId + '">'
                    +   '<div class="delphi-pp-avatar" id="pp-avatar-' + playerId + '"'
                    +     (avatarUrl ? ' style="background-image:url(\'' + avatarUrl + '\')"' : '') + '></div>'
                    +   '<div class="delphi-pp-meta-left">'
                    +     '<span class="delphi-pp-name" style="color:#' + p.player_color + '">' + this._escape(p.player_name || p.name || '') + '</span>'
                    +     '<div class="delphi-pp-stats-row">'
                    +       '<span class="delphi-pp-tasks-counter" id="pp-tasks-counter-' + playerId + '" title="Tasks completed (Zeus track)">'
                    +         done + '<small style="opacity:0.6">/' + taskTotal + '</small>'
                    +       '</span>'
                    +       '<span class="delphi-pp-star">★</span>'
                    +       (elo !== '' ? '<span class="delphi-pp-elo">' + elo + '</span>' : '')
                    +     '</div>'
                    +   '</div>'
                    +   '<div class="delphi-pp-meta-right">'
                    +     '<div class="right-top">'
                    +       (device ? '<span class="delphi-pp-device">' + device + '</span>' : '')
                    +       (flag ? '<span class="delphi-pp-flag">' + flag + '</span>' : '')
                    +     '</div>'
                    +     '<span class="delphi-pp-time" id="pp-time-' + playerId + '"></span>'
                    +   '</div>'
                    + '</div>';

                root.insertAdjacentHTML('beforeend', headerHtml);
            },

            updateTasksCounter: function(playerId, done, total) {
                var el = document.getElementById('pp-tasks-counter-' + playerId);
                if (!el) return;
                var t = total || 12;
                el.innerHTML = done + '<small style="opacity:0.6">/' + t + '</small>';
            },

            // Internal — HTML-escape user-supplied strings before inserting into innerHTML.
            _escape: function(s) {
                if (s === null || s === undefined) return '';
                var div = document.createElement('div');
                div.textContent = String(s);
                return div.innerHTML;
            },
            _countryFlag: function(code) {
                // BGA exposes player.country as ISO code in some setups; build a flag emoji
                // from regional indicator pairs. Falls back to empty if code is invalid.
                if (!code || code.length !== 2) return '';
                var cc = code.toUpperCase();
                var a = 0x1F1E6;
                return String.fromCodePoint(a + cc.charCodeAt(0) - 65) + String.fromCodePoint(a + cc.charCodeAt(1) - 65);
            },

            _updateStatValue: function(kind, playerId, n) {
                var el = document.querySelector('#pp-' + kind + '-' + playerId + ' .pp-stat-value');
                if (el) el.textContent = String(n);
            },
            updateFavor:   function(playerId, n) { this._updateStatValue('favor',   playerId, n); },
            updateShield:  function(playerId, n) { this._updateStatValue('shield',  playerId, n); },
            updatePeeked:  function(playerId, n) { this._updateStatValue('peeked',  playerId, n); },
            _renderStatPill: function(opts) {
                var classes = 'delphi-pp-stat-pill delphi-pp-stat-' + opts.kind + (opts.alignRight ? ' right' : '');
                var dataColor = opts.playerColor ? ' data-color="' + opts.playerColor + '"' : '';
                var title = opts.title ? ' title="' + this._escape(opts.title) + '"' : '';
                return ''
                    + '<div id="' + opts.id + '" class="' + classes + '"' + dataColor + title + '>'
                    +   '<span class="pp-stat-icon"></span>'
                    +   '<span class="pp-stat-value">' + opts.value + '</span>'
                    + '</div>';
            },

            SHIP_ABILITY_GLYPHS: {
                shield_start:       { glyph: '🛡', delta: '+2' },
                starting_equipment: { glyph: '📇', delta: '+1' },
                reverse_recolor:    { glyph: '🎨', delta: '⇄' },
                favor_plus_1:       { glyph: '⚜', delta: '+1' },
                god_track_high:     { glyph: '🏛', delta: '↑' },
                range_plus_2:       { glyph: '🚢', delta: '+2' },
                fewer_tasks:        { glyph: '📋', delta: '−1' },
                recolor_discount:   { glyph: '🎨', delta: '−1' },
            },

            _cargoSlotsMarkup: function(storage, cargo) {
                var html = '';
                for (var i = 0; i < storage; i++) {
                    var item = cargo[i];
                    if (item) {
                        var bg = 'img/pieces/' + (item.type === 'statue'
                            ? item.color + '-statue.png'
                            : 'offering.png');
                        html += '<div class="delphi-pp-cargo-slot ' + item.type + ' filled"'
                            + ' style="--cell-color: var(--delphi-' + item.color + ');'
                            + ' --cell-bg: url(\'' + bg + '\')"'
                            + ' data-color="' + item.color + '"></div>';
                    } else {
                        html += '<div class="delphi-pp-cargo-slot offering empty"></div>';
                    }
                }
                return html;
            },

            renderCargoRow: function(playerId, gamedatas) {
                var root = this.getRoot(playerId);
                if (!root) return;
                var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
                var storage = s.storage || 2;
                var cargo = s.cargo || [];
                var ability = s.shipAbility;
                var abilityInfo = ability ? this.SHIP_ABILITY_GLYPHS[ability] : null;
                var peekedCount = s.peekedCount || 0;

                var abilityHtml = abilityInfo
                    ? '<div class="delphi-pp-ship-ability" title="' + this._escape(s.shipTileDescription || '') + '">'
                        + '<span>' + abilityInfo.glyph + '</span><span>' + abilityInfo.delta + '</span>'
                        + '</div>'
                    : '';

                var peekedHtml = this._renderStatPill({
                    id: 'pp-peeked-' + playerId,
                    kind: 'peeked',
                    value: peekedCount,
                    alignRight: true,
                    title: 'Click to view peeked islands',
                });

                var cargoRowHtml = ''
                    + '<div class="delphi-pp-cargo-row" id="pp-cargo-row-' + playerId + '">'
                    +   '<span class="delphi-pp-ship-icon"></span>'
                    +   '<div class="delphi-pp-cargo-slots" id="pp-cargo-slots-' + playerId + '">'
                    +     this._cargoSlotsMarkup(storage, cargo)
                    +   '</div>'
                    +   abilityHtml
                    +   peekedHtml
                    + '</div>';
                root.insertAdjacentHTML('beforeend', cargoRowHtml);
            },

            updateCargo: function(playerId, gamedatas) {
                var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
                var storage = s.storage || 2;
                var cargo = s.cargo || [];
                var slotsEl = document.getElementById('pp-cargo-slots-' + playerId);
                if (!slotsEl) return;
                slotsEl.innerHTML = this._cargoSlotsMarkup(storage, cargo);
            },

            renderInjuryRow: function(playerId, gamedatas) {
                var root = this.getRoot(playerId);
                if (!root) return;
                var s = (gamedatas.panelState && gamedatas.panelState[playerId]) || {};
                var playerColor = (gamedatas.players[playerId].player_color || '').toLowerCase();

                var rowHtml = ''
                    + '<div class="delphi-pp-injury-row" id="pp-injury-row-' + playerId + '">'
                    +   '<span class="delphi-pp-injury-icon">🩹</span>'
                    +   '<div class="delphi-pp-injury-bar" id="pp-injury-bar-' + playerId + '"></div>'
                    +   '<span class="delphi-pp-injury-total" id="pp-injury-total-' + playerId + '">0/6</span>'
                    +   this._renderStatPill({
                            id: 'pp-shield-' + playerId,
                            kind: 'shield',
                            value: (s.shieldValue || 0),
                            alignRight: true,
                            playerColor: this._playerColorName(playerColor),
                        })
                    + '</div>';
                root.insertAdjacentHTML('beforeend', rowHtml);
                this.updateInjuries(playerId, s.injuries || []);
            },

            updateInjuries: function(playerId, byColor) {
                var bar = document.getElementById('pp-injury-bar-' + playerId);
                var totalEl = document.getElementById('pp-injury-total-' + playerId);
                if (!bar || !totalEl) return;

                var cells = [];
                var total = 0;
                byColor.forEach(function(row) {
                    var n = parseInt(row.n, 10);
                    total += n;
                    for (var i = 0; i < n; i++) {
                        cells.push({ color: row.color, runLen: n });
                    }
                });
                while (cells.length < 6) cells.push(null);

                bar.innerHTML = cells.map(function(cell) {
                    if (!cell) return '<div class="delphi-pp-injury-cell"></div>';
                    var cls = 'delphi-pp-injury-cell filled';
                    if (cell.runLen === 2) cls += ' warn-2';
                    if (cell.runLen >= 3) cls += ' danger-3';
                    return '<div class="' + cls + '" data-color="' + cell.color + '"></div>';
                }).join('');

                var totalCls = 'delphi-pp-injury-total';
                if (total >= 6) totalCls += ' danger';
                else if (total >= 5) totalCls += ' warn';
                totalEl.className = totalCls;
                totalEl.textContent = total + '/6';
            },

            // Map BGA hex player_color to OoD player color name (matches PHP MaterialDefs::HEX_TO_GAME_COLOR).
            _playerColorName: function(hexColor) {
                var map = {
                    'dc3545': 'red',
                    'ffc107': 'yellow',
                    '28a745': 'green',
                    '007bff': 'blue',
                };
                return map[(hexColor || '').toLowerCase()] || 'red';
            },
        },
    });
});
