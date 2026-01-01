# The Oracle of Delphi - Visual-First BGA Implementation Plan

## Executive Summary

**Game**: The Oracle of Delphi by Stefan Feld
**Players**: 2-4 | **Duration**: ~70 minutes | **BGG ID**: 193558
**Type**: Racing game - complete 12 tasks and return to Zeus first

### Core Mechanics
- **Oracle Dice**: 3 colored dice (6 colors) determine available actions
- **Color Matching**: Actions require matching die color to target
- **Favor Tokens**: Currency to "recolor" dice clockwise on oracle wheel
- **Gods**: 6 gods on track provide special abilities at top row
- **12 Tasks**: 3 Shrines + 3 Statues + 3 Offerings + 3 Monsters

### Visual Approach (User Selected)
- **Hex Rendering**: CSS-only hexagons (clip-path + transforms)
- **Player Boards**: Miniature summaries with "View Details" expansion
- **Dice Animation**: 3D CSS cube roll using BX DiceTrait

---

## 1. Visual Layout Design

### Supply Visibility Strategy

**Hidden (drawn/selected as result of actions)**:
- Oracle deck - drawn via actions or rewards
- Injury deck - drawn when Titan attacks or combat roll = 0
- Companion cards - selected when raising statues (reward)

**Visible**:
- Equipment display (6 cards) - selected when defeating monsters (reward)
- Favor tokens - player's count shown on player board (spent actively during turn)

### Desktop Layout (1920x1080)
```
+------------------------------------------------------------------+
|  BGA HEADER / PLAYER PANELS                                       |
+------------------------------------------------------------------+
|                                                                   |
|  +--------------------------------------------------------------+ |
|  |                                                              | |
|  |                 MAIN HEXAGONAL BOARD                         | |
|  |                   (Full Width)                               | |
|  |              (Zoomable/Pannable/Scrollable)                  | |
|  |                                                              | |
|  |                                                              | |
|  +--------------------------------------------------------------+ |
|                                                                   |
|  +--------------------------------------------------------------+ |
|  | EQUIPMENT DISPLAY: [Card1] [Card2] [Card3] [Card4] [Card5] [Card6] |
|  +--------------------------------------------------------------+ |
|                                                                   |
|  +--------------------------------------------------------------+ |
|  |              CURRENT PLAYER BOARD (Expanded)                  | |
|  |  [Zeus Tiles] [Oracle Wheel+Dice] [God Track] [Shield] [Cards]| |
|  |  [Favor: 5]                                                   | |
|  +--------------------------------------------------------------+ |
|                                                                   |
|  +--------------------------------------------------------------+ |
|  |  OTHER PLAYERS: [P2: 8/12 tasks, Shield:2] [P3] [P4] [View]  | |
|  +--------------------------------------------------------------+ |
+------------------------------------------------------------------+
```

### Tablet Layout (1024x768)
```
+----------------------------------------+
|  BGA HEADER                            |
+----------------------------------------+
|  +----------------------------------+  |
|  |      MAIN BOARD                  |  |
|  |      (Full Width, Scrollable)    |  |
|  +----------------------------------+  |
|  +----------------------------------+  |
|  | EQUIPMENT: [C1][C2][C3][C4][C5][C6]|
|  +----------------------------------+  |
|  +----------------------------------+  |
|  |   CURRENT PLAYER BOARD           |  |
|  |   (Horizontally Scrollable)      |  |
|  +----------------------------------+  |
|  [Other Players - Collapsed]          |
+----------------------------------------+
```

### Mobile Layout (375x667)
```
+-------------------------+
|  BGA HEADER             |
+-------------------------+
|    MAIN BOARD           |
|    (Full Width)         |
|    (Pan/Zoom)           |
+-------------------------+
| EQUIPMENT (scrollable)  |
| [C1][C2][C3][C4][C5][C6]|
+-------------------------+
|  [Tab: Player | Others] |
+-------------------------+
|  SELECTED TAB CONTENT   |
+-------------------------+
```

### Responsive Breakpoints
- **Desktop**: >= 1200px - Full layout, board dominates
- **Tablet**: 768-1199px - Stacked, all visible with scroll
- **Mobile**: < 768px - Tab-based for player boards only

### Hex Grid Specifications
- **Coordinate System**: Axial (q, r) with flat-topped hexagons
- **Hex Size**: ~80px width, ~92px height (scales with zoom)
- **Full Board**: Fills available width, maintains aspect ratio
- **Zoom Range**: 0.5x - 1.5x

---

## 2. Component Visual Catalog

### 2.1 Water Hex Spaces (6 colors)

| Color | Hex Code | CSS Class |
|-------|----------|-----------|
| Red | #E53935 | `.hex-red` |
| Yellow | #FDD835 | `.hex-yellow` |
| Green | #43A047 | `.hex-green` |
| Blue | #1E88E5 | `.hex-blue` |
| Pink | #D81B60 | `.hex-pink` |
| Black | #424242 | `.hex-black` |

**States**:
- Normal: Base color with wave texture
- Valid destination: Pulsing glow (`.hex-valid`)
- Ship present: Ship overlay centered

### 2.2 Player Ships

