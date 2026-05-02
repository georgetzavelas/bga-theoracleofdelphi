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

// JS cache-bust marker. Bump in all 6 URLs in the define() block AND the
// JS_VERSION class property below when JS modules change.
define([
    "dojo","dojo/_base/declare",
    "ebg/core/gamegui",
    "ebg/counter",
    g_gamethemeurl + "modules/js/HexGrid.js?v122",
    g_gamethemeurl + "modules/js/Components.js?v122",
    g_gamethemeurl + "modules/js/ClusterDefinitions.js?v122",
    g_gamethemeurl + "modules/js/BoardBuilder.js?v122",
    g_gamethemeurl + "modules/js/BoardRenderer.js?v122",
    g_gamethemeurl + "modules/BX/js/DragScroller.js?v122",
],
function (dojo, declare, gamegui, counter, HexGrid, Components, ClusterDefinitions, BoardBuilder, BoardRenderer) {

    // Mirror of MaterialDefs::SHRINE_LETTERS — used to map a player's shrine_index
    // to its Greek letter so we can align shrine tokens with their Zeus tile column.
    var SHRINE_LETTERS = {
        'red':    ['omega', 'phi', 'psi'],
        'yellow': ['omega', 'psi', 'sigma'],
        'green':  ['phi',   'psi', 'sigma'],
        'blue':   ['omega', 'phi', 'sigma'],
    };

    // Per-element HTML templates consumed by dojo.string.substitute. Migrated out
    // of the .tpl <script> block so they live inside the AMD closure rather than
    // on window scope (T-10 audit).
    var jstpl_hex = '<div class="delphi-hex hex-${color}" id="hex_${q}_${r}" data-q="${q}" data-r="${r}" data-type="${type}" data-color="${color}" style="left:${x}px;top:${y}px;"></div>';
    var jstpl_ship = '<div class="delphi-ship ship-${color}" id="ship_${player_id}" data-player="${player_id}" tabindex="0" role="button" style="left:${x}px;top:${y}px;"></div>';
    var jstpl_die = '<div class="delphi-die die-${color}" id="die_${id}" data-color="${color}" data-index="${index}" tabindex="0" role="button"></div>';
    var jstpl_monster = '<div class="delphi-monster monster-${type}" id="monster_${id}" data-type="${type}" data-color="${color}" style="left:${x}px;top:${y}px;"></div>';
    var jstpl_statue = '<div class="delphi-statue statue-${color}" id="statue_${id}" data-color="${color}"></div>';
    var jstpl_offering = '<div class="delphi-offering offering-${color}" id="offering_${id}" data-color="${color}"></div>';
    var jstpl_island = '<div class="delphi-island island-${type}" id="island_${id}" data-revealed="${revealed}" style="left:${x}px;top:${y}px;"></div>';
    var jstpl_card = '<div class="delphi-card card-${type}" id="card_${type}_${id}" data-type="${type}" data-card-id="${card_id}"></div>';
    var jstpl_god_token = '<div class="delphi-god-token god-${god}" id="god_${player_id}_${god}" data-god="${god}" data-player="${player_id}" tabindex="0" role="button"></div>';
    var jstpl_zeus_tile = '<div class="delphi-zeus-tile zeus-${task_type}" id="zeus_${id}" data-type="${task_type}" data-color="${task_color}" data-completed="${completed}"></div>';
    var jstpl_equipment_card = '<div class="delphi-equipment-card" id="equipment_${id}" data-card-id="${id}" tabindex="0" role="button" style="background-image:url(${img_url})"></div>';
    var jstpl_oracle_card = '<div class="delphi-oracle-card oracle-${color}" id="oracle_${id}" data-color="${color}" data-card-id="${card_id}" tabindex="0" role="button"><div class="card-count-badge">${count}</div></div>';
    var jstpl_injury_card = '<div class="delphi-injury-card injury-${color}" id="injury_${id}" data-color="${color}" data-card-id="${card_id}" tabindex="0" role="button"><div class="card-count-badge">${count}</div></div>';
    var jstpl_companion_card = '<div class="delphi-companion-card companion-${type}" id="companion_${id}" data-type="${type}" data-color="${color}" data-card-id="${card_id}" tabindex="0" role="button" style="background-image:url(${img_url})"></div>';
    var jstpl_ship_tile = '<div class="delphi-ship-tile" id="ship_tile_${id}" data-tile-id="${id}" style="background-image:url(${img_url})"></div>';
    var jstpl_favor_token = '<div class="delphi-favor-token" id="favor_${id}"></div>';
    var jstpl_cargo_item = '<div class="delphi-cargo-item cargo-${type} cargo-${color}" id="cargo_${id}" data-type="${type}" data-color="${color}"></div>';
    var jstpl_defeated_monster = '<div class="delphi-defeated-monster monster-${color}" id="defeated_monster_${id}" data-color="${color}"></div>';

    return declare("bgagame.theoracleofdelphigzed", ebg.core.gamegui, {

        // Cache-bust version read by Components when loading dice libs.
        // Keep in sync with the ?v122 markers in the define() block above.
        JS_VERSION: "v122",

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

            // Global variables
            this.hexGrid = null;
            this.components = null;
            this.boardRenderer = null;
            this.boardBuilder = null;
            this.clusterDefs = null;
            this.selectedDieIndex = null;
        },

        /**
         * Build the static skeleton DOM injected into #delphi-game-root at the
         * start of setup(). Replaces the 260-line .tpl that BGA Studio Guidelines
         * mark as deprecated for new projects.
         */
        _buildGameLayout: function()
        {
            return '' +
'<div id="delphi-game-container">' +
    '<div id="delphi-board-wrapper">' +
        '<div id="delphi-board-container">' +
            '<div id="delphi-hex-grid"></div>' +
            '<div id="delphi-board-pieces"></div>' +
            '<div id="delphi-zeus-token"></div>' +
            // Public favor pool — anchored to top-right of the hex board,
            // just off the playable map and to the left of BGA's player
            // panel. Six rotated/offset chips beneath an upright top chip
            // (fixed transforms so the pile is identical on every load).
            // Chips are square; transforms scatter them widely. Activation
            // is toggled by onUpdateActionButtons in SelectAction (no
            // Apollo recolor) and NoInjuryBonus.
            '<div id="delphi-favor-pile" class="favor-pile" tabindex="0" role="button" aria-label="Take 2 Favor Tokens">' +
                '<div class="favor-pile-chip" style="transform: rotate(-32deg) translate(-22px, 12px)"></div>' +
                '<div class="favor-pile-chip" style="transform: rotate(28deg) translate(20px, 14px)"></div>' +
                '<div class="favor-pile-chip" style="transform: rotate(-12deg) translate(2px, 22px)"></div>' +
                '<div class="favor-pile-chip" style="transform: rotate(35deg) translate(-10px, -14px)"></div>' +
                '<div class="favor-pile-chip" style="transform: rotate(-22deg) translate(18px, -12px)"></div>' +
                '<div class="favor-pile-chip" style="transform: rotate(8deg) translate(-18px, -8px)"></div>' +
                '<div class="favor-pile-chip favor-pile-top"></div>' +
            '</div>' +
        '</div>' +
    '</div>' +
    '<div id="delphi-current-player-area">' +
        '<div id="delphi-zeus-tiles-area">' +
            '<div class="zeus-tile-group" data-type="shrine">' +
                '<div class="zeus-tile-slot" data-index="0"></div>' +
                '<div class="zeus-tile-slot" data-index="1"></div>' +
                '<div class="zeus-tile-slot" data-index="2"></div>' +
            '</div>' +
            '<div class="zeus-tile-group" data-type="statue">' +
                '<div class="zeus-tile-slot" data-index="0"></div>' +
                '<div class="zeus-tile-slot" data-index="1"></div>' +
                '<div class="zeus-tile-slot" data-index="2"></div>' +
            '</div>' +
            '<div class="zeus-tile-group" data-type="offering">' +
                '<div class="zeus-tile-slot" data-index="0"></div>' +
                '<div class="zeus-tile-slot" data-index="1"></div>' +
                '<div class="zeus-tile-slot" data-index="2"></div>' +
            '</div>' +
            '<div class="zeus-tile-group" data-type="monster">' +
                '<div class="zeus-tile-slot" data-index="0"></div>' +
                '<div class="zeus-tile-slot" data-index="1"></div>' +
                '<div class="zeus-tile-slot" data-index="2"></div>' +
            '</div>' +
        '</div>' +
        '<div id="delphi-played-oracle-card"></div>' +
        '<div id="delphi-oracle-cards-area"></div>' +
        '<div id="delphi-favor-tokens-area">' +
            '<div class="favor-token-stack">' +
                '<div class="favor-count-badge">0</div>' +
            '</div>' +
        '</div>' +
        '<div id="delphi-companion-cards-area"></div>' +
        '<div id="delphi-injury-cards-area"></div>' +
        '<div id="delphi-equipment-cards-area"></div>' +
        '<div id="delphi-player-board">' +
            '<div id="delphi-oracle-wheel">' +
                '<div class="oracle-slot" data-color="red"></div>' +
                '<div class="oracle-slot" data-color="yellow"></div>' +
                '<div class="oracle-slot" data-color="green"></div>' +
                '<div class="oracle-slot" data-color="blue"></div>' +
                '<div class="oracle-slot" data-color="pink"></div>' +
                '<div class="oracle-slot" data-color="black"></div>' +
                '<div id="delphi-pythia-center"></div>' +
            '</div>' +
            '<div id="delphi-oracle-dice"></div>' +
            '<div id="delphi-shrine-slots">' +
                '<div class="shrine-slots-header">' + _('Shrines') + '</div>' +
                '<div class="shrine-columns">' +
                    '<div class="shrine-column" data-shrine="poseidon">' +
                        '<div class="shrine-icon"></div>' +
                        '<div class="shrine-row" tabindex="0" role="button" data-row="0"></div>' +
                    '</div>' +
                    '<div class="shrine-column" data-shrine="apollo">' +
                        '<div class="shrine-icon"></div>' +
                        '<div class="shrine-row" tabindex="0" role="button" data-row="0"></div>' +
                    '</div>' +
                    '<div class="shrine-column" data-shrine="artemis">' +
                        '<div class="shrine-icon"></div>' +
                        '<div class="shrine-row" tabindex="0" role="button" data-row="0"></div>' +
                    '</div>' +
                '</div>' +
            '</div>' +
            '<div id="delphi-shield-track">' +
                '<div class="shield-slots">' +
                    '<div class="shield-slot" data-value="0"></div>' +
                    '<div class="shield-slot" data-value="1"></div>' +
                    '<div class="shield-slot" data-value="2"></div>' +
                    '<div class="shield-slot" data-value="3"></div>' +
                    '<div class="shield-slot" data-value="4"></div>' +
                    '<div class="shield-slot" data-value="5"></div>' +
                '</div>' +
            '</div>' +
            '<div id="delphi-god-track">' +
                '<div id="delphi-god-columns">' +
                    this._buildGodColumn('poseidon') +
                    this._buildGodColumn('apollo') +
                    this._buildGodColumn('artemis') +
                    this._buildGodColumn('aphrodite') +
                    this._buildGodColumn('ares') +
                    this._buildGodColumn('hermes') +
                '</div>' +
            '</div>' +
            '<div id="delphi-god-start-row">' +
                '<div class="god-start-cell" data-god="poseidon"></div>' +
                '<div class="god-start-cell" data-god="apollo"></div>' +
                '<div class="god-start-cell" data-god="artemis"></div>' +
                '<div class="god-start-cell" data-god="aphrodite"></div>' +
                '<div class="god-start-cell" data-god="ares"></div>' +
                '<div class="god-start-cell" data-god="hermes"></div>' +
            '</div>' +
            '<div id="delphi-ship-tile-slot"></div>' +
            '<div id="delphi-ship-storage">' +
                '<div class="storage-slot" data-index="0"></div>' +
                '<div class="storage-slot" data-index="1"></div>' +
                '<div class="storage-slot" data-index="2"></div>' +
                '<div class="storage-slot" data-index="3"></div>' +
            '</div>' +
            '<div id="delphi-defeated-monsters">' +
                '<div class="defeated-monster-slot" data-index="0"></div>' +
                '<div class="defeated-monster-slot" data-index="1"></div>' +
                '<div class="defeated-monster-slot" data-index="2"></div>' +
            '</div>' +
        '</div>' +
    '</div>' +
'</div>' +

'<div id="delphi-combat-dialog" class="delphi-dialog">' +
    '<div class="dialog-header">' +
        '<span id="combat-title"></span>' +
    '</div>' +
    '<div class="dialog-content">' +
        '<div id="combat-monster-info">' +
            '<div id="combat-monster-image"></div>' +
            '<div id="combat-monster-stats">' +
                '<div class="stat-row">' +
                    '<span class="stat-label-group">' +
                        '<span id="combat-shield-icon" class="stat-icon stat-icon-shield"></span>' +
                        '<span class="stat-label">Shield Strength:</span>' +
                    '</span>' +
                    '<span id="combat-shield-value">0</span>' +
                '</div>' +
                '<div class="stat-row">' +
                    '<span class="stat-label-group">' +
                        '<span class="stat-icon stat-icon-die"></span>' +
                        '<span class="stat-label">Target Roll:</span>' +
                    '</span>' +
                    '<span id="combat-target-value"></span>' +
                '</div>' +
                '<div class="stat-row" id="combat-result-row">' +
                    '<span class="stat-label-group">' +
                        '<span id="combat-result-icon" class="stat-icon stat-icon-result"></span>' +
                        '<span class="stat-label">Roll Result:</span>' +
                    '</span>' +
                    '<span id="combat-roll-result"></span>' +
                '</div>' +
            '</div>' +
        '</div>' +
        '<div id="combat-dice-area">' +
            '<div id="combat-battle-die"></div>' +
        '</div>' +
    '</div>' +
    '<div class="dialog-actions" id="combat-dialog-actions"></div>' +
'</div>' +

'<div id="delphi-equipment-strip" style="display:none">' +
    '<div id="equipment-strip-cards"></div>' +
'</div>' +

'<div id="delphi-injury-strip" style="display:none">' +
    '<div class="injury-strip-header">Select 3 injury cards to discard<span id="injury-strip-count"> (0/3)</span></div>' +
    '<div id="injury-strip-cards"></div>' +
'</div>' +

'<div id="delphi-titan-die" aria-hidden="true">' +
    '<div class="titan-die-label"></div>' +
    '<div class="titan-die-face"></div>' +
'</div>' +

'<div id="delphi-reward-dialog" class="delphi-dialog">' +
    '<div class="dialog-header">' +
        '<span id="reward-title">' + _('Select Reward') + '</span>' +
        '<button class="dialog-close">&times;</button>' +
    '</div>' +
    '<div class="dialog-content">' +
        '<div id="reward-options"></div>' +
    '</div>' +
    '<div class="dialog-actions">' +
        '<button id="reward-confirm-btn" class="delphi-btn primary">' + _('Confirm') + '</button>' +
    '</div>' +
'</div>';
        },

        /**
         * Render one god-track column (rows 1..6). Extracted to keep
         * _buildGameLayout readable since six columns share the same shape.
         */
        _buildGodColumn: function(godName)
        {
            return '<div class="god-column" data-god="' + godName + '">' +
                '<div class="god-cell" data-row="6"></div>' +
                '<div class="god-cell" data-row="5"></div>' +
                '<div class="god-cell" data-row="4"></div>' +
                '<div class="god-cell" data-row="3"></div>' +
                '<div class="god-cell" data-row="2"></div>' +
                '<div class="god-cell" data-row="1"></div>' +
            '</div>';
        },

        /*
            setup:

            This method must set up the game user interface according to current game situation.
            Called when game interface is displayed to a player (start or refresh).
        */

        setup: function( gamedatas )
        {
            // Inject the static skeleton DOM. Must run before any code that
            // references its IDs (BoardRenderer, HexGrid, Components, etc.).
            dojo.place(this._buildGameLayout(), 'delphi-game-root', 'only');

            // Static lookup used by equipment-card tooltip rendering. 22 entries
            // keyed by card_type_arg with {name, description}. Loaded once from
            // getAllDatas and read by _buildEquipmentTooltipHtml.
            this.equipmentDefs = gamedatas.equipmentDefs || {};

            this._preloadActionIcons();

            // Initialize cluster definitions and board builder
            this.clusterDefs = new ClusterDefinitions();

            this.boardBuilder = new BoardBuilder(this.clusterDefs);

            // Initialize board renderer
            this.boardRenderer = new BoardRenderer('delphi-hex-grid', {
                hexWidth: 60,
                hexHeight: 69,
                themeUrl: g_gamethemeurl
            });

            // Initialize hex grid (for game piece positioning)
            this.hexGrid = new HexGrid('delphi-hex-grid', 'delphi-board-pieces', {
                hexSize: 80,
                hexHeight: 92
            });

            // Initialize components manager
            this.components = new Components(this);

            // Mount oracle dice + cards + god abilities INSIDE the BGA action
            // bar (#page-title). They appear to the right of #pagemaintitletext
            // when no source is selected; on SelectAction we hide every
            // unselected source so only the chosen one stays beside the title
            // and the action buttons.
            var diceEl = document.getElementById('delphi-oracle-dice');
            var pageTitle = document.getElementById('page-title');
            if (diceEl && pageTitle) {
                var wrapper = document.createElement('div');
                wrapper.id = 'delphi-action-sources';
                var cardsBar = document.createElement('div');
                cardsBar.id = 'delphi-action-oracle-cards';
                wrapper.appendChild(cardsBar);
                wrapper.appendChild(diceEl);
                var godsBar = document.createElement('div');
                godsBar.id = 'delphi-action-god-abilities';
                wrapper.appendChild(godsBar);

                // Insert directly before #generalactions in whichever
                // container holds it — BGA sometimes nests generalactions
                // inside another wrapper rather than placing it as a direct
                // child of #page-title. Falling back to appendChild lands the
                // sources strip at the very end of the action bar, which is
                // what produced the "die appears on a row below the action
                // buttons" layout. Going through the actual parentNode
                // guarantees source-text-button order regardless of nesting.
                var generalActions = document.getElementById('generalactions');
                if (generalActions && generalActions.parentNode) {
                    generalActions.parentNode.insertBefore(wrapper, generalActions);
                } else {
                    pageTitle.appendChild(wrapper);
                }

                // BGA "End of game" banner (gameEnd, id 99): action UI is no
                // longer meaningful — collapse the whole sources strip.
                var gsId = gamedatas.gamestate && parseInt(gamedatas.gamestate.id);
                if (gsId === 99) wrapper.style.display = 'none';

                // Hide the source picker during pre-game ship-tile / starting-
                // equipment resolution. The flag flips off the first time the
                // player reaches PlayerActions (where dice are actually
                // spendable). On a mid-game reload the flag is set early via a
                // dice-usage heuristic so we don't accidentally hide a player
                // mid-action just because we joined during a sub-state.
                this._sawPlayerActions = false;
                var initialStateName = (gamedatas.gamestate && gamedatas.gamestate.name) || '';
                var initialStateArgs = (gamedatas.gamestate && gamedatas.gamestate.args) || {};
                var anyDieUsed = (gamedatas.oracleDice || []).some(function(d) {
                    return parseInt(d.isUsed) === 1;
                });
                // SelectAction surfaces the active player's selected die via
                // dieIndex in its state args — its presence proves we're past
                // the pre-game source-picker phase even if no die has been
                // marked used yet.
                var hasSelectedDie = initialStateArgs.dieIndex !== undefined
                    && initialStateArgs.dieIndex !== null;
                if (initialStateName === 'PlayerActions' || anyDieUsed || hasSelectedDie) {
                    this._sawPlayerActions = true;
                } else {
                    wrapper.classList.add('pre-game');
                }
            }

            // Set up monster interaction handlers (event delegation — works for dynamic monsters)
            this.setupMonsterInteractions();

            // Initialize board scroller
            this.boardScroller = new bx.DragScroller('delphi-board-container');

            // Set up zoom controls
            this.setupZoomControls();

            // Scale player area to fit available width
            this.initResponsiveScaling();

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
                // Place offerings, statues, temples, shrines from server data
                this.setupOfferingsFromGamedata(gamedatas);
                this.setupStatuesFromGamedata(gamedatas);
                this.setupTemplesFromGamedata(gamedatas);
                this.setupShrinesFromGamedata(gamedatas);
                this.setupShrinePiecesFromGamedata(gamedatas);
                this.setupGodsFromGamedata(gamedatas);
                this.setupZeusTilesFromGamedata(gamedatas);
                this.setupShieldFromGamedata(gamedatas);
                this.setupFavorTokensFromGamedata(gamedatas);
                this.setupHandCardsFromGamedata(gamedatas);
                this.setupActionBarOracleCards(gamedatas);
                this.setupShipTileFromGamedata(gamedatas);
                this.setupShipStorageFromGamedata(gamedatas);
                this.setupDefeatedMonstersFromGamedata(gamedatas);
            } else if (gamedatas && gamedatas.hexes) {
                // Legacy: Use actual game data
                this.setupFromGameData(gamedatas);
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

            // Build the redesigned player panel for every seat.
            var self = this;
            // Per-player selected die color, used to drive the movement-hex
            // creature-companion bonus. The active player's value flips on
            // dieSelected / dieCancelled / dieUsed notifs.
            this._selectedDieColors = this._selectedDieColors || {};
            // Reload-into-SelectAction: derive the active player's selected
            // die color from state args + their dice list, so the movement
            // hex shows the live bonus immediately on refresh.
            var stateArgsForMov = (gamedatas.gamestate && gamedatas.gamestate.args) || {};
            var activePid = gamedatas.gamestate && gamedatas.gamestate.active_player;
            var stateDieIdx = stateArgsForMov.dieIndex;
            if (activePid != null && stateDieIdx !== undefined && stateDieIdx !== null) {
                var activePs = gamedatas.panelState && gamedatas.panelState[activePid];
                var activeDie = activePs && (activePs.dice || []).find(function(d) {
                    return parseInt(d.idx) === parseInt(stateDieIdx);
                });
                if (activeDie && activeDie.color) {
                    this._selectedDieColors[activePid] = activeDie.color;
                }
            }
            Object.keys(gamedatas.players).forEach(function(pid) {
                self.components.playerPanel.init(pid, gamedatas);
                self.components.playerPanel.renderActionsRow(pid, gamedatas);
                self.components.playerPanel.renderCargoRow(pid, gamedatas);
                self.components.playerPanel.renderInjuryRow(pid, gamedatas);
                self.components.playerPanel.renderTasks(pid, gamedatas);
                self.components.playerPanel.renderPantheon(pid, gamedatas);
                self.components.playerPanel.renderCards(pid, gamedatas);
                self.components.playerPanel.updateMovementHex(
                    pid, gamedatas, self, self._selectedDieColors[pid] || null
                );
            });

            // Setup game notifications
            this.setupNotifications();

        },

        /**
         * Scale the player area to fit the available width.
         * Uses transform: scale() so all absolute positioning inside is preserved.
         * Sets a data attribute to suppress the CSS media-query fallback.
         */
        initResponsiveScaling: function() {
            var playerArea = document.getElementById('delphi-current-player-area');
            if (!playerArea) return;

            var PLAYER_AREA_WIDTH = 1136; // 100 + 8 + 900 + 8 + 120
            var PLAYER_AREA_HEIGHT = 790; // 80 + 8 + 554 + 8 + 140
            var PADDING = 40; // horizontal breathing room

            function updateScale() {
                // Use the game container's width as the constraint
                var container = playerArea.parentElement;
                var availableWidth = container ? container.clientWidth : window.innerWidth;
                var scale = Math.min(1, (availableWidth - PADDING) / PLAYER_AREA_WIDTH);
                scale = Math.max(0.35, scale); // floor at 35% to stay usable

                if (scale < 0.99) {
                    playerArea.style.setProperty('--game-scale', scale);
                    playerArea.style.setProperty('--game-scale-margin', ((scale - 1) * PLAYER_AREA_HEIGHT) + 'px');
                    playerArea.setAttribute('data-js-scaled', '');
                } else {
                    playerArea.style.removeProperty('--game-scale');
                    playerArea.style.removeProperty('--game-scale-margin');
                    playerArea.removeAttribute('data-js-scaled');
                    // Clear any inline styles from previous scaling
                    playerArea.style.transform = '';
                    playerArea.style.marginBottom = '';
                }
            }

            updateScale();
            window.addEventListener('resize', updateScale, { passive: true });

            // Observe container width changes (BGA panel toggle, etc.)
            if (window.ResizeObserver) {
                var container = playerArea.parentElement || document.getElementById('delphi-game-container');
                if (container) {
                    new ResizeObserver(updateScale).observe(container);
                }
            }
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
                    this.onHexClick(q, r, hex.dataset.type, hex.dataset.color);
                });
            });
        },

        /**
         * Handle hex click
         */
        onHexClick: function(q, r, type, color) {

            // Check if we're in PeekIslands or ScoutIslands (card 013)
            // phase-1 selection — both use the same instance vars for
            // the selection UI, distinguished by _scoutSelectionMode.
            if (this._peekIslandSet) {
                var key = q + ',' + r;
                if (this._peekIslandSet.has(key)) {
                    var idx = this._selectedPeekIslands.findIndex(h => h.q === q && h.r === r);
                    if (idx >= 0) {
                        this._selectedPeekIslands.splice(idx, 1);
                    } else if (this._selectedPeekIslands.length < this._peekMaxPeeks) {
                        this._selectedPeekIslands.push({ q: q, r: r });
                    }
                    var storageKey = this._scoutSelectionMode
                        ? 'delphi_scout_selection'
                        : 'delphi_peek_selection';
                    sessionStorage.setItem(storageKey, JSON.stringify(this._selectedPeekIslands));
                    this._refreshPeekOverlays();
                }
                return;
            }

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

        /**
         * Get pixel position for a ship, applying cluster offset if sharing a hex
         */
        getShipPixelPosition: function(playerId, q, r) {
            var center = this.getHexCenterPixel(q, r);
            if (!center) return null;

            // Find all ships on this hex
            var shipsOnHex = [];
            var positions = this.shipPositions || {};
            Object.keys(positions).forEach(function(pid) {
                var pos = positions[pid];
                if (pos.q === q && pos.r === r) {
                    shipsOnHex.push(parseInt(pid));
                }
            });

            if (shipsOnHex.length <= 1) return center;

            // Sort by player ID for consistent slot assignment
            shipsOnHex.sort(function(a, b) { return a - b; });
            var slotIndex = shipsOnHex.indexOf(playerId);
            var offset = this.SHIP_CLUSTER_OFFSETS[slotIndex] || { dx: 0, dy: 0 };
            return { x: center.x + offset.dx, y: center.y + offset.dy };
        },

        /**
         * Reposition all ships on a given hex (apply or remove offsets)
         */
        repositionAllShipsOnHex: function(q, r, animate) {
            var self = this;
            var positions = this.shipPositions || {};
            Object.keys(positions).forEach(function(pid) {
                var pos = positions[pid];
                if (pos.q === q && pos.r === r) {
                    var adjusted = self.getShipPixelPosition(parseInt(pid), q, r);
                    if (adjusted) {
                        self.components.moveShip(parseInt(pid), adjusted.x, adjusted.y, animate !== false);
                    }
                }
            });
        },

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

            // During a movement state, treat clicking another ship's hex as a move target
            if (this.isCurrentPlayerActive() && (this._moveShipReachable || this.currentShipRange)) {
                var pos = this.shipPositions && this.shipPositions[playerId];
                if (pos) {
                    var hexData = this.boardHexes && this.boardHexes.find(function(h) {
                        return h.q === pos.q && h.r === pos.r;
                    });
                    if (hexData) {
                        this.onHexClick(pos.q, pos.r, hexData.type, hexData.color);
                    }
                }
                return;
            }

            // During other active game states, ship clicks are handled by the state flow
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
        _showReachableOverlays: function(reachable, baseRange) {
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

                    // Add favor cost overlay for hexes beyond base range
                    var favorCost = (baseRange && h.distance > baseRange) ? h.distance - baseRange : 0;
                    if (favorCost > 0) {
                        el.classList.add('hex-reachable-favor');
                        var badge = document.createElement('div');
                        badge.className = 'hex-favor-cost';
                        badge.innerHTML = '<span class="hex-favor-icon"></span>' + favorCost;
                        el.appendChild(badge);
                    }

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
         * Refresh peek island overlays: pulsing on unselected, checkmarks on selected
         */
        _refreshPeekOverlays: function() {
            this._clearReachableOverlays();
            if (this._selectedOverlays) {
                this._selectedOverlays.forEach(el => el.remove());
                this._selectedOverlays = null;
            }
            var selectedKeys = new Set(this._selectedPeekIslands.map(h => h.q + ',' + h.r));
            var selectionFull = this._selectedPeekIslands.length >= this._peekMaxPeeks;
            if (!selectionFull) {
                var unselected = Array.from(this._peekIslandSet)
                    .filter(k => !selectedKeys.has(k))
                    .map(k => {
                        var parts = k.split(',');
                        return { q: parseInt(parts[0]), r: parseInt(parts[1]) };
                    });
                this._showReachableOverlays(unselected);
            }
            this._selectedOverlays = [];
            var self = this;
            this._selectedPeekIslands.forEach(h => {
                var center = self.getHexCenterPixel(h.q, h.r);
                if (center) {
                    var el = document.createElement('div');
                    el.className = 'hex-check-overlay';
                    el.innerHTML = '&#10003;';
                    el.style.left = (center.x - 25) + 'px';
                    el.style.top = (center.y - 25) + 'px';
                    document.getElementById('delphi-hex-grid').appendChild(el);
                    self._selectedOverlays.push(el);
                }
            });
        },

        /**
         * Move ship to a hex and update its stored position
         */
        moveShipToHex: function(playerId, q, r) {
            if (!this.shipPositions) this.shipPositions = {};
            var oldPos = this.shipPositions[playerId];
            this.shipPositions[playerId] = { q: q, r: r };

            // Move this ship to its new position (with offset if sharing)
            var pos = this.getShipPixelPosition(playerId, q, r);
            if (pos) {
                this.components.moveShip(playerId, pos.x, pos.y, true);
            }

            // Reposition ships on destination hex (others already there)
            this.repositionAllShipsOnHex(q, r, true);

            // Re-center any ship left behind on the old hex
            if (oldPos) {
                this.repositionAllShipsOnHex(oldPos.q, oldPos.r, true);
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

            // First pass: store all positions so offset calculation works
            Object.keys(players).forEach(function(pid) {
                var p = players[pid];
                self.shipPositions[parseInt(pid)] = { q: parseInt(p.shipQ), r: parseInt(p.shipR) };
            });

            // Second pass: create ships with offset-aware positions
            Object.keys(players).forEach(function(pid) {
                var p = players[pid];
                var q = parseInt(p.shipQ);
                var r = parseInt(p.shipR);
                var color = self.BGA_COLOR_TO_SHIP[p.playerColor] || 'red';
                var pos = self.getShipPixelPosition(parseInt(pid), q, r);
                if (pos) {
                    var isMine = parseInt(pid) === self.player_id;
                    self.components.createShip(parseInt(pid), color, pos.x, pos.y, isMine);
                }
            });
        },

        /**
         * Handle monster click (game action when targetable)
         */
        onMonsterClick: function(monsterId) {
            // Toggle targetable state for demonstration
            this.components.setMonsterTargetable(monsterId);
        },

        // Re-render the player-panel movement hex for one player using the
        // currently cached selected-die color (set by die notifs).
        _refreshMovementHex: function(playerId) {
            if (!this.components || !this.components.playerPanel) return;
            var color = (this._selectedDieColors || {})[playerId] || null;
            this.components.playerPanel.updateMovementHex(playerId, this.gamedatas, this, color);
        },

        // Toggle the public favor-pile cluster between disabled (default)
        // and an active, clickable state that dispatches actionName when
        // clicked. Called from onUpdateActionButtons whenever the active
        // player can take 2 favor (SelectAction without Apollo recolor, or
        // NoInjuryBonus). Each call removes any prior handler so re-entry
        // doesn't stack listeners.
        _activateFavorPile: function(actionName) {
            this._deactivateFavorPile();
            var pile = document.getElementById('delphi-favor-pile');
            if (!pile) return;
            pile.classList.add('favor-pile-active');
            var self = this;
            this._favorPileClickHandler = function() {
                self.bgaPerformAction(actionName, {});
            };
            pile.addEventListener('click', this._favorPileClickHandler);
        },

        _deactivateFavorPile: function() {
            var pile = document.getElementById('delphi-favor-pile');
            if (!pile) return;
            pile.classList.remove('favor-pile-active');
            if (this._favorPileClickHandler) {
                pile.removeEventListener('click', this._favorPileClickHandler);
                this._favorPileClickHandler = null;
            }
        },

        /**
         * Set up monster click handlers via event delegation on #delphi-board-pieces.
         * Hover information is delivered via BGA tooltips bound at monster
         * creation time (Components._refreshMonsterStackTooltips), so this
         * handler only needs to forward targetable clicks to the game action.
         */
        setupMonsterInteractions: function() {
            const boardPieces = document.getElementById('delphi-board-pieces');
            const self = this;

            boardPieces.addEventListener('click', function(e) {
                const monsterEl = e.target.closest('.delphi-monster');
                if (!monsterEl) return;
                if (!monsterEl.classList.contains('monster-targetable')) return;
                e.stopPropagation();

                const id = parseInt(monsterEl.id.split('_')[1]);
                self.onMonsterClick(id);
            });
        },

        /**
         * Handle die click
         */
        onDieClick: function(index) {
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
         * Create offerings from server gamedatas
         */
        setupOfferingsFromGamedata: function(gamedatas) {
            if (!gamedatas.offerings) return;
            // Group offerings by hex to assign slotIndex
            var byHex = {};
            gamedatas.offerings.forEach(function(o) {
                if (parseInt(o.playerId) || parseInt(o.isDelivered)) return; // skip loaded/delivered
                var key = o.originQ + ',' + o.originR;
                if (!byHex[key]) byHex[key] = [];
                byHex[key].push(o);
            });

            var self = this;
            Object.keys(byHex).forEach(function(hexKey) {
                byHex[hexKey].forEach(function(o, slotIndex) {
                    var q = parseInt(o.originQ);
                    var r = parseInt(o.originR);
                    var center = self.getHexCenterPixel(q, r);
                    if (center) {
                        self.components.createOffering(
                            parseInt(o.id), o.color,
                            center.x, center.y,
                            slotIndex, hexKey
                        );
                    }
                });
            });

            // Place delivered offerings at their destination temple hex.
            var deliveredByHex = {};
            gamedatas.offerings.forEach(function(o) {
                if (!parseInt(o.isDelivered) || !o.deliveredQ || !o.deliveredR) return;
                var key = o.deliveredQ + ',' + o.deliveredR;
                if (!deliveredByHex[key]) deliveredByHex[key] = [];
                deliveredByHex[key].push(o);
            });
            Object.keys(deliveredByHex).forEach(function(hexKey) {
                deliveredByHex[hexKey].forEach(function(o, slotIndex) {
                    var q = parseInt(o.deliveredQ);
                    var r = parseInt(o.deliveredR);
                    var center = self.getHexCenterPixel(q, r);
                    if (center) {
                        self.components.createOffering(
                            parseInt(o.id), o.color,
                            center.x, center.y,
                            slotIndex, hexKey
                        );
                    }
                });
            });
        },

        /**
         * Create statues from server gamedatas
         */
        setupStatuesFromGamedata: function(gamedatas) {
            if (!gamedatas.statues) return;

            // Build city rotation lookup from boardPlacements
            var cityRotations = {};
            if (this.boardPlacements && this.clusterDefs) {
                this.boardPlacements.forEach(function(p) {
                    if (p.clusterId && p.clusterId.indexOf('city-') === 0) {
                        cityRotations[p.clusterId.replace('city-', '')] = p.rotation || 0;
                    }
                });
            }

            // Group statues by hex to assign slotIndex
            var byHex = {};
            gamedatas.statues.forEach(function(s) {
                if (parseInt(s.playerId) || parseInt(s.isRaised)) return; // skip loaded/raised
                var key = s.originQ + ',' + s.originR;
                if (!byHex[key]) byHex[key] = [];
                byHex[key].push(s);
            });

            var self = this;
            Object.keys(byHex).forEach(function(hexKey) {
                byHex[hexKey].forEach(function(s, slotIndex) {
                    var q = parseInt(s.originQ);
                    var r = parseInt(s.originR);
                    var center = self.getHexCenterPixel(q, r);
                    if (center) {
                        var rotation = cityRotations[s.color] || 0;
                        self.components.createStatue(
                            parseInt(s.id), s.color,
                            center.x, center.y,
                            slotIndex, rotation
                        );
                    }
                });
            });

            // Place raised statues at their destination hex with pedestal positioning
            var hexLookup = {};
            if (gamedatas.hexes) {
                gamedatas.hexes.forEach(function(h) {
                    hexLookup[h.q + ',' + h.r] = h;
                });
            }
            gamedatas.statues.forEach(function(s) {
                if (!parseInt(s.isRaised) || !s.raisedQ || !s.raisedR) return;
                var center = self.getHexCenterPixel(parseInt(s.raisedQ), parseInt(s.raisedR));
                if (center) {
                    // Look up pedestal position from hex cluster data
                    var hexData = hexLookup[s.raisedQ + ',' + s.raisedR];
                    var pedestalIndex = 0;
                    var clusterRotation = 0;
                    if (hexData) {
                        clusterRotation = parseInt(hexData.clusterRotation) || 0;
                        var islandColors = self.components.STATUE_ISLAND_COLORS[hexData.clusterType] || [];
                        var idx = islandColors.indexOf(s.color);
                        if (idx >= 0) pedestalIndex = idx;
                    }
                    var offset = self.components.STATUE_PEDESTAL_OFFSETS[pedestalIndex] || { dx: 0, dy: 0 };
                    var rotated = self.components.rotateOffset(offset.dx, offset.dy, clusterRotation);

                    var statueEl = document.createElement('div');
                    statueEl.className = 'delphi-statue statue-' + s.color;
                    statueEl.id = 'statue_' + s.id;
                    statueEl.dataset.statueId = s.id;
                    statueEl.dataset.color = s.color;
                    statueEl.style.left = (center.x + rotated.dx) + 'px';
                    statueEl.style.top = (center.y + rotated.dy) + 'px';
                    self.components.boardPieces.appendChild(statueEl);
                    self.components.statues.set(parseInt(s.id), statueEl);
                }
            });
        },

        /**
         * Create temples from server gamedatas
         */
        setupTemplesFromGamedata: function(gamedatas) {
            if (!gamedatas.temples) return;
            var self = this;
            gamedatas.temples.forEach(function(t) {
                var q = parseInt(t.hexQ);
                var r = parseInt(t.hexR);
                var center = self.getHexCenterPixel(q, r);
                if (center) {
                    self.components.createTemple(
                        parseInt(t.id), t.color,
                        center.x, center.y
                    );
                }
            });
        },

        /**
         * Create shrine overlays on all shrine hexes from gamedatas.
         * Unrevealed shrines show clouds (front face); revealed ones flip to show the colored shrine.
         */
        setupShrinesFromGamedata: function(gamedatas) {
            if (!gamedatas.hexes || !this.boardHexes) return;
            var self = this;

            // Build lookup from gamedatas.hexes (DB data with shrine info)
            var hexLookup = {};
            gamedatas.hexes.forEach(function(h) {
                hexLookup[h.q + ',' + h.r] = h;
            });

            // Find shrine hexes from cluster definitions (static attribute)
            this.boardHexes.forEach(function(bh) {
                if (bh.attribute !== 'shrine') return;
                var key = bh.q + ',' + bh.r;
                var dbHex = hexLookup[key];
                if (!dbHex) return;

                var center = self.getHexCenterPixel(bh.q, bh.r);
                if (!center) return;

                // Use a unique ID based on hex coords
                var shrineId = bh.q * 100 + bh.r;

                // For revealed shrines, use the actual owner color + letter as overlay
                // For unrevealed, use a placeholder (back face won't be visible)
                var overlay = 'unknown';
                var isRevealed = parseInt(dbHex.isRevealed) === 1;
                if (isRevealed && dbHex.shrineGameColor && dbHex.shrineLetter) {
                    overlay = dbHex.shrineGameColor + '-' + dbHex.shrineLetter;
                }

                self.components.createShrine(shrineId, overlay, center.x, center.y);

                if (isRevealed) {
                    // Immediately show revealed state (no animation on page load)
                    var el = self.components.shrines.get(shrineId);
                    if (el) el.classList.add('shrine-revealed');
                }
            });
        },

        setupShrinePiecesFromGamedata: function(gamedatas) {
            if (!gamedatas.shrines) return;
            var self = this;
            var playerGameColor = this.getPlayerGameColor(gamedatas);
            var letters = SHRINE_LETTERS[playerGameColor] || [];

            var myShrines = gamedatas.shrines.filter(s => parseInt(s.playerId) === this.player_id);
            var shrineRows = document.querySelectorAll('#delphi-shrine-slots .shrine-row');

            myShrines.forEach(function(shrine) {
                var letter = letters[parseInt(shrine.shrineIndex)];
                var sortOrder = self._findShrineZeusSortOrder(letter);
                if (sortOrder < 0) return;
                var slotEl = shrineRows[sortOrder];
                if (!slotEl) return;

                slotEl.dataset.shrineIndex = shrine.shrineIndex;

                if (parseInt(shrine.isBuilt) === 1 && shrine.builtQ !== null && shrine.builtR !== null) {
                    // Shrine is built — hide from player board, show on hex
                    slotEl.classList.add('shrine-built');
                    var center = self.getHexCenterPixel(parseInt(shrine.builtQ), parseInt(shrine.builtR));
                    if (center) {
                        self._placeShrinePieceOnHex(center.x, center.y, shrine.shrineIndex);
                    }
                }
            });
        },

        /**
         * Find the sort_order of this player's shrine Zeus tile that matches the
         * given Greek letter. Returns -1 if not found. Used to position shrine
         * tokens in the correct column under their matching Zeus tile.
         */
        _findShrineZeusSortOrder: function(shrineLetter) {
            if (!shrineLetter || !this.gamedatas || !this.gamedatas.zeusTiles) return -1;
            var pid = this.player_id;
            var match = this.gamedatas.zeusTiles.find(function(t) {
                return parseInt(t.playerId) === pid
                    && t.taskType === 'shrine'
                    && t.taskLetter === shrineLetter;
            });
            return match ? parseInt(match.sortOrder) : -1;
        },

        _placeShrinePieceOnHex: function(x, y, shrineIndex) {
            var piece = document.createElement('div');
            piece.className = 'delphi-shrine-piece-placed';
            piece.dataset.shrineIndex = shrineIndex;
            piece.style.left = (x - 15) + 'px';
            piece.style.top = (y - 15) + 'px';
            var boardPieces = document.getElementById('delphi-board-pieces');
            if (boardPieces) boardPieces.appendChild(piece);
        },

        /**
         * Get game color name ('red','blue','green','yellow') for a player ID.
         */
        getShrineOwnerGameColor: function(gamedatas, playerId) {
            var hexToGameColor = {
                'dc3545': 'red',
                'ffc107': 'yellow',
                '28a745': 'green',
                '007bff': 'blue'
            };
            if (gamedatas.players && gamedatas.players[playerId]) {
                var playerColor = gamedatas.players[playerId].color;
                return hexToGameColor[playerColor] || null;
            }
            return null;
        },

        /**
         * Initialize god track tokens from gamedatas.
         */
        setupGodsFromGamedata: function(gamedatas) {
            if (!gamedatas.gods || !gamedatas.players) return;
            var self = this;
            var myId = this.player_id;
            var playerCount = Object.keys(gamedatas.players).length;

            this.components.initGodTrack(playerCount);

            // Only show current player's god tokens (each player board is personal)
            gamedatas.gods.forEach(function(god) {
                var playerId = parseInt(god.playerId);
                if (playerId !== myId) return;
                var player = gamedatas.players[playerId];
                if (!player) return;
                var playerColor = '#' + player.playerColor;

                var token = self.components.createGodToken(playerId, god.godName, playerColor);
                self.components.positionGodToken(playerId, god.godName, parseInt(god.trackRow));

                // Add ability tooltip to god token — use the god's own
                // portrait as the tooltip indicator instead of the BGA
                // default "?" icon.
                var info = self.components.GOD_INFO[god.godName];
                if (info && token) {
                    var label = god.godName.charAt(0).toUpperCase() + god.godName.slice(1);
                    var desc = self.getGodAbilityDescription(info.ability);
                    var prereqHtml = info.prerequisite
                        ? '<div class="god-tooltip-prereq">(' + info.prerequisite + ')</div>'
                        : '';
                    var html = ''
                        + '<div class="god-tooltip">'
                        +   '<div class="god-tooltip-icon god-' + god.godName + '"></div>'
                        +   '<div class="god-tooltip-body">'
                        +     '<strong>' + label + '</strong>: ' + desc
                        +     prereqHtml
                        +   '</div>'
                        + '</div>';
                    self.addTooltipHtml(token.id, html);
                }
            });
        },

        /**
         * Returns the game color name (red/yellow/green/blue) for the current player.
         */
        getPlayerGameColor: function(gamedatas) {
            var hexToGameColor = { 'dc3545': 'red', 'ffc107': 'yellow', '28a745': 'green', '007bff': 'blue' };
            var playerHex = gamedatas.players[this.player_id].playerColor;
            return hexToGameColor[playerHex] || 'red';
        },

        setupZeusTilesFromGamedata: function(gamedatas) {
            if (!gamedatas.zeusTiles) return;
            var self = this;
            var playerGameColor = this.getPlayerGameColor(gamedatas);
            var tiles = gamedatas.zeusTiles.filter(function(t) {
                return parseInt(t.playerId) === self.player_id;
            });
            var tileData = tiles.map(function(t) {
                var imgUrl;
                if (t.taskType === 'shrine') {
                    imgUrl = g_gamethemeurl + 'img/zeus-tiles/shrines/' + playerGameColor + '-player-' + t.taskLetter + '.jpg';
                } else if (t.taskType === 'statue') {
                    imgUrl = g_gamethemeurl + 'img/zeus-tiles/statues/' + playerGameColor + '-player.jpg';
                } else if (t.taskType === 'offering') {
                    var offeringColor = t.taskColor || 'any';
                    imgUrl = g_gamethemeurl + 'img/zeus-tiles/offerings/' + playerGameColor + '-player-' + offeringColor + '.jpg';
                } else if (t.taskType === 'monster') {
                    var monsterColor = t.taskColor || 'any';
                    imgUrl = g_gamethemeurl + 'img/zeus-tiles/monsters/' + playerGameColor + '-player-' + monsterColor + '.jpg';
                }
                return {
                    id: t.id,
                    type: t.taskType,
                    color: t.taskColor,
                    completed: t.isCompleted == 1,
                    imgUrl: imgUrl
                };
            });
            this.components.createZeusTiles(tileData);
        },

        setupShieldFromGamedata: function(gamedatas) {
            var me = gamedatas.players[this.player_id];
            var playerGameColor = this.getPlayerGameColor(gamedatas);
            this.components.setShieldValue(parseInt(me.shieldValue), playerGameColor);
        },

        setupFavorTokensFromGamedata: function(gamedatas) {
            var me = gamedatas.players[this.player_id];
            this.components.setFavorTokenCount(parseInt(me.favorTokens));
        },

        /**
         * Restore action bar oracle card icons on page reload
         */
        setupActionBarOracleCards: function(gamedatas) {
            if (!gamedatas.hand || !this.isCurrentPlayerActive()) return;
            var colors = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];
            var oracleCardPlayed = gamedatas.oracleCardPlayed || 0;
            var selectedCardId = gamedatas.selectedOracleCardId || 0;

            // Collect oracle cards by color
            var byColor = {};
            var selectedColor = null;
            gamedatas.hand.forEach(function(card) {
                if (card.cardType !== 'oracle') return;
                var color = colors[parseInt(card.cardTypeArg)] || 'red';
                if (!byColor[color]) byColor[color] = 0;
                byColor[color]++;
            });

            // Find the color of the selected oracle card (if any)
            if (selectedCardId > 0) {
                gamedatas.hand.forEach(function(card) {
                    if (parseInt(card.id) === selectedCardId && card.cardType === 'oracle') {
                        selectedColor = colors[parseInt(card.cardTypeArg)] || 'red';
                    }
                });
                // Card may already be removed from hand — look it up from oracleDice context
                // or use the played oracle card area as a fallback
                if (!selectedColor) {
                    var playedArea = document.getElementById('delphi-played-oracle-card');
                    if (playedArea) {
                        var playedCard = playedArea.querySelector('.delphi-oracle-card');
                        if (playedCard && playedCard.dataset.color) {
                            selectedColor = playedCard.dataset.color;
                        }
                    }
                }
            }

            if (Object.keys(byColor).length === 0 && !selectedColor) return;

            var cardsBar = document.getElementById('delphi-action-oracle-cards');
            if (!cardsBar) return;
            cardsBar.innerHTML = '';

            // If a card was played, add it as the active/selected icon
            if (selectedColor) {
                var icon = document.createElement('div');
                icon.className = 'action-oracle-card oracle-' + selectedColor + ' action-card-active';
                icon.dataset.color = selectedColor;
                cardsBar.appendChild(icon);
            }

            // Add remaining hand cards
            Object.keys(byColor).forEach(function(color) {
                var icon = document.createElement('div');
                icon.className = 'action-oracle-card oracle-' + color;
                icon.dataset.color = color;
                if (byColor[color] > 1) {
                    var badge = document.createElement('span');
                    badge.className = 'action-card-count';
                    badge.textContent = byColor[color];
                    icon.appendChild(badge);
                }
                // If oracle card already played this turn, gray out remaining
                if (oracleCardPlayed) {
                    icon.classList.add('action-card-inactive');
                }
                cardsBar.appendChild(icon);
            });
        },

        setupHandCardsFromGamedata: function(gamedatas) {
            if (!gamedatas.hand) return;
            var components = this.components;
            var colors = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];
            var self = this;
            gamedatas.hand.forEach(function(card) {
                var arg = parseInt(card.cardTypeArg);
                if (card.cardType === 'oracle') {
                    components.addOracleCardToHand(colors[arg] || 'red');
                } else if (card.cardType === 'injury') {
                    components.addInjuryCard(colors[arg] || 'red');
                } else if (card.cardType === 'equipment') {
                    // MySQL TINYINT comes back as a string ("0" / "1") via
                    // BGA's getObjectListFromDB, and `!!"0"` is TRUE in JS —
                    // that coerced every permanent card to greyed on reload.
                    // Compare numerically against 1 instead.
                    components.addEquipmentCard(
                        parseInt(card.id),
                        g_gamethemeurl + 'img/equipment/card-' + String(arg).padStart(3, '0') + '.jpg',
                        {
                            onClick: self.onEquipmentCardClick.bind(self),
                            isUsed: parseInt(card.isUsed) === 1,
                            gameModule: self,
                            cardTypeArg: arg,
                        }
                    );
                } else if (card.cardType === 'companion') {
                    // card_type_arg = color_idx * 3 + type_idx (0=creature, 1=demigod, 2=hero)
                    var colorIdx = Math.floor(arg / 3);
                    var typeIdx = arg % 3;
                    var color = colors[colorIdx] || 'red';
                    components.addCompanionCard(
                        parseInt(card.id),
                        'companion',
                        color,
                        g_gamethemeurl + 'img/companion/' + color + '-card-' + typeIdx + '.png'
                    );
                }
            });
        },

        setupShipTileFromGamedata: function(gamedatas) {
            var me = gamedatas.players[this.player_id];
            var shipTileId = parseInt(me.shipTileId);
            var hasExpandedStorage = (shipTileId === 2);
            this.components.setShipTile(
                shipTileId,
                g_gamethemeurl + 'img/ship-tiles/ship-' + shipTileId + '.jpg',
                hasExpandedStorage
            );
        },

        setupShipStorageFromGamedata: function(gamedatas) {
            var self = this;
            var components = this.components;
            if (gamedatas.offerings) {
                gamedatas.offerings.forEach(function(offering) {
                    if (parseInt(offering.playerId) === self.player_id && offering.isDelivered === '0') {
                        components.addToShipStorage('offering', offering.color);
                    }
                });
            }
            if (gamedatas.statues) {
                gamedatas.statues.forEach(function(statue) {
                    if (parseInt(statue.playerId) === self.player_id && statue.isRaised === '0') {
                        components.addToShipStorage('statue', statue.color);
                    }
                });
            }
        },

        enterRecolorMode: function(currentColor, playerFavor, opts) {
            opts = opts || {};
            var apolloFree = opts.apolloFree === true;
            var demigodWild = opts.demigodWild === true;
            var demigodName = opts.demigodName || '';
            var freeRecolor = apolloFree || demigodWild;
            var recolorDiscount = opts.recolorDiscount === true;
            var reverseRecolor = opts.reverseRecolor === true;
            this._recolorActive = true;
            this._recolorCurrentColor = currentColor;
            var wheelOrder = ['red', 'black', 'pink', 'blue', 'yellow', 'green'];
            var colorNames = { red: 'Red', black: 'Black', pink: 'Pink', blue: 'Blue', yellow: 'Yellow', green: 'Green' };
            var fromIdx = wheelOrder.indexOf(currentColor);
            var self = this;

            this.statusBar.removeActionButtons();
            if (demigodWild) {
                this.statusBar.setTitle(
                    _('Use ${companion_name} to treat the die as any color'),
                    { companion_name: demigodName }
                );
            } else if (!apolloFree) {
                this.statusBar.setTitle(
                    _('${you} must spend Favors to recolor the ${die_color} die'),
                    { die_color: colorNames[currentColor] }
                );
            }
            var actionsBar = document.getElementById('generalactions');
            if (!actionsBar) return;

            var appendBtn = function(color, cost, isCurrent) {
                var btn = document.createElement('div');
                btn.className = 'recolor-btn';
                if (isCurrent) btn.classList.add('recolor-current');
                if (!isCurrent && !freeRecolor && playerFavor < cost) btn.classList.add('too-expensive');
                btn.dataset.color = color;
                var label = isCurrent ? _('Current') : colorNames[color];
                btn.innerHTML = '<span class="recolor-die-icon die-color-' + color + '"></span>' +
                                '<span class="recolor-name">' + label + '</span>';
                if (!isCurrent && (freeRecolor || playerFavor >= cost)) {
                    btn.addEventListener('click', function() {
                        self.exitRecolorMode();
                        self.bgaPerformAction("actRecolorDie", { targetColor: color });
                    });
                }
                actionsBar.appendChild(btn);
            };

            var appendSeparator = function(cost) {
                var sep = document.createElement('div');
                sep.className = 'recolor-separator';
                sep.innerHTML = '<span class="recolor-separator-cost">' + cost + '</span>';
                actionsBar.appendChild(sep);
            };

            if (freeRecolor) {
                // All colors clickable; no separators (favor cost is irrelevant).
                wheelOrder.forEach(function(color) {
                    appendBtn(color, 0, false);
                });
            } else {
                // "Current" pill on the left, then target colors in clockwise
                // wheel order with cumulative-cost separators between every
                // pair. The reverse_recolor ship tile lets the player go
                // either direction, so each color's cost is the cheaper of
                // the clockwise vs. counterclockwise step count. The
                // recolor_discount tile reduces every non-zero cost by 1
                // (minimum 0).
                var n = wheelOrder.length;
                appendBtn(currentColor, 0, true);
                for (var step = 1; step < n; step++) {
                    var color = wheelOrder[(fromIdx + step) % n];
                    var baseCost = reverseRecolor ? Math.min(step, n - step) : step;
                    var cost = recolorDiscount ? Math.max(0, baseCost - 1) : baseCost;
                    appendSeparator(cost);
                    appendBtn(color, cost, false);
                }
            }

            this.statusBar.addActionButton(_('Cancel'), () => {
                this.exitRecolorMode();
                if (apolloFree) {
                    this.bgaPerformAction("actCancelDieSelection", {});
                } else {
                    this.restoreServerGameState();
                }
            }, { color: 'secondary' });
        },

        exitRecolorMode: function() {
            this._recolorActive = false;
            document.querySelectorAll('.recolor-btn, .recolor-separator').forEach(function(el) {
                el.remove();
            });
        },

        setupDefeatedMonstersFromGamedata: function(gamedatas) {
            var self = this;
            var components = this.components;
            if (!gamedatas.monsters) return;
            gamedatas.monsters.forEach(function(monster) {
                if (monster.isDefeated === '1' && parseInt(monster.defeatedBy) === self.player_id) {
                    components.addDefeatedMonster(monster.monsterType, monster.color);
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

            switch( stateName )
            {
                case 'gameEnd': {
                    // BGA is now showing the "End of game: Winner" banner to
                    // all players — the action UI is no longer meaningful.
                    var endWrapper = document.getElementById('delphi-action-sources');
                    if (endWrapper) endWrapper.style.display = 'none';
                    break;
                }

                case 'DiscardZeusTile':
                    if (this.isCurrentPlayerActive()) {
                        this._setupDiscardTileClickHandlers();
                    }
                    break;

                case 'PlayerActions':
                    // First entry into PlayerActions retires the pre-game flag —
                    // dice are now spendable, so the source picker should be
                    // visible from here on.
                    if (!this._sawPlayerActions) {
                        this._sawPlayerActions = true;
                        var sourcesWrap = document.getElementById('delphi-action-sources');
                        if (sourcesWrap) sourcesWrap.classList.remove('pre-game');
                    }
                    // Re-show the full set of source icons (dice, oracle cards,
                    // god abilities) when the player returns to source picking.
                    this._clearActionSourceSelection();
                    if (this.isCurrentPlayerActive() && args.args && args.args.dice) {
                        this._setupDieClickHandlers(args.args.dice);
                        if (args.args.canPlayOracleCard && args.args.oracleCardsInHand) {
                            this._setupOracleCardClickHandlers(
                                args.args.oracleCardsInHand,
                                args.args.apolloWildActive === true
                            );
                        }
                    }
                    break;

                case 'SelectAction':
                    // Show possible targets based on selected die
                    if (this.isCurrentPlayerActive() && args.args) {
                        this._applyActivatableEquipmentClass(args.args.activatableEquipment);
                    }
                    // Restore die-selected on a refresh into SelectAction —
                    // the click → actSelectDie → selectDie notif chain sets
                    // it during normal play, but a reload skips that path,
                    // leaving the wheel mirror un-enlarged. The class check
                    // gates against the toggle in selectDie so re-entries
                    // mid-turn don't accidentally clear a live selection.
                    var restoreIdx = args.args && args.args.dieIndex;
                    if (this.isCurrentPlayerActive()
                            && restoreIdx !== undefined && restoreIdx !== null) {
                        restoreIdx = parseInt(restoreIdx);
                        var restoreEl = this.components.dice.get(this.player_id + '_' + restoreIdx);
                        if (restoreEl && !restoreEl.classList.contains('die-selected')) {
                            this.components.selectDie(this.player_id, restoreIdx);
                        }
                        this.selectedDieIndex = restoreIdx;
                    }
                    // Collapse the source picker to only the selected source so
                    // the action bar reads: "You must select an action for [icon]".
                    this._applyActionSourceSelection(args && args.args);
                    break;

                case 'UseGodAbility':
                    // A god ability is a self-contained action — hide the other
                    // source icons while the player resolves it.
                    this._applyActionSourceSelection(null);
                    break;

                case 'MoveShip':
                    if (this.isCurrentPlayerActive() && args.args) {
                        this.components.selectShip(this.player_id);
                        this._moveShipBaseRange = args.args.baseRange || 3;
                        this._moveShipFavor = args.args.playerFavor || 0;
                        var reachable = args.args.reachableHexes;
                        if (reachable && reachable.length > 0) {
                            this._showReachableOverlays(reachable, this._moveShipBaseRange);
                            this._moveShipReachable = new Map();
                            reachable.forEach(h => {
                                this._moveShipReachable.set(h.q + ',' + h.r, h.distance);
                            });
                        }
                    }
                    break;

                case 'LoadCargo':
                    if (this.isCurrentPlayerActive() && args.args) {
                        var loadItems = args.args.validItems || [];
                        // Auto-confirm if only one unique color+type
                        var loadSeen = {};
                        var loadUnique = [];
                        loadItems.forEach(function(item) {
                            var key = item.color + '_' + item.type;
                            if (!loadSeen[key]) {
                                loadSeen[key] = true;
                                loadUnique.push(item);
                            }
                        });
                        if (loadUnique.length === 1) {
                            this._cargoAutoConfirming = true;
                            var autoItem = loadUnique[0];
                            var self = this;
                            setTimeout(function() {
                                self.bgaPerformAction("actConfirmLoad", { itemId: autoItem.id });
                            }, 100);
                            break;
                        }
                        var self = this;
                        this._cargoClickHandlers = [];
                        loadItems.forEach(function(item) {
                            var elId = item.type === 'offering' ? 'offering_' + item.id : 'statue_' + item.id;
                            var el = document.getElementById(elId);
                            if (el) {
                                el.classList.add('cargo-selectable');
                                var handler = function() {
                                    self.bgaPerformAction("actConfirmLoad", { itemId: item.id });
                                };
                                el.addEventListener('click', handler);
                                self._cargoClickHandlers.push({ el: el, handler: handler });
                            }
                        });
                    }
                    break;

                case 'SelectOfferingFromAnyIsland':
                    // Sub-state for Equipment cards 017 (Warm) and 018 (Cool)
                    // Offering Hook: pick any offering of the allowed color
                    // set sitting on any island and move it to the active
                    // player's ship. Color set is driven by args.color_options.
                    if (this.isCurrentPlayerActive() && args.args) {
                        var eq17Items = args.args.offerings || [];
                        var eq17Self = this;
                        this._cargoClickHandlers = [];
                        eq17Items.forEach(function(item) {
                            var el = document.getElementById('offering_' + item.id);
                            if (el) {
                                el.classList.add('cargo-selectable');
                                var handler = function() {
                                    eq17Self.bgaPerformAction("actConfirmOffering", { offeringId: item.id });
                                };
                                el.addEventListener('click', handler);
                                eq17Self._cargoClickHandlers.push({ el: el, handler: handler });
                            }
                        });
                    }
                    break;

                case 'SelectStatueFromAnyCity':
                    // Sub-state for Equipment cards 019 (Cool) and 020 (Warm)
                    // Statue Hook: pick any statue of the allowed color set
                    // sitting on its city tile and move it to the ship.
                    if (this.isCurrentPlayerActive() && args.args) {
                        var eqStatueItems = args.args.statues || [];
                        var eqStatueSelf = this;
                        this._cargoClickHandlers = [];
                        eqStatueItems.forEach(function(item) {
                            var el = document.getElementById('statue_' + item.id);
                            if (el) {
                                el.classList.add('cargo-selectable');
                                var handler = function() {
                                    eqStatueSelf.bgaPerformAction("actConfirmStatue", { statueId: item.id });
                                };
                                el.addEventListener('click', handler);
                                eqStatueSelf._cargoClickHandlers.push({ el: el, handler: handler });
                            }
                        });
                    }
                    break;

                case 'DeliverCargo':
                    if (this.isCurrentPlayerActive() && args.args) {
                        var deliverItems = args.args.deliverableItems || [];
                        // Auto-confirm if only one unique color+type
                        var deliverSeen = {};
                        var deliverUnique = [];
                        deliverItems.forEach(function(item) {
                            var key = item.color + '_' + item.type;
                            if (!deliverSeen[key]) {
                                deliverSeen[key] = true;
                                deliverUnique.push(item);
                            }
                        });
                        if (deliverUnique.length === 1) {
                            this._cargoAutoConfirming = true;
                            var autoDeliverItem = deliverUnique[0];
                            var self = this;
                            setTimeout(function() {
                                self.bgaPerformAction("actConfirmDeliver", { itemId: autoDeliverItem.id });
                            }, 100);
                            break;
                        }
                        var self = this;
                        this._cargoClickHandlers = [];
                        this.components.cargoItems.forEach(function(data, slotIndex) {
                            deliverItems.forEach(function(item) {
                                if (data.type === item.type && data.color === item.color) {
                                    data.element.classList.add('cargo-selectable');
                                    var handler = function() {
                                        self.bgaPerformAction("actConfirmDeliver", { itemId: item.id });
                                    };
                                    data.element.addEventListener('click', handler);
                                    self._cargoClickHandlers.push({ el: data.element, handler: handler });
                                }
                            });
                        });
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

                case 'PeekIslands':
                    if (this.isCurrentPlayerActive() && args.args) {
                        if (args.args.phase === 'viewing') {
                            // Clear selection overlays so flipped shrines are visible
                            this._clearReachableOverlays();
                            if (this._selectedOverlays) {
                                this._selectedOverlays.forEach(el => el.remove());
                                this._selectedOverlays = null;
                            }
                            this._selectedPeekIslands = null;
                            this._peekIslandSet = null;
                            sessionStorage.removeItem('delphi_peek_selection');
                            var boardContainerPeek = document.getElementById('delphi-board-container');
                            if (boardContainerPeek) boardContainerPeek.classList.remove('peek-mode');
                            // Shrine contents are no longer in public state args (privacy).
                            // On fresh peek: notif_islandsPeeked delivered them and the shrines
                            // are already flipped. On reload: pull from the private
                            // `myPeekedHexes` field in gamedatas (set per-player by getAllDatas).
                            this._peekViewingHexes = (this.gamedatas && this.gamedatas.myPeekedHexes) || this._peekViewingHexes || [];
                            // Flip peeked shrines from state args (reload path). On fresh peek,
                            // notif_islandsPeeked already flipped them and populated
                            // _peekedShrineIds — skip the rebuild so we don't wipe its list.
                            if (!this._peekedShrineIds || this._peekedShrineIds.length === 0) {
                                this._peekedShrineIds = [];
                                var self = this;
                                this._peekViewingHexes.forEach(function(island) {
                                    var shrineId = parseInt(island.q) * 100 + parseInt(island.r);
                                    var ownerColor = island.shrine_owner_color;
                                    var letter = island.shrine_letter;
                                    var el = self.components.shrines.get(shrineId);
                                    if (el && ownerColor && letter && ownerColor !== 'empty') {
                                        var overlay = ownerColor + '-' + letter;
                                        var oldOverlay = el.dataset.overlay;
                                        if (oldOverlay) el.classList.remove('shrine-' + oldOverlay);
                                        el.classList.add('shrine-' + overlay);
                                        el.dataset.overlay = overlay;
                                        el.classList.add('shrine-revealed');
                                    } else if (el) {
                                        // Unassigned shrine (fewer players than hexes) — flip to show empty
                                        el.classList.add('shrine-revealed');
                                    }
                                    self._peekedShrineIds.push(shrineId);
                                });
                            }
                            // Reset flag so next leave (End Peek) does full cleanup
                            this._peekEnteringViewing = false;
                        } else {
                            // Phase 1: selecting islands
                            this._peekMaxPeeks = args.args.maxPeeks || 2;
                            var peekable = args.args.peekableIslands || [];
                            this._peekIslandSet = new Set(peekable.map(h => h.q + ',' + h.r));
                            // Restore selection from sessionStorage if available
                            var saved = sessionStorage.getItem('delphi_peek_selection');
                            if (saved) {
                                try {
                                    var parsed = JSON.parse(saved);
                                    this._selectedPeekIslands = parsed.filter(h =>
                                        this._peekIslandSet.has(h.q + ',' + h.r)
                                    );
                                } catch(e) {
                                    this._selectedPeekIslands = [];
                                }
                            } else {
                                this._selectedPeekIslands = [];
                            }
                            this._refreshPeekOverlays();
                            // Allow clicks to pass through board pieces to hex elements
                            var boardContainer = document.getElementById('delphi-board-container');
                            if (boardContainer) boardContainer.classList.add('peek-mode');
                        }
                    }
                    break;

                case 'ScoutIslands':
                    // Equipment card 013 (Island Scout): pick 2 face-down
                    // islands, preview both, reveal one. Shares the 'peek_*'
                    // client state with PeekIslands so hex-click overlays
                    // and shrine-flip handlers work identically — the
                    // server uses the same peek_viewing/peek_hexes globals
                    // for the preview phase.
                    if (this.isCurrentPlayerActive() && args.args) {
                        if (args.args.phase === 'preview') {
                            // Phase 2: the 2 peeked shrines should already
                            // be flipped (via notif_islandsPeeked on fresh
                            // peek, or via myPeekedHexes on reload). Clean
                            // up phase-1 selection overlays so the shrine
                            // contents are visible.
                            this._clearReachableOverlays();
                            if (this._selectedOverlays) {
                                this._selectedOverlays.forEach(el => el.remove());
                                this._selectedOverlays = null;
                            }
                            this._selectedPeekIslands = null;
                            this._peekIslandSet = null;
                            sessionStorage.removeItem('delphi_scout_selection');
                            var boardContainerScout = document.getElementById('delphi-board-container');
                            if (boardContainerScout) boardContainerScout.classList.remove('peek-mode');
                            // On reload: flip shrines from myPeekedHexes
                            // (same pattern as PeekIslands viewing reload).
                            this._peekViewingHexes = (this.gamedatas && this.gamedatas.myPeekedHexes) || this._peekViewingHexes || [];
                            if (!this._peekedShrineIds || this._peekedShrineIds.length === 0) {
                                this._peekedShrineIds = [];
                                var scoutSelf = this;
                                this._peekViewingHexes.forEach(function(island) {
                                    var shrineId = parseInt(island.q) * 100 + parseInt(island.r);
                                    var ownerColor = island.shrine_owner_color;
                                    var letter = island.shrine_letter;
                                    var el = scoutSelf.components.shrines.get(shrineId);
                                    if (el && ownerColor && letter && ownerColor !== 'empty') {
                                        var overlay = ownerColor + '-' + letter;
                                        var oldOverlay = el.dataset.overlay;
                                        if (oldOverlay) el.classList.remove('shrine-' + oldOverlay);
                                        el.classList.add('shrine-' + overlay);
                                        el.dataset.overlay = overlay;
                                        el.classList.add('shrine-revealed');
                                    } else if (el) {
                                        el.classList.add('shrine-revealed');
                                    }
                                    scoutSelf._peekedShrineIds.push(shrineId);
                                });
                            }
                            this._peekEnteringViewing = false;
                        } else {
                            // Phase 1: selecting. Same click/overlay logic
                            // as PeekIslands phase 1 — reuse the same
                            // instance variables so onHexClick routes into
                            // _selectedPeekIslands.
                            this._peekMaxPeeks = args.args.maxPeeks || 2;
                            var scoutPeekable = args.args.peekableIslands || [];
                            this._peekIslandSet = new Set(scoutPeekable.map(h => h.q + ',' + h.r));
                            var savedScout = sessionStorage.getItem('delphi_scout_selection');
                            if (savedScout) {
                                try {
                                    var parsedScout = JSON.parse(savedScout);
                                    this._selectedPeekIslands = parsedScout.filter(h =>
                                        this._peekIslandSet.has(h.q + ',' + h.r)
                                    );
                                } catch(e) {
                                    this._selectedPeekIslands = [];
                                }
                            } else {
                                this._selectedPeekIslands = [];
                            }
                            this._scoutSelectionMode = true;
                            this._refreshPeekOverlays();
                            var boardContainerScoutSel = document.getElementById('delphi-board-container');
                            if (boardContainerScoutSel) boardContainerScoutSel.classList.add('peek-mode');
                        }
                    }
                    break;

                case 'Recover':
                    if (this.isCurrentPlayerActive() && args.args) {
                        this._showInjuryStrip(args.args.injuryCards || []);
                    }
                    break;
            }
        },

        onLeavingState: function( stateName )
        {

            switch( stateName )
            {
                case 'DiscardZeusTile':
                    this._teardownDiscardTileClickHandlers();
                    break;

                case 'PlayerActions':
                    this._teardownDieClickHandlers();
                    this._teardownOracleCardClickHandlers();
                    this.clearRangeOverlays();
                    this.components.deselectShips();
                    this._disableGodAbilityIcons();
                    var bonusPicker = document.getElementById('delphi-bonus-action-color-picker');
                    if (bonusPicker) bonusPicker.remove();
                    break;

                case 'UseGodAbility':
                    this._clearGodTargetOverlays();
                    this._clearActionSourceSelection();
                    break;

                case 'SelectAction':
                    this.clearRangeOverlays();
                    this._clearActivatableEquipmentClass();
                    if (this._recolorActive) {
                        this.exitRecolorMode();
                    }
                    this._clearActionSourceSelection();
                    break;

                case 'MoveShip':
                    this._clearReachableOverlays();
                    this.components.deselectShips();
                    this._moveShipReachable = null;
                    this._moveShipBaseRange = null;
                    this._moveShipFavor = null;
                    break;

                case 'LoadCargo':
                case 'DeliverCargo':
                case 'SelectOfferingFromAnyIsland':
                case 'SelectStatueFromAnyCity':
                    if (this._cargoClickHandlers) {
                        this._cargoClickHandlers.forEach(function(item) {
                            item.el.classList.remove('cargo-selectable');
                            item.el.removeEventListener('click', item.handler);
                        });
                        this._cargoClickHandlers = null;
                    }
                    document.querySelectorAll('.cargo-selectable').forEach(function(el) {
                        el.classList.remove('cargo-selectable');
                    });
                    break;

                case 'CombatRound':
                case 'CombatDefeat':
                    this._clearCombatDialogActions();
                    break;
                case 'CombatVictory':
                    document.getElementById('delphi-equipment-strip').style.display = 'none';
                    this._closeCombatDialog();
                    break;

                case 'SelectReward':
                    document.getElementById('delphi-equipment-strip').style.display = 'none';
                    break;

                case 'PeekIslands':
                    // Only do full cleanup when truly leaving PeekIslands
                    // (not during selecting→viewing same-state transition)
                    if (!this._peekEnteringViewing) {
                        this._clearReachableOverlays();
                        if (this._selectedOverlays) {
                            this._selectedOverlays.forEach(el => el.remove());
                            this._selectedOverlays = null;
                        }
                        this._selectedPeekIslands = null;
                        this._peekIslandSet = null;
                        sessionStorage.removeItem('delphi_peek_selection');
                        this._peekViewingHexes = null;
                        // Unflip peeked shrines before clearing the list
                        if (this._peekedShrineIds) {
                            var self = this;
                            this._peekedShrineIds.forEach(function(shrineId) {
                                var el = self.components.shrines.get(shrineId);
                                if (el) {
                                    el.classList.remove('shrine-revealed');
                                    var overlay = el.dataset.overlay;
                                    if (overlay) el.classList.remove('shrine-' + overlay);
                                    el.classList.add('shrine-unknown');
                                    el.dataset.overlay = 'unknown';
                                }
                            });
                            this._peekedShrineIds = null;
                        }
                        var boardContainerLeave = document.getElementById('delphi-board-container');
                        if (boardContainerLeave) boardContainerLeave.classList.remove('peek-mode');
                    }
                    break;

                case 'ScoutIslands':
                    // Card 013: full cleanup when truly leaving the state
                    // (selecting → preview uses _peekEnteringViewing the same
                    // way PeekIslands does). peekEnded notif already handles
                    // unflipping shrines on the active-player channel.
                    if (!this._peekEnteringViewing) {
                        this._clearReachableOverlays();
                        if (this._selectedOverlays) {
                            this._selectedOverlays.forEach(el => el.remove());
                            this._selectedOverlays = null;
                        }
                        this._selectedPeekIslands = null;
                        this._peekIslandSet = null;
                        this._scoutSelectionMode = false;
                        sessionStorage.removeItem('delphi_scout_selection');
                        this._peekViewingHexes = null;
                        if (this._peekedShrineIds) {
                            var scoutLeaveSelf = this;
                            this._peekedShrineIds.forEach(function(shrineId) {
                                var el = scoutLeaveSelf.components.shrines.get(shrineId);
                                if (el) {
                                    el.classList.remove('shrine-revealed');
                                    var overlay = el.dataset.overlay;
                                    if (overlay) el.classList.remove('shrine-' + overlay);
                                    el.classList.add('shrine-unknown');
                                    el.dataset.overlay = 'unknown';
                                }
                            });
                            this._peekedShrineIds = null;
                        }
                        var boardContainerScoutLeave = document.getElementById('delphi-board-container');
                        if (boardContainerScoutLeave) boardContainerScoutLeave.classList.remove('peek-mode');
                    }
                    break;

                case 'Recover':
                    this._hideInjuryStrip();
                    break;
            }
        },

        onUpdateActionButtons: function( stateName, args )
        {
            // Reset the favor-pile to disabled on every state change so
            // stale handlers can't fire after the player leaves the take-
            // favor states. Re-activated below where applicable.
            this._deactivateFavorPile();

            if( this.isCurrentPlayerActive() )
            {
                switch( stateName )
                {
                    case 'PlayerActions':
                        // God ability icons (free actions) — shown beside oracle dice
                        this._updateGodAbilityIcons(args && args.availableGods ? args.availableGods : []);
                        var endTurnLocked = args && args.apolloWildCardInHand === true;
                        var self = this;
                        // Equipment card 003: "Use bonus action (any color)" button when
                        // the activated bonus is still unused for this turn.
                        if (args && args.bonusActionAvailable) {
                            this.statusBar.addActionButton(_('Use bonus action (any color)'), () => {
                                self._showBonusActionColorPicker();
                            }, { color: 'primary' });
                        }
                        var endTurnBtn = this.statusBar.addActionButton(_('End Turn'), () => {
                            if (endTurnLocked) {
                                self.showMessage(_('You must play the wild oracle card drawn by Apollo before ending your turn'), 'error');
                                return;
                            }
                            self.onEndTurn();
                        }, { color: 'secondary' });
                        if (endTurnLocked && endTurnBtn) {
                            endTurnBtn.classList.add('end-turn-locked');
                            endTurnBtn.title = _('Play the wild oracle card first');
                        }
                        break;

                    case 'NoInjuryBonus':
                        var takeFavorBtnNoInjury = this.statusBar.addActionButton(_('Take 2 Favor'), () => {
                            this.bgaPerformAction("actTakeFavor", {});
                        });
                        this._prependActionIconToButton(takeFavorBtnNoInjury, 'take-favors');
                        // Same action available via the favor-pile cluster.
                        // (NoInjuryBonus uses actTakeFavor, not actTakeFavorTokens.)
                        this._activateFavorPile('actTakeFavor');
                        if (args && args.advanceableGods && args.advanceableGods.length > 0) {
                            this._sortGodsByBoard(args.advanceableGods).forEach(g => {
                                var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1);
                                var btn = this.statusBar.addActionButton(_('Advance') + ' ' + godLabel, () => {
                                    this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
                                });
                                this._prependGodIconToButton(btn, g.god_name);
                            });
                        }
                        break;

                    case 'CheckGodAdvancement':
                        var noEligibleGods = false;
                        if (args && args.eligibleGods && args.eligibleGods.length > 0) {
                            this._sortGodsByBoard(args.eligibleGods).forEach(g => {
                                var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1);
                                var btn = this.statusBar.addActionButton(_('Advance') + ' ' + godLabel, () => {
                                    this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
                                });
                                this._prependGodIconToButton(btn, g.god_name);
                            });
                        } else {
                            var msg = document.createElement('span');
                            msg.className = 'delphi-status-message';
                            msg.textContent = _('No matching gods are eligible to advance');
                            document.getElementById('generalactions').appendChild(msg);
                            noEligibleGods = true;
                        }
                        this.statusBar.addActionButton(noEligibleGods ? _('OK') : _('Pass'), () => {
                            this.bgaPerformAction("actPass", {});
                        }, { color: 'secondary' });
                        break;

                    case 'ChooseGodAdvancement':
                        if (args && args.gods) {
                            this._sortGodsByBoard(args.gods).forEach(g => {
                                if (g.can_advance) {
                                    var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1) + ' (row ' + g.current_row + ')';
                                    var btn = this.statusBar.addActionButton(godLabel, () => {
                                        this.bgaPerformAction("actAdvanceGod", { godName: g.god_name });
                                    });
                                    this._prependGodIconToButton(btn, g.god_name);
                                }
                            });
                        }
                        this.statusBar.addActionButton(_('Done'), () => {
                            this.bgaPerformAction("actPass", {});
                        }, { color: 'secondary' });
                        break;

                    case 'SelectGodForTopRow':
                        // Equipment card 021 (Divine Surge): single pick to
                        // advance one of Poseidon/Hermes/Artemis/Aphrodite
                        // straight to the topmost row. Gods already at the
                        // top are rendered disabled-style (they'd no-op).
                        // If all four are at the top the server resolves
                        // inline and we never enter this state; no Pass.
                        if (args && args.eligible_gods) {
                            this._sortGodsByBoard(args.eligible_gods).forEach(g => {
                                if (g.can_advance) {
                                    var surgeLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1) +
                                        ' (row ' + g.current_row + ' → ' + args.max_row + ')';
                                    var surgeBtn = this.statusBar.addActionButton(surgeLabel, () => {
                                        this.bgaPerformAction("actSelectGod", { godName: g.god_name });
                                    });
                                    this._prependGodIconToButton(surgeBtn, g.god_name);
                                }
                            });
                        }
                        break;

                    case 'ChooseInjuryColor':
                        if (args && args.injuryColors && args.injuryColors.length > 0) {
                            args.injuryColors.forEach(color => {
                                var colorLabel = color.charAt(0).toUpperCase() + color.slice(1);
                                this.statusBar.addActionButton(_('Discard') + ' ' + colorLabel, () => {
                                    this.bgaPerformAction("actChooseColor", { color: color });
                                });
                            });
                        }
                        this.statusBar.addActionButton(_('Skip'), () => {
                            this.bgaPerformAction("actPass", {});
                        }, { color: 'secondary' });
                        break;

                    case 'UseGodAbility':
                        if (args) {
                            switch (args.ability) {
                                case 'teleport_ship':
                                    this._highlightValidHexes(args.validHexes, 'god-target god-target-water', (q, r) => {
                                        this.bgaPerformAction("actTeleportShip", { hexQ: q, hexR: r });
                                    });
                                    break;
                                case 'free_explore_island':
                                    this._highlightValidHexes(args.validHexes, 'god-target', (q, r) => {
                                        this.bgaPerformAction("actExploreIsland", { hexQ: q, hexR: r });
                                    });
                                    break;
                                case 'auto_defeat_monster':
                                    if (args.adjacentMonsters && args.adjacentMonsters.length > 0) {
                                        args.adjacentMonsters.forEach(m => {
                                            var label = _('Defeat') + ' ' + m.monster_type.charAt(0).toUpperCase() + m.monster_type.slice(1);
                                            var defeatBtn = this.statusBar.addActionButton(label, () => {
                                                this.bgaPerformAction("actDefeatMonster", { monster_id: m.monster_id });
                                            }, { color: 'red' });
                                            this._prependActionIconToButton(defeatBtn, 'fight-monster');
                                        });
                                    }
                                    break;
                                case 'grab_any_statue':
                                    if (args.validCities && args.validCities.length > 0) {
                                        args.validCities.forEach(city => {
                                            var colorLabel = city.statue_color.charAt(0).toUpperCase() + city.statue_color.slice(1);
                                            var statueBtn = this.statusBar.addActionButton(colorLabel + ' ' + _('Statue'), () => {
                                                this.bgaPerformAction("actGrabStatue", { statue_id: city.statue_id });
                                            });
                                            this._prependActionIconToButton(statueBtn, 'statue-' + city.statue_color);
                                        });
                                    }
                                    break;
                            }
                        }
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actPass", {});
                        }, { color: 'secondary' });
                        break;

                    case 'SelectAction':
                        if (args && args.apolloNeedsRecolor) {
                            this.enterRecolorMode(args.dieColor, args.playerFavor || 0, { apolloFree: true });
                            break;
                        }
                        var moveShipBtn = this.statusBar.addActionButton(_('Move Ship'), () => {
                            this.bgaPerformAction("actMoveShip", {});
                        });
                        this._prependActionIconToButton(moveShipBtn, 'move-ship');
                        if (args && args.fightableMonsters && args.fightableMonsters.length > 0) {
                            var monsters = args.fightableMonsters;
                            if (monsters.length === 1) {
                                var fightBtn = this.statusBar.addActionButton(_('Fight Monster'), () => {
                                    this.bgaPerformAction("actFightMonster", { monster_id: monsters[0].monster_id });
                                }, { color: 'red' });
                                this._prependActionIconToButton(fightBtn, 'fight-monster');
                            } else {
                                monsters.forEach(m => {
                                    var fightBtn = this.statusBar.addActionButton(_('Fight ' + m.monster_type), () => {
                                        this.bgaPerformAction("actFightMonster", { monster_id: m.monster_id });
                                    }, { color: 'red' });
                                    this._prependActionIconToButton(fightBtn, 'fight-monster');
                                });
                            }
                        }
                        if (args && args.loadableOfferings && args.loadableOfferings.length > 0) {
                            var loadOfferingBtn = this.statusBar.addActionButton(_('Load Offering'), () => {
                                this.bgaPerformAction("actLoadOffering", {});
                            });
                            this._prependActionIconToButton(loadOfferingBtn, 'load-offering');
                        }
                        if (args && args.deliverableOfferings && args.deliverableOfferings.length > 0) {
                            var makeOfferingBtn = this.statusBar.addActionButton(_('Make Offering'), () => {
                                this.bgaPerformAction("actMakeOffering", {});
                            });
                            this._prependActionIconToButton(makeOfferingBtn, 'make-offering');
                        }
                        if (args && args.loadableStatues && args.loadableStatues.length > 0) {
                            var loadStatueBtn = this.statusBar.addActionButton(_('Load Statue'), () => {
                                this.bgaPerformAction("actLoadStatue", {});
                            });
                            this._prependActionIconToButton(loadStatueBtn, 'load-statue');
                        }
                        if (args && args.deliverableStatues && args.deliverableStatues.length > 0) {
                            var raiseStatueBtn = this.statusBar.addActionButton(_('Raise Statue'), () => {
                                this.bgaPerformAction("actRaiseStatue", {});
                            });
                            this._prependActionIconToButton(raiseStatueBtn, 'raise-statue');
                        }
                        if (args && args.explorableIslands && args.explorableIslands.length > 0) {
                            var islands = args.explorableIslands;
                            if (islands.length === 1) {
                                var exploreBtn = this.statusBar.addActionButton(_('Explore Island'), () => {
                                    this.bgaPerformAction("actExploreIsland", {
                                        hexQ: islands[0].hex_q,
                                        hexR: islands[0].hex_r
                                    });
                                });
                                this._prependActionIconToButton(exploreBtn, 'explore-island');
                            } else {
                                islands.forEach(island => {
                                    var label = _('Explore') + ' ' + island.explorationColor.charAt(0).toUpperCase() + island.explorationColor.slice(1) + ' ' + _('Island');
                                    var exploreBtn = this.statusBar.addActionButton(label, () => {
                                        this.bgaPerformAction("actExploreIsland", {
                                            hexQ: island.hex_q,
                                            hexR: island.hex_r
                                        });
                                    });
                                    this._prependActionIconToButton(exploreBtn, 'explore-island');
                                });
                            }
                        }
                        if (args && args.discardableInjuryCount && args.discardableInjuryCount > 0) {
                            var discardInjuryBtn = this.statusBar.addActionButton(_('Discard Injuries'), () => {
                                this.bgaPerformAction("actDiscardInjuries", {});
                            });
                            this._prependActionIconToButton(discardInjuryBtn, 'discard-injuries');
                        }
                        if (args && args.advanceableGod) {
                            var godLabel = args.advanceableGod.charAt(0).toUpperCase() + args.advanceableGod.slice(1);
                            var btn = this.statusBar.addActionButton(_('Advance') + ' ' + godLabel, () => {
                                this.bgaPerformAction("actAdvanceGod", { godName: args.advanceableGod });
                            });
                            this._prependGodIconToButton(btn, args.advanceableGod);
                        }
                        var drawOracleBtn = this.statusBar.addActionButton(_('Draw Oracle Card'), () => {
                            this.bgaPerformAction("actDrawOracleCard", {});
                        });
                        this._prependActionIconToButton(drawOracleBtn, 'draw-oracle-card');
                        var takeFavorBtn = this.statusBar.addActionButton(_('Take 2 Favor'), () => {
                            this.bgaPerformAction("actTakeFavorTokens", {});
                        });
                        this._prependActionIconToButton(takeFavorBtn, 'take-favors');
                        // Same action available via the favor-pile cluster
                        // in the top-right corner.
                        this._activateFavorPile('actTakeFavorTokens');
                        if (args && args.peekableIslands && args.peekableIslands.length > 0) {
                            var peekCount = Math.min(2, args.peekableIslands.length);
                            var peekLabel = peekCount === 1
                                ? _('Look at 1 Island')
                                : _('Look at 2 Islands');
                            var peekBtn = this.statusBar.addActionButton(peekLabel, () => {
                                this.bgaPerformAction("actLookAtIslands", {});
                            });
                            this._prependActionIconToButton(peekBtn, 'peek-islands');
                        }
                        if (args && !args.isOracleCard && ((args.playerFavor || 0) > 0 || args.recolorDiscount || args.demigodWild)) {
                            var recolorBtn = this.statusBar.addActionButton(_('Recolor Die'), () => {
                                this.enterRecolorMode(args.dieColor, args.playerFavor || 0, {
                                    recolorDiscount: args.recolorDiscount === true,
                                    reverseRecolor: args.reverseRecolor === true,
                                    demigodWild: args.demigodWild === true,
                                    demigodName: args.demigodName || '',
                                });
                            }, { color: 'secondary' });
                            this._prependActionIconToButton(recolorBtn, 'recolor-die');
                        }
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actCancelDieSelection", {});
                        }, { color: 'secondary' });
                        break;

                    case 'PeekIslands':
                        if (args && args.phase === 'viewing') {
                            // Phase 2: viewing — just End Peek button
                            this.statusBar.addActionButton(_('End Peek'), () => {
                                this.bgaPerformAction("actEndPeek", {});
                            });
                        } else {
                            // Phase 1: selecting
                            this.statusBar.addActionButton(_('Confirm Peek'), () => {
                                if (this._selectedPeekIslands && this._selectedPeekIslands.length > 0) {
                                    // Clear checkmark overlays immediately so flipped shrines are visible
                                    this._clearReachableOverlays();
                                    if (this._selectedOverlays) {
                                        this._selectedOverlays.forEach(el => el.remove());
                                        this._selectedOverlays = null;
                                    }
                                    var boardContainerConfirm = document.getElementById('delphi-board-container');
                                    if (boardContainerConfirm) boardContainerConfirm.classList.remove('peek-mode');
                                    // Flag to prevent leave handler from unflipping shrines
                                    this._peekEnteringViewing = true;
                                    this.bgaPerformAction("actConfirmPeek", {
                                        hexCoordsJson: JSON.stringify(this._selectedPeekIslands)
                                    });
                                }
                            });
                            this.statusBar.addActionButton(_('Cancel'), () => {
                                this.bgaPerformAction("actCancel", {});
                            }, { color: 'secondary' });
                        }
                        break;

                    case 'ScoutIslands':
                        // Card 013 (Island Scout). Phase 1: confirm 2
                        // picks. Phase 2: one "Reveal this island" button
                        // per peeked coord (no Cancel — the card is
                        // already committed; per rulebook the player must
                        // reveal one).
                        if (args && args.phase === 'preview') {
                            var scoutPeeked = args.peekedCoords || [];
                            // Greek letter names → capital glyph (matches
                            // the illustration on the shrine piece).
                            var greekGlyph = {
                                psi: 'Ψ', phi: 'Φ', sigma: 'Σ', omega: 'Ω',
                            };
                            scoutPeeked.forEach((coord) => {
                                // shrine_owner_color is the disc color
                                // surrounding the greek letter on the
                                // shrine piece — the visual identifier a
                                // player would use.
                                var colorWord = coord.shrine_owner_color
                                    ? coord.shrine_owner_color.charAt(0).toUpperCase() + coord.shrine_owner_color.slice(1)
                                    : '';
                                var letterGlyph = greekGlyph[coord.shrine_letter]
                                    || (coord.shrine_letter || '').toUpperCase();
                                var label = dojo.string.substitute(_('Explore ${color} ${letter} Island'), {
                                    color: colorWord,
                                    letter: letterGlyph,
                                });
                                this.statusBar.addActionButton(label, () => {
                                    this._peekEnteringViewing = false;
                                    this.bgaPerformAction("actRevealIsland", {
                                        hexQ: coord.q,
                                        hexR: coord.r,
                                    });
                                });
                            });
                        } else {
                            this.statusBar.addActionButton(_('Confirm 2 Islands'), () => {
                                if (this._selectedPeekIslands && this._selectedPeekIslands.length === 2) {
                                    this._clearReachableOverlays();
                                    if (this._selectedOverlays) {
                                        this._selectedOverlays.forEach(el => el.remove());
                                        this._selectedOverlays = null;
                                    }
                                    var boardContainerScoutConfirm = document.getElementById('delphi-board-container');
                                    if (boardContainerScoutConfirm) boardContainerScoutConfirm.classList.remove('peek-mode');
                                    this._peekEnteringViewing = true;
                                    this.bgaPerformAction("actConfirmPeek", {
                                        hexCoordsJson: JSON.stringify(this._selectedPeekIslands),
                                    });
                                } else {
                                    this.showMessage(_('Select 2 face-down islands first'), 'error');
                                }
                            });
                        }
                        break;

                    case 'MoveShip':
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actPass", {});
                        }, { color: 'secondary' });
                        break;

                    case 'SelectOfferingFromAnyIsland':
                        // Offering Hook (cards 017 Warm / 018 Cool): free
                        // sub-state. A deduped button per unique color lets
                        // the player confirm when there's only one instance
                        // of that color on the board; otherwise they click a
                        // specific highlighted offering on the map.
                        if (args && args.offerings && args.offerings.length > 0) {
                            var seenEq17 = {};
                            args.offerings.forEach(item => {
                                if (!seenEq17[item.color]) {
                                    seenEq17[item.color] = true;
                                    var capColor = item.color.charAt(0).toUpperCase() + item.color.slice(1);
                                    var label = _('Take') + ' ' + _(capColor) + ' ' + _('Offering');
                                    this.statusBar.addActionButton(label, () => {
                                        this.bgaPerformAction("actConfirmOffering", { offeringId: item.id });
                                    });
                                }
                            });
                        }
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actCancelOffering", {});
                        }, { color: 'secondary' });
                        break;

                    case 'SelectStatueFromAnyCity':
                        // Statue Hook (cards 019 Cool / 020 Warm): free
                        // sub-state. Same pattern as SelectOfferingFromAnyIsland
                        // but for statues.
                        if (args && args.statues && args.statues.length > 0) {
                            var seenEqStatue = {};
                            args.statues.forEach(item => {
                                if (!seenEqStatue[item.color]) {
                                    seenEqStatue[item.color] = true;
                                    var capColor = item.color.charAt(0).toUpperCase() + item.color.slice(1);
                                    var label = _('Take') + ' ' + _(capColor) + ' ' + _('Statue');
                                    this.statusBar.addActionButton(label, () => {
                                        this.bgaPerformAction("actConfirmStatue", { statueId: item.id });
                                    });
                                }
                            });
                        }
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actCancelStatue", {});
                        }, { color: 'secondary' });
                        break;

                    case 'LoadCargo':
                        if (this._cargoAutoConfirming) {
                            this._cargoAutoConfirming = false;
                            break;
                        }
                        if (args && args.validItems && args.validItems.length > 0) {
                            // Deduplicate by color+type — identical items need only one button
                            var seen = {};
                            args.validItems.forEach(item => {
                                var key = item.color + '_' + item.type;
                                if (!seen[key]) {
                                    seen[key] = item;
                                    var label = _('Load') + ' ' + item.color + ' ' + item.type;
                                    this.statusBar.addActionButton(label, () => {
                                        this.bgaPerformAction("actConfirmLoad", { itemId: item.id });
                                    });
                                }
                            });
                        }
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actCancel", {});
                        }, { color: 'secondary' });
                        break;

                    case 'DeliverCargo':
                        if (this._cargoAutoConfirming) {
                            this._cargoAutoConfirming = false;
                            break;
                        }
                        if (args && args.deliverableItems && args.deliverableItems.length > 0) {
                            // Deduplicate by color+type
                            var seenDeliver = {};
                            args.deliverableItems.forEach(item => {
                                var key = item.color + '_' + item.type;
                                if (!seenDeliver[key]) {
                                    seenDeliver[key] = item;
                                    var actionWord = item.type === 'offering' ? _('Deliver') : _('Raise');
                                    var label = actionWord + ' ' + item.color + ' ' + item.type;
                                    this.statusBar.addActionButton(label, () => {
                                        this.bgaPerformAction("actConfirmDeliver", { itemId: item.id });
                                    });
                                }
                            });
                        }
                        this.statusBar.addActionButton(_('Cancel'), () => {
                            this.bgaPerformAction("actCancel", {});
                        }, { color: 'secondary' });
                        break;

                    case 'SelectReward':
                        if (args && args.rewardType === 'companion' && args.availableCards && args.availableCards.length > 0) {
                            this._companionCards = args.availableCards;
                            this._showCompanionStrip();
                        } else {
                            this.statusBar.addActionButton(_('Skip'), () => {
                                this.bgaPerformAction("actPass", {});
                            }, { color: 'secondary' });
                        }
                        break;

                    case 'CombatRound':
                        var strengthText = (args && args.strength !== undefined) ? ' (need ' + args.strength + '+)' : '';
                        var self = this;
                        this._setCombatDialogActions([
                            {
                                label: _('Roll Battle Die') + strengthText,
                                color: 'primary',
                                onClick: function() { self.onRollBattleDie(); }
                            },
                            {
                                label: _('Cancel'),
                                color: 'secondary',
                                onClick: function() { self.bgaPerformAction("actCancelCombat", {}); }
                            }
                        ]);
                        break;

                    case 'CombatDefeat':
                        var self = this;
                        var defeatButtons = [];
                        if (args && args.canContinue) {
                            defeatButtons.push({
                                label: _('Pay 1 Favor to continue') + ' (' + args.favorTokens + ' left)',
                                color: 'primary',
                                onClick: function() { self.onContinueFight(); }
                            });
                        }
                        defeatButtons.push({
                            label: _('Surrender'),
                            color: 'secondary',
                            onClick: function() { self.onSurrender(); }
                        });
                        this._setCombatDialogActions(defeatButtons);
                        break;

                    case 'CombatVictory':
                        var victoryMonster = (args && args.monster_type) || 'Monster';
                        victoryMonster = victoryMonster.charAt(0).toUpperCase() + victoryMonster.slice(1);
                        var titleEl = document.getElementById('pagemaintitletext');
                        if (titleEl) titleEl.innerHTML = 'You defeated the ' + victoryMonster + '!';
                        var self = this;
                        this._equipmentCards = args.equipmentDisplay || [];
                        // Reload mid-victory: dialog isn't active, so skip the
                        // button and open the equipment strip directly.
                        if (document.getElementById('delphi-combat-dialog').classList.contains('active')) {
                            this._setCombatDialogActions([
                                {
                                    label: _('Select Equipment Card'),
                                    color: 'primary',
                                    onClick: function() {
                                        self._closeCombatDialog();
                                        self._showEquipmentStrip();
                                    }
                                }
                            ]);
                        } else {
                            this._showEquipmentStrip();
                        }
                        break;

                    case 'Recover':
                        this.statusBar.addActionButton(_('Confirm Discard'), () => {
                            if (this._selectedRecoveryCards && this._selectedRecoveryCards.size === 3) {
                                this.bgaPerformAction("actDiscardInjuries", {
                                    cardIdsJson: JSON.stringify(Array.from(this._selectedRecoveryCards))
                                });
                            }
                        });
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
            dice.forEach(function(die) {
                var dieIndex = parseInt(die.die_index);
                var elId = 'die_' + self.player_id + '_' + dieIndex;
                if (parseInt(die.is_used) === 0) {
                    var dieEl = document.getElementById(elId);
                    if (dieEl) {
                        dieEl.classList.add('die-selectable');
                        var handler = function() {
                            self.bgaPerformAction("actSelectDie", { die_index: dieIndex });
                        };
                        dieEl.addEventListener('click', handler);
                        self._dieClickHandlers.push({ el: dieEl, handler: handler, key: self.player_id + '_' + dieIndex });
                        self.components._syncDieMirror(self.player_id + '_' + dieIndex);
                    }
                }
            });
        },

        /**
         * Remove oracle die click handlers
         */
        _teardownDieClickHandlers: function() {
            var self = this;
            if (this._dieClickHandlers) {
                this._dieClickHandlers.forEach(function(item) {
                    item.el.classList.remove('die-selectable');
                    item.el.removeEventListener('click', item.handler);
                    if (item.key) self.components._syncDieMirror(item.key);
                });
                this._dieClickHandlers = null;
            }
        },

        _setupDiscardTileClickHandlers: function() {
            var self = this;
            this._discardTileClickHandlers = [];
            this.components.zeusTiles.forEach(function(el, tileId) {
                if (el.dataset.completed === 'true') return;
                el.classList.add('zeus-tile-discardable');
                var handler = function() {
                    self.bgaPerformAction("actDiscardTile", { tile_id: parseInt(tileId) });
                };
                el.addEventListener('click', handler);
                self._discardTileClickHandlers.push({ el: el, handler: handler });
            });
        },

        _teardownDiscardTileClickHandlers: function() {
            if (this._discardTileClickHandlers) {
                this._discardTileClickHandlers.forEach(function(item) {
                    item.el.classList.remove('zeus-tile-discardable');
                    item.el.removeEventListener('click', item.handler);
                });
                this._discardTileClickHandlers = null;
            }
        },

        /**
         * Click handler for an equipment card in the current player's hand.
         * Server dispatches via actActivateEquipment when the card is in the
         * activatableEquipment list for the current state; otherwise we give
         * brief visual feedback (a shake) and do not round-trip.
         */
        onEquipmentCardClick: function(cardId) {
            var args = (this.gamedatas && this.gamedatas.gamestate && this.gamedatas.gamestate.args) || {};
            var activatable = args.activatableEquipment || [];
            var numericId = parseInt(cardId);
            var found = activatable.some(function(e) {
                return parseInt(e.card_id) === numericId;
            });
            if (!found) {
                var el = this.components.equipmentCards.get(numericId)
                    || this.components.equipmentCards.get(cardId);
                if (el) {
                    el.classList.add('shake-feedback');
                    setTimeout(function() {
                        el.classList.remove('shake-feedback');
                    }, 400);
                }
                return;
            }
            this.bgaPerformAction('actActivateEquipment', { card_id: numericId });
        },

        /**
         * Add the `.activatable` class to every equipment card currently in
         * gamestate.args.activatableEquipment. Safe to call repeatedly.
         */
        _applyActivatableEquipmentClass: function(activatableList) {
            var list = activatableList || [];
            // Clear any stale activatable state first.
            this._clearActivatableEquipmentClass();
            var self = this;
            list.forEach(function(entry) {
                var cid = parseInt(entry.card_id);
                var el = self.components.equipmentCards.get(cid);
                if (el) el.classList.add('activatable');
            });
        },

        _clearActivatableEquipmentClass: function() {
            this.components.equipmentCards.forEach(function(el) {
                if (el) el.classList.remove('activatable');
            });
        },

        /**
         * Collapse the source picker in the action bar to only the selected
         * source. Triggered when a die or oracle card has been chosen and the
         * server transitions to SelectAction (or UseGodAbility for the god
         * branch). Other dice / oracle-card icons / god abilities are hidden;
         * the title text is rewritten to G's "You must select an action for"
         * pattern so the remaining icon reads as the subject of that prompt.
         *
         * @param {object|null} stateArgs SelectAction state args ({ die_color,
         *   selected_oracle_card_id }). Pass null for UseGodAbility (no source
         *   element in the bar should remain visible).
         */
        _applyActionSourceSelection: function(stateArgs) {
            var sources = document.getElementById('delphi-action-sources');
            if (!sources) return;
            sources.classList.add('source-selected');

            // SelectAction sends die_color as the display name ("Red") via
            // MaterialDefs::COLOR_NAMES, but dataset.color on every source
            // element is the internal lowercase token ("red"). Normalize so
            // the equality check below actually matches.
            var dieColorRaw = (stateArgs && stateArgs.die_color) || null;
            var dieColor = dieColorRaw ? String(dieColorRaw).toLowerCase() : null;
            var oracleCardId = (stateArgs && parseInt(stateArgs.selected_oracle_card_id)) || 0;
            var oracleCardSelected = oracleCardId > 0;
            // dieIndex disambiguates same-color dice (e.g. two red dice in
            // the same roll). Falls back to color matching only when the
            // index isn't available — kept as a safety net for any code
            // path that might call this without dieIndex in args.
            var dieIndexRaw = (stateArgs && stateArgs.dieIndex);
            var dieIndex = (dieIndexRaw !== undefined && dieIndexRaw !== null)
                ? String(dieIndexRaw)
                : null;

            // Dice: keep only the die that was actually selected. If args
            // give us its index, use that (since two dice can share a color);
            // otherwise fall back to color match.
            sources.querySelectorAll('.delphi-die').forEach(function(el) {
                if (oracleCardSelected) {
                    el.classList.add('source-hidden');
                    return;
                }
                var match;
                if (dieIndex !== null) {
                    match = el.dataset.index === dieIndex;
                } else {
                    match = dieColor && el.dataset.color === dieColor;
                }
                el.classList.toggle('source-hidden', !match);
            });
            // Oracle cards: keep the matching color visible only when the
            // player actually played a card.
            sources.querySelectorAll('.action-oracle-card').forEach(function(el) {
                var color = el.dataset.color;
                var match = oracleCardSelected && dieColor && color === dieColor;
                el.classList.toggle('source-hidden', !match);
            });
            // God abilities: always hidden once a source is locked in.
            sources.querySelectorAll('.action-god-ability').forEach(function(el) {
                el.classList.add('source-hidden');
            });

            // Collapse any sub-bar whose children are entirely hidden so
            // gap/padding/margin don't leave dead space between the prompt
            // and the chosen source. The dice grid, oracle-card icons, and
            // god-ability strip are siblings inside the wrapper — without
            // this, the cards / gods bars keep their flex slot even though
            // they show nothing visible.
            ['delphi-action-oracle-cards', 'delphi-oracle-dice', 'delphi-action-god-abilities']
                .forEach(function(id) {
                    var bar = document.getElementById(id);
                    if (!bar) return;
                    var hasVisible = false;
                    for (var i = 0; i < bar.children.length; i++) {
                        if (!bar.children[i].classList.contains('source-hidden')) {
                            hasVisible = true;
                            break;
                        }
                    }
                    bar.classList.toggle('bar-empty', !hasVisible);
                });

            var titleEl = document.getElementById('pagemaintitletext');
            if (titleEl) titleEl.textContent = _('You must select an action for');
        },

        /**
         * Restore every source icon in the action bar. Called on returning to
         * PlayerActions and on leaving SelectAction / UseGodAbility — BGA
         * rewrites #pagemaintitletext from the entering state's
         * descriptionMyTurn so we don't need to reset the title here.
         */
        _clearActionSourceSelection: function() {
            var sources = document.getElementById('delphi-action-sources');
            if (!sources) return;
            sources.classList.remove('source-selected');
            sources.querySelectorAll('.source-hidden').forEach(function(el) {
                el.classList.remove('source-hidden');
            });
            sources.querySelectorAll('.bar-empty').forEach(function(el) {
                el.classList.remove('bar-empty');
            });
        },

        /**
         * Set up oracle card click handlers for playing an oracle card as a virtual die.
         * Also populates small oracle card icons in the action bar (left of dice).
         */
        _setupOracleCardClickHandlers: function(oracleCards, apolloWildActive) {
            var self = this;
            // Tear down any leftover handlers from a previous setup so re-entry
            // into PlayerActions (e.g. after cancelling an oracle card mid-turn)
            // gets a clean slate — otherwise the "already has the class" guard
            // below silently skips re-adding the click listener and the card
            // appears un-selectable.
            this._teardownOracleCardClickHandlers();
            this._oracleCardClickHandlers = [];

            // Populate action bar oracle card icons
            var cardsBar = document.getElementById('delphi-action-oracle-cards');
            if (cardsBar) cardsBar.innerHTML = '';

            // Deduplicate by color (cards of same color share one icon with count)
            var byColor = {};
            oracleCards.forEach(function(card) {
                if (!byColor[card.color]) {
                    byColor[card.color] = { cardId: card.cardId, count: 0, isWild: card.isWild || false };
                }
                byColor[card.color].count++;
            });

            Object.keys(byColor).forEach(function(color) {
                var info = byColor[color];
                var isWild = info.isWild || false;
                var apolloLocked = apolloWildActive === true && !isWild;
                var handler = function() {
                    if (isWild) {
                        self.showWildColorPicker(info.cardId);
                    } else {
                        self.bgaPerformAction("actPlayOracleCard", { card_id: info.cardId });
                    }
                };

                // Action bar icon
                if (cardsBar) {
                    var icon = document.createElement('div');
                    icon.className = 'action-oracle-card oracle-' + color;
                    if (isWild) icon.classList.add('oracle-card-wild');
                    if (apolloLocked) icon.classList.add('oracle-card-apollo-locked');
                    icon.dataset.color = color;
                    if (info.count > 1) {
                        var badge = document.createElement('span');
                        badge.className = 'action-card-count';
                        badge.textContent = info.count;
                        icon.appendChild(badge);
                    }
                    if (!apolloLocked) {
                        icon.addEventListener('click', handler);
                        self._oracleCardClickHandlers.push({ el: icon, handler: handler });
                    }
                    cardsBar.appendChild(icon);
                }

                // Hand area card (existing behavior)
                var container = document.getElementById('delphi-oracle-cards-area');
                if (container) {
                    var cardEl = container.querySelector('.oracle-' + color);
                    if (cardEl) {
                        if (apolloLocked) {
                            cardEl.classList.add('oracle-card-apollo-locked');
                            cardEl.classList.remove('oracle-card-selectable');
                        } else {
                            cardEl.classList.remove('oracle-card-apollo-locked');
                            cardEl.classList.add('oracle-card-selectable');
                            cardEl.addEventListener('click', handler);
                            self._oracleCardClickHandlers.push({ el: cardEl, handler: handler });
                        }
                    }
                }
            });
        },

        /**
         * Remove oracle card click handlers (keeps action bar icons visible)
         */
        _teardownOracleCardClickHandlers: function() {
            if (this._oracleCardClickHandlers) {
                this._oracleCardClickHandlers.forEach(function(item) {
                    item.el.classList.remove('oracle-card-selectable');
                    item.el.removeEventListener('click', item.handler);
                });
                this._oracleCardClickHandlers = null;
            }
        },

        /**
         * Clear action bar oracle card icons (called at turn end)
         */
        _clearActionBarOracleCards: function() {
            var cardsBar = document.getElementById('delphi-action-oracle-cards');
            if (cardsBar) cardsBar.innerHTML = '';
        },

        /**
         * Prepend a circular god icon to an action button's label.
         * Uses textContent for existing label so translations/escaping remain intact.
         */
        // Sort an array of god rows ({god_name, ...}) by player-board left-to-right
        // order so the action-bar buttons match the panel's pantheon column order.
        _sortGodsByBoard: function(gods) {
            var order = (this.components && this.components.playerPanel && this.components.playerPanel.GOD_ORDER) || [];
            return [].concat(gods || []).sort(function(a, b) {
                return order.indexOf(a.god_name) - order.indexOf(b.god_name);
            });
        },

        _prependGodIconToButton: function(buttonEl, godName) {
            if (!buttonEl || !godName) return;
            var label = buttonEl.textContent;
            var icon = document.createElement('span');
            icon.className = 'god-btn-icon god-' + godName;
            icon.setAttribute('aria-hidden', 'true');
            buttonEl.textContent = '';
            buttonEl.appendChild(icon);
            buttonEl.appendChild(document.createTextNode(label));
        },

        /**
         * Prepend an action icon to a player-action button's label.
         * actionKey matches an .action-{key} CSS modifier (e.g. "draw-oracle-card").
         */
        _prependActionIconToButton: function(buttonEl, actionKey) {
            if (!buttonEl || !actionKey) return;
            var label = buttonEl.textContent;
            var icon = document.createElement('span');
            icon.className = 'action-btn-icon action-' + actionKey;
            icon.setAttribute('aria-hidden', 'true');
            buttonEl.textContent = '';
            buttonEl.appendChild(icon);
            buttonEl.appendChild(document.createTextNode(label));
        },

        // Kick off decoding of action-bar icons at setup so the first
        // button click doesn't show a blank icon while the PNG fetches.
        _preloadActionIcons: function() {
            var keys = [
                'draw-oracle-card', 'take-favors', 'peek-islands', 'move-ship',
                'explore-island', 'discard-injuries', 'fight-monster',
                'load-offering', 'load-statue', 'build-shrine',
                'make-offering', 'raise-statue', 'recolor-die'
            ];
            keys.forEach(function(key) {
                var img = new Image();
                img.src = g_gamethemeurl + 'img/actions/action-' + key + '.png';
            });
        },

        /**
         * Populate god ability icons to the right of the oracle dice.
         */
        _updateGodAbilityIcons: function(availableGods) {
            var godsBar = document.getElementById('delphi-action-god-abilities');
            if (!godsBar) return;

            if (!availableGods || availableGods.length === 0) {
                godsBar.innerHTML = '';
                return;
            }

            // Check if existing disabled icons match — re-enable instead of rebuilding
            var existing = godsBar.querySelectorAll('.action-god-ability');
            var newNames = availableGods.map(function(g) { return g.god_name; }).sort().join(',');
            var oldNames = Array.prototype.map.call(existing, function(el) {
                return el.id.replace('god-ability-btn-', '');
            }).sort().join(',');

            if (existing.length > 0 && newNames === oldNames) {
                var self = this;
                availableGods.forEach(function(g) {
                    var icon = document.getElementById('god-ability-btn-' + g.god_name);
                    if (!icon) return;
                    var usable = g.usable !== false;
                    // Re-enable: swap clone for fresh node to attach new click handler
                    var fresh = icon.cloneNode(true);
                    if (usable) fresh.classList.remove('god-ability-unavailable');
                    if (usable) {
                        fresh.addEventListener('click', function() {
                            self.bgaPerformAction("actUseGodAbility", { godName: g.god_name });
                        });
                    }
                    icon.parentNode.replaceChild(fresh, icon);
                });
                return;
            }

            // Full rebuild — god list changed
            godsBar.innerHTML = '';
            var self = this;
            availableGods.forEach(function(g) {
                var godLabel = g.god_name.charAt(0).toUpperCase() + g.god_name.slice(1);
                var usable = g.usable !== false;
                var icon = document.createElement('div');
                icon.className = 'action-god-ability god-' + g.god_name;
                if (!usable) icon.classList.add('god-ability-unavailable');
                icon.id = 'god-ability-btn-' + g.god_name;
                icon.setAttribute('aria-label', godLabel);
                if (usable) {
                    icon.addEventListener('click', function() {
                        self.bgaPerformAction("actUseGodAbility", { godName: g.god_name });
                    });
                }
                godsBar.appendChild(icon);
                var desc = self.getGodAbilityDescription(g.ability);
                var reasonHtml = (!usable && g.reason)
                    ? '<div class="god-tooltip-prereq">(' + g.reason + ')</div>'
                    : '';
                var tooltipHtml = ''
                    + '<div class="god-tooltip">'
                    +   '<div class="god-tooltip-icon god-' + g.god_name + '"></div>'
                    +   '<div class="god-tooltip-body">'
                    +     '<strong>' + godLabel + '</strong>: ' + desc
                    +     reasonHtml
                    +   '</div>'
                    + '</div>';
                self.addTooltipHtml(icon.id, tooltipHtml);
            });
        },

        /**
         * Clear god ability icons from the dice bar.
         */
        _clearGodAbilityIcons: function() {
            var godsBar = document.getElementById('delphi-action-god-abilities');
            if (godsBar) godsBar.innerHTML = '';
        },

        /**
         * Strip click handlers from god ability icons without changing their appearance.
         * Matches Oracle Card teardown behaviour — icons stay visible and unchanged.
         */
        _disableGodAbilityIcons: function() {
            var godsBar = document.getElementById('delphi-action-god-abilities');
            if (!godsBar) return;
            var icons = godsBar.querySelectorAll('.action-god-ability');
            icons.forEach(function(icon) {
                // Replace with clone to strip click handlers
                var clone = icon.cloneNode(true);
                icon.parentNode.replaceChild(clone, icon);
            });
        },

        onEndTurn: function() {
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
            // Set shield icon to current player's color
            var shieldIconEl = document.getElementById('combat-shield-icon');
            if (shieldIconEl) {
                shieldIconEl.classList.remove('shield-red', 'shield-yellow', 'shield-green', 'shield-blue');
                var playerColor = this.getPlayerGameColor(this.gamedatas);
                if (playerColor) shieldIconEl.classList.add('shield-' + playerColor);
            }
            // Set shield and target values
            var shieldEl = document.getElementById('combat-shield-value');
            if (shieldEl) shieldEl.textContent = combatArgs.shield_value != null ? combatArgs.shield_value : 0;
            var targetEl = document.getElementById('combat-target-value');
            if (targetEl) targetEl.textContent = combatArgs.strength != null ? combatArgs.strength : '';
            // Show roll result if available. Toggle visibility, not display,
            // so the dialog height stays stable between rolls.
            var resultRow = document.getElementById('combat-result-row');
            var resultEl = document.getElementById('combat-roll-result');
            if (combatArgs.roll != null) {
                if (resultRow) resultRow.classList.add('combat-result-row-visible');
                if (resultEl) resultEl.textContent = combatArgs.roll;
            } else {
                if (resultRow) resultRow.classList.remove('combat-result-row-visible');
                if (resultEl) resultEl.textContent = '';
            }
            this._applyRollResultColor();
        },

        _applyRollResultColor: function() {
            var resultEl = document.getElementById('combat-roll-result');
            var targetEl = document.getElementById('combat-target-value');
            var iconEl = document.getElementById('combat-result-icon');
            if (!resultEl) return;
            resultEl.classList.remove('roll-success', 'roll-fail');
            if (iconEl) iconEl.textContent = '';
            var roll = parseInt(resultEl.textContent, 10);
            var target = targetEl ? parseInt(targetEl.textContent, 10) : NaN;
            if (!isNaN(roll) && !isNaN(target)) {
                var success = roll >= target;
                resultEl.classList.add(success ? 'roll-success' : 'roll-fail');
                if (iconEl) iconEl.textContent = success ? '\u2705' : '\u274C';
            }
        },

        _showInjuryStrip: function(injuryCards) {
            var strip = document.getElementById('delphi-injury-strip');
            var container = document.getElementById('injury-strip-cards');
            var countEl = document.getElementById('injury-strip-count');
            if (!strip || !container) return;
            container.innerHTML = '';
            this._selectedRecoveryCards = new Set();
            this._recoveryCardHandlers = [];
            var self = this;
            var updateCount = function() {
                if (countEl) countEl.textContent = ' (' + self._selectedRecoveryCards.size + '/3)';
            };
            injuryCards.forEach(function(card) {
                var el = document.createElement('div');
                el.id = 'injury_card_' + card.card_id;
                el.className = 'injury-strip-card injury-' + card.color;
                el.dataset.cardId = card.card_id;
                var handler = function() {
                    if (self._selectedRecoveryCards.has(card.card_id)) {
                        self._selectedRecoveryCards.delete(card.card_id);
                        el.classList.remove('injury-selected');
                    } else if (self._selectedRecoveryCards.size < 3) {
                        self._selectedRecoveryCards.add(card.card_id);
                        el.classList.add('injury-selected');
                    }
                    updateCount();
                };
                el.addEventListener('click', handler);
                container.appendChild(el);
                self._recoveryCardHandlers.push({ el: el, handler: handler });
            });
            updateCount();
            strip.style.display = '';
            // Insert after the page title / action bar so it appears at the top
            var pageTitle = document.getElementById('page-title');
            if (pageTitle && pageTitle.parentNode) {
                pageTitle.parentNode.insertBefore(strip, pageTitle.nextSibling);
            }
        },

        _hideInjuryStrip: function() {
            var strip = document.getElementById('delphi-injury-strip');
            var container = document.getElementById('injury-strip-cards');
            if (strip) strip.style.display = 'none';
            if (container) container.innerHTML = '';
            this._recoveryCardHandlers = null;
            this._selectedRecoveryCards = null;
        },

        /**
         * Minimal HTML-escape helper for user-facing text interpolated into
         * tooltip innerHTML.
         */
        _escHtml: function(s) {
            if (s === null || s === undefined) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
        },

        /**
         * Build the rich HTML tooltip for an equipment card. Used by both
         * render sites — the hand strip (via Components.addEquipmentCard)
         * and the combat-victory selection strip (via _showEquipmentStrip).
         *
         * Layout mirrors the god-tooltip template: image on the left (2x
         * card size = 160x240), title+description on the right.
         */
        _buildEquipmentTooltipHtml: function(cardTypeArg) {
            var def = (this.equipmentDefs && this.equipmentDefs[cardTypeArg]) || {};
            var name = def.name || ('Equipment #' + cardTypeArg);
            var desc = def.description || '';
            var cardNum = String(cardTypeArg).padStart(3, '0');
            var imgUrl = g_gamethemeurl + 'img/equipment/card-' + cardNum + '.jpg';
            return ''
                + '<div class="delphi-equipment-tooltip">'
                +   '<div class="delphi-equipment-tooltip-image" style="background-image:url(\'' + imgUrl + '\')"></div>'
                +   '<div class="delphi-equipment-tooltip-body">'
                +     '<strong class="delphi-equipment-tooltip-title">' + this._escHtml(name) + '</strong>'
                +     '<p class="delphi-equipment-tooltip-desc">' + this._escHtml(desc) + '</p>'
                +   '</div>'
                + '</div>';
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
                cardEl.id = 'equipment-select-' + card.card_id;
                cardEl.dataset.cardId = card.card_id;
                var cardNum = String(card.card_type_arg).padStart(3, '0');
                cardEl.style.backgroundImage = "url('" + g_gamethemeurl + "img/equipment/card-" + cardNum + ".jpg')";
                cardEl.addEventListener('click', function() {
                    self._selectEquipmentCard(parseInt(card.card_id));
                });
                container.appendChild(cardEl);

                // Rich tooltip on the selection strip — same template as hand
                // cards. Bind AFTER appending so BGA can resolve the id.
                self.addTooltipHtml(
                    cardEl.id,
                    self._buildEquipmentTooltipHtml(parseInt(card.card_type_arg))
                );
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

        _showCompanionStrip: function() {
            var strip = document.getElementById('delphi-equipment-strip');
            var container = document.getElementById('equipment-strip-cards');
            container.innerHTML = '';
            var self = this;
            this._selectedCompanionId = null;

            var titleEl = document.getElementById('pagemaintitletext');
            if (titleEl) titleEl.innerHTML = 'Select a Companion card';
            var actionBar = document.getElementById('generalactions');
            if (actionBar) actionBar.innerHTML = '';

            this._companionCards.forEach(function(card) {
                var cardEl = document.createElement('div');
                cardEl.className = 'equipment-card companion-card';
                cardEl.dataset.cardId = card.card_id;
                cardEl.style.backgroundImage = "url('" + g_gamethemeurl + "img/companion/" + card.color + "-card-" + (card.card_type_arg % 3) + ".png')";
                cardEl.addEventListener('click', function() {
                    self._selectCompanionCard(parseInt(card.card_id));
                });
                container.appendChild(cardEl);
            });

            strip.style.display = '';
            var pageTitle = document.getElementById('page-title');
            if (pageTitle && pageTitle.parentNode) {
                pageTitle.parentNode.insertBefore(strip, pageTitle.nextSibling);
            }
        },

        _selectCompanionCard: function(cardId) {
            this._selectedCompanionId = cardId;
            var cards = document.querySelectorAll('#equipment-strip-cards .companion-card');
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
            var self = this;
            var actionBar = document.getElementById('generalactions');
            if (actionBar) actionBar.innerHTML = '';
            this.statusBar.addActionButton(_('Confirm'), function() {
                var strip = document.getElementById('delphi-equipment-strip');
                if (strip) strip.style.display = 'none';
                self.bgaPerformAction("actSelectReward", { card_id: cardId });
            }, { color: 'primary' });
            this.statusBar.addActionButton(_('Cancel'), function() {
                self._deselectCompanionCard();
            }, { color: 'secondary' });
        },

        _deselectCompanionCard: function() {
            this._selectedCompanionId = null;
            var overlays = document.querySelectorAll('#equipment-strip-cards .equipment-check-overlay');
            overlays.forEach(function(el) { el.remove(); });
            var titleEl = document.getElementById('pagemaintitletext');
            if (titleEl) titleEl.innerHTML = 'Select a Companion card';
            var actionBar = document.getElementById('generalactions');
            if (actionBar) actionBar.innerHTML = '';
        },

        _clearCombatDialogActions: function() {
            var footer = document.getElementById('combat-dialog-actions');
            if (footer) footer.innerHTML = '';
        },

        /**
         * Populate the combat dialog footer with action buttons.
         * @param {Array<{label:string,color?:string,onClick:Function}>} buttons
         *   color defaults to 'primary'. Valid: 'primary' | 'secondary'.
         */
        _setCombatDialogActions: function(buttons) {
            var footer = document.getElementById('combat-dialog-actions');
            if (!footer) return;
            footer.innerHTML = '';
            (buttons || []).forEach(function(b) {
                var btn = document.createElement('button');
                var colorClass = (b.color === 'secondary') ? 'secondary' : 'primary';
                btn.className = 'delphi-btn ' + colorClass;
                btn.textContent = b.label;
                btn.addEventListener('click', function(ev) {
                    ev.preventDefault();
                    if (typeof b.onClick === 'function') b.onClick();
                });
                footer.appendChild(btn);
            });
        },

        _closeCombatDialog: function() {
            this._clearCombatDialogActions();
            this.components.clearBattleDie();
            document.getElementById('delphi-combat-dialog').classList.remove('active');
        },

        onRollBattleDie: function() {
            this.bgaPerformAction("actRollBattleDie", {});
        },

        onContinueFight: function() {
            this.bgaPerformAction("actPayFavor", {});
        },

        onSurrender: function() {
            this.bgaPerformAction("actSurrender", {});
        },

        getGodAbilityDescription: function(ability) {
            switch (ability) {
                case 'discard_all_injuries': return _('Discard all injuries');
                case 'dice_wild': return _('All dice become wild + draw wild Oracle Card');
                case 'teleport_ship': return _('Teleport ship to any water hex');
                case 'free_explore_island': return _('Explore any island (no die needed)');
                case 'auto_defeat_monster': return _('Auto-defeat an adjacent monster');
                case 'grab_any_statue': return _('Take a statue from any city');
                default: return '';
            }
        },

        _highlightValidHexes: function(hexes, className, onClick) {
            this._godTargetOverlays = [];
            var self = this;
            var container = document.getElementById('delphi-hex-grid');
            if (!container) return;

            hexes.forEach(function(hex) {
                var q = parseInt(hex.q);
                var r = parseInt(hex.r);
                var center = self.getHexCenterPixel(q, r);
                if (!center) return;

                var overlay = document.createElement('div');
                overlay.className = 'hex-overlay ' + className;
                overlay.style.left = (center.x - 27) + 'px';
                overlay.style.top = (center.y - 27) + 'px';
                overlay.addEventListener('click', function() {
                    onClick(q, r);
                });

                container.appendChild(overlay);
                self._godTargetOverlays.push(overlay);
            });
        },

        _clearGodTargetOverlays: function() {
            if (this._godTargetOverlays) {
                this._godTargetOverlays.forEach(function(el) { el.remove(); });
                this._godTargetOverlays = null;
            }
        },

        /**
         * Inline color picker for equipment card 003's bonus action.
         * Shares styling (.wild-color-picker / .wild-color-btn) with the
         * wild oracle card picker, but commits via actUseBonusAction.
         */
        _showBonusActionColorPicker: function() {
            var self = this;
            var colors = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];

            var existing = document.getElementById('delphi-bonus-action-color-picker');
            if (existing) existing.remove();
            // Also remove a wild-card picker if one is open, to avoid overlap.
            var wildPicker = document.getElementById('delphi-wild-color-picker');
            if (wildPicker) wildPicker.remove();

            var picker = document.createElement('div');
            picker.id = 'delphi-bonus-action-color-picker';
            picker.className = 'wild-color-picker';

            var label = document.createElement('span');
            label.textContent = _('Bonus action color: ');
            picker.appendChild(label);

            colors.forEach(function(color) {
                var btn = document.createElement('button');
                btn.className = 'wild-color-btn wild-color-' + color;
                btn.title = color.charAt(0).toUpperCase() + color.slice(1);
                btn.addEventListener('click', function() {
                    picker.remove();
                    self.bgaPerformAction("actUseBonusAction", {
                        chosen_color: color
                    });
                });
                picker.appendChild(btn);
            });

            var cancelBtn = document.createElement('button');
            cancelBtn.className = 'wild-color-btn wild-color-cancel';
            cancelBtn.textContent = '\u2715';
            cancelBtn.title = _('Cancel');
            cancelBtn.addEventListener('click', function() {
                picker.remove();
            });
            picker.appendChild(cancelBtn);

            var host = document.getElementById('generalactions');
            if (host) host.appendChild(picker);
        },

        showWildColorPicker: function(cardId) {
            var self = this;
            var colors = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];

            var existing = document.getElementById('delphi-wild-color-picker');
            if (existing) existing.remove();

            var picker = document.createElement('div');
            picker.id = 'delphi-wild-color-picker';
            picker.className = 'wild-color-picker';

            var label = document.createElement('span');
            label.textContent = _('Choose color: ');
            picker.appendChild(label);

            colors.forEach(function(color) {
                var btn = document.createElement('button');
                btn.className = 'wild-color-btn wild-color-' + color;
                btn.title = color.charAt(0).toUpperCase() + color.slice(1);
                btn.addEventListener('click', function() {
                    picker.remove();
                    self.bgaPerformAction("actPlayWildOracleCard", {
                        card_id: cardId,
                        chosen_color: color
                    });
                });
                picker.appendChild(btn);
            });

            var cancelBtn = document.createElement('button');
            cancelBtn.className = 'wild-color-btn wild-color-cancel';
            cancelBtn.textContent = '✕';
            cancelBtn.addEventListener('click', function() {
                picker.remove();
            });
            picker.appendChild(cancelBtn);

            document.getElementById('generalactions').appendChild(picker);
        },

        ///////////////////////////////////////////////////
        //// Reaction to cometD notifications

        setupNotifications: function()
        {
            this.bgaSetupPromiseNotifications();

            // Equipment-card notifications (infra batch).
            dojo.subscribe('equipmentActivated', this, 'notif_equipmentActivated');
            this.notifqueue.setSynchronous('equipmentActivated', 400);
            dojo.subscribe('equipmentReactionTriggered', this, 'notif_equipmentReactionTriggered');
            this.notifqueue.setSynchronous('equipmentReactionTriggered', 600);
            dojo.subscribe('equipmentUsed', this, 'notif_equipmentUsed');
            // Equipment card 003 — bonus-action lifecycle.
            dojo.subscribe('bonusActionStarted', this, 'notif_bonusActionStarted');
            dojo.subscribe('bonusActionCancelled', this, 'notif_bonusActionCancelled');

            // End-of-game scoring sequence (BGA Studio Guideline F-3:
            // build suspense, animate the breakdown over each player's panel).
            dojo.subscribe('endScoreBegin', this, 'notif_endScoreBegin');
            this.notifqueue.setSynchronous('endScoreBegin', 1200);
            dojo.subscribe('endScorePlayer', this, 'notif_endScorePlayer');
            this.notifqueue.setSynchronous('endScorePlayer', 1800);
        },

        /**
         * F-3: short pause before the per-player breakdown so the gamelog
         * "Final scoring begins" line is visible and the moment registers.
         */
        notif_endScoreBegin: function(notif) {
            // Timing handled by setSynchronous('endScoreBegin', 1200).
        },

        /**
         * F-3: animate each player's task count over their panel in their own
         * color. Tasks completed is the most meaningful metric in Oracle of
         * Delphi (binary win/lose primary score doesn't tell the story alone).
         */
        notif_endScorePlayer: function(notif) {
            var payload = (notif && notif.args) ? notif.args : notif;
            var pid = parseInt(payload.player_id);
            var anchorId = 'player_board_' + pid;
            if (!document.getElementById(anchorId)) return;

            var players = (this.gamedatas && this.gamedatas.players) || {};
            var color = (players[pid] && players[pid].color) || '000000';
            var tasks = parseInt(payload.tasks) || 0;
            this.displayScoring(anchorId, color, '+' + tasks, 1500);
        },

        /**
         * The server-side translated string is rendered by BGA automatically.
         * Additionally, when the activation spent favor (e.g. equipment 003),
         * update the local favor counter for the acting player.
         */
        notif_equipmentActivated: function(notif) {
            var payload = (notif && notif.args) ? notif.args : notif;
            if (payload
                && parseInt(payload.player_id) === this.player_id
                && typeof payload.favor_tokens !== 'undefined') {
                this.components.setFavorTokenCount(parseInt(payload.favor_tokens));
            }
        },

        /**
         * Log-only — BGA renders the translated server message. The bonus
         * action flow transitions the state machine; no client animation
         * needed here beyond whatever the subsequent state change triggers.
         */
        notif_bonusActionStarted: function(notif) {
        },

        /**
         * Log-only — fired when the player cancels the bonus-action die
         * selection and returns to PlayerActions with the bonus still active.
         */
        notif_bonusActionCancelled: function(notif) {
        },

        /**
         * Reaction (e.g. card 000 yellow-charm +2 Favor on Consult Oracle):
         *   - Gold-pulse the card element for 800ms.
         *   - Update favor counter if the server sent the new total (favor_tokens)
         *     or a delta (favor_delta). Current-player only.
         */
        notif_equipmentReactionTriggered: function(notif) {
            var payload = (notif && notif.args) ? notif.args : notif;
            var cardId = parseInt(payload.card_id);
            if (parseInt(payload.player_id) === this.player_id) {
                if (typeof payload.favor_tokens !== 'undefined') {
                    this.components.setFavorTokenCount(parseInt(payload.favor_tokens));
                } else if (typeof payload.favor_delta === 'number') {
                    var current = (this.components.favorTokenCount || 0);
                    this.components.setFavorTokenCount(current + parseInt(payload.favor_delta));
                }
            }
            var el = this.components.equipmentCards.get(cardId);
            if (el) {
                el.classList.add('equipment-pulse');
                setTimeout(function() {
                    el.classList.remove('equipment-pulse');
                }, 800);
            }
        },

        /**
         * Marks an equipment card as used (grey-out). Fires for one-time /
         * once-per-turn cards after server resolves their effect.
         */
        notif_equipmentUsed: function(notif) {
            var payload = (notif && notif.args) ? notif.args : notif;
            var cardId = parseInt(payload.card_id);
            var el = this.components.equipmentCards.get(cardId);
            if (el) el.classList.add('used');
        },

        notif_shipMoved: async function(args) {
            if (!this.shipPositions) this.shipPositions = {};
            var oldPos = this.shipPositions[args.player_id];
            this.shipPositions[args.player_id] = { q: args.q, r: args.r };

            // Move this ship to new position (with offset if sharing)
            var pos = this.getShipPixelPosition(args.player_id, args.q, args.r);
            if (pos) {
                var isMe = (args.player_id == this.player_id);
                this.components.moveShip(args.player_id, pos.x, pos.y, isMe);
            }

            // Reposition other ships on destination hex
            this.repositionAllShipsOnHex(args.q, args.r, true);

            // Re-center any ship left behind on old hex
            if (oldPos) {
                this.repositionAllShipsOnHex(oldPos.q, oldPos.r, true);
            }
        },

        notif_monsterDefeated: async function(args) {
            this.components.removeMonster(args.monster_id);
            if (parseInt(args.player_id) === this.player_id) {
                this.components.addDefeatedMonster(args.monster_type, args.monster_color);
            }
            // Optimistic panel update — server marks the Zeus tile in CombatVictory
            // (after equipment pick), but the visual should reflect the kill now.
            // Match the same priority the server uses: exact color match first,
            // then fall back to the "any color" tile.
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps && ps.tasks && Array.isArray(ps.tasks.monsters)) {
                var color = args.monster_color;
                var tile = ps.tasks.monsters.find(function(t) { return !t.done && t.color === color; })
                        || ps.tasks.monsters.find(function(t) { return !t.done && t.color === null; });
                if (tile) {
                    tile.done = true;
                    this.components.playerPanel.updateTask(args.player_id, 'monster', ps.tasks.monsters);
                }
            }
        },

        notif_diceRolled: async function(args) {
            // ConsultOracle re-rolls the active player's dice between turns.
            // Strip every stale class that the inline-action-bar refactor can
            // leave on dice (.source-hidden / .bar-empty / .die-selected) so
            // animateDiceRoll fires on a clean, fully-visible set. We also
            // force a reflow on the dice container before kicking off the
            // animation — without it the transition can be batched with the
            // visibility change and the browser skips the keyframes.
            this._clearActionSourceSelection();
            var diceContainer = document.getElementById('delphi-oracle-dice');
            if (diceContainer) {
                diceContainer.classList.remove('bar-empty');
                var diceElsForReset = diceContainer.querySelectorAll('.delphi-die');
                for (var i = 0; i < diceElsForReset.length; i++) {
                    diceElsForReset[i].classList.remove('source-hidden', 'die-selected');
                }
                // Commit the visibility / class changes before the animation
                // starts so the CSS transition on .die-inner has a stable
                // from-state to interpolate from.
                void diceContainer.offsetHeight;
            }
            await this.components.animateDiceRoll(args.player_id, args.colors);
            if (Array.isArray(args.colors)) {
                var dice = args.colors.map(function(color, idx) {
                    return { idx: idx, color: color, spent: 0 };
                });
                var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
                if (ps) ps.dice = dice;
                this.components.playerPanel.updateDice(args.player_id, dice);
            }
        },

        notif_shieldChanged: async function(args) {
            this.components.setShieldValue(args.value, args.playerColor);
            // Update opponent shield pills so all player panels stay in sync.
            this.components.playerPanel.updateShield(args.player_id, parseInt(args.value, 10));
        },

        notif_taskCompleted: async function(args) {
            this.components.completeZeusTile(args.tile_id);
            // Push the new score into the BGA player-board score widget.
            if (args.player_score != null && this.scoreCtrl && this.scoreCtrl[args.player_id]) {
                this.scoreCtrl[args.player_id].toValue(parseInt(args.player_score, 10));
            }
            if (args.task_type && args.tile_id != null && this.gamedatas.panelState && this.gamedatas.panelState[args.player_id]) {
                var ps = this.gamedatas.panelState[args.player_id];
                if (ps.tasks) {
                    var key = args.task_type === 'shrine' ? 'shrines' : args.task_type + 's';
                    var tiles = ps.tasks[key] || [];
                    var targetId = parseInt(args.tile_id, 10);
                    var tile = tiles.find(function(t) { return parseInt(t.id, 10) === targetId; });
                    if (tile) {
                        tile.done = true;
                        this.components.playerPanel.updateTask(args.player_id, args.task_type, tiles);
                    }
                }
            }
        },

        notif_dieSelected: async function(args) {
            var pid = parseInt(args.player_id);
            var dieIndex = parseInt(args.die_index);
            this.components.selectDie(pid, dieIndex);
            this._selectedDieColors = this._selectedDieColors || {};
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[pid];
            var die = ps && ps.dice && ps.dice.find(function(d) { return parseInt(d.idx) === dieIndex; });
            this._selectedDieColors[pid] = die && die.color ? die.color : null;
            this._refreshMovementHex(pid);
        },

        notif_dieCancelled: async function(args) {
            var pid = parseInt(args.player_id);
            this.components.selectDie(pid, -1); // deselect all
            this._selectedDieColors = this._selectedDieColors || {};
            this._selectedDieColors[pid] = null;
            this._refreshMovementHex(pid);
        },

        notif_dieUsed: async function(args) {
            var pid = parseInt(args.player_id);
            var dieIndex = parseInt(args.die_index);
            this.components.useDie(pid, dieIndex);
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[pid];
            if (ps && ps.dice) {
                ps.dice.forEach(function(d) { if (d.idx === dieIndex) d.spent = 1; });
                this.components.playerPanel.updateDice(pid, ps.dice);
            }
            this._selectedDieColors = this._selectedDieColors || {};
            this._selectedDieColors[pid] = null;
            this._refreshMovementHex(pid);
        },

        notif_favorSpentForMovement: function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                this.components.setFavorTokenCount(parseInt(args.favor_tokens));
            }
            this.components.playerPanel.updateFavor(args.player_id, parseInt(args.favor_tokens, 10));
        },

        notif_combatStart: async function(args) {
            // Dialog population now handled by onEnteringState for CombatRound
        },

        notif_battleDieRolled: async function(args) {
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
            if (resultRow) resultRow.classList.add('combat-result-row-visible');
            var resultEl = document.getElementById('combat-roll-result');
            if (resultEl) resultEl.textContent = args.roll;
            this._applyRollResultColor();
        },

        notif_combatInjury: async function(args) {
            if (args.player_id == this.player_id) {
                this.components.addInjuryCard(args.color);
            }
            // Update injury bar for the affected player (all players see this).
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps && args.color) {
                ps.injuries = ps.injuries || [];
                var existing = ps.injuries.find(function(x) { return x.color === args.color; });
                if (existing) existing.n = parseInt(existing.n, 10) + 1;
                else ps.injuries.push({ color: args.color, n: 1 });
                this.components.playerPanel.updateInjuries(args.player_id, ps.injuries);
            }
        },

        notif_combatContinue: async function(args) {
            if (args.player_id == this.player_id) {
                var badge = document.querySelector('.favor-count-badge');
                if (badge) badge.textContent = args.favor_remaining;
            }
        },

        notif_combatSurrender: async function(args) {
            this._closeCombatDialog();
        },

        notif_combatCancelled: async function(args) {
            this._closeCombatDialog();
            // Restore the die visually
            if (args.die_index != null) {
                this.components.restoreDie(parseInt(args.player_id), parseInt(args.die_index));
            }
        },

        notif_equipmentSelected: async function(args) {
            this._closeCombatDialog();

            // Hide equipment strip
            var strip = document.getElementById('delphi-equipment-strip');
            if (strip) strip.style.display = 'none';

            // Add selected card to current player's equipment area (hand strip)
            if (parseInt(args.player_id) === this.player_id) {
                var cardNum = String(args.card_type_arg).padStart(3, '0');
                this.components.addEquipmentCard(
                    parseInt(args.card_id),
                    g_gamethemeurl + 'img/equipment/card-' + cardNum + '.jpg',
                    {
                        onClick: this.onEquipmentCardClick.bind(this),
                        isUsed: !!args.isUsed,
                        gameModule: this,
                        cardTypeArg: parseInt(args.card_type_arg),
                    }
                );
            }

            // Update player panel equipment row for all players
            if (typeof args.player_id !== 'undefined' && typeof args.card_id !== 'undefined') {
                var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
                if (ps) {
                    ps.equipment = ps.equipment || [];
                    var cardIdx = parseInt(args.card_type_arg, 10);
                    ps.equipment.push({ id: parseInt(args.card_id, 10), card_idx: cardIdx });
                    this.components.playerPanel.updateEquipment(args.player_id, ps.equipment, ps.equipmentCapacity);
                    // Reinforced Hull (card 16) — permanent +1 storage. Bump now and
                    // re-render the cargo row so the new slot appears.
                    if (cardIdx === 16) {
                        ps.storage = (ps.storage || 2) + 1;
                        this.components.playerPanel.updateCargo(args.player_id, this.gamedatas);
                    }
                    // Quadrireme (card 8) gives +1 movement; refresh the
                    // hex regardless of card so the panel stays in sync if
                    // future cards add range bonuses.
                    this._refreshMovementHex(args.player_id);
                }
            }
        },

        notif_loadCargo: async function(args) {
            if (args.item_type === 'offering') {
                this.components.removeOffering(args.item_id);
            } else {
                this.components.removeStatue(args.item_id);
            }
            if (parseInt(args.player_id) === this.player_id) {
                this.components.addToShipStorage(args.item_type, args.color);
            }
            // Update player panel cargo row for all players
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps) {
                ps.cargo.push({ id: args.item_id, color: args.color, type: args.item_type });
                this.components.playerPanel.updateCargo(args.player_id, this.gamedatas);
            }
        },

        notif_deliverCargo: async function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                var found = false;
                var self = this;
                this.components.cargoItems.forEach(function(data, slotIndex) {
                    if (!found && data.type === args.item_type && data.color === args.color) {
                        self.components.removeFromShipStorage(slotIndex);
                        found = true;
                    }
                });
            }
            // Update player panel cargo row for all players
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps) {
                var itemType = args.item_type;
                var itemId = String(args.item_id);
                ps.cargo = ps.cargo.filter(function(c) {
                    return !(c.type === itemType && String(c.id) === itemId);
                });
                this.components.playerPanel.updateCargo(args.player_id, this.gamedatas);
            }
            // Place on destination hex
            var destQ = parseInt(args.dest_q);
            var destR = parseInt(args.dest_r);
            var center = this.getHexCenterPixel(destQ, destR);
            if (center) {
                var hexKey = destQ + ',' + destR;
                if (args.item_type === 'offering') {
                    // Count existing offerings at this temple for slot assignment
                    var existingCount = 0;
                    if (this.components.offeringsByHex && this.components.offeringsByHex.has(hexKey)) {
                        existingCount = this.components.offeringsByHex.get(hexKey).length;
                    }
                    this.components.createOffering(
                        args.item_id, args.color,
                        center.x, center.y,
                        existingCount, hexKey
                    );
                } else {
                    // Statue raised at statue island — place on matching pedestal
                    var pedestalIndex = args.pedestal_index != null ? parseInt(args.pedestal_index) : 0;
                    var clusterRotation = args.cluster_rotation != null ? parseInt(args.cluster_rotation) : 0;
                    var offset = this.components.STATUE_PEDESTAL_OFFSETS[pedestalIndex] || { dx: 0, dy: 0 };
                    var rotated = this.components.rotateOffset(offset.dx, offset.dy, clusterRotation);
                    var statueEl = document.createElement('div');
                    statueEl.className = 'delphi-statue statue-' + args.color;
                    statueEl.id = 'statue_' + args.item_id;
                    statueEl.dataset.statueId = args.item_id;
                    statueEl.dataset.color = args.color;
                    statueEl.style.left = (center.x + rotated.dx) + 'px';
                    statueEl.style.top = (center.y + rotated.dy) + 'px';
                    this.components.boardPieces.appendChild(statueEl);
                    this.components.statues.set(parseInt(args.item_id), statueEl);
                }
            }
        },

        notif_favorTokensChanged: async function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                this.components.setFavorTokenCount(parseInt(args.favor_tokens));
            }
            this.components.playerPanel.updateFavor(args.player_id, parseInt(args.favor_tokens, 10));
        },

        notif_companionSelected: async function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                var cardTypeArg = parseInt(args.card_type_arg);
                var typeIndex = cardTypeArg % 3;
                var color = args.color;
                var imgUrl = g_gamethemeurl + 'img/companion/' + color + '-card-' + typeIndex + '.png';
                this.components.addCompanionCard(
                    parseInt(args.card_id),
                    args.subtype || 'companion',
                    color,
                    imgUrl
                );
            }
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps) {
                ps.companions = ps.companions || [];
                ps.companions.push({
                    id: parseInt(args.card_id, 10),
                    color: args.color,
                    subtype_idx: parseInt(args.card_type_arg, 10) % 3,
                });
                this.components.playerPanel.updateCompanions(args.player_id, ps.companions);
                // A creature companion of a color may add +3 to movement
                // when a die of that color is currently selected.
                this._refreshMovementHex(args.player_id);
            }
        },

        notif_consultOracle: async function(args) {
            this._clearActionBarOracleCards();
            this._clearGodAbilityIcons();
            this.components.setDiceWild(false);
        },

        notif_islandRevealed: function(args) {
            // NOTE: peekedCount in panelState is NOT decremented here because we
            // don't track client-side which players had peeked this specific hex.
            // The SQL query in getAllDatas() excludes is_revealed=1 hexes, so the
            // count is corrected on the next page reload. Follow-up: push a server-
            // side delta for each affected player if real-time accuracy is needed.
            var hexQ = parseInt(args.hex_q);
            var hexR = parseInt(args.hex_r);
            var shrineId = hexQ * 100 + hexR;
            var overlay = args.shrine_owner_color + '-' + args.shrine_letter;

            var el = this.components.shrines.get(shrineId);
            if (el) {
                // Replace the old overlay class with the correct one for the back face image
                var oldOverlay = el.dataset.overlay;
                if (oldOverlay) el.classList.remove('shrine-' + oldOverlay);
                el.classList.add('shrine-' + overlay);
                el.dataset.overlay = overlay;
                // Trigger the flip animation
                this.components.flipShrine(shrineId);
            } else {
                // Shrine overlay wasn't created at setup — create and flip it now
                var center = this.getHexCenterPixel(hexQ, hexR);
                if (center) {
                    this.components.createShrine(shrineId, overlay, center.x, center.y);
                    this.components.flipShrine(shrineId);
                }
            }
        },

        notif_shrineBuilt: function(args) {
            if (parseInt(args.player_id) !== this.player_id) return;

            var shrineIndex = parseInt(args.shrine_index);
            var hexQ = parseInt(args.hex_q);
            var hexR = parseInt(args.hex_r);
            var sortOrder = this._findShrineZeusSortOrder(args.shrine_letter);
            if (sortOrder < 0) return;

            // Find the shrine slot on the player board (positioned under matching Zeus tile)
            var shrineRows = document.querySelectorAll('#delphi-shrine-slots .shrine-row');
            var slotEl = shrineRows[sortOrder];
            if (!slotEl) return;

            var center = this.getHexCenterPixel(hexQ, hexR);
            if (!center) return;

            // Get source and destination positions relative to board-pieces container
            var boardPieces = document.getElementById('delphi-board-pieces');
            if (!boardPieces) return;
            var boardRect = boardPieces.getBoundingClientRect();
            var slotRect = slotEl.getBoundingClientRect();

            // Create flying piece at source position
            var flyingPiece = document.createElement('div');
            flyingPiece.className = 'delphi-shrine-piece-flying';
            flyingPiece.style.left = (slotRect.left - boardRect.left + slotRect.width / 2 - 15) + 'px';
            flyingPiece.style.top = (slotRect.top - boardRect.top + slotRect.height / 2 - 15) + 'px';
            boardPieces.appendChild(flyingPiece);

            // Hide from player board
            slotEl.classList.add('shrine-built');

            // Animate to destination
            var destX = center.x - 15;
            var destY = center.y - 15;
            var self = this;
            requestAnimationFrame(function() {
                flyingPiece.style.transition = 'left 0.8s ease-in-out, top 0.8s ease-in-out';
                flyingPiece.style.left = destX + 'px';
                flyingPiece.style.top = destY + 'px';
            });

            // After animation, replace with permanent piece
            setTimeout(function() {
                flyingPiece.remove();
                self._placeShrinePieceOnHex(center.x, center.y, shrineIndex);
            }, 850);
        },

        notif_shrineExplored: function(args) {
            // Log notification for deferred shrine bonuses (sigma, omega)
        },

        notif_oracleCardsDrawn: function(args) {
            // Public payload now carries real card identities so every panel
            // (including opponents') shows the actual colors. The active
            // player's main-board hand UI is still driven by the Private notif.
            if (!Array.isArray(args.cards) || args.cards.length === 0) return;
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (!ps) return;
            var chips = args.cards.map(function(c) { return { id: c.id || 0, color: c.color }; });
            ps.oracleHand = (ps.oracleHand || []).concat(chips);
            this.components.playerPanel.updateOracleHand(args.player_id, ps.oracleHand);
        },

        notif_oracleCardsDrawnPrivate: function(args) {
            // Drives only the active player's main-board hand UI now —
            // panel state is updated by the public oracleCardsDrawn notif.
            if (!args.cards) return;
            var self = this;
            args.cards.forEach(function(card) {
                self.components.addOracleCardToHand(card.color);
            });
        },

        notif_injuriesDiscarded: function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                this.components.removeAllInjuryCardsOfColor(args.color);
            }
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps && args.color) {
                ps.injuries = (ps.injuries || []).filter(function(x) { return x.color !== args.color; });
                this.components.playerPanel.updateInjuries(args.player_id, ps.injuries);
            }
        },

        notif_injuriesDiscardedByChoice: function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                this.components.removeAllInjuryCardsOfColor(args.color);
            }
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps && args.color) {
                ps.injuries = (ps.injuries || []).filter(function(x) { return x.color !== args.color; });
                this.components.playerPanel.updateInjuries(args.player_id, ps.injuries);
            }
        },

        notif_heroAutoDiscarded: function(args) {
            // Injury cards from combat / Titan never land in the hand, so
            // nothing to remove there. On the "acquire" source the matching
            // injuries were already in hand and need to be cleared.
            if (parseInt(args.player_id) === this.player_id && args.source === 'acquire') {
                this.components.removeAllInjuryCardsOfColor(args.color);
            }
            // Update injury bar when hero auto-discards from acquire (card was in hand).
            if (args.source === 'acquire' && args.color) {
                var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
                if (ps) {
                    ps.injuries = (ps.injuries || []).filter(function(x) { return x.color !== args.color; });
                    this.components.playerPanel.updateInjuries(args.player_id, ps.injuries);
                }
            }
        },

        notif_creatureMoveBonus: function(args) {
            // Log-only; the expanded range + color-agnostic end hex come
            // through the normal MoveShip state args.
        },

        notif_shieldIncreased: function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                this.components.setShieldValue(parseInt(args.value), args.playerColor);
            }
            this.components.playerPanel.updateShield(args.player_id, parseInt(args.value, 10));
        },

        notif_godAdvanced: function(args) {
            var newRow = parseInt(args.new_row, 10);
            this.components.positionGodToken(parseInt(args.player_id), args.god_name, newRow);
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps) {
                ps.gods = ps.gods || {};
                ps.gods[args.god_name] = { god: args.god_name, row: newRow };
            }
            this.components.playerPanel.updateGodRow(args.player_id, args.god_name, newRow);
        },

        notif_godReset: function(args) {
            this.components.positionGodToken(
                parseInt(args.player_id),
                args.god_name,
                0
            );
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps) {
                ps.gods = ps.gods || {};
                ps.gods[args.god_name] = { god: args.god_name, row: 0 };
            }
            this.components.playerPanel.updateGodRow(args.player_id, args.god_name, 0);
        },

        notif_godAbilityUsed: function(args) {
            if (args.ability === 'discard_all_injuries' && parseInt(args.player_id) === this.player_id) {
                this.components.clearAllInjuryCards();
            }
            if (args.ability === 'discard_all_injuries') {
                var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
                if (ps) {
                    ps.injuries = [];
                    this.components.playerPanel.updateInjuries(args.player_id, ps.injuries);
                }
            }
            if (args.ability === 'dice_wild') {
                if (parseInt(args.player_id) === this.player_id) {
                    this.components.setDiceWild(true);
                    // Wild card identity arrives via apolloWildCardPrivate (private notif).
                }
            }
        },

        notif_apolloWildCardPrivate: function(args) {
            if (args.wild_card_color) {
                this.components.addOracleCardToHand(args.wild_card_color, true);
            }
        },

        notif_cancelGodAbility: function(args) {
        },

        notif_oracleCardDrawn: function(args) {
            // Public payload now carries the card color so every panel
            // (including opponents') shows the real chip.
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (!ps || !args.card_color) return;
            ps.oracleHand = (ps.oracleHand || []).concat([{ id: args.card_id || 0, color: args.card_color }]);
            this.components.playerPanel.updateOracleHand(args.player_id, ps.oracleHand);
        },

        notif_oracleCardDrawnPrivate: function(args) {
            // Drives only the active player's main-board hand UI now —
            // panel state is updated by the public oracleCardDrawn notif.
            this.components.addOracleCardToHand(args.card_color);
        },

        notif_oracleCardPlayed: function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                this.components.playOracleCard(args.card_color);
                // Rotate the played card in the action bar, gray out the others
                var cardsBar = document.getElementById('delphi-action-oracle-cards');
                if (cardsBar) {
                    cardsBar.querySelectorAll('.action-oracle-card').forEach(function(el) {
                        if (el.dataset.color === args.card_color) {
                            el.classList.add('action-card-active');
                        } else {
                            el.classList.add('action-card-inactive');
                        }
                    });
                }
            }
            // Remove the played color from the player's panel hand for everyone.
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps && ps.oracleHand) {
                var removed = false;
                ps.oracleHand = ps.oracleHand.filter(function(c) {
                    if (!removed && c.color === args.card_color) { removed = true; return false; }
                    return true;
                });
                this.components.playerPanel.updateOracleHand(args.player_id, ps.oracleHand);
            }
        },

        notif_oracleCardDiscarded: function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                this.components.clearPlayedOracleCard();
                // Mark the active card as used (action completed)
                var cardsBar = document.getElementById('delphi-action-oracle-cards');
                if (cardsBar) {
                    cardsBar.querySelectorAll('.action-card-active').forEach(function(el) {
                        el.classList.remove('action-card-active');
                        el.classList.add('action-card-used');
                    });
                }
            }
        },

        notif_oracleCardCancelled: function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                this.components.clearPlayedOracleCard();
                this.components.addOracleCardToHand(args.card_color);
                // Rotate back — remove active and used states from all action bar cards
                var cardsBar = document.getElementById('delphi-action-oracle-cards');
                if (cardsBar) {
                    cardsBar.querySelectorAll('.action-oracle-card').forEach(function(el) {
                        el.classList.remove('action-card-active', 'action-card-inactive', 'action-card-used');
                    });
                }
            }
            // Put the cancelled card's color back into the player's panel hand for everyone.
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps && args.card_color) {
                ps.oracleHand = (ps.oracleHand || []).concat([{ id: args.card_id || 0, color: args.card_color }]);
                this.components.playerPanel.updateOracleHand(args.player_id, ps.oracleHand);
            }
        },

        notif_favorTokensTaken: function(args) {
            if (parseInt(args.player_id) === this.player_id) {
                this.components.setFavorTokenCount(parseInt(args.favor_tokens));
            }
            this.components.playerPanel.updateFavor(args.player_id, parseInt(args.favor_tokens, 10));
        },

        notif_dieRecolored: function(args) {
            var dieIndex = parseInt(args.die_index);
            if (parseInt(args.player_id) === this.player_id) {
                this.components.setFavorTokenCount(parseInt(args.favor_tokens));
                this.components.recolorDie(this.player_id, dieIndex, args.target_color);
            }
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps) {
                if (ps.dice && args.target_color) {
                    ps.dice.forEach(function(d) { if (d.idx === dieIndex) d.color = args.target_color; });
                    this.components.playerPanel.updateDice(args.player_id, ps.dice);
                }
                if (typeof args.favor_tokens !== 'undefined') {
                    ps.favorTokens = parseInt(args.favor_tokens, 10);
                    this.components.playerPanel.updateFavor(args.player_id, ps.favorTokens);
                }
            }
            // If the recolored die was the active selection, the cached
            // color is now stale — point _selectedDieColors at the new
            // color and refresh the hex so the companion-match check uses
            // the current value.
            this._selectedDieColors = this._selectedDieColors || {};
            if (this._selectedDieColors[args.player_id] != null && args.target_color) {
                this._selectedDieColors[args.player_id] = args.target_color;
                this._refreshMovementHex(args.player_id);
            }
        },

        notif_injuriesRecovered: function(args) {
            if (parseInt(args.player_id) === this.player_id && args.colors) {
                var self = this;
                args.colors.forEach(function(color) {
                    self.components.removeInjuryCard(color);
                });
            }
            // Update injury bar for all players using the colors array from the payload.
            if (args.colors) {
                var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
                if (ps) {
                    var injuries = ps.injuries ? ps.injuries.slice() : [];
                    args.colors.forEach(function(color) {
                        var entry = injuries.find(function(x) { return x.color === color; });
                        if (entry) {
                            entry.n = parseInt(entry.n, 10) - 1;
                            if (entry.n <= 0) {
                                injuries = injuries.filter(function(x) { return x.color !== color; });
                            }
                        }
                    });
                    ps.injuries = injuries;
                    this.components.playerPanel.updateInjuries(args.player_id, ps.injuries);
                }
            }
        },

        notif_islandsPeeked: function(args) {
            // Set correct back-face image and reveal shrine overlays
            this._peekedShrineIds = [];
            if (args.islands) {
                var self = this;
                args.islands.forEach(island => {
                    var shrineId = parseInt(island.q) * 100 + parseInt(island.r);
                    var ownerColor = island.shrine_owner_color;
                    var letter = island.shrine_letter;
                    var el = self.components.shrines.get(shrineId);
                    if (el && ownerColor && letter && ownerColor !== 'empty') {
                        var overlay = ownerColor + '-' + letter;
                        var oldOverlay = el.dataset.overlay;
                        if (oldOverlay) el.classList.remove('shrine-' + oldOverlay);
                        el.classList.add('shrine-' + overlay);
                        el.dataset.overlay = overlay;
                        el.classList.add('shrine-revealed');
                    } else if (el) {
                        el.classList.add('shrine-revealed');
                    }
                    self._peekedShrineIds.push(shrineId);
                });
            }
            // islandsPeeked is private — the recipient is always this.player_id.
            // Increment by the number of islands peeked in this action (args.count).
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[this.player_id];
            if (ps) {
                ps.peekedCount = (ps.peekedCount || 0) + (args.count || 1);
                this.components.playerPanel.updatePeeked(this.player_id, ps.peekedCount);
            }
        },

        notif_peekEnded: function(args) {
            // Hide shrine overlays and restore unknown back face
            if (this._peekedShrineIds) {
                var self = this;
                this._peekedShrineIds.forEach(shrineId => {
                    var el = self.components.shrines.get(shrineId);
                    if (el) {
                        el.classList.remove('shrine-revealed');
                        var overlay = el.dataset.overlay;
                        if (overlay) el.classList.remove('shrine-' + overlay);
                        el.classList.add('shrine-unknown');
                        el.dataset.overlay = 'unknown';
                    }
                });
                this._peekedShrineIds = null;
            }
        },

        notif_playerPeekedIslands: function(args) {
        },

        notif_endTurn: async function(args) {
            this._clearActionBarOracleCards();
            this._clearGodAbilityIcons();
        },

        notif_reachedZeus: function(args) {
            // Log-only; the shipMoved notif has already animated the ship,
            // and the state machine transitions to PreEndGame -> EndScore.
        },

        notif_zeusTileDiscarded: function(args) {
            this.components.removeZeusTile(args.tile_id);
        },

        notif_titanRoll: async function(args) {
            var die = document.getElementById('delphi-titan-die');
            if (!die) return;
            var face = die.querySelector('.titan-die-face');
            var label = die.querySelector('.titan-die-label');
            if (face) face.textContent = String(args.value);
            if (label) label.textContent = _('The Titan attacks!');
            // Restart the spin animation by toggling active off first
            die.classList.remove('active');
            void die.offsetWidth;
            die.classList.add('active');
            // Hold the face visible briefly, then fade out
            await new Promise(r => setTimeout(r, 1800));
            die.classList.remove('active');
        },

        notif_titanNoInjury: function(args) {
            // Log-only — no hand change.
        },

        notif_titanInjury: function(args) {
            // Public notif — count/colors for the log. Hand update arrives
            // via titanInjuryPrivate so opponents don't see specific card ids.
            // Update injury bar for everyone using the public colors array.
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps && Array.isArray(args.colors)) {
                ps.injuries = ps.injuries || [];
                args.colors.forEach(function(color) {
                    var existing = ps.injuries.find(function(x) { return x.color === color; });
                    if (existing) existing.n = parseInt(existing.n, 10) + 1;
                    else ps.injuries.push({ color: color, n: 1 });
                });
                this.components.playerPanel.updateInjuries(args.player_id, ps.injuries);
            }
        },

        notif_titanInjuryPrivate: function(args) {
            this.components.addInjuryCard(args.color);
        },

        notif_injuryDeckReshuffled: function(args) {
            // Log-only; deck/discard are piles (no per-card UI to update).
        },

        // Start-of-game setup notifications — log-only.
        // Game state is already populated from getAllDatas() on client load,
        // so these handlers exist solely to acknowledge the notif and keep
        // the BGA framework happy while the message is written to the log.
        notif_startingShipTile: function(args) {
        },

        notif_startingResources: function(args) {
        },

        notif_startingInjuryDrawn: function(args) {
        },

        notif_startingInjuryDrawnPrivate: function(args) {
        },

        notif_startingBonusCards: function(args) {
        },

        notif_startingBonusCardsPrivate: function(args) {
        },

        notif_startingDiceRolled: function(args) {
        }
   });
});
