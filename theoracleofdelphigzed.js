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
    g_gamethemeurl + "modules/js/HexGrid.js?v186",
    g_gamethemeurl + "modules/js/Components.js?v186",
    g_gamethemeurl + "modules/js/ClusterDefinitions.js?v186",
    g_gamethemeurl + "modules/js/BoardBuilder.js?v186",
    g_gamethemeurl + "modules/js/BoardRenderer.js?v186",
    g_gamethemeurl + "modules/BX/js/DragScroller.js?v186",
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
        // Keep in sync with the ?v186 markers in the define() block above.
        JS_VERSION: "v186",

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
        '</div>' +
    '</div>' +
    // Card-supply strip — sits between the hex board and the player
    // area. Bottom-anchored "shelf" with the equipment supply (deck +
    // 6 face-up cards) on the left and the three other decks
    // (oracle, injury, companion) on the right. Decks/cards land in
    // these placeholder slots in subsequent commits; this commit only
    // wires the layout skeleton.
    '<div id="delphi-supply-strip">' +
        '<div id="delphi-supply-equipment">' +
            '<div class="supply-deck supply-deck-landscape deck-has-back" id="supply-deck-equipment" data-deck="equipment"></div>' +
            '<div id="supply-equipment-cards">' +
                '<div class="supply-equipment-slot" id="supply-equipment-slot-0" data-slot="0"></div>' +
                '<div class="supply-equipment-slot" id="supply-equipment-slot-1" data-slot="1"></div>' +
                '<div class="supply-equipment-slot" id="supply-equipment-slot-2" data-slot="2"></div>' +
                '<div class="supply-equipment-slot" id="supply-equipment-slot-3" data-slot="3"></div>' +
                '<div class="supply-equipment-slot" id="supply-equipment-slot-4" data-slot="4"></div>' +
                '<div class="supply-equipment-slot" id="supply-equipment-slot-5" data-slot="5"></div>' +
            '</div>' +
        '</div>' +
        // Public favor pool — sits between the equipment region and the
        // other decks on the supply strip. Six rotated/offset chips
        // beneath an upright top chip (fixed transforms so the pile is
        // identical on every load). Activation is toggled by
        // onUpdateActionButtons in SelectAction (no Apollo recolor) and
        // NoInjuryBonus.
        '<div id="delphi-favor-pile" class="favor-pile" tabindex="0" role="button" aria-label="Take 2 Favor Tokens">' +
            '<div class="favor-pile-chip" style="transform: rotate(-32deg) translate(-22px, 12px)"></div>' +
            '<div class="favor-pile-chip" style="transform: rotate(28deg) translate(20px, 14px)"></div>' +
            '<div class="favor-pile-chip" style="transform: rotate(-12deg) translate(2px, 22px)"></div>' +
            '<div class="favor-pile-chip" style="transform: rotate(35deg) translate(-10px, -14px)"></div>' +
            '<div class="favor-pile-chip" style="transform: rotate(-22deg) translate(18px, -12px)"></div>' +
            '<div class="favor-pile-chip" style="transform: rotate(8deg) translate(-18px, -8px)"></div>' +
            '<div class="favor-pile-chip favor-pile-top"></div>' +
        '</div>' +
        '<div id="delphi-supply-decks">' +
            '<div class="supply-deck supply-deck-landscape deck-has-back" id="supply-deck-oracle" data-deck="oracle"></div>' +
            '<div class="supply-deck supply-deck-landscape deck-has-back" id="supply-deck-injury" data-deck="injury"></div>' +
            '<div class="supply-deck supply-deck-portrait" id="supply-deck-companion" data-deck="companion"></div>' +
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

// Modal card picker — replaces the old top-of-screen strip for both
// equipment selection (post-combat) and companion selection (post-reward).
// Centered floating card with a dimmed/blurred backdrop; cards stagger
// in with a small lift; confirm/cancel live on the dialog footer
// instead of in the action bar. _showCardPicker / _hideCardPicker
// drive entry + exit, _showEquipmentStrip + _showCompanionStrip keep
// their existing names as thin wrappers.
'<div id="delphi-card-picker-backdrop" class="card-picker-backdrop"></div>' +
'<div id="delphi-card-picker" role="dialog" aria-modal="true" aria-labelledby="card-picker-title">' +
    '<div class="card-picker-title" id="card-picker-title"></div>' +
    '<div class="card-picker-cards" id="card-picker-cards"></div>' +
    '<div class="card-picker-actions" id="card-picker-actions"></div>' +
'</div>' +

