{OVERALL_GAME_HEADER}

<div id="delphi-game-container">

    <!-- Supply Area -->
    <div id="delphi-supply-area">
        <div id="delphi-equipment-display">
            <h3>{EQUIPMENT_CARDS}</h3>
            <div id="delphi-equipment-cards"></div>
        </div>
        <div id="delphi-companion-supply"></div>
        <div id="delphi-decks">
            <div id="delphi-oracle-deck" class="delphi-deck">
                <span class="deck-label">{ORACLE_DECK}</span>
            </div>
            <div id="delphi-injury-deck" class="delphi-deck">
                <span class="deck-label">{INJURY_DECK}</span>
            </div>
        </div>
        <div id="delphi-favor-supply">
            <span class="favor-label">{FAVOR_TOKENS}</span>
            <span id="delphi-favor-count"></span>
        </div>
    </div>

    <!-- Main Board -->
    <div id="delphi-board-wrapper">
        <div id="delphi-board-container">
            <div id="delphi-hex-grid"></div>
            <div id="delphi-board-pieces"></div>
            <div id="delphi-zeus-token"></div>
        </div>
        <div id="delphi-board-controls">
            <button id="delphi-zoom-in" class="delphi-control-btn">+</button>
            <button id="delphi-zoom-out" class="delphi-control-btn">-</button>
            <button id="delphi-zoom-fit" class="delphi-control-btn">{FIT}</button>
        </div>
    </div>

    <!-- Current Player Board - Uses board image with overlays -->
    <div id="delphi-current-player-area">
        <div id="delphi-player-board">
            <!-- Oracle Wheel Overlay - Positioned over board image -->
            <div id="delphi-oracle-wheel">
                <div class="oracle-slot" data-color="red"></div>
                <div class="oracle-slot" data-color="yellow"></div>
                <div class="oracle-slot" data-color="green"></div>
                <div class="oracle-slot" data-color="blue"></div>
                <div class="oracle-slot" data-color="pink"></div>
                <div class="oracle-slot" data-color="black"></div>
                <div id="delphi-pythia-center"></div>
            </div>

            <!-- Oracle Dice - Positioned in center of oracle wheel area -->
            <div id="delphi-oracle-dice"></div>

            <!-- Shrine Slots Overlay - Over the top section with Greek symbols -->
            <div id="delphi-shrine-slots">
                <div class="shrine-slots-header">{SHRINES}</div>
                <div class="shrine-columns">
                    <div class="shrine-column" data-shrine="poseidon">
                        <div class="shrine-icon"></div>
                        <div class="shrine-row" data-row="0"></div>
                    </div>
                    <div class="shrine-column" data-shrine="apollo">
                        <div class="shrine-icon"></div>
                        <div class="shrine-row" data-row="0"></div>
                    </div>
                    <div class="shrine-column" data-shrine="artemis">
                        <div class="shrine-icon"></div>
                        <div class="shrine-row" data-row="0"></div>
                    </div>
                </div>
            </div>

            <!-- Shield Track Overlay - Over the 0-5 track -->
            <div id="delphi-shield-track">
                <div class="shield-slots">
                    <div class="shield-slot" data-value="0"></div>
                    <div class="shield-slot" data-value="1"></div>
                    <div class="shield-slot" data-value="2"></div>
                    <div class="shield-slot" data-value="3"></div>
                    <div class="shield-slot" data-value="4"></div>
                    <div class="shield-slot" data-value="5"></div>
                </div>
            </div>

            <!-- God Track Overlay - Over the cloud god track area -->
            <!-- 6 gods x 7 rows (row 0 = starting position at bottom, rows 1-6 = advancement track) -->
            <div id="delphi-god-track">
                <div id="delphi-god-columns">
                    <div class="god-column" data-god="apollo">
                        <div class="god-cell" data-row="6"></div>
                        <div class="god-cell" data-row="5"></div>
                        <div class="god-cell" data-row="4"></div>
                        <div class="god-cell" data-row="3"></div>
                        <div class="god-cell" data-row="2"></div>
                        <div class="god-cell" data-row="1"></div>
                    </div>
                    <div class="god-column" data-god="artemis">
                        <div class="god-cell" data-row="6"></div>
                        <div class="god-cell" data-row="5"></div>
                        <div class="god-cell" data-row="4"></div>
                        <div class="god-cell" data-row="3"></div>
                        <div class="god-cell" data-row="2"></div>
                        <div class="god-cell" data-row="1"></div>
                    </div>
                    <div class="god-column" data-god="poseidon">
                        <div class="god-cell" data-row="6"></div>
                        <div class="god-cell" data-row="5"></div>
                        <div class="god-cell" data-row="4"></div>
                        <div class="god-cell" data-row="3"></div>
                        <div class="god-cell" data-row="2"></div>
                        <div class="god-cell" data-row="1"></div>
                    </div>
                    <div class="god-column" data-god="aphrodite">
                        <div class="god-cell" data-row="6"></div>
                        <div class="god-cell" data-row="5"></div>
                        <div class="god-cell" data-row="4"></div>
                        <div class="god-cell" data-row="3"></div>
                        <div class="god-cell" data-row="2"></div>
                        <div class="god-cell" data-row="1"></div>
                    </div>
                    <div class="god-column" data-god="hermes">
                        <div class="god-cell" data-row="6"></div>
                        <div class="god-cell" data-row="5"></div>
                        <div class="god-cell" data-row="4"></div>
                        <div class="god-cell" data-row="3"></div>
                        <div class="god-cell" data-row="2"></div>
                        <div class="god-cell" data-row="1"></div>
                    </div>
                    <div class="god-column" data-god="ares">
                        <div class="god-cell" data-row="6"></div>
                        <div class="god-cell" data-row="5"></div>
                        <div class="god-cell" data-row="4"></div>
                        <div class="god-cell" data-row="3"></div>
                        <div class="god-cell" data-row="2"></div>
                        <div class="god-cell" data-row="1"></div>
                    </div>
                </div>
            </div>

            <!-- God Starting Row - Bottom row beside shield track where gods start -->
            <div id="delphi-god-start-row">
                <div class="god-start-cell" data-god="apollo"></div>
                <div class="god-start-cell" data-god="artemis"></div>
                <div class="god-start-cell" data-god="poseidon"></div>
                <div class="god-start-cell" data-god="aphrodite"></div>
                <div class="god-start-cell" data-god="hermes"></div>
                <div class="god-start-cell" data-god="ares"></div>
            </div>

            <!-- Cargo Slots - Equipment/Companion icons at bottom -->
            <div id="delphi-cargo-slots">
                <div class="cargo-slot" data-type="equipment" data-index="0"></div>
                <div class="cargo-slot" data-type="equipment" data-index="1"></div>
            </div>

            <!-- Defeated Monsters - Bottom area -->
            <div id="delphi-defeated-monsters"></div>

            <!-- Cards Panel - Right side -->
            <div id="delphi-player-cards">
                <div id="delphi-oracle-hand">
                    <span class="card-section-label">{ORACLE_CARDS}</span>
                    <div class="card-container"></div>
                </div>
                <div id="delphi-equipment-owned">
                    <span class="card-section-label">{EQUIPMENT}</span>
                    <div class="card-container"></div>
                </div>
                <div id="delphi-companion-owned">
                    <span class="card-section-label">{COMPANIONS}</span>
                    <div class="card-container"></div>
                </div>
                <div id="delphi-injury-stack">
                    <span class="card-section-label">{INJURIES}</span>
                    <div class="injury-count"></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Other Players (Miniature) -->
    <div id="delphi-other-players">
        <!-- BEGIN other_player -->
        <div class="delphi-mini-player" data-player-id="{PLAYER_ID}">
            <span class="mini-name" style="color:#{PLAYER_COLOR}">{PLAYER_NAME}</span>
            <span class="mini-tasks">{TASKS}/12</span>
            <span class="mini-shield">{SHIELD_LABEL}:{SHIELD}</span>
            <span class="mini-favor">{FAVOR_LABEL}:{FAVOR}</span>
            <button class="expand-btn">{VIEW}</button>
        </div>
        <!-- END other_player -->
    </div>

