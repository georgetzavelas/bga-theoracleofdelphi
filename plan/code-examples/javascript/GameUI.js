/**
 * The Oracle of Delphi - Main Game UI
 * Modern BGA framework patterns with Promise-based notifications
 */

define([
    "dojo", "dojo/_base/declare",
    "ebg/core/gamegui"
], function(dojo, declare) {
    return declare("bgagame.theoracleofdelphi", ebg.core.gamegui, {
        constructor: function() {
            // Initialize managers
            this.boardManager = null;
            this.shipManager = null;
            this.oracleManager = null;
        },

        setup: function(gamedatas) {
            console.log("Starting game setup");

            // Setup board
            this.boardManager = new BoardManager(this, gamedatas);
            this.shipManager = new ShipManager(this, gamedatas);
            this.oracleManager = new OracleManager(this, gamedatas);

            // Setup player boards
            this.setupPlayerBoards(gamedatas.players);

            // Setup notifications (modern promise-based system)
            this.setupNotifications();

            console.log("Game setup complete");
        },

        onEnteringState: function(stateName, args) {
            console.log('Entering state: ' + stateName);

            // Handle state-specific UI
            switch(stateName) {
                case 'playerActions':
                    this.updateAvailableActions(args.args);
                    break;
                case 'fightMonster':
                    this.showCombatUI(args.args);
                    break;
                case 'consultOracle':
                    this.prepareOracleConsultation();
                    break;
                // ... other states
            }
        },

        setupNotifications: function() {
            // Modern promise-based notification system
            this.bgaSetupPromiseNotifications();

            // Handlers auto-detected by prefix "notif_"
            // No need for manual dojo.subscribe calls
        },

        // Modern async notification handlers
        notif_shipMoved: async function(args) {
            // args contains: player_id, space_id, player_name (from decorator)
            await this.shipManager.moveShipAnimation(args.player_id, args.space_id);
        },

        notif_diceRolled: async function(args) {
            await this.oracleManager.animateDiceRoll(args.player_id, args.rolls);
        },

        notif_taskCompleted: async function(args) {
            await this.taskManager.completeTaskAnimation(args.player_id, args.task_type);
        },

        notif_monsterDefeated: async function(args) {
            await this.combatManager.showVictoryAnimation(args.player_id, args.monster_color);
        },

        notif_godAdvanced: async function(args) {
            await this.godManager.advanceGodAnimation(args.player_id, args.god_color, args.new_position);
        },

        // Player actions
        onMoveShip: function(spaceId) {
            if (!this.checkAction('moveShip')) return;

            this.bgaPerformAction('actMoveShip', {
                space_id: spaceId
            });
        },

        onFightMonster: function(monsterColor) {
            if (!this.checkAction('fightMonster')) return;

            this.bgaPerformAction('actFightMonster', {
                monster_color: monsterColor
            });
        },

        onUseDie: function(dieNumber, action) {
            if (!this.checkAction('useDie')) return;

            this.bgaPerformAction('actUseDie', {
                die_number: dieNumber,
                action: action
            });
        }
    });
});