'<div id="delphi-titan-backdrop" class="card-picker-backdrop"></div>' +
'<div id="delphi-titan-popup" role="dialog" aria-modal="true" aria-labelledby="titan-popup-title">' +
    '<div class="titan-popup-title" id="titan-popup-title"></div>' +
    '<div class="titan-popup-die-row">' +
        '<div class="titan-popup-die-face"></div>' +
    '</div>' +
    '<div class="titan-popup-grid" id="titan-popup-grid"></div>' +
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
            // Companion-card counterpart: 18 entries (6 colors × 3 types)
            // keyed by card_type_arg with {name, subtype, description, color}.
            this.companionDefs = gamedatas.companionDefs || {};

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

                // Inactive viewers in PlayerActions see "${actplayer} must
                // select an Oracle die" with their OWN dice mounted to the
                // right. Sit a "- Your Oracle die are" label as a sibling
                // of the wrapper (not a flex child) so it shares the title
                // bar's text baseline — pulling it inside the inline-flex
                // wrapper offset its vertical alignment vs #pagemaintitletext.
                // Hidden by default; toggled visible by PlayerActions
                // onEntering/onLeaving when !isCurrentPlayerActive.
                var diceLabel = document.createElement('span');
                diceLabel.id = 'delphi-your-dice-label';
                diceLabel.textContent = _(' - Your Oracle die are');
                wrapper.parentNode.insertBefore(diceLabel, wrapper);

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
                // Mid-turn reload: if an oracle card was played but its
                // resolution hasn't completed, move the played card from
                // the hand strip into the played-area (rotated wrapper)
                // so the visual matches the server-side oracle_card_played
                // global. setupHandCardsFromGamedata always adds to hand
                // first because the server keeps the played card in the
                // hand row; playOracleCard handles the remove + place.
                if (gamedatas.oracleCardPlayed && gamedatas.selectedOracleCardId) {
                    var oracleColors = ['red', 'yellow', 'green', 'blue', 'pink', 'black'];
                    var playedCard = (gamedatas.hand || []).find(function(c) {
                        return c.cardType === 'oracle'
                            && parseInt(c.id) === parseInt(gamedatas.selectedOracleCardId);
                    });
                    if (playedCard) {
                        var playedColor = oracleColors[parseInt(playedCard.cardTypeArg)] || 'red';
                        this.components.playOracleCard(playedColor);
                    }
                }
                this.setupActionBarOracleCards(gamedatas);
                this.setupShipTileFromGamedata(gamedatas);
                this.setupShipStorageFromGamedata(gamedatas);
                this.setupDefeatedMonstersFromGamedata(gamedatas);
                this._renderEquipmentSupply(gamedatas.equipmentDisplay);
                this._renderCompanionDeckTop(gamedatas.companionDeckTopCard);
                this._renderDeckTooltips();
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

            // Click-to-fight via the island tile: if SelectAction has a
            // fightable monster on this hex, dispatch actFightMonster
            // even when the user didn't click the small monster sprite
            // directly. _fightableMonstersByHex is populated by
            // onUpdateActionButtons during SelectAction.
            var hexKey = q + ',' + r;
            if (this._fightableMonstersByHex && this._fightableMonstersByHex[hexKey]) {
                this.bgaPerformAction("actFightMonster", {
                    monster_id: this._fightableMonstersByHex[hexKey],
                });
                return;
            }

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

            // SelectAction shortcut: clicking your own ship while a die is
            // selected dispatches actMoveShip (same as the status-bar
            // Move Ship button). Skipped in the apolloNeedsRecolor branch
            // since that state blocks normal actions until the recolor
            // completes.
            if (this.isCurrentPlayerActive() && playerId === this.player_id) {
                var gs = this.gamedatas && this.gamedatas.gamestate;
                var stateName = gs && gs.name;
                var stateArgs = (gs && gs.args) || {};
                if (stateName === 'SelectAction'
                        && stateArgs.dieColor
                        && !stateArgs.apolloNeedsRecolor) {
                    this.bgaPerformAction("actMoveShip", {});
                    return;
                }
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

        // Stable shrine id from a hex coord pair. Used by every site that
        // looks up a shrine for a given (q, r) — the marker code, the peek
        // notif handlers, the reveal handler, and setup.
        _shrineIdFromHex: function(q, r) {
            return parseInt(q) * 100 + parseInt(r);
        },

        // Persistent peek marker on an unrevealed island hex this player has
        // already peeked. The marker sits as a non-flipped sibling of the
        // shrine's flipper so it stays visible in 2D regardless of the 3D
        // flip state; CSS hides it on .shrine-revealed once the island is
        // explored. Hover tooltip shows the back-face image so the player
        // can recall what they saw without re-peeking.
        _markIslandPeeked: function(shrineId, color, letter) {
            var el = this.components.shrines.get(parseInt(shrineId));
            if (!el) return;
            el.classList.add('shrine-peeked');
            if (!el.querySelector('.shrine-peek-marker')) {
                var marker = document.createElement('div');
                marker.className = 'shrine-peek-marker';
                el.appendChild(marker);
            }
            var imgUrl = g_gamethemeurl
                + 'img/shrine-overlay/shrine-' + color + '-' + letter + '.png';
            var html = '<div class="shrine-peek-tooltip" style="background-image:url(\''
                + imgUrl + '\')"></div>';
            try { this.removeTooltip(el.id); } catch (e) { /* not yet bound */ }
            this.addTooltipHtml(el.id, html);
        },

        _unmarkIslandPeeked: function(shrineId) {
            var el = this.components.shrines.get(parseInt(shrineId));
            if (!el) return;
            el.classList.remove('shrine-peeked');
            var marker = el.querySelector('.shrine-peek-marker');
            if (marker) marker.remove();
            try { this.removeTooltip(el.id); } catch (e) { /* not bound */ }
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
         * Handle monster click (game action when targetable). When a die
         * or oracle card is selected and that monster — OR any monster on
         * the same hex — is in the active player's fightableMonsters set,
         * dispatch actFightMonster against the fightable id. The hex
         * fallback covers monster stacks: the user can click any chip on
         * the pile and the click resolves to the fightable monster on
         * that island, even if it's buried beneath others in the stack.
         */
        onMonsterClick: function(monsterId, hexKey) {
            var fightable = this._fightableMonsterIds || {};
            if (fightable[monsterId]) {
                this.bgaPerformAction("actFightMonster", { monster_id: monsterId });
                return;
            }
            if (hexKey) {
                var hexFightable = this._fightableMonstersByHex || {};
                var stackedFightableId = hexFightable[hexKey];
                if (stackedFightableId) {
                    this.bgaPerformAction("actFightMonster", { monster_id: stackedFightableId });
                    return;
                }
            }
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

        // Same activation pattern as the favor pile, applied to the
        // oracle deck on the supply strip. Active state adds a click
        // handler that dispatches actDrawOracleCard. Wired into
        // onUpdateActionButtons in the SelectAction case so the deck
        // becomes interactive whenever the status-bar Draw Oracle Card
        // button is also being added.
        _activateOracleDeck: function() {
            this._deactivateOracleDeck();
            var deck = document.getElementById('supply-deck-oracle');
            if (!deck) return;
            deck.classList.add('supply-deck-active');
            var self = this;
            this._oracleDeckClickHandler = function() {
                self.bgaPerformAction('actDrawOracleCard', {});
            };
            deck.addEventListener('click', this._oracleDeckClickHandler);
        },

        _deactivateOracleDeck: function() {
            var deck = document.getElementById('supply-deck-oracle');
            if (!deck) return;
            deck.classList.remove('supply-deck-active');
            if (this._oracleDeckClickHandler) {
                deck.removeEventListener('click', this._oracleDeckClickHandler);
                this._oracleDeckClickHandler = null;
            }
        },

        // Click-to-load affordance shared by statues and offerings.
        // Park the chosen item id on _preferredLoadItemId so LoadCargo's
        // auto-confirm path can prefer it over loadItems[0]. Items must
        // each carry { id, type } where type is 'statue' or 'offering'
        // (matches the DOM id prefix on the board piece).
        _setupClickToLoadHandlers: function(items, actionName) {
            this._teardownClickToLoadHandlers();
            var self = this;
            this._clickToLoadHandlers = [];
            items.forEach(function(item) {
                var el = document.getElementById(item.type + '_' + item.id);
                if (!el) return;
                el.classList.add('cargo-selectable');
                var handler = function(e) {
                    e.stopPropagation();
                    // Tear down before dispatching so a slow/failed
                    // bgaPerformAction can't double-fire on a second click.
                    self._teardownClickToLoadHandlers();
                    self._preferredLoadItemId = parseInt(item.id);
                    self.bgaPerformAction(actionName, {});
                };
                el.addEventListener('click', handler);
                self._clickToLoadHandlers.push({ el: el, handler: handler });
            });
        },

        _teardownClickToLoadHandlers: function() {
            if (!this._clickToLoadHandlers) return;
            this._clickToLoadHandlers.forEach(function(entry) {
                entry.el.classList.remove('cargo-selectable');
                entry.el.removeEventListener('click', entry.handler);
            });
            this._clickToLoadHandlers = null;
        },

        // Dedupe a {dest_q, dest_r}-bearing list to a {q, r} hex array
        // ready for _highlightValidHexes. Used by the click-to-deliver
        // affordance (Make Offering / Raise Statue) — the server may
        // emit one entry per cargo item, but multiple items can share
        // a destination (one matching-color temple, statue islands
        // that accept the die color).
        _uniqueDestHexes: function(items) {
            var seen = new Set();
            var hexes = [];
            (items || []).forEach(function(item) {
                var key = item.dest_q + ',' + item.dest_r;
                if (seen.has(key)) return;
                seen.add(key);
                hexes.push({ q: item.dest_q, r: item.dest_r });
            });
            return hexes;
        },

        // Wheel-order index drives both the slot positions on the board
        // and the cost arithmetic in the recolor flow. BETWEEN_POSITIONS[i]
        // sits between WHEEL_ORDER[i] and WHEEL_ORDER[(i+1) % 6] on the
        // wheel. `rotationStep` is the per-position rotation in degrees
        // (0° at black↔pink, +60° per step clockwise around the wheel);
        // the recolor overlay's actual transform combines this with a
        // -45° base to render the favor chip as a diamond.
        WHEEL_ORDER: ['red', 'black', 'pink', 'blue', 'yellow', 'green'],
        BETWEEN_POSITIONS: [
            { x: 57.5,  y: 88,    rotationStep: 308 }, // red ↔ black    (slight off-axis tilt)
            { x: 170,   y: 30,    rotationStep: 0   }, // black ↔ pink
            { x: 280.5, y: 83,    rotationStep: 60  }, // pink ↔ blue
            { x: 290.5, y: 196.5, rotationStep: 126 }, // blue ↔ yellow  (slight off-axis tilt)
            { x: 172,   y: 256,   rotationStep: 180 }, // yellow ↔ green
            { x: 50.5,  y: 200.5, rotationStep: 240 }, // green ↔ red
        ],
        // Base rotation applied to every chip (renders the square favor
        // token as a diamond). The per-position rotationStep is added on
        // top via the --rot custom property in JS.
        RECOLOR_BASE_ROTATION: -45,
        WHEEL_CENTER: { x: 167, y: 138 },
        // Chip size (must match .recolor-arrow CSS). Used to compute the
        // top-left from the between-position center.
        RECOLOR_ARROW_W: 30,
        RECOLOR_ARROW_H: 30,
        // Cost-label center distance from the between-position, radially
        // outward. Smaller value = label sits closer to (or overlaps) the
        // chip on the outer end.
        RECOLOR_LABEL_OFFSET: 30,

        // Render up-to-5 recolor target arrows on the wheel for the
        // active player's currently selected die. Skips:
        //  - apolloNeedsRecolor (separate free-recolor flow handles this)
        //  - oracle-card source (cards aren't recolorable)
        //  - the wrap-around-to-current target
        //  - any target whose cost exceeds the player's favor
        // Cost rules mirror enterRecolorMode: reverse_recolor halves the
        // distance to the cheaper of CW/CCW; recolor_discount drops every
        // non-zero cost by 1 (floor 0).
        _setupRecolorArrows: function(args) {
            this._clearRecolorArrows();
            if (!args || !args.dieColor) return;
            if (args.apolloNeedsRecolor) return;
            if (args.isOracleCard) return;

            var wheel = document.getElementById('delphi-oracle-wheel');
            if (!wheel) return;

            var currentIdx = this.WHEEL_ORDER.indexOf(args.dieColor);
            if (currentIdx < 0) return;

            var playerFavor = parseInt(args.playerFavor) || 0;
            var reverseRecolor = args.reverseRecolor === true;
            var recolorDiscount = args.recolorDiscount === true;
            var n = this.WHEEL_ORDER.length;
            var center = this.WHEEL_CENTER;
            var labelOffset = this.RECOLOR_LABEL_OFFSET;
            var self = this;

            for (var step = 1; step < n; step++) {
                var targetIdx = (currentIdx + step) % n;
                var targetColor = this.WHEEL_ORDER[targetIdx];
                var baseCost = reverseRecolor ? Math.min(step, n - step) : step;
                var cost = recolorDiscount ? Math.max(0, baseCost - 1) : baseCost;
                if (cost > playerFavor) continue;

                var betweenIdx = (currentIdx + step - 1) % n;
                var pos = this.BETWEEN_POSITIONS[betweenIdx];

                var arrow = document.createElement('div');
                arrow.className = 'recolor-arrow';
                arrow.dataset.target = targetColor;
                arrow.dataset.cost = cost;
                arrow.style.left = (pos.x - this.RECOLOR_ARROW_W / 2) + 'px';
                arrow.style.top  = (pos.y - this.RECOLOR_ARROW_H / 2) + 'px';
                arrow.style.setProperty('--rot', (this.RECOLOR_BASE_ROTATION + pos.rotationStep) + 'deg');
                arrow.addEventListener('click', function(e) {
                    var color = e.currentTarget.dataset.target;
                    self.bgaPerformAction('actRecolorDie', { targetColor: color });
                });
                wheel.appendChild(arrow);

                // Cost badge sits radially outside the arrow.
                var dx = pos.x - center.x;
                var dy = pos.y - center.y;
                var len = Math.sqrt(dx * dx + dy * dy) || 1;
                var label = document.createElement('div');
                label.className = 'recolor-cost-label';
                label.textContent = cost;
                label.style.left = (pos.x + (dx / len) * labelOffset) + 'px';
                label.style.top  = (pos.y + (dy / len) * labelOffset) + 'px';
                wheel.appendChild(label);
            }
        },

        _clearRecolorArrows: function() {
            var wheel = document.getElementById('delphi-oracle-wheel');
            if (!wheel) return;
            wheel.querySelectorAll('.recolor-arrow, .recolor-cost-label').forEach(function(el) {
                el.remove();
            });
        },

        // Convenience wrapper around _flyCard for the deck → hand
        // case (oracle / injury). Routes the destination based on
        // viewer perspective: when the viewer is the player gaining
        // the card, animate to their own full-size hand area on the
        // left side of the player area. For opponents (or anyone else
        // viewing), animate to that player's panel row instead, since
        // the opponent's hand area isn't rendered for non-active
        // viewers. Multiple flights stagger by 120ms so a multi-draw
        // reads as a sequence rather than overlapping clones.
        _DECK_TO_PANEL_TARGETS: {
            oracle: {
                deckId:     'supply-deck-oracle',
                selfDestId: 'delphi-oracle-cards-area',
                panelPrefix:'pp-oracle-hand-',
                backImg:    'img/oracle/card-back.jpg',
            },
            injury: {
                deckId:     'supply-deck-injury',
                selfDestId: 'delphi-injury-cards-area',
                panelPrefix:'pp-injury-bar-',
                backImg:    'img/injury/card-back.jpg',
            },
        },
        _flyDeckCardToPanel: function(deckType, playerId, count) {
            var def = this._DECK_TO_PANEL_TARGETS[deckType];
            if (!def || !count) return;
            var deckEl = document.getElementById(def.deckId);
            if (!deckEl) return;
            // BGA can deliver this.player_id as a string or a number depending
            // on the framework version — coerce both sides so the self-routing
            // doesn't silently fall through to the panel branch on mismatched
            // types (the original bug for the Titan injury flight).
            var isSelf = parseInt(playerId) === parseInt(this.player_id);
            var destId = (isSelf && def.selfDestId)
                ? def.selfDestId
                : def.panelPrefix + playerId;
            var destEl = document.getElementById(destId);
            if (!destEl) return;
            var bgImg = "url('" + g_gamethemeurl + def.backImg + "')";
            var self = this;
            for (var i = 0; i < count; i++) {
                (function(stagger) {
                    setTimeout(function() {
                        self._flyCard({
                            from: deckEl,
                            to: destEl,
                            backgroundImage: bgImg,
                        });
                    }, stagger);
                })(i * 120);
            }
        },

        // Generic source-to-destination card animation. Used by the
        // supply strip for equipment refills, oracle draws, injury
        // distribution and companion awards. Spawns a body-level
        // .delphi-flying-card clone, sized to the source's bounding
        // box, then animates it via the @keyframes delphi-card-fly
        // rule. The CSS custom properties (--fly-dx/dy/scale) carry
        // the deltas so source and destination sizes don't have to
        // match. Falls back to immediate completion if either anchor
        // isn't in the DOM (e.g. mid-state transition).
        //
        // opts:
        //   from:            element OR selector for the source
        //   to:              element OR selector for the destination
        //   backgroundImage: optional inline image (defaults to source's
        //                    computed background-image — useful for
        //                    decks where the source already shows the
        //                    right image)
        //   className:       CSS class to drive the flight (defaults to
        //                    'delphi-flying-card'; pass
        //                    'delphi-flying-piece' for transparent board
        //                    pieces that need a silhouette drop-shadow
        //                    instead of the card's rectangle box-shadow)
        //   onLanding:       callback after the clone is removed
        _flyCard: function(opts) {
            opts = opts || {};
            var src = typeof opts.from === 'string'
                ? document.querySelector(opts.from)
                : opts.from;
            var dst = typeof opts.to === 'string'
                ? document.querySelector(opts.to)
                : opts.to;
            if (!src || !dst) {
                if (opts.onLanding) opts.onLanding();
                return;
            }
            var srcRect = src.getBoundingClientRect();
            var dstRect = dst.getBoundingClientRect();
            if (!srcRect.width || !srcRect.height) {
                if (opts.onLanding) opts.onLanding();
                return;
            }
            var clone = document.createElement('div');
            clone.className = opts.className || 'delphi-flying-card';
            clone.style.left = srcRect.left + 'px';
            clone.style.top = srcRect.top + 'px';
            clone.style.width = srcRect.width + 'px';
            clone.style.height = srcRect.height + 'px';
            clone.style.backgroundImage = opts.backgroundImage
                || getComputedStyle(src).backgroundImage;
            var dx = (dstRect.left + dstRect.width / 2)
                   - (srcRect.left + srcRect.width / 2);
            var dy = (dstRect.top + dstRect.height / 2)
                   - (srcRect.top + srcRect.height / 2);
            clone.style.setProperty('--fly-dx', dx + 'px');
            clone.style.setProperty('--fly-dy', dy + 'px');
            // No non-uniform scaling — destination elements like the
            // oracle hand area are column-stacked containers whose
            // bounding rect is much taller than a single card. Scaling
            // the clone to match would stretch it vertically and
            // distort the artwork. The clone keeps its source size
            // throughout flight and lands centered on the target.
            clone.style.setProperty('--fly-scale-x', 1);
            clone.style.setProperty('--fly-scale-y', 1);
            // Rotation interpolated by the keyframe — used by the equipment
            // refill flight to turn the portrait card-back into landscape
            // orientation as it lands. Pivot from center so the clone stays
            // aligned on the destination throughout the rotation; default
            // origin (top-left) would shift the visual off the slot.
            if (opts.rotation) {
                clone.style.setProperty('--fly-rotation', opts.rotation + 'deg');
                clone.style.transformOrigin = 'center';
            }
            document.body.appendChild(clone);
            var done = false;
            var finish = function() {
                if (done) return;
                done = true;
                if (clone.parentNode) clone.parentNode.removeChild(clone);
                if (opts.onLanding) opts.onLanding();
            };
            clone.addEventListener('animationend', finish, { once: true });
            // Safety net if animationend never fires. Sized for the slowest
            // _flyCard caller (.delphi-flying-piece at 1200ms, used for
            // hex-board-to-player-board flights) plus headroom.
            setTimeout(finish, 1500);
        },

        // The companion deck has no card-back artwork, so its slot
        // shows the actual top card face-up. Server provides
        // gamedatas.companionDeckTopCard at setup and a new_top_card
        // field on each companionSelected notif. Pass null to clear
        // the slot (deck empty).
        COMPANION_COLORS: ['red', 'yellow', 'green', 'blue', 'pink', 'black'],
        _renderCompanionDeckTop: function(card) {
            var slot = document.getElementById('supply-deck-companion');
            if (!slot) return;
            if (!card || card.cardTypeArg == null) {
                slot.classList.remove('companion-has-card');
                slot.style.backgroundImage = '';
                delete slot.dataset.cardId;
                delete slot.dataset.cardTypeArg;
                return;
            }
            var typeArg = parseInt(card.cardTypeArg);
            var colorIdx = Math.floor(typeArg / 3);
            var subtypeIdx = typeArg % 3;
            var color = this.COMPANION_COLORS[colorIdx] || 'red';
            slot.classList.add('companion-has-card');
            slot.style.backgroundImage = "url('" + g_gamethemeurl
                + 'img/companion/' + color + '-card-' + subtypeIdx + ".png')";
            slot.dataset.cardId = card.id;
            slot.dataset.cardTypeArg = typeArg;
        },

        // Read gamedatas.deckSizes (populated by getAllDatas) into a
        // by-cardType lookup. Returns 0 for any missing type.
        _deckCount: function(cardType) {
            var sizes = (this.gamedatas && this.gamedatas.deckSizes) || [];
            for (var i = 0; i < sizes.length; i++) {
                if (sizes[i].cardType === cardType) return parseInt(sizes[i].cnt) || 0;
            }
            return 0;
        },

        // Set the cached deckSizes count to an absolute value. Used by
        // events that resize the deck non-incrementally — primarily a
        // reshuffle of a discard pile back into the deck.
        _setDeckCount: function(cardType, count) {
            if (!this.gamedatas.deckSizes) this.gamedatas.deckSizes = [];
            var sizes = this.gamedatas.deckSizes;
            var entry = null;
            for (var i = 0; i < sizes.length; i++) {
                if (sizes[i].cardType === cardType) { entry = sizes[i]; break; }
            }
            var n = Math.max(0, parseInt(count) || 0);
            if (entry) entry.cnt = n;
            else sizes.push({ cardType: cardType, cnt: n });
            this._renderDeckTooltips();
        },

        // Mutate the cached deckSizes count by `delta` and refresh the
        // tooltip on the matching deck so the on-hover info stays in
        // sync with what the player has done. Called from notif
        // handlers that consume cards (oracle draw, equipment refill,
        // injury taken, companion taken).
        _adjustDeckCount: function(cardType, delta) {
            if (!this.gamedatas.deckSizes) this.gamedatas.deckSizes = [];
            var sizes = this.gamedatas.deckSizes;
            var entry = null;
            for (var i = 0; i < sizes.length; i++) {
                if (sizes[i].cardType === cardType) { entry = sizes[i]; break; }
            }
            if (entry) {
                entry.cnt = Math.max(0, (parseInt(entry.cnt) || 0) + delta);
            } else {
                sizes.push({ cardType: cardType, cnt: Math.max(0, delta) });
            }
            this._renderDeckTooltips();
        },

        // Bind a hover tooltip to every supply-strip deck showing the
        // remaining count. We agreed no permanent count badges, so the
        // info stays one mouse-hover away. Called from setup() and
        // re-called whenever a count changes.
        _renderDeckTooltips: function() {
            var self = this;
            var entries = [
                { id: 'supply-deck-oracle',    label: _('Oracle deck'),    type: 'oracle'    },
                { id: 'supply-deck-equipment', label: _('Equipment deck'), type: 'equipment' },
                { id: 'supply-deck-injury',    label: _('Injury deck'),    type: 'injury'    },
                { id: 'supply-deck-companion', label: _('Companion deck'), type: 'companion' },
            ];
            entries.forEach(function(e) {
                if (!document.getElementById(e.id)) return;
                var count = self._deckCount(e.type);
                var html = '<div class="deck-tooltip">'
                    + '<div class="deck-tooltip-title">' + e.label + '</div>'
                    + '<div class="deck-tooltip-count">'
                    +     dojo.string.substitute(_('${n} cards remaining'), { n: count })
                    + '</div>'
                    + '</div>';
                try { self.removeTooltip(e.id); } catch (err) { /* not yet bound */ }
                self.addTooltipHtml(e.id, html);
            });
        },

        // Paint the 6 face-up equipment cards into the supply strip from
        // an array of {id, cardTypeArg} (gamedatas shape) or
        // {card_id, card_type_arg} (state-args shape — used by the
        // existing card-picker popup). Empty slots are left as
        // dashed placeholders. Called from setup() and any handler that
        // mutates the public display.
        _renderEquipmentSupply: function(displayData) {
            var slots = document.querySelectorAll('#supply-equipment-cards .supply-equipment-slot');
            var data = displayData || [];
            var self = this;
            slots.forEach(function(slot, index) {
                var card = data[index];
                // Slot identity is stable but the card filling it changes on
                // refill — wipe the old tooltip on every render so the body
                // matches the current card (or none, when emptied).
                try { self.removeTooltip(slot.id); } catch (err) { /* not yet bound */ }
                if (card) {
                    var cardTypeArg = card.cardTypeArg != null ? card.cardTypeArg : card.card_type_arg;
                    var cardId      = card.id           != null ? card.id           : card.card_id;
                    var cardNum = String(cardTypeArg).padStart(3, '0');
                    slot.classList.add('supply-slot-filled');
                    slot.style.backgroundImage = "url('" + g_gamethemeurl + "img/equipment/card-" + cardNum + ".jpg')";
                    slot.dataset.cardId = cardId;
                    slot.dataset.cardTypeArg = cardTypeArg;
                    self.addTooltipHtml(slot.id, self._buildEquipmentTooltipHtml(parseInt(cardTypeArg)));
                } else {
                    slot.classList.remove('supply-slot-filled');
                    slot.style.backgroundImage = '';
                    delete slot.dataset.cardId;
                    delete slot.dataset.cardTypeArg;
                }
            });
        },

        // Mutate the supply strip after a single card is taken: remove the
        // card matching `pickedCardId` and (optionally) push the refill
        // card returned by the server. Mirrors what the server-side does
        // to the equipment_display table during CombatVictory and similar.
        _updateEquipmentSupplyAfterPick: function(pickedCardId, refillCard) {
            if (!this.gamedatas.equipmentDisplay) this.gamedatas.equipmentDisplay = [];
            var display = this.gamedatas.equipmentDisplay;
            var pickedIdx = display.findIndex(function(c) {
                return parseInt(c.id) === parseInt(pickedCardId);
            });
            if (pickedIdx >= 0) display.splice(pickedIdx, 1);
            if (refillCard) {
                display.push({
                    id: parseInt(refillCard.card_id),
                    cardTypeArg: parseInt(refillCard.card_type_arg),
                });
            }
            this._renderEquipmentSupply(display);
        },

        // Toggle the .my-ship-can-move class on the player's own ship.
        // Adds the class while a die is selected (SelectAction without
        // Apollo recolor pending) so the ship reads as clickable; the
        // click handler in onShipClick dispatches actMoveShip.
        _setShipMoveAffordance: function(canMove) {
            var ship = document.getElementById('ship_' + this.player_id);
            if (!ship) return;
            ship.classList.toggle('my-ship-can-move', !!canMove);
        },

        // Apply a favor-token update for a player. For the local player,
        // any GAIN (newTotal > currently displayed) flies chips one at a
        // time from the public pile to the single-chip stash and steps the
        // visible counters up as each chip lands. Losses or unchanged
        // values snap instantly. Non-local players get an instant panel-
        // pill update only (the chip-stash element belongs to the local
        // viewer's player area). All favor-changing notifs route through
        // this so animations are uniform across actions, equipment
        // reactions, exploration rewards, etc.
        // Returns a Promise that resolves once the chip flight (if any)
        // has fully landed. Callers in notif handlers should await this
        // so the BGA notif queue blocks the next state transition (e.g.
        // a turn-end after the player spends their last die on Take 2
        // Favor) until the chips visibly arrive at the player's stash.
        _applyFavorUpdate: function(playerId, newTotal) {
            var pid = parseInt(playerId);
            var newAmount = parseInt(newTotal);
            if (isNaN(newAmount)) return Promise.resolve();
            var self = this;
            if (pid !== this.player_id) {
                this.components.playerPanel.updateFavor(pid, newAmount);
                return Promise.resolve();
            }
            var displayed = (this.components.favorTokenCount != null)
                ? this.components.favorTokenCount
                : 0;
            var delta = newAmount - displayed;
            if (delta > 0) {
                var startingDisplayed = displayed;
                var landed = 0;
                return new Promise(function(resolve) {
                    self._animateFavorChipsToStash(delta, function() {
                        landed += 1;
                        self.components.setFavorTokenCount(startingDisplayed + landed);
                        self.components.playerPanel.updateFavor(pid, startingDisplayed + landed);
                    }, function() {
                        // Pin to the authoritative server total (covers any
                        // safety-net timeouts firing before transitionend).
                        self.components.setFavorTokenCount(newAmount);
                        self.components.playerPanel.updateFavor(pid, newAmount);
                        resolve();
                    });
                });
            }
            // Loss or unchanged — snap instantly.
            this.components.setFavorTokenCount(newAmount);
            this.components.playerPanel.updateFavor(pid, newAmount);
            return Promise.resolve();
        },

        // Fly `count` favor chips from #delphi-favor-pile to the player's
        // single-chip indicator (#delphi-favor-tokens-area .favor-token-stack),
        // one at a time. onLanding fires after each chip's transition ends
        // (used by the caller to step the visible count up by 1); onAllDone
        // fires after the last chip lands. Falls back to immediate completion
        // if either anchor is missing from the DOM.
        _animateFavorChipsToStash: function(count, onLanding, onAllDone) {
            var pile = document.getElementById('delphi-favor-pile');
            var stash = document.querySelector('#delphi-favor-tokens-area .favor-token-stack');
            if (!pile || !stash || count <= 0) {
                for (var i = 0; i < count; i++) {
                    if (onLanding) onLanding();
                }
                if (onAllDone) onAllDone();
                return;
            }
            var pileRect = pile.getBoundingClientRect();
            var stashRect = stash.getBoundingClientRect();
            var srcX = pileRect.left + pileRect.width / 2;
            var srcY = pileRect.top + pileRect.height / 2;
            var dstX = stashRect.left + stashRect.width / 2;
            var dstY = stashRect.top + stashRect.height / 2;

            var DURATION = 600;
            var step = function(remaining) {
                if (remaining === 0) {
                    if (onAllDone) onAllDone();
                    return;
                }
                var chip = document.createElement('div');
                // .favor-chip-flying carries every visual property AND a
                // CSS @keyframes animation that runs from translate(0,0)
                // to translate(var(--fly-dx), var(--fly-dy)). Using a
                // keyframe rather than a transition guarantees the
                // animation fires on a freshly appended element across
                // every browser, regardless of style-commit timing.
                chip.className = 'favor-chip-flying';
                chip.style.left = (srcX - 25) + 'px';
                chip.style.top  = (srcY - 25) + 'px';
                chip.style.setProperty('--fly-dx', (dstX - srcX) + 'px');
                chip.style.setProperty('--fly-dy', (dstY - srcY) + 'px');
                document.body.appendChild(chip);

                var done = false;
                var finish = function() {
                    if (done) return;
                    done = true;
                    if (chip.parentNode) chip.parentNode.removeChild(chip);
                    if (onLanding) onLanding();
                    step(remaining - 1);
                };
                chip.addEventListener('animationend', finish, { once: true });
                // Safety net if animationend never fires (e.g. tab
                // backgrounded). Slightly longer than DURATION so it
                // doesn't pre-empt a real animation.
                setTimeout(finish, DURATION + 250);
            };
            step(count);
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

            // Click delegation for the monster sprite. Intentionally NOT
            // gated on .monster-targetable — the source of truth for
            // "can fight" is the _fightableMonsterIds map populated by
            // onUpdateActionButtons in SelectAction, and onMonsterClick
            // checks it. The class is purely a visual pulse affordance;
            // gating clicks on it caused the sprite-click path to break
            // whenever setMonsterTargetable hadn't (re-)applied the class
            // (e.g. after a monster was redrawn or the player came in
            // through the oracle-card source instead of a die). The
            // surrounding island-tile click already routes via onHexClick
            // → _fightableMonstersByHex; this keeps the two paths in sync.
            boardPieces.addEventListener('click', function(e) {
                const monsterEl = e.target.closest('.delphi-monster');
                if (!monsterEl) return;
                e.stopPropagation();
                const id = parseInt(monsterEl.id.split('_')[1]);
                // Pass the hex key so onMonsterClick can fall back to the
                // hex-level fightable lookup when the clicked chip itself
                // isn't fightable (typical for buried chips in a stack).
                self.onMonsterClick(id, monsterEl.dataset.hexKey || null);
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
            this.components.initMonsterSizing(Object.keys(gamedatas.players || {}).length);
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
                        // Temple deliveries use the small variant in a
                        // cardinal layout — same path notif_deliverCargo
                        // takes at runtime so reloads match.
                        self.components.createTempleOffering(
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

                var shrineId = self._shrineIdFromHex(bh.q, bh.r);

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
                } else if (dbHex.shrineGameColor && dbHex.shrineLetter) {
                    // Server only fills shrineGameColor+shrineLetter on
                    // unrevealed island hexes when this player has peeked
                    // them — paint the persistent peek marker + tooltip
                    // so the player remembers what they've already seen.
                    self._markIslandPeeked(shrineId, dbHex.shrineGameColor, dbHex.shrineLetter);
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
                var hasHex = shrine.builtQ !== null && shrine.builtR !== null;

                if (parseInt(shrine.isBuilt) === 1 && hasHex) {
                    // Shrine is built — hide from player board, show on hex
                    slotEl.classList.add('shrine-built');
                    var center = self.getHexCenterPixel(parseInt(shrine.builtQ), parseInt(shrine.builtR));
                    if (center) {
                        self._placeShrinePieceOnHex(center.x, center.y, shrine.shrineIndex);
                    }
                } else if (hasHex) {
                    // Discovered (an opponent revealed our island) but not
                    // yet built — token sits on the matching Zeus tile.
                    slotEl.classList.add('shrine-discovered');
                    var zeusTileEl = self._findShrineZeusTileEl(letter);
                    if (zeusTileEl) {
                        self._placeShrinePieceOnZeus(zeusTileEl, shrine.shrineIndex);
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
            var t = this._findShrineZeusTile(shrineLetter);
            return t ? parseInt(t.sortOrder) : -1;
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

            // Collect oracle cards by color, skipping the already-played card.
            // The server keeps the played card in the player's hand row (only
            // its globals flag it as played), so without this guard we'd
            // double-render it: an .action-card-active icon for the play AND
            // an .action-card-inactive icon for the same color from the
            // byColor count.
            var byColor = {};
            var selectedColor = null;
            gamedatas.hand.forEach(function(card) {
                if (card.cardType !== 'oracle') return;
                if (selectedCardId > 0 && parseInt(card.id) === selectedCardId) return;
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
                        g_gamethemeurl + 'img/companion/' + color + '-card-' + typeIdx + '.png',
                        { gameModule: self, cardTypeArg: arg }
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
                this.components.initMonsterSizing(Object.keys(gamedatas.players || {}).length);
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
            // Refresh the "- Your Oracle die are" prefix on every state
            // transition — it should appear in any state where the local
            // viewer is non-active and the dice strip is visible. The
            // helper handles all the gating itself.
            this._updateYourDiceLabel();

            switch( stateName )
            {
                case 'gameEnd': {
                    // BGA is now showing the "End of game: Winner" banner to
                    // all players — the action UI is no longer meaningful.
                    var endWrapper = document.getElementById('delphi-action-sources');
                    if (endWrapper) endWrapper.style.display = 'none';
                    // Wrapper just got hidden — re-evaluate so the label
                    // doesn't stick around on the post-game banner.
                    this._updateYourDiceLabel();
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
                    // _sawPlayerActions toggle above may have just removed
                    // .pre-game on the wrapper — re-evaluate label visibility
                    // now that the dice are actually showing.
                    this._updateYourDiceLabel();
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
                    // Collapse the source picker to only the selected source
                    // so the action bar reads "You must select an action for
                    // [icon]". This MUST only fire for the active player —
                    // it dataset-index-matches against #delphi-action-sources
                    // (the local viewer's dice) and rewrites
                    // pagemaintitletext. Without the gate, an inactive
                    // viewer's own same-indexed die gets visually selected
                    // and they see the "You must select" prompt.
                    if (this.isCurrentPlayerActive()) {
                        this._applyActionSourceSelection(args && args.args);
                    }
                    break;

                case 'UseGodAbility':
                    // A god ability is a self-contained action — hide the other
                    // source icons while the player resolves it. Active
                    // player only (same reasoning as SelectAction).
                    if (this.isCurrentPlayerActive()) {
                        this._applyActionSourceSelection(null);
                    }
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
                            // Prefer the item the player picked by clicking
                            // on the board (offering or statue). The validItems
                            // list is single-type for this state, so an offering
                            // id can't collide with a statue id here.
                            var preferredId = this._preferredLoadItemId;
                            this._preferredLoadItemId = null;
                            var autoItem = loadUnique[0];
                            if (preferredId != null) {
                                for (var pi = 0; pi < loadItems.length; pi++) {
                                    if (parseInt(loadItems[pi].id) === preferredId) {
                                        autoItem = loadItems[pi];
                                        break;
                                    }
                                }
                            }
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
                                    var shrineId = self._shrineIdFromHex(island.q, island.r);
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
                                    var shrineId = scoutSelf._shrineIdFromHex(island.q, island.r);
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
                        this._showRecoveryPicker(args.args.injuryCards || []);
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
                    this._teardownClickToLoadHandlers();
                    this._clearGodTargetOverlays();
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
                    this._hideCardPicker();
                    this._closeCombatDialog();
                    break;

                case 'SelectReward':
                    this._hideCardPicker();
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
                    // Modal closes on confirm; if the player navigated away
                    // mid-pick (rare — Recover doesn't currently allow it),
                    // make sure the picker tears down too.
                    this._hideCardPicker();
                    break;
            }
        },

        onUpdateActionButtons: function( stateName, args )
        {
            // Reset the favor-pile to disabled on every state change so
            // stale handlers can't fire after the player leaves the take-
            // favor states. Re-activated below where applicable.
            this._deactivateFavorPile();
            // Wheel recolor arrows: same lifecycle — clear unconditionally
            // on every refresh, then re-render from the current state args
            // in the SelectAction case (covers in-state arg refreshes
            // such as a die recolor that stays in SelectAction).
            this._clearRecolorArrows();
            // Click-to-move ship affordance: drop unconditionally, re-add
            // in the SelectAction case below.
            this._setShipMoveAffordance(false);
            // Oracle deck on the supply strip: same lifecycle as the
            // favor pile — drop the active state, re-add in SelectAction.
            this._deactivateOracleDeck();
            // Clickable cargo targets on the board (Load Statue / Load
            // Offering affordance): drop unconditionally and re-add inside
            // SelectAction.
            this._teardownClickToLoadHandlers();
            // Hex affordance overlays (god-ability targets, click-to-deliver
            // for Make Offering / Raise Statue): drop unconditionally so
            // arg-only refreshes don't accumulate stale overlays in the DOM.
            this._clearGodTargetOverlays();
            // Click-to-discard affordance on the matching-color injury hand
            // card: drop unconditionally so a state refresh that changes
            // discardability (e.g. a recolor that flips the action color)
            // doesn't leave a stale handler on the wrong color.
            this._teardownInjuryDiscardAffordance();
            // Click-to-fight affordance: clear the targetable pulse on
            // every refresh and reset the fightable id maps; re-set in
            // the SelectAction case below. The hex map lets onHexClick
            // dispatch actFightMonster when the user clicks the island
            // tile rather than the small monster sprite directly.
            if (this.components && this.components.clearTargetableMonsters) {
                this.components.clearTargetableMonsters();
            }
            this._fightableMonsterIds = {};
            this._fightableMonstersByHex = {};

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
                                var btn = this.statusBar.addActionButton(godLabel, () => {
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
                                var btn = this.statusBar.addActionButton(godLabel, () => {
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
                        // Re-evaluate activatable amulets on every args
                        // refresh, not just the initial entry. A recolor
                        // mid-SelectAction changes the action color, which
                        // can flip a Hermes/Artemis/Poseidon amulet from
                        // not-activatable to activatable (or vice versa);
                        // without this the gold pulse stayed stuck on
                        // whatever the amulet matched at first selection.
                        // Also handles the apollo-recolor → action path
                        // below since onEnteringState only fires once per
                        // state transition.
                        this._applyActivatableEquipmentClass(
                            args && args.activatableEquipment
                        );
                        if (args && args.apolloNeedsRecolor) {
                            this.enterRecolorMode(args.dieColor, args.playerFavor || 0, { apolloFree: true });
                            break;
                        }
                        // Wheel-overlay recolor arrows: an alternate path
                        // alongside the status-bar Recolor Die button. Both
                        // dispatch actRecolorDie.
                        this._setupRecolorArrows(args);
                        // Click-to-move shortcut: clicking the player's own
                        // ship dispatches actMoveShip (handled in
                        // onShipClick).
                        this._setShipMoveAffordance(true);
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
                            // Click-to-fight affordance: pulse each
                            // fightable monster, remember its id (for
                            // monster-piece clicks) AND its hex (for
                            // island-tile clicks via onHexClick).
                            var fightableMap = this._fightableMonsterIds || {};
                            var hexMap       = this._fightableMonstersByHex || {};
                            var self2 = this;
                            monsters.forEach(function(m) {
                                var mid = parseInt(m.monster_id);
                                fightableMap[mid] = true;
                                if (m.hex_q != null && m.hex_r != null) {
                                    hexMap[parseInt(m.hex_q) + ',' + parseInt(m.hex_r)] = mid;
                                }
                                if (self2.components && self2.components.setMonsterTargetable) {
                                    self2.components.setMonsterTargetable(mid);
                                }
                            });
                            this._fightableMonsterIds = fightableMap;
                            this._fightableMonstersByHex = hexMap;
                        }
                        if (args && args.loadableOfferings && args.loadableOfferings.length > 0) {
                            var loadOfferingBtn = this.statusBar.addActionButton(_('Load Offering'), () => {
                                this.bgaPerformAction("actLoadOffering", {});
                            });
                            this._prependActionIconToButton(loadOfferingBtn, 'load-offering');
                            // Same action available by clicking any matching-
                            // color offering on its island hex.
                            this._setupClickToLoadHandlers(args.loadableOfferings, 'actLoadOffering');
                        }
                        if (args && args.deliverableOfferings && args.deliverableOfferings.length > 0) {
                            var makeOfferingBtn = this.statusBar.addActionButton(_('Make Offering'), () => {
                                this.bgaPerformAction("actMakeOffering", {});
                            });
                            this._prependActionIconToButton(makeOfferingBtn, 'make-offering');
                            this._highlightValidHexes(
                                this._uniqueDestHexes(args.deliverableOfferings),
                                'god-target',
                                () => this.bgaPerformAction('actMakeOffering', {}),
                            );
                        }
                        if (args && args.loadableStatues && args.loadableStatues.length > 0) {
                            var loadStatueBtn = this.statusBar.addActionButton(_('Load Statue'), () => {
                                this.bgaPerformAction("actLoadStatue", {});
                            });
                            this._prependActionIconToButton(loadStatueBtn, 'load-statue');
                            // Same action available by clicking any matching-
                            // color statue on its city hex.
                            this._setupClickToLoadHandlers(args.loadableStatues, 'actLoadStatue');
                        }
                        if (args && args.deliverableStatues && args.deliverableStatues.length > 0) {
                            var raiseStatueBtn = this.statusBar.addActionButton(_('Raise Statue'), () => {
                                this.bgaPerformAction("actRaiseStatue", {});
                            });
                            this._prependActionIconToButton(raiseStatueBtn, 'raise-statue');
                            // Pass the clicked hex coords so the server knows
                            // which island to raise at when the player is
                            // adjacent to two eligible statue islands. The
                            // action-bar button still calls with no coords —
                            // server falls back to the first reachable match,
                            // which is fine when only one option exists.
                            this._highlightValidHexes(
                                this._uniqueDestHexes(args.deliverableStatues),
                                'god-target',
                                (q, r) => this.bgaPerformAction('actRaiseStatue', { hexQ: q, hexR: r }),
                            );
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
                        if (args && args.buildableShrines && args.buildableShrines.length > 0) {
                            var shrines = args.buildableShrines;
                            shrines.forEach(shrine => {
                                var label = shrines.length === 1
                                    ? _('Build Shrine')
                                    : _('Build Shrine') + ' (' + shrine.explorationColor.charAt(0).toUpperCase() + shrine.explorationColor.slice(1) + ')';
                                var buildBtn = this.statusBar.addActionButton(label, () => {
                                    this.bgaPerformAction("actBuildShrine", {
                                        hexQ: shrine.hex_q,
                                        hexR: shrine.hex_r
                                    });
                                });
                                this._prependActionIconToButton(buildBtn, 'build-shrine');
                            });
                            // Also let the player click the highlighted hex
                            // directly, mirroring the Make Offering / Raise
                            // Statue affordance pattern.
                            this._highlightValidHexes(
                                shrines.map(s => ({ q: s.hex_q, r: s.hex_r })),
                                'god-target',
                                (q, r) => this.bgaPerformAction('actBuildShrine', { hexQ: q, hexR: r }),
                            );
                        }
                        if (args && args.discardableInjuryCount && args.discardableInjuryCount > 0) {
                            var discardInjuryBtn = this.statusBar.addActionButton(_('Discard Injuries'), () => {
                                this.bgaPerformAction("actDiscardInjuries", {});
                            });
                            this._prependActionIconToButton(discardInjuryBtn, 'discard-injuries');
                            // Same action available by clicking the
                            // matching-color injury card stack in the hand.
                            // The stack glows gold so the player knows it's
                            // active without scanning the action bar.
                            this._setupInjuryDiscardAffordance(args.dieColor);
                        }
                        if (args && args.advanceableGod) {
                            var godLabel = args.advanceableGod.charAt(0).toUpperCase() + args.advanceableGod.slice(1);
                            var btn = this.statusBar.addActionButton(godLabel, () => {
                                this.bgaPerformAction("actAdvanceGod", { godName: args.advanceableGod });
                            });
                            this._prependGodIconToButton(btn, args.advanceableGod);
                        }
                        var drawOracleBtn = this.statusBar.addActionButton(_('Draw Oracle Card'), () => {
                            this.bgaPerformAction("actDrawOracleCard", {});
                        });
                        this._prependActionIconToButton(drawOracleBtn, 'draw-oracle-card');
                        // Same action available via the oracle deck on
                        // the supply strip (cursor pointer + click).
                        this._activateOracleDeck();
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
                        // button and open the equipment picker directly.
                        if (document.getElementById('delphi-combat-dialog').classList.contains('active')) {
                            this._setCombatDialogActions([
                                {
                                    label: _('Select Equipment Card'),
                                    color: 'primary',
                                    onClick: function() {
                                        // Wait for the combat dialog's exit
                                        // animation before the picker enters
                                        // so the two modals don't fight for
                                        // the centerline. _closeCombatDialog
                                        // resolves on transition-end.
                                        self._closeCombatDialog().then(function() {
                                            self._showEquipmentStrip();
                                        });
                                    }
                                }
                            ]);
                        } else {
                            this._showEquipmentStrip();
                        }
                        break;

                    case 'Recover':
                        // Confirm + selection state both live on the card-
                        // picker modal now (_showRecoveryPicker → onConfirm
                        // dispatches actDiscardInjuries). No status-bar
                        // button needed — the modal owns the whole flow.
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
         *   isOracleCard, dieIndex }). Pass null for UseGodAbility (no source
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
            // PHP exposes only the boolean isOracleCard in args (not the card
            // id). Use the boolean directly — the matching below keys off
            // dieColor anyway, since cards of the same color share one icon.
            var oracleCardSelected = !!(stateArgs && stateArgs.isOracleCard);
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
         * Toggle the "- Your Oracle die are" prefix shown to non-active
         * viewers next to the action bar's title text. Visible whenever the
         * local player is NOT the active player AND the dice strip itself
         * is on screen — hides during pre-game (.pre-game on wrapper) and
         * the gameEnd banner (wrapper inline display:none). Called from
         * onEnteringState top-level so it refreshes on every state
         * transition without needing a per-state branch.
         */
        _updateYourDiceLabel: function() {
            var label = document.getElementById('delphi-your-dice-label');
            if (!label) return;
            var wrapper = document.getElementById('delphi-action-sources');
            var hidden = !wrapper
                || wrapper.classList.contains('pre-game')
                || wrapper.style.display === 'none';
            label.classList.toggle(
                'visible',
                !this.isCurrentPlayerActive() && !hidden
            );
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

                self._bindHandOracleCardSelectable(color, info.cardId, isWild, apolloLocked);
            });
        },

        // Add the .oracle-card-selectable class + click handler to the
        // hand-area card for `color`. Idempotent — skips if the class is
        // already there. Used by _setupOracleCardClickHandlers AND by
        // notif_oracleCardCancelled (defensive: the card element may not
        // exist when state transitions back to PlayerActions if the notif
        // hasn't re-added it to the hand area yet).
        _bindHandOracleCardSelectable: function(color, cardId, isWild, apolloLocked) {
            var container = document.getElementById('delphi-oracle-cards-area');
            if (!container) return;
            var cardEl = container.querySelector('.oracle-' + color);
            if (!cardEl) return;
            if (apolloLocked) {
                cardEl.classList.add('oracle-card-apollo-locked');
                cardEl.classList.remove('oracle-card-selectable');
                return;
            }
            cardEl.classList.remove('oracle-card-apollo-locked');
            if (cardEl.classList.contains('oracle-card-selectable')) return;
            cardEl.classList.add('oracle-card-selectable');
            var self = this;
            var handler = isWild
                ? function() { self.showWildColorPicker(cardId); }
                : function() { self.bgaPerformAction('actPlayOracleCard', { card_id: cardId }); };
            cardEl.addEventListener('click', handler);
            if (!this._oracleCardClickHandlers) this._oracleCardClickHandlers = [];
            this._oracleCardClickHandlers.push({ el: cardEl, handler: handler });
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

        // Kick off decoding of action-bar icons + peek-tooltip art at setup
        // so the first button click / first hover doesn't show a blank
        // image while the PNG fetches.
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
            // Shrine back-face art used by the peeked-island hover tooltip.
            // Mirrors the 12 .shrine-{color}-{letter} .shrine-face-back rules
            // in CSS — bounded set, fine to warm them all.
            var shrineOverlays = [
                'blue-omega', 'blue-phi', 'blue-sigma',
                'green-phi', 'green-psi', 'green-sigma',
                'red-omega', 'red-phi', 'red-psi',
                'yellow-omega', 'yellow-psi', 'yellow-sigma'
            ];
            shrineOverlays.forEach(function(name) {
                var img = new Image();
                img.src = g_gamethemeurl + 'img/shrine-overlay/shrine-' + name + '.png';
            });
            // Equipment + companion card art for the rich hover tooltips.
            // Bounded sets driven by the def maps already cached client-side.
            Object.keys(this.equipmentDefs || {}).forEach(function(arg) {
                var img = new Image();
                img.src = g_gamethemeurl + 'img/equipment/card-' + String(arg).padStart(3, '0') + '.jpg';
            });
            var self = this;
            Object.keys(this.companionDefs || {}).forEach(function(arg) {
                var def = self.companionDefs[arg];
                if (!def || !def.color) return;
                var img = new Image();
                img.src = g_gamethemeurl + 'img/companion/' + def.color + '-card-' + (parseInt(arg) % 3) + '.png';
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

        // Stable color order for grouping injury cards in the Recover
        // picker. Same order used by OFFERING_COLORS / COMPANION_COLORS
        // elsewhere — keeps multi-color stacks reading the same way
        // everywhere they appear.
        INJURY_COLOR_ORDER: ['red', 'yellow', 'green', 'blue', 'pink', 'black'],

        // Recover state: player has too many injuries and must discard 3.
        // Uses the same modal as the equipment / companion pickers, in
        // multi-select mode capped at 3, with cards sorted by color so
        // same-color injuries sit adjacent.
        _showRecoveryPicker: function(injuryCards) {
            var self = this;
            var orderIdx = {};
            this.INJURY_COLOR_ORDER.forEach(function(c, i) { orderIdx[c] = i; });
            var sorted = (injuryCards || []).slice().sort(function(a, b) {
                var oa = orderIdx[a.color] != null ? orderIdx[a.color] : 99;
                var ob = orderIdx[b.color] != null ? orderIdx[b.color] : 99;
                if (oa !== ob) return oa - ob;
                return parseInt(a.card_id) - parseInt(b.card_id);
            });
            var cards = sorted.map(function(card) {
                return {
                    id: parseInt(card.card_id),
                    imageUrl: g_gamethemeurl + 'img/injury/' + card.color + '.jpg',
                };
            });
            this._showCardPicker({
                title: _('Select 3 injury cards to discard'),
                cards: cards,
                cardOrientation: 'landscape',
                selectCount: 3,
                onConfirm: function(cardIds) {
                    self.bgaPerformAction('actDiscardInjuries', {
                        cardIdsJson: JSON.stringify(cardIds),
                    });
                },
            });
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
         * and the combat-victory card picker (via _showEquipmentStrip).
         *
         * Layout mirrors the god-tooltip template: image on the left (2x
         * card size = 160x240), title+description on the right.
         */
        // Generic image-left / text-right card tooltip body. Both equipment
        // and companion tooltips render through here so the layout, escape
        // rules, and CSS classes stay in one place.
        _buildCardTooltipHtml: function(opts) {
            var subtitleHtml = opts.subtitle
                ? '<span class="delphi-equipment-tooltip-subtitle">' + this._escHtml(opts.subtitle) + '</span>'
                : '';
            return ''
                + '<div class="delphi-equipment-tooltip">'
                +   '<div class="delphi-equipment-tooltip-image" style="background-image:url(\'' + opts.imgUrl + '\')"></div>'
                +   '<div class="delphi-equipment-tooltip-body">'
                +     '<strong class="delphi-equipment-tooltip-title">' + this._escHtml(opts.name) + '</strong>'
                +     subtitleHtml
                +     '<p class="delphi-equipment-tooltip-desc">' + this._escHtml(opts.description) + '</p>'
                +   '</div>'
                + '</div>';
        },

        _buildEquipmentTooltipHtml: function(cardTypeArg) {
            var def = (this.equipmentDefs && this.equipmentDefs[cardTypeArg]) || {};
            var cardNum = String(cardTypeArg).padStart(3, '0');
            return this._buildCardTooltipHtml({
                imgUrl: g_gamethemeurl + 'img/equipment/card-' + cardNum + '.jpg',
                name: def.name || ('Equipment #' + cardTypeArg),
                description: def.description || '',
            });
        },

        _buildCompanionTooltipHtml: function(cardTypeArg) {
            var def = (this.companionDefs && this.companionDefs[cardTypeArg]) || {};
            var typeIdx = cardTypeArg % 3;
            return this._buildCardTooltipHtml({
                imgUrl: g_gamethemeurl + 'img/companion/' + (def.color || '') + '-card-' + typeIdx + '.png',
                name: def.name || ('Companion #' + cardTypeArg),
                subtitle: def.subtype || '',
                description: def.description || '',
            });
        },

        // Drop BGA tooltip registrations for every id-bearing child before
        // we wipe a container's innerHTML — otherwise BGA's internal
        // tooltip map accumulates orphaned handles.
        _clearTooltipsIn: function(container) {
            if (!container) return;
            var self = this;
            container.querySelectorAll('[id]').forEach(function(el) {
                try { self.removeTooltip(el.id); } catch (e) { /* not bound */ }
            });
        },

        // Generic card-picker modal driving both equipment + companion
        // selection. opts:
        //   title:            string shown above the cards
        //   cards:            [{ id, imageUrl, tooltipHtml }]
        //   cardOrientation:  'landscape' | 'portrait' (sizes the card box)
        //   gridColumns:      optional integer; when set the cards row
        //                     uses a fixed N-column grid instead of the
        //                     default flex-wrap. Use for fixed-size sets
        //                     (e.g. the 6-card equipment supply) where
        //                     viewport-driven wrapping into a 4-2 split
        //                     looks lopsided.
        //   onConfirm:        function(cardId) — called with the chosen id
        //   onCancel:         function() | omitted — when omitted the
        //                     cancel button is hidden (selection mandatory)
        _showCardPicker: function(opts) {
            var picker = document.getElementById('delphi-card-picker');
            var backdrop = document.getElementById('delphi-card-picker-backdrop');
            var titleEl = document.getElementById('card-picker-title');
            var cardsEl = document.getElementById('card-picker-cards');
            var actionsEl = document.getElementById('card-picker-actions');
            if (!picker || !backdrop || !titleEl || !cardsEl || !actionsEl) return;
            var self = this;

            // Cancel any pending exit cleanup from a recent _hideCardPicker —
            // otherwise the queued setTimeout would wipe the cards we're
            // about to populate.
            if (this._cardPickerExitTimer) {
                clearTimeout(this._cardPickerExitTimer);
                this._cardPickerExitTimer = null;
            }

            // Tear down any previous picker tooltips before we wipe the row.
            this._clearTooltipsIn(cardsEl);
            cardsEl.innerHTML = '';
            actionsEl.innerHTML = '';
            // Title is set by renderTitle() below — multi-select appends a
            // running "(n/N)" counter to the base text on every selection.

            // Reset any layout modifier from a prior picker invocation,
            // then re-apply if this caller requested a fixed grid.
            cardsEl.classList.remove('card-picker-cards--cols-3');
            if (opts.gridColumns === 3) {
                cardsEl.classList.add('card-picker-cards--cols-3');
            }

            // Single-select: selectedId holds the chosen card or null.
            // Multi-select (opts.selectCount >= 2): selectedSet holds the
            // chosen ids; Confirm activates only when size === selectCount.
            // The two modes share the same DOM + check-overlay rendering;
            // only the selection bookkeeping and onConfirm payload differ.
            var multi = typeof opts.selectCount === 'number' && opts.selectCount >= 2;
            var selectedId = null;
            var selectedSet = multi ? new Set() : null;
            var baseTitle = opts.title || '';
            var renderTitle = function() {
                titleEl.textContent = multi
                    ? baseTitle + ' (' + selectedSet.size + '/' + opts.selectCount + ')'
                    : baseTitle;
            };
            renderTitle();

            var renderActions = function() {
                actionsEl.innerHTML = '';
                var canConfirm = multi
                    ? (selectedSet.size === opts.selectCount)
                    : (selectedId !== null);
                if (canConfirm) {
                    var confirmBtn = document.createElement('button');
                    confirmBtn.className = 'delphi-btn primary';
                    confirmBtn.textContent = _('Confirm');
                    confirmBtn.addEventListener('click', function() {
                        var chosen = multi ? Array.from(selectedSet) : selectedId;
                        self._hideCardPicker();
                        if (typeof opts.onConfirm === 'function') opts.onConfirm(chosen);
                    });
                    actionsEl.appendChild(confirmBtn);
                }
                if (typeof opts.onCancel === 'function') {
                    var cancelBtn = document.createElement('button');
                    cancelBtn.className = 'delphi-btn secondary';
                    cancelBtn.textContent = _('Cancel');
                    cancelBtn.addEventListener('click', function() {
                        self._hideCardPicker();
                        opts.onCancel();
                    });
                    actionsEl.appendChild(cancelBtn);
                }
            };

            // Refresh check overlays from current selection state. Shared
            // by single + multi-select so the visual feedback is identical.
            var syncCheckOverlays = function() {
                cardsEl.querySelectorAll('.card-picker-card').forEach(function(el) {
                    var id = parseInt(el.dataset.cardId);
                    var isSelected = multi ? selectedSet.has(id) : (id === selectedId);
                    var existing = el.querySelector('.card-picker-check');
                    if (isSelected && !existing) {
                        var overlay = document.createElement('div');
                        overlay.className = 'card-picker-check';
                        overlay.innerHTML = '&#10003;';
                        el.appendChild(overlay);
                    } else if (!isSelected && existing) {
                        existing.remove();
                    }
                });
            };

            var cardClass = 'card-picker-card' + (opts.cardOrientation === 'portrait' ? ' card-picker-card--portrait' : '');
            (opts.cards || []).forEach(function(card, idx) {
                var cardEl = document.createElement('div');
                cardEl.className = cardClass;
                cardEl.id = 'card-picker-card-' + card.id;
                cardEl.dataset.cardId = card.id;
                cardEl.style.backgroundImage = "url('" + card.imageUrl + "')";
                // Stagger the card-in animation so the row reads as a
                // dealt sequence rather than all cards arriving at once.
                cardEl.style.animationDelay = (idx * 70) + 'ms';
                cardEl.addEventListener('click', function() {
                    var cardId = parseInt(card.id);
                    if (multi) {
                        if (selectedSet.has(cardId)) {
                            selectedSet.delete(cardId);
                        } else if (selectedSet.size < opts.selectCount) {
                            selectedSet.add(cardId);
                        }
                    } else {
                        selectedId = (selectedId === cardId) ? null : cardId;
                    }
                    syncCheckOverlays();
                    renderTitle();
                    renderActions();
                });
                cardsEl.appendChild(cardEl);
                if (card.tooltipHtml) {
                    self.addTooltipHtml(cardEl.id, card.tooltipHtml);
                }
            });

            renderActions();

            // The .dealing class drives the per-card stagger animation
            // exactly once per open. Removed on the last card's
            // animationend (or on hide) so future re-renders don't
            // replay the deal in place.
            cardsEl.classList.add('dealing');
            var lastCard = cardsEl.lastElementChild;
            if (lastCard) {
                var onLastDealEnd = function() {
                    lastCard.removeEventListener('animationend', onLastDealEnd);
                    cardsEl.classList.remove('dealing');
                };
                lastCard.addEventListener('animationend', onLastDealEnd);
            }

            // Trigger the entry animations on the next frame so the
            // browser commits the initial (inactive) styles first —
            // otherwise the transition can be skipped on a freshly
            // populated dialog.
            requestAnimationFrame(function() {
                backdrop.classList.add('active');
                picker.classList.add('active');
            });
        },

        _hideCardPicker: function() {
            var picker = document.getElementById('delphi-card-picker');
            var backdrop = document.getElementById('delphi-card-picker-backdrop');
            if (!picker || !backdrop) return;
            picker.classList.remove('active');
            backdrop.classList.remove('active');
            var cardsEl = document.getElementById('card-picker-cards');
            if (cardsEl) cardsEl.classList.remove('dealing');
            var self = this;
            // Tear down tooltips + clear the row after the picker's
            // exit transition completes so BGA's tooltip registry
            // doesn't leak handles for the detached cards. Listen for
            // transitionend rather than racing a timer; setTimeout is
            // a safety net if the event doesn't fire.
            var done = false;
            var finish = function() {
                if (done) return;
                done = true;
                picker.removeEventListener('transitionend', onEnd);
                self._cardPickerExitTimer = null;
                self._clearTooltipsIn(cardsEl);
                if (cardsEl) cardsEl.innerHTML = '';
            };
            var onEnd = function(e) {
                if (e.target !== picker) return;
                if (e.propertyName !== 'opacity' && e.propertyName !== 'transform') return;
                finish();
            };
            picker.addEventListener('transitionend', onEnd);
            // Safety net + handle for cancellation if _showCardPicker
            // reopens before the cleanup fires.
            this._cardPickerExitTimer = setTimeout(finish, 380);
        },

        _showEquipmentStrip: function() {
            var self = this;
            // Action bar gets out of the way — the picker takes over.
            var titleEl = document.getElementById('pagemaintitletext');
            if (titleEl) titleEl.innerHTML = '';
            var actionBar = document.getElementById('generalactions');
            if (actionBar) actionBar.innerHTML = '';

            var cards = (this._equipmentCards || []).map(function(card) {
                var typeArg = parseInt(card.card_type_arg);
                var cardNum = String(typeArg).padStart(3, '0');
                return {
                    id: parseInt(card.card_id),
                    imageUrl: g_gamethemeurl + 'img/equipment/card-' + cardNum + '.jpg',
                    tooltipHtml: self._buildEquipmentTooltipHtml(typeArg),
                };
            });

            this._showCardPicker({
                title: _('Select an Equipment Card'),
                cards: cards,
                cardOrientation: 'landscape',
                gridColumns: 3,
                onConfirm: function(cardId) {
                    self.bgaPerformAction('actSelectEquipment', { card_id: cardId });
                },
            });
        },

        _showCompanionStrip: function() {
            var self = this;
            var titleEl = document.getElementById('pagemaintitletext');
            if (titleEl) titleEl.innerHTML = '';
            var actionBar = document.getElementById('generalactions');
            if (actionBar) actionBar.innerHTML = '';

            var cards = (this._companionCards || []).map(function(card) {
                var typeArg = parseInt(card.card_type_arg);
                var typeIdx = typeArg % 3;
                return {
                    id: parseInt(card.card_id),
                    imageUrl: g_gamethemeurl + 'img/companion/' + card.color + '-card-' + typeIdx + '.png',
                    tooltipHtml: self._buildCompanionTooltipHtml(typeArg),
                };
            });

            this._showCardPicker({
                title: _('Select a Companion Card'),
                cards: cards,
                cardOrientation: 'portrait',
                onConfirm: function(cardId) {
                    self.bgaPerformAction('actSelectReward', { card_id: cardId });
                },
            });
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

        // Returns a Promise that resolves once the combat dialog's exit
        // transition finishes, so callers can chain the next modal
        // (e.g. the equipment picker after a combat victory) without
        // the two dialogs visibly overlapping or snapping. If the dialog
        // wasn't visibly active (e.g. mid-victory page reload), resolves
        // immediately — no point burning ~300ms before the next modal.
        _closeCombatDialog: function() {
            this._clearCombatDialogActions();
            this.components.clearBattleDie();
            var dialog = document.getElementById('delphi-combat-dialog');
            if (!dialog || !dialog.classList.contains('active')) {
                return Promise.resolve();
            }
            dialog.classList.remove('active');
            return new Promise(function(resolve) {
                var done = false;
                var finish = function() {
                    if (done) return;
                    done = true;
                    dialog.removeEventListener('transitionend', onEnd);
                    resolve();
                };
                var onEnd = function(e) {
                    if (e.target !== dialog) return;
                    if (e.propertyName !== 'opacity' && e.propertyName !== 'transform') return;
                    finish();
                };
                dialog.addEventListener('transitionend', onEnd);
                // Safety net in case transitionend doesn't fire (tab
                // backgrounded, reduced motion, etc.). Slightly past the
                // CSS transition (.delphi-dialog: 280ms) so the real event
                // wins under normal circumstances.
                setTimeout(finish, 320);
            });
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

        // Additive: appends to _godTargetOverlays so the same lifecycle
        // helper (_clearGodTargetOverlays) can be used by multiple call
        // sites within one onUpdateActionButtons cycle (e.g. Make Offering
        // and Raise Statue both wanting clickable hex affordances). Callers
        // must ensure the array starts cleared per cycle — handled by the
        // unconditional teardown at the top of onUpdateActionButtons.
        _highlightValidHexes: function(hexes, className, onClick) {
            if (!this._godTargetOverlays) this._godTargetOverlays = [];
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
         * Highlight the matching-color injury card stack in the local
         * player's hand and wire a click-to-discard handler. Mirrors the
         * "Discard Injuries" action button so the player can trigger the
         * action from the visible injury cards rather than hunting for
         * the button in the action bar. Idempotent: clears any previous
         * affordance before re-applying so a state arg refresh doesn't
         * stack handlers.
         */
        _setupInjuryDiscardAffordance: function(color) {
            this._teardownInjuryDiscardAffordance();
            if (!color) return;
            var card = document.querySelector(
                '#delphi-injury-cards-area .delphi-injury-card.injury-' + color
            );
            if (!card) return;
            card.classList.add('injury-discardable');
            var self = this;
            var handler = function() {
                self.bgaPerformAction('actDiscardInjuries', {});
            };
            card.addEventListener('click', handler);
            this._injuryDiscardHandler = { el: card, handler: handler };
        },

        _teardownInjuryDiscardAffordance: function() {
            if (this._injuryDiscardHandler) {
                var h = this._injuryDiscardHandler;
                h.el.removeEventListener('click', h.handler);
                this._injuryDiscardHandler = null;
            }
            // Belt-and-suspenders: any element still wearing the highlight
            // class (e.g. picked up via hot-reload before the handler was
            // tracked) gets cleaned too.
            document.querySelectorAll(
                '#delphi-injury-cards-area .delphi-injury-card.injury-discardable'
            ).forEach(function(el) {
                el.classList.remove('injury-discardable');
            });
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
            if (payload && typeof payload.favor_tokens !== 'undefined') {
                this._applyFavorUpdate(payload.player_id, payload.favor_tokens);
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
            var pid = parseInt(payload.player_id);
            // Resolve a target total: prefer authoritative favor_tokens; fall
            // back to applying favor_delta against the local player's current
            // count (delta-only payloads aren't useful for opponents since we
            // don't track their counts client-side).
            var newTotal = null;
            if (typeof payload.favor_tokens !== 'undefined') {
                newTotal = parseInt(payload.favor_tokens);
            } else if (typeof payload.favor_delta === 'number' && pid === this.player_id) {
                newTotal = (this.components.favorTokenCount || 0) + parseInt(payload.favor_delta);
            }
            if (newTotal !== null) {
                this._applyFavorUpdate(pid, newTotal);
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
            var isActivePlayer = parseInt(args.player_id) === this.player_id;
            // Active player: fly the monster tile from its hex into the next
            // defeated-monster slot before the standard remove + add. Other
            // players see only removeMonster's lift-and-fade since the
            // defeated-monster row is local to the active player's view.
            if (isActivePlayer) {
                var monsterEl = this.components.monsters.get(String(args.monster_id));
                var targetSlot = this.components.getNextEmptyDefeatedMonsterSlot();
                if (monsterEl && targetSlot) {
                    monsterEl.style.visibility = 'hidden';
                    var self = this;
                    await new Promise(function(resolve) {
                        self._flyCard({
                            from: monsterEl,
                            to: targetSlot,
                            className: 'delphi-flying-piece',
                            onLanding: resolve,
                        });
                    });
                }
            }
            this.components.removeMonster(args.monster_id);
            if (isActivePlayer) {
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
                        if (args.completion_value) tile.completionValue = args.completion_value;
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
            this._applyFavorUpdate(args.player_id, args.favor_tokens);
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
            this._adjustDeckCount('injury', -1);
            this._flyDeckCardToPanel('injury', args.player_id, 1);
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
            this._hideCardPicker();

            // Update the always-visible supply strip — drop the picked
            // card immediately so the slot it leaves behind goes empty.
            this._updateEquipmentSupplyAfterPick(args.card_id, null);
            if (args.new_display_card) {
                // Deck loses one card to refill; visually animate a
                // card-back from the equipment deck to the empty slot,
                // then paint the actual face card on landing.
                this._adjustDeckCount('equipment', -1);
                var self = this;
                var refill = args.new_display_card;
                // Find the empty slot we just opened up. Slots are
                // ordered, so the lowest-index slot without a filled
                // class is the target.
                var slots = document.querySelectorAll('#supply-equipment-cards .supply-equipment-slot');
                var targetSlot = null;
                for (var i = 0; i < slots.length; i++) {
                    if (!slots[i].classList.contains('supply-slot-filled')) {
                        targetSlot = slots[i];
                        break;
                    }
                }
                if (targetSlot) {
                    this._flyCard({
                        from: 'supply-deck-equipment'
                            ? document.getElementById('supply-deck-equipment')
                            : null,
                        to: targetSlot,
                        backgroundImage: "url('" + g_gamethemeurl + "img/equipment/card-back.jpg')",
                        // Interpolate from portrait card-back to landscape
                        // slot mid-flight, so the orientation flip feels
                        // continuous instead of an abrupt swap on landing.
                        rotation: 90,
                        onLanding: function() {
                            // Paint the actual face card into the slot.
                            self.gamedatas.equipmentDisplay = self.gamedatas.equipmentDisplay || [];
                            self.gamedatas.equipmentDisplay.push({
                                id: parseInt(refill.card_id),
                                cardTypeArg: parseInt(refill.card_type_arg),
                            });
                            self._renderEquipmentSupply(self.gamedatas.equipmentDisplay);
                        },
                    });
                } else {
                    // Fallback: no empty slot found (shouldn't happen
                    // normally); just paint the refill in place.
                    this._updateEquipmentSupplyAfterPick(null, refill);
                }
            }

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
            var isActivePlayer = parseInt(args.player_id) === this.player_id;
            // Active player: fly the piece from its hex into the next empty
            // cargo slot before the standard remove + storage swap. Other
            // players skip the flight and rely on the standard lift-and-fade
            // (they don't see the loader's ship storage).
            if (isActivePlayer) {
                var pieceMap = args.item_type === 'offering'
                    ? this.components.offerings
                    : this.components.statues;
                var pieceEl = pieceMap.get(parseInt(args.item_id));
                var targetSlot = this.components.getNextEmptyShipStorageSlot();
                if (pieceEl && targetSlot) {
                    pieceEl.style.visibility = 'hidden';
                    var self = this;
                    await new Promise(function(resolve) {
                        self._flyCard({
                            from: pieceEl,
                            to: targetSlot,
                            className: 'delphi-flying-piece',
                            onLanding: resolve,
                        });
                    });
                }
            }
            if (args.item_type === 'offering') {
                this.components.removeOffering(args.item_id);
            } else {
                this.components.removeStatue(args.item_id);
            }
            if (isActivePlayer) {
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
                    // Temple deliveries use the smaller .offering-small variant
                    // and a cardinal-position layout — createTempleOffering
                    // applies both. (createOffering is the island-spawn path
                    // and renders the full-size piece in a diamond layout.)
                    this.components.createTempleOffering(
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
            await this._applyFavorUpdate(args.player_id, args.favor_tokens);
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
                    imgUrl,
                    { gameModule: this, cardTypeArg: cardTypeArg }
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
            // Animate the picked face-up companion card from the deck
            // slot to wherever the gaining player's companion area
            // lives in the viewer's DOM: their full-size companion
            // cards area when self-viewing, the panel companion row
            // when watching someone else. On landing, flip the deck
            // slot to show the new top card and decrement the count.
            var companionDeckEl = document.getElementById('supply-deck-companion');
            var companionImgUrl = companionDeckEl
                ? getComputedStyle(companionDeckEl).backgroundImage
                : null;
            var companionDestEl = (parseInt(args.player_id) === this.player_id)
                ? document.getElementById('delphi-companion-cards-area')
                : document.getElementById('pp-companions-' + args.player_id);
            var self = this;
            this._flyCard({
                from: companionDeckEl,
                to: companionDestEl,
                backgroundImage: companionImgUrl,
                onLanding: function() {
                    self._renderCompanionDeckTop(args.new_top_card || null);
                    self._adjustDeckCount('companion', -1);
                },
            });
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
            var shrineId = this._shrineIdFromHex(hexQ, hexR);
            var overlay = args.shrine_owner_color + '-' + args.shrine_letter;

            // Drop any "peeked but unexplored" marker — the island is now
            // fully revealed, the marker would be redundant.
            this._unmarkIslandPeeked(shrineId);

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

            var shrineRows = document.querySelectorAll('#delphi-shrine-slots .shrine-row');
            var slotEl = shrineRows[sortOrder];
            if (!slotEl) return;

            var center = this.getHexCenterPixel(hexQ, hexR);
            if (!center) return;

            // Source: if the shrine was previously discovered (token sitting
            // on the matching Zeus tile because an opponent revealed the
            // island), fly from there. Otherwise from the player-board slot.
            var onZeusEl = document.querySelector(
                '.delphi-shrine-piece-on-zeus[data-shrine-index="' + shrineIndex + '"]'
            );
            var srcRect = (onZeusEl || slotEl).getBoundingClientRect();

            if (onZeusEl) onZeusEl.remove();
            slotEl.classList.remove('shrine-discovered');
            slotEl.classList.add('shrine-built');

            var self = this;
            this._flyShrinePiece(srcRect, center.x - 15, center.y - 15, function() {
                self._placeShrinePieceOnHex(center.x, center.y, shrineIndex);
            });
        },

        // Owner-only animation: an opponent just revealed an island that
        // belongs to this player. Slide the matching shrine token from the
        // player-board slot up onto the matching Zeus tile as a "discovered,
        // awaiting build" indicator. Ignored for all other viewers.
        notif_shrineDiscovered: function(args) {
            if (parseInt(args.player_id) !== this.player_id) return;

            var shrineIndex = parseInt(args.shrine_index);
            var sortOrder = this._findShrineZeusSortOrder(args.shrine_letter);
            if (sortOrder < 0) return;

            var shrineRows = document.querySelectorAll('#delphi-shrine-slots .shrine-row');
            var slotEl = shrineRows[sortOrder];
            if (!slotEl || slotEl.classList.contains('shrine-built')) return;

            var zeusTileEl = this._findShrineZeusTileEl(args.shrine_letter);
            if (!zeusTileEl) return;

            var boardPieces = document.getElementById('delphi-board-pieces');
            if (!boardPieces) return;
            var boardRect = boardPieces.getBoundingClientRect();
            var srcRect = slotEl.getBoundingClientRect();
            var zeusRect = zeusTileEl.getBoundingClientRect();

            slotEl.classList.add('shrine-discovered');

            var self = this;
            this._flyShrinePiece(
                srcRect,
                zeusRect.left - boardRect.left + zeusRect.width / 2 - 15,
                zeusRect.top - boardRect.top + zeusRect.height / 2 - 15,
                function() { self._placeShrinePieceOnZeus(zeusTileEl, shrineIndex); }
            );
        },

        // Shrine-token flight from a viewport rect to a board-pieces-relative
        // (destX, destY) point. Source rect is also viewport — translated to
        // board-pieces coords inline. The 15px offset centers the 30x30 piece
        // on the source/destination centers (matches .delphi-shrine-piece-*
        // dimensions in CSS).
        _flyShrinePiece: function(srcRect, destX, destY, onLand) {
            var boardPieces = document.getElementById('delphi-board-pieces');
            if (!boardPieces) return;
            var boardRect = boardPieces.getBoundingClientRect();
            var piece = document.createElement('div');
            piece.className = 'delphi-shrine-piece-flying';
            piece.style.left = (srcRect.left - boardRect.left + srcRect.width / 2 - 15) + 'px';
            piece.style.top = (srcRect.top - boardRect.top + srcRect.height / 2 - 15) + 'px';
            boardPieces.appendChild(piece);
            requestAnimationFrame(function() {
                piece.style.transition = 'left 0.8s ease-in-out, top 0.8s ease-in-out';
                piece.style.left = destX + 'px';
                piece.style.top = destY + 'px';
            });
            setTimeout(function() {
                piece.remove();
                if (onLand) onLand();
            }, 850);
        },

        _findShrineZeusTileEl: function(shrineLetter) {
            var t = this._findShrineZeusTile(shrineLetter);
            return t ? document.getElementById('zeus_' + t.id) : null;
        },

        _findShrineZeusTile: function(shrineLetter) {
            if (!shrineLetter || !this.gamedatas || !this.gamedatas.zeusTiles) return null;
            var pid = this.player_id;
            return this.gamedatas.zeusTiles.find(function(t) {
                return parseInt(t.playerId) === pid
                    && t.taskType === 'shrine'
                    && t.taskLetter === shrineLetter;
            }) || null;
        },

        _placeShrinePieceOnZeus: function(zeusTileEl, shrineIndex) {
            if (!zeusTileEl) return;
            var existing = zeusTileEl.querySelector(
                '.delphi-shrine-piece-on-zeus[data-shrine-index="' + shrineIndex + '"]'
            );
            if (existing) existing.remove();
            var piece = document.createElement('div');
            piece.className = 'delphi-shrine-piece-on-zeus';
            piece.dataset.shrineIndex = shrineIndex;
            zeusTileEl.appendChild(piece);
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
            this._adjustDeckCount('oracle', -args.cards.length);
            this._flyDeckCardToPanel('oracle', args.player_id, args.cards.length);
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
            // Defense in depth: if a Titan-source auto-discard fires while
            // the matching cell is still pending (i.e. the canonical
            // titanInjury notif was lost or hasn't replayed), fill the
            // cell as auto-discarded so the popup doesn't get stuck.
            // The PHP fix above always emits titanInjury now; this is a
            // backstop for unknown notif-loss paths.
            if (args.source === 'titan' && args.color) {
                var pendingCell = document.querySelector(
                    '.titan-popup-cell[data-player-id="' + args.player_id + '"].titan-popup-cell--pending'
                );
                if (pendingCell) {
                    var n = parseInt(args.count, 10) || 1;
                    this._fillTitanCell(args.player_id, {
                        colors: [],
                        autoDiscardedColors: Array(n).fill(args.color),
                    });
                    this._maybeCloseTitanPopup();
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
            this._adjustDeckCount('oracle', -1);
            this._flyDeckCardToPanel('oracle', args.player_id, 1);
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
                this.components.addOracleCardToHand(args.card_color, !!args.is_wild);
                // Rotate back — remove active and used states from all action bar cards
                var cardsBar = document.getElementById('delphi-action-oracle-cards');
                if (cardsBar) {
                    cardsBar.querySelectorAll('.action-oracle-card').forEach(function(el) {
                        el.classList.remove('action-card-active', 'action-card-inactive', 'action-card-used');
                    });
                }
                // Defensive rebind: the state transition's onEnteringState
                // _setupOracleCardClickHandlers can run BEFORE this notif (the
                // BGA framework doesn't guarantee notif → state-hook ordering),
                // in which case it queried for the hand card before
                // addOracleCardToHand recreated it and never bound the click.
                // _bindHandOracleCardSelectable is idempotent, so this is safe
                // either way.
                this._bindHandOracleCardSelectable(
                    args.card_color, parseInt(args.card_id), !!args.is_wild, false,
                );
            }
            // Put the cancelled card's color back into the player's panel hand for everyone.
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps && args.card_color) {
                ps.oracleHand = (ps.oracleHand || []).concat([{ id: args.card_id || 0, color: args.card_color }]);
                this.components.playerPanel.updateOracleHand(args.player_id, ps.oracleHand);
            }
        },

        notif_favorTokensTaken: async function(args) {
            // Await the chip flight so a turn-end (spendActionSource → next
            // state) doesn't fire before the chips visibly land at the
            // stash. With bgaSetupPromiseNotifications the BGA queue waits
            // on the returned promise.
            await this._applyFavorUpdate(args.player_id, args.favor_tokens);
        },

        notif_dieRecolored: function(args) {
            var dieIndex = parseInt(args.die_index);
            if (parseInt(args.player_id) === this.player_id) {
                this.components.recolorDie(this.player_id, dieIndex, args.target_color);
            }
            if (typeof args.favor_tokens !== 'undefined') {
                this._applyFavorUpdate(args.player_id, args.favor_tokens);
            }
            var ps = this.gamedatas.panelState && this.gamedatas.panelState[args.player_id];
            if (ps) {
                if (ps.dice && args.target_color) {
                    ps.dice.forEach(function(d) { if (d.idx === dieIndex) d.color = args.target_color; });
                    this.components.playerPanel.updateDice(args.player_id, ps.dice);
                }
                if (typeof args.favor_tokens !== 'undefined') {
                    ps.favorTokens = parseInt(args.favor_tokens, 10);
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
                    var shrineId = self._shrineIdFromHex(island.q, island.r);
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
                    if (ownerColor && letter && ownerColor !== 'empty') {
                        self._markIslandPeeked(shrineId, ownerColor, letter);
                    }
                });
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
            // Treat discarded tiles like completed ones visually: the slot
            // on the player board keeps a faded tile in place (so the
            // dashed empty-slot placeholder doesn't show through), and the
            // panel pip flips to .done. The win condition is unchanged
            // server-side — fewer_tasks lowers taskTotal to 11 and the
            // discard doesn't bump tasks_completed.
            this.components.completeZeusTile(args.tile_id);
            if (args.task_type && args.tile_id != null
                && this.gamedatas.panelState && this.gamedatas.panelState[args.player_id]) {
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

        notif_titanRoll: async function(args) {
            var popup = document.getElementById('delphi-titan-popup');
            var backdrop = document.getElementById('delphi-titan-backdrop');
            if (!popup || !backdrop) return;
            var titleEl = document.getElementById('titan-popup-title');
            var faceEl = popup.querySelector('.titan-popup-die-face');
            var gridEl = document.getElementById('titan-popup-grid');
            if (titleEl) titleEl.textContent = _('The Titan Attacks!');
            if (faceEl) {
                faceEl.textContent = String(args.value);
                faceEl.classList.remove('spin');
                void faceEl.offsetWidth;
                faceEl.classList.add('spin');
            }

            // Pre-populate one cell per player so the grid is visible from
            // the moment the popup opens. Cells start in --pending and
            // flip to --defended / --injured as each per-player notif
            // arrives. Sorted by player_no so the cells track turn order.
            // The pending class doubles as the "still waiting" signal —
            // _maybeCloseTitanPopup queries the DOM for remaining
            // pending cells rather than tracking a separate counter.
            var players = (this.gamedatas && this.gamedatas.players) || {};
            var playerIds = Object.keys(players).sort(function(a, b) {
                return parseInt(players[a].player_no || 0) - parseInt(players[b].player_no || 0);
            });
            var self = this;
            if (gridEl) {
                gridEl.innerHTML = playerIds.map(function(pid) {
                    var p = players[pid];
                    return '<div class="titan-popup-cell titan-popup-cell--pending" data-player-id="' + pid + '" style="--player-color: #' + p.color + ';">' +
                        '<div class="titan-popup-cell-name">' + self._escHtml(p.name) + '</div>' +
                        '<div class="titan-popup-cell-body">' +
                            '<div class="titan-popup-cell-pending">' + _('Awaiting roll…') + '</div>' +
                        '</div>' +
                        '</div>';
                }).join('');
            }

            backdrop.classList.add('active');
            popup.classList.add('active');

            // Defense in depth: the popup is modal and a missed per-player
            // notif would leave it stuck on "Awaiting roll…" with no
            // escape. Reset close state, arm a 30s force-close fallback,
            // and wire backdrop-click + Escape-key as a manual escape.
            this._titanPopupClosed = false;
            if (this._titanSafetyTimer) clearTimeout(this._titanSafetyTimer);
            this._titanSafetyTimer = setTimeout(function() {
                self._titanSafetyTimer = null;
                if (document.querySelectorAll('.titan-popup-cell--pending').length > 0) {
                    self._closeTitanPopup();
                }
            }, 30000);
            this._unbindTitanDismissHandlers();
            var dismiss = function() { self._closeTitanPopup(); };
            var onKey = function(e) { if (e.key === 'Escape') self._closeTitanPopup(); };
            backdrop.addEventListener('click', dismiss);
            document.addEventListener('keydown', onKey);
            this._titanDismissBackdrop = backdrop;
            this._titanDismissBackdropHandler = dismiss;
            this._titanDismissKeyHandler = onKey;

            // Brief pause so viewers register the rolled value before
            // per-player result notifs start filling in cells.
            await new Promise(r => setTimeout(r, 500));
        },

        _unbindTitanDismissHandlers: function() {
            // Use the backdrop ref captured at bind time so a re-render
            // between bind and unbind doesn't leak a listener on the
            // stale element.
            if (this._titanDismissBackdrop && this._titanDismissBackdropHandler) {
                this._titanDismissBackdrop.removeEventListener('click', this._titanDismissBackdropHandler);
            }
            if (this._titanDismissKeyHandler) {
                document.removeEventListener('keydown', this._titanDismissKeyHandler);
            }
            this._titanDismissBackdrop = null;
            this._titanDismissBackdropHandler = null;
            this._titanDismissKeyHandler = null;
        },

        notif_titanNoInjury: function(args) {
            this._fillTitanCell(args.player_id, { outcome: 'defended', colors: [] });
            return this._maybeCloseTitanPopup();
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
            // Decrement the deck by EVERY drawn card (kept + hero-auto-discarded)
            // since both came off the top of the deck.
            var keptCount = Array.isArray(args.colors) ? args.colors.length : 0;
            var autoCount = Array.isArray(args.auto_discarded_colors) ? args.auto_discarded_colors.length : 0;
            if (keptCount + autoCount > 0) {
                this._adjustDeckCount('injury', -(keptCount + autoCount));
            }
            this._fillTitanCell(args.player_id, {
                colors: Array.isArray(args.colors) ? args.colors : [],
                autoDiscardedColors: Array.isArray(args.auto_discarded_colors) ? args.auto_discarded_colors : [],
            });
            return this._maybeCloseTitanPopup();
        },

        // Replace the body of one player's cell with their result. Called
        // once per titanNoInjury / titanInjury notif as they arrive.
        // Outcome is derived from the colors arrays: kept > 0 means
        // 'injured' (red), all auto-discarded or deck empty means
        // 'defended' (green) since the player took no damage either way.
        _fillTitanCell: function(playerId, opts) {
            var cell = document.querySelector('.titan-popup-cell[data-player-id="' + playerId + '"]');
            if (!cell) return;
            var keptColors = opts.colors || [];
            var autoColors = opts.autoDiscardedColors || [];
            var outcome;
            var text;
            if (opts.outcome === 'defended') {
                outcome = 'defended';
                text = _('Successfully defended');
            } else if (keptColors.length > 0) {
                outcome = 'injured';
                text = keptColors.length === 1
                    ? _('Drew 1 injury')
                    : dojo.string.substitute(_('Drew ${n} injuries'), { n: keptColors.length });
            } else if (autoColors.length > 0) {
                outcome = 'defended';
                text = autoColors.length === 1
                    ? _('Hero auto-discarded 1 injury')
                    : dojo.string.substitute(_('Hero auto-discarded ${n} injuries'), { n: autoColors.length });
            } else {
                outcome = 'defended';
                text = _('No injury drawn (deck empty)');
            }
            // Strip every outcome class before applying the new one so a
            // late notif (e.g. canonical titanInjury arriving after the
            // heroAutoDiscarded backstop already filled the cell) can't
            // leave both --defended and --injured on the same cell.
            cell.classList.remove(
                'titan-popup-cell--pending',
                'titan-popup-cell--defended',
                'titan-popup-cell--injured'
            );
            cell.classList.add('titan-popup-cell--' + outcome);
            var body = cell.querySelector('.titan-popup-cell-body');
            if (!body) return;
            var html = '<div class="titan-popup-cell-text">' + text + '</div>';
            if (keptColors.length > 0) {
                var cards = keptColors.map(function(color) {
                    return '<div class="titan-popup-cell-card delphi-injury-card injury-' + color + '" data-color="' + color + '"></div>';
                }).join('');
                html += '<div class="titan-popup-cell-cards">' + cards + '</div>';
            }
            body.innerHTML = html;
        },

        // After every player's result has landed, hold the popup for 4s
        // so viewers can read the full table, then fly the active
        // player's drawn injuries (if any) to their player board while
        // the popup fades out concurrently. Returns a Promise so the BGA
        // notif queue blocks until the close finishes.
        //
        // "Last result" is detected from the DOM: when no cells remain
        // in --pending, we're done. This survives reconnect-mid-round
        // (titanRoll always re-renders the grid before per-player
        // notifs replay) without a separate counter to keep in sync.
        _maybeCloseTitanPopup: async function() {
            if (this._titanPopupClosed) return;
            var stillPending = document.querySelectorAll('.titan-popup-cell--pending').length;
            if (stillPending > 0) return;
            await new Promise(r => setTimeout(r, 4000));
            // Popup may have been dismissed (manual escape, safety
            // timer) during the hold — skip the flight + re-close so
            // the BGA queue unblocks immediately.
            if (this._titanPopupClosed) return;

            var selfId = parseInt(this.player_id);
            var selfCell = document.querySelector('.titan-popup-cell[data-player-id="' + selfId + '"]');
            var selfColors = [];
            if (selfCell && selfCell.classList.contains('titan-popup-cell--injured')) {
                selfCell.querySelectorAll('.titan-popup-cell-card').forEach(function(el) {
                    if (el.dataset.color) selfColors.push(el.dataset.color);
                });
            }

            // Start the flight first (snapshots source rects synchronously
            // inside _flyCard) so the cards detach visually from the popup
            // before the fade transform displaces it.
            var flightPromise = selfColors.length
                ? this._flyTitanInjuriesFromDialog(selfId, selfColors)
                : Promise.resolve();
            this._closeTitanPopup();
            await flightPromise;
        },

        _closeTitanPopup: function() {
            var popup = document.getElementById('delphi-titan-popup');
            var backdrop = document.getElementById('delphi-titan-backdrop');
            if (popup) popup.classList.remove('active');
            if (backdrop) backdrop.classList.remove('active');
            this._titanPopupClosed = true;
            if (this._titanSafetyTimer) {
                clearTimeout(this._titanSafetyTimer);
                this._titanSafetyTimer = null;
            }
            this._unbindTitanDismissHandlers();
        },

        // Fly injury card thumbnails from a player's titan-popup cell to
        // the affected player's board (self) or panel (opponent). Used
        // only for self in the close sequence; opponent flights stay
        // suppressed to keep multi-player Titan rounds quiet (their
        // panel injury bar already updated when the cell filled).
        _flyTitanInjuriesFromDialog: function(playerId, colors) {
            if (!colors || !colors.length) return Promise.resolve();
            var def = this._DECK_TO_PANEL_TARGETS.injury;
            var isSelf = parseInt(playerId) === parseInt(this.player_id);
            var destId = (isSelf && def.selfDestId) ? def.selfDestId : def.panelPrefix + playerId;
            var destEl = document.getElementById(destId);
            if (!destEl) return Promise.resolve();
            var cell = document.querySelector('.titan-popup-cell[data-player-id="' + playerId + '"]');
            if (!cell) return Promise.resolve();
            var cardEls = cell.querySelectorAll('.titan-popup-cell-card');
            if (!cardEls.length) return Promise.resolve();
            var bgImg = "url('" + g_gamethemeurl + def.backImg + "')";
            var self = this;
            var flights = [];
            cardEls.forEach(function(srcEl) {
                flights.push(new Promise(function(resolve) {
                    // Hide the source so we don't double-render it during
                    // flight; the clone takes its place. No stagger here —
                    // we're racing the popup fade, so capture all source
                    // rects synchronously up front by starting the flights
                    // together.
                    srcEl.style.visibility = 'hidden';
                    self._flyCard({
                        from: srcEl,
                        to: destEl,
                        backgroundImage: bgImg,
                        onLanding: resolve,
                    });
                }));
            });
            return Promise.all(flights);
        },

        notif_titanInjuryPrivate: function(args) {
            this.components.addInjuryCard(args.color);
        },

        notif_injuryDeckReshuffled: function(args) {
            // Discard pile recombines with the deck; server sends the new
            // total via args.count. Snap the cached count to it so the
            // supply-strip tooltip reflects the reshuffled size.
            if (typeof args.count !== 'undefined') {
                this._setDeckCount('injury', args.count);
            }
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