**Assets**: `img/pieces/[color]-ship.png` (red, yellow, green, blue)
**Size**: ~60px x 40px
**States**:
- Normal: Standard appearance
- Selected: `.ship-selected` - highlight + 1.1x scale
- Moving: CSS transition along bezier path (500ms/space)

### 2.3 Oracle Dice

**Colors**: Same 6 colors as water hexes
**Rendering**: 3D CSS cube using BX DiceTrait
**Size**: ~50px cube

**States**:
| State | Visual | Class |
|-------|--------|-------|
| On wheel | Positioned by color slot | `.die-on-wheel` |
| Available | Clickable highlight | `.die-available` |
| Selected | Lifted, enlarged | `.die-selected` |
| Used | In Pythia center | `.die-used` |
| Rolling | 3D tumble animation | `.die-rolling` |

### 2.4 Gods (6)

| God | Color | Special Ability | Asset |
|-----|-------|-----------------|-------|
| Poseidon | Blue | Teleport ship anywhere | `img/gods/poseidon.png` |
| Apollo | Yellow | All dice become wild | `img/gods/apollo.png` |
| Artemis | Green | Flip any island (no die) | `img/gods/artemis.png` |
| Aphrodite | Red | Discard all injuries | `img/gods/aphrodite.png` |
| Ares | Black | Auto-kill adjacent monster | `img/gods/ares.png` |
| Hermes | Pink | Grab any statue from any city | `img/gods/hermes.png` |

**Track Rows**: Bottom (0) → Player count row → Top (special ability available)

### 2.5 Monsters

**Assets**: `img/monsters/[type].jpg`
- cyclops, minotaur, chimera, hydra, gorgon, siren
**Size**: ~50px x 50px
**Color Association**: Each monster type = one of 6 colors

**States**:
- On board: Full visibility
- Fightable: `.monster-targetable` - red glow when adjacent + matching die
- In combat: Shake animation
- Defeated: Fade out + slide to player board

### 2.6 Statues & Offerings

**Statues**: `img/pieces/[color]-statue.png` (~40x60px)
**Offerings**: `img/pieces/[color]-offering.png` (~25x25px cubes)

**Locations**: City tile → Ship cargo → Delivery site

### 2.7 Cards

| Type | Count | Size | Assets | Display |
|------|-------|------|--------|---------|
| Oracle | 30 | 60x90px | `img/oracle/[color].jpg` | Hand (fanned) |
| Equipment | 22 | 80x120px | `img/equipment/card-*.jpg` | 6 in display |
| Companion | 18 | 80x120px | `img/companion/card-*.png` | Supply stack |
| Injury | 42 | 60x90px | `img/injury/[color].jpg` | Stacked count |

### 2.8 Other Components

| Component | Asset | Size | Notes |
|-----------|-------|------|-------|
| Shield marker | `img/pieces/[color]-shield.png` | 30x30px | Track 0-5 |
| Shrines | `img/pieces/shrine.png` | 30x40px | Player colored |
| Favor tokens | `img/pieces/favor-token.jpg` | 25px dia | Counter display |
| Zeus tiles | `img/zeus-tiles/[type]/*.jpg` | 80x60px | Task cards |
| Titan die | Custom render | 50px | Values for attack |
| Battle die | Custom render | 50px | D10 (0-9) |

---

## 3. Player Interaction Design

### 3.1 Move Ship Flow

```
1. [Turn Active] Player sees Oracle Dice on wheel
2. [Click Die]
   → Die becomes selected (enlarged, highlighted)
   → Valid destination hexes glow (matching die color, within range 3)
   → Range indicator shows moveable area
3. [Optional: Recolor]
   → Click different color slot on oracle wheel
   → Tooltip shows: "Spend X Favor Tokens?"
   → Confirm or cancel
4. [Click Destination Hex]
   → Path highlights
   → Ship animates along path (500ms per hex)
   → Die moves to Pythia center
5. [Optional: Extend Range]
   → If destination > 3 spaces, prompt per extra space
   → "Spend 1 Favor Token to extend range?"
```

### 3.2 Fight Monster Flow

```
1. [Prerequisite] Ship adjacent to monster + matching die available
   → Monster gets targetable indicator (red glow)
2. [Click Monster]
   → Combat dialog opens (modal)
3. [Combat Dialog Shows]
   - Monster image and name
   - Monster strength: 9 - your shield = target number
   - Your shield value
   - Your favor tokens
   - [ROLL] button
4. [Click Roll]
   → Battle die (0-9) animates with 3D tumble
   → Result displayed prominently
5. [Result Handling]
   IF roll >= target:
     → Victory animation
     → Monster slides to player board
     → Zeus tile completes → Equipment card selection
   IF roll < target:
     → If rolled 0: Draw injury card animation
     → Prompt: "Spend 1 Favor to continue? (New target: X-1)"
     → [Continue] or [Surrender] buttons
6. [Combat End]
   → Dialog closes
   → Die moves to Pythia
```

**Combat Dialog Mockup**:
```
+------------------------------------------+
|           COMBAT: Red Cyclops             |
+------------------------------------------+
|                                           |
|  [Cyclops Image]     Your Shield: 2       |
|                      Target Roll: 7+      |
|                                           |
|        [====BATTLE DIE====]               |
|              [ ROLL ]                     |
|                                           |
|  Favor Tokens: 5                          |
+------------------------------------------+
|  [Continue Fight (1 Favor)] [Surrender]   |
+------------------------------------------+
```

