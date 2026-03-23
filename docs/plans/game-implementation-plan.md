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

### Architecture Decisions
- **Board Generation**: Hybrid approach — PHP generates the logical board (server-authoritative), JS handles pixel rendering only. Port the working JS BoardBuilder algorithm to PHP.
- **Test Code**: Extract demo/test functions to a dev-only module (`modules/js/DevTools.js`) separate from production code.

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

Unified scrollable view on BGA wood background. No separate panels — everything flows vertically.

```
+----------------------------------------------------------------------+
|  BGA HEADER / PLAYER PANELS                                          |
+----------------------------------------------------------------------+
|                                                                      |
|  +------------------------------------------------------------------+|
|  |                                                                  ||
|  |               MAIN HEXAGONAL BOARD                               ||
|  |           (Cluster images + hex overlays)                        ||
|  |              [Zeus Token on board]                                ||
|  |         [Ships, Monsters, Offerings, Statues,                    ||
|  |          Temples, Shrines all on board]                          ||
|  |                                                                  ||
|  +------------------------------------------------------------------+|
|                                                                      |
|  +------------------------------------------------------------------+|
|  |  CURRENT PLAYER AREA (CSS Grid: 100px | 900px | 120px)          ||
|  |                                                                  ||
|  |  [Played   [===== ZEUS TILES (4 groups of 3) =====]  [Favor    ||
|  |   Oracle]   (overlapping top of player board)          Tokens]  ||
|  |                                                                  ||
|  |  [Oracle ] +---------------------------------------------+ [Com-||
|  |  [Cards  ] |                                             | [pan-||
|  |  [stacked] |          PLAYER BOARD (900x554)             | [ion ||
|  |  [left   ] |                                             | [Card||
|  |  [side   ] | [Shrines]  [Oracle Wheel]  [God Track]      | [s   ||
|  |            | [3 slots]  [6 slots+dice]  [6 gods x 7]     | [rig-||
|  |            |            [Pythia ctr]    [start row]       | [ht  ||
|  |            |                                              | [side||
|  |            | [Shield Track 0-5]  [Ship Tile -8deg]        |      ||
|  |            |                     [Ship Storage 2-4]       |      ||
|  |            |                     [Defeated Monsters]      |      ||
|  |            +---------------------------------------------+      ||
|  |                                                                  ||
|  |  [Injury Cards]  [====== Equipment Cards (right-aligned) ======]||
|  |  [bottom-left ]  [spans center + right columns, row-reverse    ]||
|  |                                                                  ||
|  +------------------------------------------------------------------+|
|                                                                      |
+----------------------------------------------------------------------+
```

**Key layout details**:
- No separate supply/equipment display section — equipment cards sit below the player board
- Player board uses `background-image: url('img/boards/player-board.jpg')` as base
- All player board elements are absolutely positioned overlays on the board image
- Zeus tiles overlap the top of the player board via `translateY(25px)`
- Oracle cards stack vertically on the left (top card on top, -98px overlap)
- Companion cards stack vertically on the right
- Injury cards stack horizontally at bottom-left (leftmost on top, -94px overlap)
- Equipment cards at bottom-right, row-reverse (rightmost first)
- Played oracle card is rotated -90deg in the top-left corner
- Ship tile slot is rotated -8deg matching the physical board angle

### Responsive Notes
- Currently desktop-focused (fixed grid: `100px 900px 120px`)
- Tablet/mobile responsive refinement planned for Phase 6

### Hex Grid Specifications
- **Coordinate System**: Axial (q, r) with flat-topped hexagons
- **Hex Size**: ~80px width, ~92px height
- **Full Board**: Fills available width, maintains aspect ratio

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
| Shield marker | `img/pieces/[color]-shield.png` | 30x30px | Single marker on track 0-5 (player-colored) |
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

**STATUS: COMPLETE** — Full template with all game zones, dialogs, and JS templates implemented.

