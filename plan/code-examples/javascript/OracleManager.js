/**
 * Oracle Manager - Oracle and Dice Display
 * Handles dice rolling, placement, and recoloring UI
 */

var OracleManager = {
    game: null,
    playerId: null,
    dice: {},

    /**
     * Initialize oracle manager
     */
    setup: function(game, playerId, diceData) {
        console.log('OracleManager: Setting up oracle for player', playerId);
        this.game = game;
        this.playerId = playerId;
        this.dice = diceData;

        this.renderOracle();
        this.placeDice(diceData);
    },

    /**
     * Render oracle circle
     */
    renderOracle: function() {
        const oracleContainer = document.getElementById(`oracle-${this.playerId}`);
        if (!oracleContainer) return;

        // Create oracle segments (6 colored positions)
        const colors = ['blue', 'yellow', 'green', 'red', 'black', 'pink'];
        const gods = ['Poseidon', 'Apollon', 'Artemis', 'Aphrodite', 'Ares', 'Hermes'];

        for (let i = 0; i < 6; i++) {
            const segment = document.createElement('div');
            segment.id = `oracle-segment-${i + 1}`;
            segment.className = `oracle-segment oracle-segment-${colors[i]}`;
            segment.dataset.position = i + 1;
            segment.dataset.color = colors[i];
            segment.dataset.god = gods[i];

            // Position segment around circle
            const angle = (i * 60) - 90; // Start at top
            segment.style.transform = `rotate(${angle}deg) translateY(-120px)`;

            oracleContainer.appendChild(segment);
        }

        // Create center (Pythia)
        const center = document.createElement('div');
        center.id = 'oracle-center';
        center.className = 'oracle-center';
        oracleContainer.appendChild(center);
    },

    /**
     * Place dice on oracle
     */
    placeDice: function(diceData) {
        for (const die of diceData) {
            this.placeDie(die.die_number, die.oracle_position, die.die_color);
        }
    },

    /**
     * Place individual die
     */
    placeDie: function(dieNumber, position, color) {
        const dieElement = document.getElementById(`die-${this.playerId}-${dieNumber}`);
        if (!dieElement) {
            // Create die element
            const die = document.createElement('div');
            die.id = `die-${this.playerId}-${dieNumber}`;
            die.className = `oracle-die oracle-die-${color}`;
            die.dataset.dieNumber = dieNumber;
            die.dataset.color = color;
            die.textContent = dieNumber;

            // Add to oracle
            document.getElementById(`oracle-${this.playerId}`).appendChild(die);
        }

        // Position die
        const segmentElement = document.getElementById(`oracle-segment-${position}`);
        if (segmentElement) {
            const rect = segmentElement.getBoundingClientRect();
            dieElement.style.left = rect.left + 'px';
            dieElement.style.top = rect.top + 'px';
        }

        // Update die appearance
        dieElement.className = `oracle-die oracle-die-${color}`;
        dieElement.dataset.color = color;
        dieElement.dataset.position = position;
    },

    /**
     * Roll dice animation
     */
    animateDiceRoll: async function(rolls) {
        console.log('OracleManager: Rolling dice', rolls);

        // Animate each die
        for (const roll of rolls) {
            await this.animateSingleDieRoll(roll.die_number, roll.position, roll.color);
        }
    },

    /**
     * Animate single die roll
     */
    animateSingleDieRoll: async function(dieNumber, position, color) {
        const dieElement = document.getElementById(`die-${this.playerId}-${dieNumber}`);
        if (!dieElement) return;

        // Rolling animation
        dieElement.classList.add('rolling');

        await this.game.wait(500);

        // Place at final position
        this.placeDie(dieNumber, position, color);

        dieElement.classList.remove('rolling');
    },

    /**
     * Show recolor UI for a die
     */
    showRecolorUI: function(dieNumber) {
        const dieElement = document.getElementById(`die-${this.playerId}-${dieNumber}`);
        if (!dieElement) return;

        const currentPosition = parseInt(dieElement.dataset.position);

        // Highlight available positions
        for (let steps = 1; steps <= 5; steps++) {
            const newPosition = ((currentPosition - 1 + steps) % 6) + 1;
            const cost = this.calculateRecolorCost(steps);

            const segment = document.getElementById(`oracle-segment-${newPosition}`);
            if (segment) {
                segment.classList.add('recolor-available');
                segment.dataset.recolorCost = cost;
            }
        }

        // Attach click handlers
        document.querySelectorAll('.recolor-available').forEach(segment => {
            segment.addEventListener('click', (evt) => {
                const newPosition = parseInt(evt.target.dataset.position);
                const cost = parseInt(evt.target.dataset.recolorCost);
                this.game.onRecolorDie(dieNumber, newPosition, cost);
                this.clearRecolorUI();
            });
        });
    },

    /**
     * Calculate recolor cost
     */
    calculateRecolorCost: function(steps) {
        // Check for ship tile discount
        const hasDiscount = this.game.playerHasShipTileAbility('recolor_discount');
        return hasDiscount ? Math.max(0, steps - 1) : steps;
    },

    /**
     * Clear recolor UI
     */
    clearRecolorUI: function() {
        document.querySelectorAll('.recolor-available').forEach(segment => {
            segment.classList.remove('recolor-available');
            delete segment.dataset.recolorCost;
        });
    },

    /**
     * Move die to center (used)
     */
    moveDieToCenter: async function(dieNumber) {
        const dieElement = document.getElementById(`die-${this.playerId}-${dieNumber}`);
        const centerElement = document.getElementById('oracle-center');

        if (!dieElement || !centerElement) return;

        dieElement.classList.add('die-used');

        // Animate to center
        const centerRect = centerElement.getBoundingClientRect();
        dieElement.style.transition = 'all 0.3s ease';
        dieElement.style.left = centerRect.left + 'px';
        dieElement.style.top = centerRect.top + 'px';
        dieElement.style.opacity = '0.5';

        await this.game.wait(300);
    },

    /**
     * Reset dice (new turn)
     */
    resetDice: function() {
        document.querySelectorAll('.oracle-die').forEach(die => {
            die.classList.remove('die-used');
            die.style.opacity = '1';
        });
    },

    /**
     * Show oracle consultation animation
     */
    consultOracleAnimation: async function() {
        const oracleElement = document.getElementById(`oracle-${this.playerId}`);
        if (!oracleElement) return;

        // Glow effect
        oracleElement.classList.add('consulting');

        await this.game.wait(1000);

        oracleElement.classList.remove('consulting');
    }
};