### 3.3 Load/Deliver Cargo Flow

**Load Offering**:
```
1. Ship adjacent to Offering Island + matching die
2. Matching offering cubes highlight
3. Click cube → Animates to ship cargo slot
4. Die moves to Pythia
```

**Make Offering (Deliver)**:
```
1. Ship adjacent to Temple + matching offering in cargo + matching die
2. Temple highlights
3. Click temple → Offering animates from cargo to temple
4. Zeus tile completes → Reward: 3 Favor Tokens
```

**Load/Raise Statue**: Same pattern with City Tiles and Statue Islands

### 3.4 Explore Island Flow

**Unexplored Islands**: Display `img/island-1-tile/island-background.png` (cloud/mystery icon)
**Explored Islands**: Show corresponding 1-tile island image (shrine location with player color)

```
1. Ship adjacent to unexplored Island + matching hex color die
2. Island tile highlights with "?" indicator (shows island-background.png)
3. Click island → Flip animation reveals corresponding 1-tile island image
4. Check result:
   a. Matches your shrine Zeus tile color:
      → Shrine auto-places on island
      → Zeus tile completes → Reward: Advance 1 god
   b. Other player's color:
      → Bonus based on Greek letter:
        - Psi (Ψ): 4 Favor Tokens
        - Phi (Φ): 2 Oracle Cards
        - Sigma (Σ): Advance gods 3 total steps
        - Omega (Ω): Discard injuries + 1 shield
```

### 3.5 Recolor Dice Flow

```
1. Click Oracle Die → Die selected
2. Oracle wheel shows recolor options
   → Each slot shows cost (steps clockwise × 1 Favor)
   → Visual: arrows with token cost
3. Click target color slot
   → Confirmation tooltip: "Spend X Favor?"
   → [Confirm] [Cancel]
4. Die moves to new slot, favor decrements
5. Proceed with action using new color
```

### 3.6 God Special Abilities Flow

```
1. God at top row → Special glow + tooltip shows ability
2. Click god token → Options:
   a. Use special ability (ability-specific flow)
   b. Return to bottom for 1 Oracle Card
3. Execute ability:
   - Poseidon: Click any water hex → Ship teleports
   - Apollo: Draw card, all dice wild this turn
   - Artemis: Click any face-down island → Flip (no die needed)
   - Aphrodite: All injuries discard (animation)
   - Ares: Click adjacent monster → Auto-defeat (no roll)
   - Hermes: Click any statue anywhere → Load to ship
4. God returns to bottom row
```

### 3.7 Consult Oracle (End Turn)

```
1. [Trigger] "End Turn" clicked OR all dice used
2. [Animation] 3 Oracle dice roll simultaneously (3D tumble)
3. [Results] Dice land on wheel slots, colors announced & stored
4. [Last Player Only] Titan die also rolls:
   → If 6: All players draw 2 injury cards
   → Else: Compare to each player's shield
     → Shield < Titan: Draw 1 injury card
5. [Turn ends] → Next player begins
```

### 3.8 God Advancement (Start of Turn)

**Note**: Instead of a multiactive state after oracle consultation, each player checks for god advancement at the START of their own turn based on the PREVIOUS player's oracle roll.

```
1. [Turn Start] Check previous player's oracle colors (stored in globals)
2. [Prompt] "Previous player rolled: Red, Blue, Green"
   → Check: Do you have a matching god NOT on bottom row?
   → If yes: "Advance [God Name]?" or "Skip"
3. [Optional] Advance 1 matching god by 1 step
4. [Continue] → Check injuries phase → Actions phase
```

**Benefits of this approach**:
- No multiactive state complexity
- Players don't wait for others
- Smoother game flow
- Player can decide during their planning time

---

## 4. HTML Template Structure

### Main Template (`theoracleofdelphigzed_theoracleofdelphigzed.tpl`)