Contains:
- Main board container (`delphi-board-wrapper`) with hex grid and board pieces overlays
- Zeus token positioning
- Current player area with: Zeus tiles (4 groups), Oracle wheel (6 slots + Pythia center), God track (6 gods x 7 rows), Shield track (0-5), Shrine columns, Ship tile + cargo, Defeated monsters, Card areas (oracle, injury, companion, equipment)
- Other players miniature display
- Combat and reward dialogs
- 17 JS templates (jstpl_hex, jstpl_ship, jstpl_die, jstpl_monster, jstpl_statue, jstpl_offering, jstpl_island, jstpl_card, jstpl_god_token, jstpl_zeus_tile, jstpl_equipment_card, jstpl_oracle_card, jstpl_injury_card, jstpl_companion_card, jstpl_ship_tile, jstpl_favor_token, jstpl_cargo_item, jstpl_defeated_monster)

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
    `ship_tile_id` INT DEFAULT NULL,  -- References SHIP_TILES constant (0-7)
    `oracle_card_used_this_turn` TINYINT(1) DEFAULT 0,
    `tasks_completed` INT NOT NULL DEFAULT 0
);
```

### 5.3 Ship Tile Definitions (PHP Constant)

Ship tiles are static reference data - defined as a PHP constant rather than a database table. These match the actual board game rules.

```php
// In Game.php or a dedicated Constants.php
public const SHIP_TILES = [
    0 => [
        'name' => 'Shield Ship',
        'ability' => 'shield_bonus',
        'description' => clienttranslate('+2 Shield at game start'),
    ],
    1 => [
        'name' => 'Swift Ship',
        'ability' => 'move_extra',
        'description' => clienttranslate('+2 Ship movement range'),
    ],
    2 => [
        'name' => 'Divine Ship',
        'ability' => 'god_start_high',
        'description' => clienttranslate('Gods start at player-count row, return there (not bottom)'),
    ],
    3 => [
        'name' => 'Favored Ship',
        'ability' => 'favor_bonus',
        'description' => clienttranslate('+1 Favor when gaining favor'),
    ],
    4 => [
        'name' => 'Blessed Ship',
        'ability' => 'fewer_tasks',
        'description' => clienttranslate('-1 Zeus tile needed (11 tasks to win)'),
    ],
    5 => [
        'name' => 'Prepared Ship',
        'ability' => 'starting_cards',
        'description' => clienttranslate('Start with 1 Equipment + 1 Oracle card'),
    ],
    6 => [
        'name' => 'Oracle Ship',
        'ability' => 'recolor_discount',
        'description' => clienttranslate('-1 recolor cost (0 = free for 1 step)'),
    ],
    7 => [
        'name' => 'Cargo Ship',
        'ability' => 'recolor_reverse_cargo',
        'description' => clienttranslate('Recolor counterclockwise allowed + 2 cargo capacity'),
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
| `prev_oracle_colors` | array | Previous player's oracle roll colors (for god advancement) |
| `board_seed` | int | Random seed used for board generation (for reproducibility) |

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

### Phase 1: Static Visual Prototype — COMPLETE

**Goal**: Render all visual components without game logic

**Files Created**:
| File | Purpose | Status |
|------|---------|--------|
| `theoracleofdelphigzed_theoracleofdelphigzed.tpl` | HTML template | Done — full layout with 17 JS templates |
| `theoracleofdelphigzed.css` | Complete styling | Done — ~2000 lines, responsive, all components |
| `modules/js/HexGrid.js` | Hex coordinate system + zoom + BFS pathfinding | Done — ~450 lines, axial coords, zoom, reachable hex BFS with path reconstruction |
| `modules/js/Components.js` | Game piece rendering + D10 battle die | Done — ~2100 lines, ships/monsters/offerings/statues/temples/shrines/dice/battle die |
| `modules/js/BoardBuilder.js` | Board generation algorithm | Done — 987 lines, cluster placement with backtracking |
| `modules/js/BoardRenderer.js` | Visual board rendering + pixel-to-hex | Done — ~310 lines, cluster images + positioning + reverse coordinate conversion |
| `modules/js/ClusterDefinitions.js` | Board tile definitions | Done — 611 lines, all cluster types + rotation |

**Deliverables**:
- [x] Hardcoded hex board renders correctly
- [x] Player board layout matches physical game
- [x] Oracle wheel with dice slots
- [x] God track (6 gods x 7 rows)
- [x] Shield track (0-5)
- [x] Card display areas
- [x] Responsive layout at all breakpoints
- [x] Monster stacking with 3D perspective
- [x] Shrine flip animations (toggle on click)
- [x] Roll oracle dice with animation (test toolbar button triggers random reroll with CSS 3D rotation)
- [x] Roll battle die with animation (D10 spinning cylinder in combat dialog, 0-9 results)
- [x] Click interaction for ships highlighting water movement range of 3 spaces (BFS over water hexes, overlay-based highlighting, sequential path tinting on hover, click-to-move)
- [x] Ships start in the shallows with Zeus (2x2 offset cluster pattern, all 4 players visible)
- [x] Collapsible test toolbar with all dev actions (Roll Dice, Roll Battle Die, Show Ship Range, Reset Ships, Flip Shrines, New Board)
- [x] Board click detection via pixel-to-hex coordinate conversion (works with cluster image rendering)

**Architecture Notes (Phase 1)**:
- Ship movement range uses BFS on hex grid with water-only passability filter
- Path preview creates temporary DOM overlays on `#delphi-board-pieces` (not hex DOM elements)
- Board click detection uses `BoardRenderer.pixelToHex()` since board uses cluster images, not individual hex elements
- D10 battle die is a CSS 3D cylinder with 10 faces rotated 36deg apart, spin animation via CSS keyframes
- Test toolbar is fixed-position at top-right, collapsible, routes actions via `data-action` attribute delegation

### Phase 2: Board Generation & Basic Interactions — COMPLETE

**Goal**: Dynamic board from server + click handling + data persistence

**Architecture Decision**: Hybrid approach — port BoardBuilder algorithm to PHP for server-authoritative board generation. JS handles rendering only. The existing JS BoardBuilder (987 lines) serves as the proven reference implementation.

**Files Created/Modified**:
| File | Purpose | Size | Status |
|------|---------|------|--------|
| `dbmodel.sql` | Complete schema (Section 5) | M | **DONE** — all tables + player extensions |
| `modules/php/ClusterDefinitions.php` | Port of JS ClusterDefinitions | L | **DONE** — all cluster data + rotation + world coords |
| `modules/php/BoardGenerator.php` | Port of JS BoardBuilder | XL | **DONE** — placement + backtracking + validation |
| `modules/php/HexUtils.php` | Axial coordinate helpers | S | **DONE** — hexDistance + getHexesAtDistance |
| `tests/test_board_generator.php` | Smoke test for board gen | S | **DONE** — 21 assertions, 5-run reliability |
| `modules/js/DevTools.js` | Extract test/demo code | M | **DONE** — ~700 lines, all test functions isolated |
| `theoracleofdelphigzed.js` | Data-driven rendering + die selection | M | **DONE** — reads `gamedatas.boardPlacements` from PHP, delegates test code to DevTools |

**Deliverables**:
- [x] Board generation algorithm (JS reference implementation complete)
- [x] Hex selection highlighting
- [x] Component visual placement on hexes
- [x] **Port BoardBuilder to PHP** — `BoardGenerator.php` + `ClusterDefinitions.php` + `HexUtils.php` replicate the cluster placement, backtracking, and validation logic [XL]
- [x] **Implement dbmodel.sql** — all tables from Section 5.1 + player extensions from 5.2 [M]
- [x] **Extract test code to DevTools.js** — moved `createTestShips()`, `createTestMonsters()`, `createTestOfferings()`, `createTestStatues()`, `createTestTemples()`, `createTestShrines()`, `createTestDice()`, `setupTestPlayerBoard()` to separate module [M]
- [x] **Data-driven board rendering** — `setup()` reads `gamedatas.boardPlacements` from PHP `getAllDatas()` via `board_placement` table; client-side generation is dev-only fallback [M]
- [x] **Die selection on oracle wheel** — click handlers with toggle state (`die-selected` class), `selectDie()` and `useDie()` in Components.js [S]

### Phase 3: Core Game Logic

**Goal**: Setup, turn flow, and state machine working end-to-end

**Files to Modify**:
| File | Purpose | Size | Status |
|------|---------|------|--------|
| `modules/php/Game.php` | `setupNewGame()`, `getAllDatas()` | XL | **3a-3f COMPLETE** — Full board population + player setup (cards, Zeus tiles, ships, shrines, gods, dice) + getAllDatas returns complete game state |
| `modules/php/MaterialDefs.php` | Static game constants | M | **COMPLETE** — All constants + `monsterTypeByColor()` + PLAYER_COUNT_ROW + HEX_TO_GAME_COLOR + COLOR_INDEX |
| `states.inc.php` | Full state machine (Section 6.2) | L | Currently 4 placeholder states, need 20+ |
| `modules/php/States/PlayerTurn.php` | Real action handlers | XL | Currently example code only |
| `modules/php/States/NextPlayer.php` | Turn transitions | M | Basic scaffold |
| `modules/php/States/EndScore.php` | End game scoring | S | Basic scaffold |

**Deliverables**:

#### 3a. Game Material Definitions [M] — COMPLETE
- [x] Created `modules/php/MaterialDefs.php` as a `final class` with private constructor containing:
  - `COLORS`: 6 game colors (red, yellow, green, blue, pink, black)
  - `MONSTERS`: 6 types × color mapping + `monsterTypeByColor()` helper
  - `GODS`: 6 gods × color + ability
  - `ORACLE_CARDS`: 30 cards (5 per color)
  - `EQUIPMENT_CARDS`: 22 cards with type/color metadata
  - `COMPANION_CARDS`: 18 cards with abilities
  - `INJURY_CARDS`: 42 cards (7 per color)
  - `ZEUS_TILES`: 4 task groups (shrine/statue/offering/monster) with colors + letters, dual-sided handling
  - `SHIP_TILES`: 8 types with starting bonuses
- [x] Wired into Game.php, removed placeholder constants
- Design: `docs/plans/2026-02-20-material-defs-design.md` | Impl: `docs/plans/2026-02-20-material-defs-impl.md`

#### 3b. Board Hex & Piece Population [L] — COMPLETE
- [x] **Schema**: Added `player_island_knowledge` table for island peek tracking (equipment card #13)
- [x] **Distribution helper**: `distributeColorRounds()` static method — Latin rectangle algorithm with retry loop, `bgaShuffle()` using `bga_rand()` for BGA replay support. 640-assertion test suite.
- [x] **Save hexes to `hex` table** — `populateBoard()` iterates BoardGenerator clusters, INSERTs each hex with q, r, tile_type, color, island_content, is_revealed, cluster linkage (id, type, rotation)
- [x] **Place monsters** — `placeMonsters()`: 3 `two_monster` hexes get 2 shuffled colors each (6 total), 6 `monster` hexes get `distributeColorRounds(playerCount-1)` distribution
- [x] **Place offerings** — `placeOfferings()`: `distributeColorRounds(playerCount)` across 6 offering hexes, no color twice per island
- [x] **Register temples** — `placeTemples()`: random 1:1 color assignment to 6 temple hexes
- [x] **Place statues in cities** — `placeStatues()`: 3 statues per city color derived from cluster ID (e.g., `city-red` → `red`)
- [x] **`getAllDatas()` board state** — returns hexes, monsters, offerings, statues, temples with island visibility filtering via `player_island_knowledge` + `is_revealed`
- Design: `docs/plans/2026-02-25-board-population-design.md` | Impl: `docs/plans/2026-02-25-board-population-impl.md`

#### 3c. Player Initialization [M] — COMPLETE
- [x] **Ship placement** — `initPlayers()`: all ships at Zeus hex (q, r), visual offset is JS-only
- [x] **Starting resources** — `favor_tokens = 2 + player_no`, `shield_value = 0` (+2 for shield_start tile, +1 favor for favor_plus_1 tile)
- [x] **Ship tile assignment** — shuffle [0..7] via bgaShuffle, deal first N. Immediate bonuses: shield_start (+2 shield), favor_plus_1 (+1 favor), god_track_high (gods start at player-count row), starting_equipment (1 equip + 1 oracle card)
- [x] **Shrine init** — 3 shrine rows per player (shrine_index 0-2, is_built=0)
- [x] **God track init** — 6 player_god rows per player (track_row=0, or player-count row for god_track_high tile)
- [x] **Starting injury** — `drawStartingInjuries()`: each player draws 1 injury, advances OWN matching god from row 0 to player-count row (2p→3, 3p→2, 4p→1)
- [x] **Titan holder** — globals `titan_holder_id` = last player (highest player_no)
- Design: `docs/plans/2026-03-07-player-setup-design.md` | Impl: `docs/plans/2026-03-07-player-setup-impl.md`

#### 3d. Zeus Tile Distribution [M] — COMPLETE
- [x] **Global dual-sided flip** — randomly pick 2 of 4 colored offering tiles to stay offering-side; other 2 flip to monster-side. Same for all players. Stored as `zeus_flip_offering_colors` global.
- [x] **12 tiles per player** — 3 shrine (fixed Greek letters per player color) + 3 statue (generic) + 3 offering (any + 2 unflipped colors) + 3 monster (any + 2 flipped monster types)
- [x] **Shuffle & sort_order** — bgaShuffle within each group of 3, assign sort_order 0-2

#### 3e. Card Deck Setup [M] — COMPLETE
- [x] **Oracle deck** — 30 cards (5 per color), shuffled, card_order assigned
- [x] **Equipment deck** — 22 cards, shuffled, first 6 to `display` location
- [x] **Companion deck** — 18 cards (6 colors × 3 types), shuffled
- [x] **Injury deck** — 42 cards (7 per color), shuffled
- [x] **Starting equipment bonus** — `applyShipTileBonuses()`: starting_equipment tile draws 1 equip from display (refill) + 1 oracle from deck
- [x] **Schema**: Added `card_order` column to card table

#### 3f. Initial Oracle Roll [S] — COMPLETE
- [x] `rollInitialDice()`: INSERT 3 oracle_die rows per player
- [x] Random colors via `bga_rand(0, 5)` indexing into COLORS
- [x] `original_color = color`, `is_used = 0`

---

- [x] **`getAllDatas()` — board state** (hexes, monsters, offerings, statues, temples with visibility filtering) — done in 3b
- [x] **`getAllDatas()` — remaining** (players expanded, shrines, gods, oracleDice, zeusTiles, equipmentDisplay, hand, playerCardCounts, deckSizes, titanHolderId, zeusFlipOfferingColors) — done in 3c-3f
- [x] **State machine** — 22 state classes in `modules/php/States/`, auto-discovered by BGA framework (no `states.inc.php`). Happy-path turn loop: RoundStart→PlayerTurnStart→CheckInjuries→PlayerActions→ConsultOracle→NextPlayer→loop [L]
- [ ] **Turn phase flow** — injury check → recovery/bonus → actions → oracle consultation [L]
- [ ] **Next player / round transitions** — proper round tracking, first player rotation [M]
- [x] **Basic notification framework** — `$this->notify->all()` for state changes, client-side `notif_*` async handlers with `bgaSetupPromiseNotifications()` [M]

### Phase 4: All Actions Implementation

**Movement & Combat**:
- [x] Move ship (range 3/5, BFS pathfinding, die color destination matching) [L]
- [x] Ship animation on move (smooth CSS transition to destination) [M]
- [ ] Favor token extension (+1 range per favor spent) [S]
- [x] Fight monster (dialog, multi-round, favor to continue) [XL]
- [x] Battle die roll + result handling [M]
- [x] Combat cancel (restore die, return to action selection) [S]
- [x] Equipment card selection after victory (visual card strip + confirm/cancel) [M]

**Cargo & Islands**:
- [x] Load offering (adjacent + matching die + cargo capacity) [M]
- [x] Deliver offering to temple (matching color) [M]
- [x] Load statue from city [M]
- [x] Raise statue at statue island [M]
- [x] Explore island (flip + shrine placement or bonus) [L]
- [x] Build shrine (auto-built within Explore Island) [S]
- [x] Discard injuries (matching die color) [S]
- [x] Advance god (matching die color) [S]

**Oracle & Gods**:
- [x] Draw oracle card [S]
- [x] Take favor tokens (+2 favor) [S]
- [ ] Look at 2 islands (peek without die) [M]
- [ ] Oracle consultation — roll 3 dice, store results [M]
- [ ] God advancement check at turn start (from previous oracle roll) [M]
- [ ] All 6 god special abilities [XL]
  - Poseidon: Teleport ship [M]
  - Apollo: All dice wild [S]
  - Artemis: Free island flip [M]
  - Aphrodite: Discard all injuries [S]
  - Ares: Auto-defeat adjacent monster [M]
  - Hermes: Grab any statue from any city [M]

### Phase 5: Special Mechanics

- [ ] Titan attack at round end (roll titan die, compare shields) [M]
- [ ] Recovery turn (3 same color OR 6 total injuries → forced recovery) [M]
- [ ] No-injury bonus (2 favor OR advance god) [S]
- [ ] Ship tile abilities (8 types — see Section 5.3) [XL]
- [ ] Equipment card effects (22 cards) [XL]
- [ ] Companion abilities (18 cards) [L]
- [ ] End game detection (all tasks + return to Zeus) [M]
- [ ] Tie-breakers (oracle cards → favor tokens) [S]
- [x] Recolor die mechanics (clockwise cost, favor spending) [M]
- [ ] Oracle card usage (play matching color as wild die) [M]

**Player Board Wire-Up (from gamedatas on page load)**:
- [x] Zeus tiles (4 groups of 3, with double-sided any tile support) [M]
- [x] Shield track marker [S]
- [x] Favor token count [S]
- [x] Hand cards (oracle, injury, equipment, companion) [M]
- [x] Ship tile image + expanded storage for tile 2 [S]
- [x] Ship storage / cargo display [S]
- [x] Defeated monsters display [S]
- [x] God track tokens (current player only, positioned from gamedatas) [M]
- [x] Shrine overlays on hex board (cloud flip to revealed) [M]

### Phase 6: Polish & Testing

- [ ] Auto-select single valid target for cargo/combat actions (skip selection when only 1 option) [S]
- [ ] Animation refinement (smooth transitions, timing) [L]
- [ ] Extract remaining test code to DevTools.js [S]
- [ ] Tooltip system for all components [M]
- [ ] Equipment card hover tooltip (plain text effects + short description for game updates) [M]
- [ ] Complete game log messages (all actions, all notifications) [L]
- [ ] Statistics tracking (`stats.json` + stat recording) [M]
- [ ] Game options (`gameoptions.json` — player count variants, etc.) [S]
- [ ] Ship tile draft variant (counterclockwise from last player) as game option [M]
- [ ] Zeus tile flip variant (choose which 2 to flip vs random) as game option [S]
- [ ] Zombie mode (auto-play for disconnected players) [M]
- [ ] Mobile optimization pass [M]
- [ ] 2/3/4 player testing [L]
- [ ] All ship tiles tested [M]
- [ ] All equipment cards tested [L]
- [ ] All companion cards tested [M]
- [ ] Bug fixes [L]
- [ ] Pre-release: remove dev DB workarounds — delete `resetCustomTables()` and `ensurePlayerColumns()` from Game.php, restore ALTER TABLE statements to dbmodel.sql [S]

### Phase 7: AI Testing

- [ ] Build an agent to playtest the game [XL]

---

## 8. Critical Files Summary

| File | Priority | Status | Lines |
|------|----------|--------|-------|
| `theoracleofdelphigzed_theoracleofdelphigzed.tpl` | P1 | **COMPLETE** — Full layout + 17 JS templates | ~170 |
| `theoracleofdelphigzed.css` | P1 | **COMPLETE** — All components styled, responsive | 1881 |
| `modules/js/HexGrid.js` | P1 | **COMPLETE** — Axial coords, zoom, neighbors | 379 |
| `modules/js/Components.js` | P1 | **COMPLETE** — All piece rendering + die selection | 2041 |
| `modules/js/BoardBuilder.js` | P1 | **COMPLETE** — Board generation with backtracking | 987 |
| `modules/js/BoardRenderer.js` | P1 | **COMPLETE** — Cluster image placement | 279 |
| `modules/js/ClusterDefinitions.js` | P1 | **COMPLETE** — All cluster types + rotation | 611 |
| `theoracleofdelphigzed.js` | P2 | **COMPLETE** — Data-driven board rendering, die selection, test code extracted to DevTools | 1014 |
| `dbmodel.sql` | P2 | **COMPLETE** — All tables + player extensions + player_island_knowledge | ~175 |
| `modules/php/ClusterDefinitions.php` | P2 | **COMPLETE** — All cluster data + rotation | ~380 |
| `modules/php/BoardGenerator.php` | P2 | **COMPLETE** — Port from JS BoardBuilder | ~480 |
| `modules/php/HexUtils.php` | P2 | **COMPLETE** — Axial coordinate helpers | ~45 |
| `tests/test_board_generator.php` | P2 | **COMPLETE** — 21 assertions, 5-run reliability | ~100 |
| `modules/php/MaterialDefs.php` | P3 | **COMPLETE** — All game constants + helpers + PLAYER_COUNT_ROW + HEX_TO_GAME_COLOR + COLOR_INDEX | ~180 |
| `modules/php/Game.php` | P3 | **COMPLETE (setup)** — 3a-3f done: board population, piece placement, card decks, Zeus tiles, player init, starting injuries, oracle dice, getAllDatas full game state | ~800 |
| `tests/test_distribute_colors.php` | P3 | **COMPLETE** — 640 assertions for Latin rectangle distribution | ~90 |
| `states.inc.php` | P3 | **SCAFFOLD** — 4 placeholder states, needs 20+ from Section 6 | ~40 |
| `modules/php/States/PlayerTurn.php` | P3 | **SCAFFOLD** — Example actions only | 119 |
| `modules/php/States/NextPlayer.php` | P3 | **SCAFFOLD** — Basic transition | 43 |
| `modules/php/States/EndScore.php` | P3 | **SCAFFOLD** — Basic handler | 34 |
| `modules/js/DevTools.js` | P2 | **COMPLETE** — All test/demo functions extracted | ~700 |
| `gameoptions.json` | P4 | **EMPTY** | 0 |
| `stats.json` | P4 | **EMPTY** | 0 |

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

### Board Generation Architecture (Hybrid)

```
Setup Flow:
1. PHP BoardGenerator::generate() runs during setupNewGame()
2. Uses same algorithm as JS BoardBuilder (ported):
   - Select 12 island clusters (6×7-hex, 3×9-hex, 3×11-hex)
   - Place with backtracking + water connectivity validation
   - Place 6 city tiles (one per color, equidistant)
   - Detect shallows in gaps between clusters
   - Find Zeus starting position
3. Store all hex data in `hex` table
4. Store pieces (monsters, offerings, statues, temples) in their tables
5. JS getAllDatas() receives hex + piece data
6. JS BoardRenderer renders from server data (no client-side generation)
```

---

## 11. Fidelity Checklist

### Visual Fidelity
- [x] Board layout matches physical game
- [x] Oracle wheel accurate to player board artwork
- [x] God track has correct row count per player count
- [x] Component colors match official palette
- [ ] Card layouts readable

### Interaction Fidelity
- [x] Die selection intuitive
- [ ] Recolor cost clear before confirming
- [x] Valid moves clearly highlighted
- [ ] Combat dialog shows all info needed

### Gameplay Fidelity
- [ ] All 12 task types completable
- [ ] All 6 god abilities work correctly
- [ ] All 8 ship tile effects implemented
- [ ] Titan attack rules accurate (6 = 2 injuries, else compare shield)
- [ ] Recovery rules correct (3 same OR 6 total)
- [ ] End game tie-breakers correct (oracle cards → favor)

---

## Effort Size Key

| Size | Meaning | Rough Scope |
|------|---------|-------------|
| S | Small | Single function or minor change |
| M | Medium | Multiple functions, one file focus |
| L | Large | Multi-file, significant logic |
| XL | Extra Large | Complex system, many files, extensive testing needed |

---

*Plan created: December 2024*
*Last updated: March 22, 2026 — Phases 1-3 complete. Phase 4: movement, combat, cargo, explore island, discard injuries, advance god, draw oracle card, take favor tokens, recolor die all complete. Player board fully wired from gamedatas.*
*Visual-first approach: Start with static prototype, validate layout, then add logic*
*Next milestone: Phase 4 remaining — look at islands, oracle consultation storage, god advancement at turn start, god special abilities. Phase 5 — titan attack, recovery, ship tile/equipment/companion abilities, end game detection.*
