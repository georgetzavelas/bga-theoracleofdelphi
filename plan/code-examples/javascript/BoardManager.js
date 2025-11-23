/**
 * Board Manager - Board Rendering and Interaction
 * Handles hexagonal board display and ship placement
 */

var BoardManager = {
    game: null,
    spaces: {},
    adjacency: {},

    /**
     * Initialize board manager
     */
    setup: function(game, boardData) {
        console.log('BoardManager: Setting up board');
        this.game = game;
        this.spaces = boardData.spaces;
        this.adjacency = boardData.adjacency;

        this.renderBoard(boardData);
        this.attachEventListeners();
    },

    /**
     * Render hexagonal board
     */
    renderBoard: function(boardData) {
        const boardContainer = document.getElementById('game-board');

        // Create hex grid container
        const hexGrid = document.createElement('div');
        hexGrid.id = 'hex-grid';
        hexGrid.className = 'hex-grid';

        // Render each space
        for (const spaceId in this.spaces) {
            const space = this.spaces[spaceId];
            const hexElement = this.createHexElement(space);
            hexGrid.appendChild(hexElement);
        }

        boardContainer.appendChild(hexGrid);

        // Place components on board
        this.placeComponents(boardData.components);
    },

    /**
     * Create hex element for a space
     */
    createHexElement: function(space) {
        const hex = document.createElement('div');
        hex.id = `space-${space.space_id}`;
        hex.className = `hex hex-${space.space_type}`;

        if (space.space_type === 'water') {
            hex.classList.add(`hex-color-${space.hex_color}`);
        }

        // Position hex using CSS
        const position = this.calculateHexPosition(space);
        hex.style.left = position.x + 'px';
        hex.style.top = position.y + 'px';

        // Add data attributes
        hex.dataset.spaceId = space.space_id;
        hex.dataset.spaceType = space.space_type;
        if (space.hex_color) {
            hex.dataset.hexColor = space.hex_color;
        }

        return hex;
    },

    /**
     * Calculate hex position using axial coordinates
     */
    calculateHexPosition: function(space) {
        // Hex dimensions
        const hexSize = 60;
        const hexWidth = hexSize * 2;
        const hexHeight = Math.sqrt(3) * hexSize;

        // Convert axial to pixel coordinates
        const x = hexSize * 3/2 * space.q;
        const y = hexHeight * (space.r + space.q/2);

        return {
            x: x + 500, // Offset to center board
            y: y + 300
        };
    },

    /**
     * Place components on board (offerings, monsters, statues, etc)
     */
    placeComponents: function(components) {
        for (const component of components) {
            this.placeComponent(component);
        }
    },

    /**
     * Place individual component
     */
    placeComponent: function(component) {
        const spaceElement = document.getElementById(`space-${component.location_id}`);
        if (!spaceElement) return;

        const componentElement = document.createElement('div');
        componentElement.id = `component-${component.component_id}`;
        componentElement.className = `component component-${component.component_type} component-${component.component_color}`;

        spaceElement.appendChild(componentElement);
    },

    /**
     * Highlight reachable spaces for ship movement
     */
    highlightReachableSpaces: function(spaceIds) {
        console.log('BoardManager: Highlighting reachable spaces', spaceIds);

        // Clear previous highlights
        this.clearHighlights();

        // Highlight reachable spaces
        for (const spaceId of spaceIds) {
            const hexElement = document.getElementById(`space-${spaceId}`);
            if (hexElement) {
                hexElement.classList.add('hex-reachable');
            }
        }
    },

    /**
     * Clear all highlights
     */
    clearHighlights: function() {
        document.querySelectorAll('.hex-reachable').forEach(el => {
            el.classList.remove('hex-reachable');
        });
        document.querySelectorAll('.hex-selected').forEach(el => {
            el.classList.remove('hex-selected');
        });
    },

    /**
     * Place ship on space
     */
    placeShip: function(playerId, spaceId) {
        const spaceElement = document.getElementById(`space-${spaceId}`);
        if (!spaceElement) return;

        // Remove ship from previous location
        const existingShip = document.getElementById(`ship-${playerId}`);
        if (existingShip) {
            existingShip.remove();
        }

        // Create ship element
        const shipElement = document.createElement('div');
        shipElement.id = `ship-${playerId}`;
        shipElement.className = `ship ship-player-${playerId}`;

        spaceElement.appendChild(shipElement);
    },

    /**
     * Animate ship movement
     */
    moveShipAnimation: async function(playerId, fromSpaceId, toSpaceId) {
        const shipElement = document.getElementById(`ship-${playerId}`);
        const toSpace = document.getElementById(`space-${toSpaceId}`);

        if (!shipElement || !toSpace) return;

        // Get positions
        const fromRect = shipElement.getBoundingClientRect();
        const toRect = toSpace.getBoundingClientRect();

        // Calculate movement
        const deltaX = toRect.left - fromRect.left;
        const deltaY = toRect.top - fromRect.top;

        // Animate
        shipElement.style.transition = 'transform 0.5s ease-in-out';
        shipElement.style.transform = `translate(${deltaX}px, ${deltaY}px)`;

        // Wait for animation
        await this.game.wait(500);

        // Place ship at new location
        this.placeShip(playerId, toSpaceId);
        shipElement.style.transform = '';
        shipElement.style.transition = '';
    },

    /**
     * Attach event listeners for hex clicks
     */
    attachEventListeners: function() {
        const self = this;

        document.getElementById('game-board').addEventListener('click', function(evt) {
            const hex = evt.target.closest('.hex');
            if (!hex) return;

            const spaceId = parseInt(hex.dataset.spaceId);
            self.onHexClick(spaceId, hex);
        });
    },

    /**
     * Handle hex click
     */
    onHexClick: function(spaceId, hexElement) {
        console.log('BoardManager: Hex clicked', spaceId);

        // Check if this is a valid move
        if (hexElement.classList.contains('hex-reachable')) {
            this.game.onMoveShip(spaceId);
        }
    },

    /**
     * Show island tile reveal animation
     */
    revealIslandAnimation: async function(islandTileId, tileData) {
        const islandElement = document.getElementById(`island-${islandTileId}`);
        if (!islandElement) return;

        // Flip animation
        islandElement.classList.add('revealing');

        await this.game.wait(300);

        // Update tile appearance
        islandElement.classList.remove('face-down');
        islandElement.classList.add('face-up');
        islandElement.dataset.tileType = tileData.tile_type;

        await this.game.wait(300);

        islandElement.classList.remove('revealing');
    },

    /**
     * Get adjacent spaces
     */
    getAdjacentSpaces: function(spaceId) {
        return this.adjacency[spaceId] || [];
    }
};