```html
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
            <div id="delphi-oracle-deck" class="delphi-deck"></div>
            <div id="delphi-injury-deck" class="delphi-deck"></div>
        </div>
        <div id="delphi-favor-supply"></div>
    </div>

    <!-- Main Board -->
    <div id="delphi-board-wrapper">
        <div id="delphi-board-container">
            <div id="delphi-hex-grid"></div>
            <div id="delphi-board-pieces"></div>
            <div id="delphi-zeus-token"></div>
        </div>
        <div id="delphi-board-controls">
            <button id="zoom-in">+</button>
            <button id="zoom-out">-</button>
            <button id="zoom-fit">Fit</button>
        </div>
    </div>

    <!-- Current Player Board -->
    <div id="delphi-current-player-area">
        <div id="delphi-player-board">
            <!-- Zeus Tiles -->
            <div id="delphi-zeus-tiles">
                <div class="zeus-group" data-type="shrines"></div>
                <div class="zeus-group" data-type="statues"></div>
                <div class="zeus-group" data-type="offerings"></div>
                <div class="zeus-group" data-type="monsters"></div>
            </div>

            <!-- Oracle Wheel -->
            <div id="delphi-oracle-wheel">
                <div class="oracle-slot" data-color="red"></div>
                <div class="oracle-slot" data-color="yellow"></div>
                <div class="oracle-slot" data-color="green"></div>
                <div class="oracle-slot" data-color="blue"></div>
                <div class="oracle-slot" data-color="pink"></div>
                <div class="oracle-slot" data-color="black"></div>
                <div id="delphi-pythia-center"></div>
                <div id="delphi-oracle-dice"></div>
            </div>

            <!-- God Track -->
            <div id="delphi-god-track"></div>

            <!-- Shield Track -->
            <div id="delphi-shield-track"></div>

            <!-- Shrines -->
            <div id="delphi-shrine-slots"></div>

            <!-- Ship Tile + Cargo -->
            <div id="delphi-ship-tile">
                <div id="delphi-cargo-slots"></div>
            </div>

            <!-- Defeated Monsters -->
            <div id="delphi-defeated-monsters"></div>

            <!-- Cards -->
            <div id="delphi-player-cards">
                <div id="delphi-oracle-hand"></div>
                <div id="delphi-equipment-owned"></div>
                <div id="delphi-companion-owned"></div>
                <div id="delphi-injury-stack"></div>
            </div>
        </div>
    </div>

    <!-- Other Players (Miniature) -->
    <div id="delphi-other-players">
        <!-- BEGIN other_player -->
        <div class="delphi-mini-player" data-player-id="{PLAYER_ID}">
            <span class="mini-name" style="color:#{PLAYER_COLOR}">{PLAYER_NAME}</span>
            <span class="mini-tasks">{TASKS}/12</span>
            <span class="mini-shield">Shield:{SHIELD}</span>
            <span class="mini-favor">Favor:{FAVOR}</span>
            <button class="expand-btn">{VIEW}</button>
        </div>
        <!-- END other_player -->
    </div>

</div>

<!-- Dialogs -->
<div id="delphi-combat-dialog" class="delphi-dialog"></div>
<div id="delphi-reward-dialog" class="delphi-dialog"></div>

<!-- JS Templates -->
<script type="text/javascript">
var jstpl_hex = '<div class="delphi-hex" id="hex_${q}_${r}" data-q="${q}" data-r="${r}" data-type="${type}" data-color="${color}"></div>';
var jstpl_ship = '<div class="delphi-ship" id="ship_${player_id}" data-player="${player_id}"></div>';
var jstpl_die = '<div class="delphi-die" id="die_${id}" data-color="${color}"></div>';
var jstpl_monster = '<div class="delphi-monster" id="monster_${id}" data-color="${color}"></div>';
var jstpl_card = '<div class="delphi-card" id="card_${type}_${id}" data-type="${type}"></div>';
</script>

{OVERALL_GAME_FOOTER}
```

---

## 5. Database Schema

### 5.1 Core Tables