</div>

<!-- Dialogs -->
<div id="delphi-combat-dialog" class="delphi-dialog">
    <div class="dialog-header">
        <span id="combat-title"></span>
        <button class="dialog-close">&times;</button>
    </div>
    <div class="dialog-content">
        <div id="combat-monster-info">
            <div id="combat-monster-image"></div>
            <div id="combat-monster-stats">
                <div class="stat-row">
                    <span class="stat-label">{YOUR_SHIELD}:</span>
                    <span id="combat-shield-value"></span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">{TARGET_ROLL}:</span>
                    <span id="combat-target-value"></span>
                </div>
            </div>
        </div>
        <div id="combat-dice-area">
            <div id="combat-battle-die"></div>
            <div id="combat-roll-result"></div>
        </div>
        <div id="combat-favor-info">
            <span>{FAVOR_TOKENS}:</span>
            <span id="combat-favor-count"></span>
        </div>
    </div>
    <div class="dialog-actions">
        <button id="combat-roll-btn" class="delphi-btn primary">{ROLL}</button>
        <button id="combat-continue-btn" class="delphi-btn">{CONTINUE_FIGHT}</button>
        <button id="combat-surrender-btn" class="delphi-btn secondary">{SURRENDER}</button>
    </div>
</div>

<div id="delphi-reward-dialog" class="delphi-dialog">
    <div class="dialog-header">
        <span id="reward-title">{SELECT_REWARD}</span>
        <button class="dialog-close">&times;</button>
    </div>
    <div class="dialog-content">
        <div id="reward-options"></div>
    </div>
    <div class="dialog-actions">
        <button id="reward-confirm-btn" class="delphi-btn primary">{CONFIRM}</button>
    </div>
