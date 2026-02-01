{OVERALL_GAME_HEADER}

<div id="delphi-game-container">

    <!-- Main Board -->
    <div id="delphi-board-wrapper">
        <div id="delphi-board-container">
            <div id="delphi-hex-grid"></div>
            <div id="delphi-board-pieces"></div>
            <div id="delphi-zeus-token"></div>
        </div>
    </div>

    <!-- Current Player Area - Player board with surrounding card areas -->
    <div id="delphi-current-player-area">
        <!-- Zeus Tiles - 4 groups of 3 above the player board -->
        <div id="delphi-zeus-tiles-area">
            <div class="zeus-tile-group" data-type="shrine">
                <div class="zeus-tile-slot" data-index="0"></div>
                <div class="zeus-tile-slot" data-index="1"></div>
                <div class="zeus-tile-slot" data-index="2"></div>
            </div>
            <div class="zeus-tile-group" data-type="statue">
                <div class="zeus-tile-slot" data-index="0"></div>
                <div class="zeus-tile-slot" data-index="1"></div>
                <div class="zeus-tile-slot" data-index="2"></div>
            </div>
            <div class="zeus-tile-group" data-type="offering">
                <div class="zeus-tile-slot" data-index="0"></div>
                <div class="zeus-tile-slot" data-index="1"></div>
                <div class="zeus-tile-slot" data-index="2"></div>
            </div>
            <div class="zeus-tile-group" data-type="monster">
                <div class="zeus-tile-slot" data-index="0"></div>
                <div class="zeus-tile-slot" data-index="1"></div>
                <div class="zeus-tile-slot" data-index="2"></div>
            </div>
        </div>

        <!-- Played Oracle Card - Top left, rotated to show it's being used -->
        <div id="delphi-played-oracle-card"></div>

        <!-- Oracle Cards - Left side, stacking bottom to top -->
        <div id="delphi-oracle-cards-area"></div>

        <!-- Favor Tokens - Top right of player area -->
        <div id="delphi-favor-tokens-area">
            <div class="favor-token-stack">
                <div class="favor-count-badge">0</div>
            </div>
        </div>

        <!-- Companion Cards - Right side, stacking top to bottom -->
        <div id="delphi-companion-cards-area"></div>

        <!-- Injury Cards - Bottom left, stacking right to left -->
        <div id="delphi-injury-cards-area"></div>

        <!-- Equipment Cards - Bottom right, with gaps -->
        <div id="delphi-equipment-cards-area"></div>

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

            <!-- Ship Tile - Placed on top of ship at 8 degrees -->
            <div id="delphi-ship-tile-slot"></div>

            <!-- Ship Storage - For statues and offerings (typically 2, can be 4) -->
            <div id="delphi-ship-storage">
                <div class="storage-slot" data-index="0"></div>
                <div class="storage-slot" data-index="1"></div>
                <div class="storage-slot" data-index="2"></div>
                <div class="storage-slot" data-index="3"></div>
            </div>

            <!-- Defeated Monsters - Lower right of player board (max 3) -->
            <div id="delphi-defeated-monsters">
                <div class="defeated-monster-slot" data-index="0"></div>
                <div class="defeated-monster-slot" data-index="1"></div>
                <div class="defeated-monster-slot" data-index="2"></div>
            </div>
        </div>
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

var jstpl_oracle_card = '<div class="delphi-oracle-card oracle-${color}" id="oracle_${id}" data-color="${color}" data-card-id="${card_id}"><div class="card-count-badge">${count}</div></div>';

var jstpl_injury_card = '<div class="delphi-injury-card injury-${color}" id="injury_${id}" data-color="${color}" data-card-id="${card_id}"><div class="card-count-badge">${count}</div></div>';

var jstpl_companion_card = '<div class="delphi-companion-card companion-${type}" id="companion_${id}" data-type="${type}" data-color="${color}" data-card-id="${card_id}" style="background-image:url(${img_url})"></div>';

var jstpl_ship_tile = '<div class="delphi-ship-tile" id="ship_tile_${id}" data-tile-id="${id}" style="background-image:url(${img_url})"></div>';

var jstpl_favor_token = '<div class="delphi-favor-token" id="favor_${id}"></div>';

var jstpl_cargo_item = '<div class="delphi-cargo-item cargo-${type} cargo-${color}" id="cargo_${id}" data-type="${type}" data-color="${color}"></div>';

var jstpl_defeated_monster = '<div class="delphi-defeated-monster monster-${color}" id="defeated_monster_${id}" data-color="${color}"></div>';
</script>

{OVERALL_GAME_FOOTER}