```sql
-- dbmodel.sql

-- =====================================================
-- BOARD STATE
-- =====================================================

-- Hex grid (generated during setup)
CREATE TABLE IF NOT EXISTS `hex` (
    `hex_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `q` INT NOT NULL,
    `r` INT NOT NULL,
    `tile_type` VARCHAR(20) NOT NULL,  -- 'water','island','city','zeus','shallow'
    `color` VARCHAR(10) DEFAULT NULL,
    `island_content` VARCHAR(50) DEFAULT NULL,  -- For revealed islands
    `is_revealed` TINYINT(1) DEFAULT 0,
    PRIMARY KEY (`hex_id`),
    UNIQUE KEY `coords` (`q`, `r`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Monsters
CREATE TABLE IF NOT EXISTS `monster` (
    `monster_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `monster_type` VARCHAR(20) NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    `is_defeated` TINYINT(1) NOT NULL DEFAULT 0,
    `defeated_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`monster_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Offerings
-- States: on_island → in_cargo → delivered
CREATE TABLE IF NOT EXISTS `offering` (
    `offering_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `origin_hex_q` INT NOT NULL,       -- Original offering island location
    `origin_hex_r` INT NOT NULL,
    `player_id` INT DEFAULT NULL,      -- Set when in player's cargo
    `is_delivered` TINYINT(1) NOT NULL DEFAULT 0,
    `delivered_to_hex_q` INT DEFAULT NULL,  -- Temple location when delivered
    `delivered_to_hex_r` INT DEFAULT NULL,
    `delivered_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`offering_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Statues
-- States: on_city → in_cargo → raised
CREATE TABLE IF NOT EXISTS `statue` (
    `statue_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `origin_hex_q` INT NOT NULL,       -- City tile location
    `origin_hex_r` INT NOT NULL,
    `player_id` INT DEFAULT NULL,      -- Set when in player's cargo
    `is_raised` TINYINT(1) NOT NULL DEFAULT 0,
    `raised_at_hex_q` INT DEFAULT NULL,     -- Statue island location when raised
    `raised_at_hex_r` INT DEFAULT NULL,
    `raised_by_player_id` INT DEFAULT NULL,
    PRIMARY KEY (`statue_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Temples
CREATE TABLE IF NOT EXISTS `temple` (
    `temple_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `color` VARCHAR(10) NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    PRIMARY KEY (`temple_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Shrines (each player has 3)
-- States: on_player_board → built on island
CREATE TABLE IF NOT EXISTS `shrine` (
    `shrine_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `shrine_index` TINYINT NOT NULL,   -- 0, 1, 2 (3 shrines per player)
    `is_built` TINYINT(1) NOT NULL DEFAULT 0,
    `built_at_hex_q` INT DEFAULT NULL, -- Island location when built
    `built_at_hex_r` INT DEFAULT NULL,
    PRIMARY KEY (`shrine_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- =====================================================
-- PLAYER STATE
-- =====================================================

-- Oracle dice
CREATE TABLE IF NOT EXISTS `oracle_die` (
    `die_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `die_index` TINYINT NOT NULL,  -- 0, 1, 2
    `color` VARCHAR(10) NOT NULL,
    `original_color` VARCHAR(10) NOT NULL,
    `is_used` TINYINT(1) DEFAULT 0,
    PRIMARY KEY (`die_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Player gods
CREATE TABLE IF NOT EXISTS `player_god` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `god_name` VARCHAR(20) NOT NULL,
    `track_row` INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- Zeus tiles (tasks)
CREATE TABLE IF NOT EXISTS `zeus_tile` (
    `tile_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,
    `task_type` VARCHAR(20) NOT NULL,  -- 'shrine','statue','offering','monster'
    `task_color` VARCHAR(10) DEFAULT NULL,  -- For colored tasks
    `task_letter` VARCHAR(10) DEFAULT NULL,  -- For shrine letters
    `is_completed` TINYINT(1) DEFAULT 0,
    `sort_order` INT NOT NULL,
    PRIMARY KEY (`tile_id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

-- =====================================================
-- CARDS (Using BGA Deck component pattern)
-- =====================================================

CREATE TABLE IF NOT EXISTS `card` (
    `card_id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `card_type` VARCHAR(20) NOT NULL,  -- 'oracle', 'equipment', 'companion', 'injury'
    `card_type_arg` VARCHAR(50) NOT NULL,  -- For injury: the color (red, blue, etc.)
    `card_location` VARCHAR(30) NOT NULL,  -- 'deck', 'hand', 'discard', etc.
    `card_location_arg` INT DEFAULT NULL,  -- player_id when in hand
    `card_order` INT DEFAULT 0,
    PRIMARY KEY (`card_id`),
    KEY `location` (`card_location`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

### 5.2 Player Table Extensions

```sql
-- Add columns to BGA's player table
ALTER TABLE `player` ADD (
    `ship_q` INT DEFAULT NULL,
    `ship_r` INT DEFAULT NULL,
    `shield_value` INT NOT NULL DEFAULT 0,
    `favor_tokens` INT NOT NULL DEFAULT 0,
    `ship_tile_id` INT DEFAULT NULL,  -- References SHIP_TILES constant (1-8)
    `oracle_card_used_this_turn` TINYINT(1) DEFAULT 0,
    `tasks_completed` INT NOT NULL DEFAULT 0
);
```

### 5.3 Ship Tile Definitions (PHP Constant)

Ship tiles are static reference data - defined as a PHP constant rather than a database table.

```php
// In Game.php or a dedicated Constants.php
public const SHIP_TILES = [
    1 => [
        'name' => 'Argo',
        'ability' => 'move_extra',
        'description' => clienttranslate('Move 1 additional space when moving'),
    ],
    2 => [
        'name' => 'Aegeus',
        'ability' => 'combat_reroll',
        'description' => clienttranslate('Reroll combat die once per fight (free)'),
    ],
    3 => [
        'name' => 'Delphinios',
        'ability' => 'favor_discount',
        'description' => clienttranslate('Recoloring dice costs 1 less favor (min 0)'),
    ],
    4 => [
        'name' => 'Thalassa',
        'ability' => 'shallow_water',
        'description' => clienttranslate('May move through shallow water spaces'),
    ],
    5 => [
        'name' => 'Poseidon',
        'ability' => 'cargo_extra',
        'description' => clienttranslate('Carry 1 additional cargo (4 total)'),
    ],
    6 => [
        'name' => 'Helios',
        'ability' => 'oracle_peek',
        'description' => clienttranslate('Look at top 2 oracle cards, keep 1'),
    ],
    7 => [
        'name' => 'Anemoi',
        'ability' => 'wild_color',
        'description' => clienttranslate('Once per turn, treat 1 die as any color'),
    ],
    8 => [
        'name' => 'Triton',
        'ability' => 'god_boost',
        'description' => clienttranslate('Advance any god 1 step at start of turn'),
    ],
];
```

**Usage**: `self::SHIP_TILES[$player['ship_tile_id']]['ability']`

### 5.4 Game Globals (via $this->globals API)

| Key | Type | Purpose |
|-----|------|---------|
| `current_round` | int | Round number |
| `titan_die_value` | int | Last titan roll |
| `first_player_id` | int | First player marker |
| `combat_state` | array | Active combat data |
| `selected_die_id` | int | Currently selected die |
| `game_ended` | bool | End triggered |

---

## 6. State Machine

### 6.1 State Flow Diagram

```
[1] gameSetup
      │
      ▼
[2] roundStart ◄─────────────────────────────────┐
      │                                          │
      ▼                                          │
[10] playerTurnStart                             │
      │                                          │
      ▼                                          │
[9] checkGodAdvancement (from prev oracle roll)  │
      │                                          │
      ▼                                          │
[11] checkInjuries                               │
      │                                          │
      ├──► [12] recover ─────────────────────┐   │
      │                                      │   │
      ├──► [13] noInjuryBonus ──┐            │   │
      │                         │            │   │
      ▼                         ▼            │   │
[20] playerActions ◄────────────┘            │   │
      │                                      │   │
      ├──► [21] selectAction                 │   │
      │         │                            │   │
      │         ├──► [22] confirmRecolor     │   │
      │         │                            │   │
      │         ├──► [30] moveShip           │   │
      │         │                            │   │
      │         ├──► [31-33] combat ────┐    │   │
      │         │                       │    │   │
      │         ├──► [34-37] cargo/     │    │   │
      │         │    island actions     │    │   │
      │         │                       │    │   │
      │         └──► [38] useGodAbility │    │   │
      │                   │             │    │   │
      │                   ▼             │    │   │
      │              [39] selectReward ◄┘    │   │
      │                   │                  │   │
      ▼                   ▼                  │   │
[40] consultOracle ◄─────┴──────────────────┘   │
      │                                          │
      ▼                                          │
[50] nextPlayer                                  │
      │                                          │
      ├──► [51] titanAttack ─────────────────────┘
      │         │
      │         ▼
      └──► [90] preEndGame
                │
                ▼
           [99] gameEnd
```

### 6.2 State Definitions

```php
// states.inc.php

$machinestates = [
    1 => [
        "name" => "gameSetup",
        "type" => "manager",
        "action" => "stGameSetup",
        "transitions" => ["" => 2]
    ],

    2 => [
        "name" => "roundStart",
        "type" => "game",
        "action" => "stRoundStart",
        "transitions" => ["playerTurn" => 10]
    ],

    10 => [
        "name" => "playerTurnStart",
        "type" => "game",
        "action" => "stPlayerTurnStart",
        "transitions" => ["checkGodAdvancement" => 9, "checkInjuries" => 11]
    ],

    9 => [
        "name" => "checkGodAdvancement",
        "description" => clienttranslate('${actplayer} may advance a god'),
        "descriptionmyturn" => clienttranslate('Previous roll: ${prevColors}. Advance a matching god?'),
        "type" => "activeplayer",
        "possibleactions" => ["actAdvanceGodFromOracle", "actSkipGodAdvancement"],
        "transitions" => ["done" => 11],
        "args" => "argCheckGodAdvancement"
    ],

    11 => [
        "name" => "checkInjuries",
        "type" => "game",
        "action" => "stCheckInjuries",
        "transitions" => [
            "recover" => 12,
            "noInjuryBonus" => 13,
            "normalTurn" => 20
        ]
    ],

    12 => [
        "name" => "recover",
        "description" => clienttranslate('${actplayer} must recover'),
        "descriptionmyturn" => clienttranslate('${you} must discard 3 Injury Cards'),
        "type" => "activeplayer",
        "possibleactions" => ["actSelectInjuriesToDiscard"],
        "transitions" => ["done" => 50]
    ],

    13 => [
        "name" => "noInjuryBonus",
        "description" => clienttranslate('${actplayer} has no injuries'),
        "descriptionmyturn" => clienttranslate('Take 2 Favor or advance 1 God'),
        "type" => "activeplayer",
        "possibleactions" => ["actTakeFavorBonus", "actAdvanceGodBonus"],
        "transitions" => ["done" => 20]
    ],

    20 => [
        "name" => "playerActions",
        "description" => clienttranslate('${actplayer} may perform actions'),
        "descriptionmyturn" => clienttranslate('${you} may perform actions'),
        "type" => "activeplayer",
        "possibleactions" => [
            "actSelectDie",
            "actUseOracleCard",
            "actUseGodAbility",
            "actEndTurn"
        ],
        "transitions" => [
            "selectDie" => 21,
            "useOracleCard" => 21,
            "useGodAbility" => 38,
            "endTurn" => 40
        ],
        "args" => "argPlayerActions"
    ],

    21 => [
        "name" => "selectAction",
        "description" => clienttranslate('${actplayer} selects action'),
        "descriptionmyturn" => clienttranslate('Select action for ${dieColor} die'),
        "type" => "activeplayer",
        "possibleactions" => [
            "actRecolorDie",
            "actMoveShip",
            "actFightMonster",
            "actLoadOffering",
            "actMakeOffering",
            "actLoadStatue",
            "actRaiseStatue",
            "actExploreIsland",
            "actBuildShrine",
            "actDiscardInjuries",
            "actAdvanceGod",
            "actDrawOracleCard",
            "actTakeFavorTokens",
            "actLookAtIslands",
            "actCancelDieSelection"
        ],
        "transitions" => [
            "recolor" => 22,
            "moveShip" => 30,
            "fightMonster" => 31,
            "loadCargo" => 34,
            "deliverCargo" => 35,
            "exploreIsland" => 36,
            "buildShrine" => 37,
            "simpleAction" => 20,
            "cancel" => 20
        ],
        "args" => "argSelectAction"
    ],

    // Combat states (31-33)
    31 => [
        "name" => "fightMonsterStart",
        "type" => "game",
        "action" => "stFightMonsterStart",
        "transitions" => ["combatRound" => 32]
    ],

    32 => [
        "name" => "combatRound",
        "description" => clienttranslate('${actplayer} is in combat'),
        "descriptionmyturn" => clienttranslate('Roll the Battle Die'),
        "type" => "activeplayer",
        "possibleactions" => ["actRollBattleDie"],
        "transitions" => ["rolled" => 33],
        "args" => "argCombatRound"
    ],

    33 => [
        "name" => "combatResult",
        "description" => clienttranslate('${actplayer} combat result'),
        "type" => "activeplayer",
        "possibleactions" => ["actContinueFight", "actSurrender"],
        "transitions" => [
            "victory" => 39,
            "continueRound" => 32,
            "surrender" => 20
        ],
        "args" => "argCombatResult"
    ],

    // Reward selection
    39 => [
        "name" => "selectReward",
        "description" => clienttranslate('${actplayer} selects reward'),
        "type" => "activeplayer",
        "possibleactions" => ["actSelectReward"],
        "transitions" => ["done" => 20],
        "args" => "argSelectReward"
    ],

    // End of turn
    40 => [
        "name" => "consultOracle",
        "type" => "game",
        "action" => "stConsultOracle",
        "transitions" => ["nextPlayer" => 50]
    ],

    // Note: God advancement from previous player's oracle roll happens at state 9 (start of next turn)

    50 => [
        "name" => "nextPlayer",
        "type" => "game",
        "action" => "stNextPlayer",
        "transitions" => [
            "nextTurn" => 10,
            "titanAttack" => 51,
            "gameEnd" => 90
        ]
    ],

    51 => [
        "name" => "titanAttack",
        "type" => "game",
        "action" => "stTitanAttack",
        "transitions" => ["nextRound" => 2, "gameEnd" => 90]
    ],

    90 => [
        "name" => "preEndGame",
        "type" => "game",
        "action" => "stPreEndGame",
        "transitions" => ["end" => 99]
    ],

    99 => [
        "name" => "gameEnd",
        "type" => "manager",
        "action" => "stGameEnd",
        "args" => "argGameEnd"
    ]
];
```

---

## 7. Development Phases

### Phase 1: Static Visual Prototype

**Goal**: Render all visual components without game logic

**Files to Create**:
| File | Purpose |
|------|---------|
| `theoracleofdelphigzed_theoracleofdelphigzed.tpl` | HTML template |
| `theoracleofdelphigzed.css` | Complete styling |
| `modules/js/HexGrid.js` | CSS hex rendering |
| `modules/js/Components.js` | Component templates |

**Deliverables**:
- [ ] Hardcoded hex board renders correctly
- [ ] Player board layout matches physical game
- [ ] Oracle wheel with dice slots
- [ ] God track (4 rows)
- [ ] Shield track (0-5)
- [ ] Card display areas
- [ ] Responsive layout at all breakpoints

**Validation**: Screenshot comparison with physical game

### Phase 2: Board Generation & Basic Interactions

**Goal**: Dynamic board + click handling

**Files to Create/Modify**:
| File | Purpose |
|------|---------|
| `dbmodel.sql` | Complete schema |
| `modules/php/BoardGenerator.php` | Tile placement |
| `modules/php/HexUtils.php` | Axial coordinates |
| `modules/js/InteractionManager.js` | Click handlers |

**Deliverables**:
- [ ] Variable board generates from 12 tiles + 6 cities
- [ ] Hex selection highlights work
- [ ] Die selection on oracle wheel
- [ ] Zoom/pan controls functional
- [ ] Component placement on hexes

### Phase 3: Core Game Logic

**Goal**: Setup and turn flow

**Files to Modify**:
| File | Purpose |
|------|---------|
| `modules/php/Game.php` | `setupNewGame()`, `getAllDatas()` |
| `modules/php/States/*.php` | State handlers |
| `states.inc.php` | State machine |

**Deliverables**:
- [ ] Complete game setup (all components distributed)
- [ ] Turn phases work (injury → actions → oracle)
- [ ] Next player / round transitions
- [ ] Basic notifications
- [ ] `getAllDatas()` reconstructs full state

### Phase 4: All Actions Implementation

**Movement & Combat**:
- [ ] Move ship (range, pathfinding, favor extension)
- [ ] Ship animation along path
- [ ] Fight monster (dialog, multi-round, rewards)
- [ ] Battle die 3D roll animation

**Cargo & Islands**:
- [ ] Load/deliver offerings
- [ ] Load/raise statues
- [ ] Explore island (flip animation)
- [ ] Build shrine
- [ ] Discard injuries
- [ ] Advance god

**Oracle & Gods**:
- [ ] Draw oracle card
- [ ] Take favor tokens
- [ ] Look at 2 islands
- [ ] Oracle consultation (3D dice roll)
- [ ] God advancement check at turn start (from previous oracle roll)
- [ ] All 6 god special abilities

### Phase 5: Special Mechanics

- [ ] Titan attack at round end
- [ ] Recovery turn (3 same color OR 6 total injuries)
- [ ] No-injury bonus (2 favor OR advance god)
- [ ] Ship tile abilities (8 types)
- [ ] Equipment card effects (22 cards)
- [ ] Companion abilities (18 cards)
- [ ] End game detection
- [ ] Tie-breakers (oracle cards → favor tokens)

### Phase 6: Polish & Testing

- [ ] Animation refinement
- [ ] Tooltip system for all components
- [ ] Complete game log messages
- [ ] Statistics tracking
- [ ] Zombie mode (auto-play for disconnected)
- [ ] Mobile optimization pass
- [ ] 2/3/4 player testing
- [ ] All ship tiles tested
- [ ] All equipment cards tested
- [ ] All companion cards tested
- [ ] Bug fixes

---

## 8. Critical Files Summary

| File | Priority | Status |
|------|----------|--------|
| `dbmodel.sql` | P1 | Empty - needs full schema |
| `theoracleofdelphigzed_theoracleofdelphigzed.tpl` | P1 | Missing - create |
| `theoracleofdelphigzed.css` | P1 | Scaffold only |
| `modules/php/Game.php` | P1 | Scaffold - needs logic |
| `states.inc.php` | P1 | Needs complete state machine |
| `theoracleofdelphigzed.js` | P2 | Scaffold - needs UI logic |
| `modules/php/BoardGenerator.php` | P2 | Create new |
| `modules/js/HexGrid.js` | P2 | Create new |

---

## 9. Assets Inventory

### Existing (231 files in `img/`)

| Directory | Contents | Count |
|-----------|----------|-------|
| `boards/` | Board tile variants | Multiple |
| `equipment/` | Equipment cards | 22 |
| `companion/` | Companion cards | 18 |
| `gods/` | God tokens | 6+ variants |
| `injury/` | Injury cards by color | 6 |
| `island-*-tiles/` | Island tiles | Multiple sizes |
| `monsters/` | Monster images | 6 types |
| `oracle/` | Oracle wheel components | 6 colors |
| `pieces/` | Ships, shields, statues, offerings | 34+ |
| `ship-tiles/` | Ship ability tiles | 8 |
| `zeus-tiles/` | Zeus task tiles | Multiple |

### To Create

- [ ] Sprite sheets for small repeated assets
- [ ] CSS hex clip-path definitions
- [ ] Combat dialog layout assets

---

## 10. Technical Notes

### Hex Coordinate System (Axial)

```javascript
// Hex to pixel (flat-top)
function hexToPixel(q, r, size) {
    const x = size * (3/2 * q);
    const y = size * (Math.sqrt(3)/2 * q + Math.sqrt(3) * r);
    return {x, y};
}

// Pixel to hex
function pixelToHex(x, y, size) {
    const q = (2/3 * x) / size;
    const r = (-1/3 * x + Math.sqrt(3)/3 * y) / size;
    return hexRound(q, r);
}

// Neighbors
const directions = [
    {q:+1, r:0}, {q:+1, r:-1}, {q:0, r:-1},
    {q:-1, r:0}, {q:-1, r:+1}, {q:0, r:+1}
];
```

### CSS Hex Rendering

```css
.delphi-hex {
    width: 80px;
    height: 92px;
    clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
    position: absolute;
}
```

### State Persistence (BGA Critical)

All game state MUST be in database or globals:
```php
// CORRECT - survives page refresh
$this->globals->set('combat_state', [...]);
$location = $this->getUniqueValueFromDB("SELECT...");

// WRONG - lost on refresh
private $currentCombat; // NEVER for game state
```

---

## 11. Fidelity Checklist

### Visual Fidelity
- [ ] Board layout matches physical game
- [ ] Oracle wheel accurate to player board artwork
- [ ] God track has correct row count per player count
- [ ] Component colors match official palette
- [ ] Card layouts readable

### Interaction Fidelity
- [ ] Die selection intuitive
- [ ] Recolor cost clear before confirming
- [ ] Valid moves clearly highlighted
- [ ] Combat dialog shows all info needed

### Gameplay Fidelity
- [ ] All 12 task types completable
- [ ] All 6 god abilities work correctly
- [ ] All 8 ship tile effects implemented
- [ ] Titan attack rules accurate (6 = 2 injuries, else compare shield)
- [ ] Recovery rules correct (3 same OR 6 total)
- [ ] End game tie-breakers correct (oracle cards → favor)

---

## Appendix: Ship Tile Abilities

| ID | Ability |
|----|---------|
| 0 | +2 Shield at game start |
| 1 | +2 Ship movement range |
| 2 | Gods start at player-count row, return there (not bottom) |
| 3 | +1 Favor when gaining favor |
| 4 | -1 Zeus tile needed (11 tasks to win) |
| 5 | Start with 1 Equipment + 1 Oracle card |
| 6 | -1 recolor cost (0 = free for 1 step) |
| 7 | Recolor counterclockwise allowed + 2 cargo capacity |

---

*Plan created: December 2024*
*Visual-first approach: Start with static prototype, validate layout, then add logic*