</div>

<!-- JS Templates -->
<script type="text/javascript">
var jstpl_hex = '<div class="delphi-hex hex-${color}" id="hex_${q}_${r}" data-q="${q}" data-r="${r}" data-type="${type}" data-color="${color}" style="left:${x}px;top:${y}px;"></div>';

var jstpl_ship = '<div class="delphi-ship ship-${color}" id="ship_${player_id}" data-player="${player_id}" style="left:${x}px;top:${y}px;"></div>';

var jstpl_die = '<div class="delphi-die die-${color}" id="die_${id}" data-color="${color}" data-index="${index}"></div>';

var jstpl_monster = '<div class="delphi-monster monster-${type}" id="monster_${id}" data-type="${type}" data-color="${color}" style="left:${x}px;top:${y}px;"></div>';

var jstpl_statue = '<div class="delphi-statue statue-${color}" id="statue_${id}" data-color="${color}"></div>';

var jstpl_offering = '<div class="delphi-offering offering-${color}" id="offering_${id}" data-color="${color}"></div>';

var jstpl_island = '<div class="delphi-island island-${type}" id="island_${id}" data-revealed="${revealed}" style="left:${x}px;top:${y}px;"></div>';

var jstpl_card = '<div class="delphi-card card-${type}" id="card_${type}_${id}" data-type="${type}" data-card-id="${card_id}"></div>';

var jstpl_god_token = '<div class="delphi-god-token god-${god}" id="god_${player_id}_${god}" data-god="${god}" data-player="${player_id}"></div>';

var jstpl_zeus_tile = '<div class="delphi-zeus-tile zeus-${task_type}" id="zeus_${id}" data-type="${task_type}" data-color="${task_color}" data-completed="${completed}"></div>';

var jstpl_equipment_card = '<div class="delphi-equipment-card" id="equipment_${id}" data-card-id="${id}" style="background-image:url(${img_url})"></div>';

var jstpl_oracle_card = '<div class="delphi-oracle-card oracle-${color}" id="oracle_${id}" data-color="${color}"></div>';
</script>

{OVERALL_GAME_FOOTER}
