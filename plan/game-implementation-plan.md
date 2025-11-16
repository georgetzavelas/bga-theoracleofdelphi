# The Oracle of Delphi - Digital Implementation Plan

## Executive Summary

**Game**: The Oracle of Delphi by Stefan Feld
**Type**: Dice placement, resource management, racing game
**Players**: 2-4
**Complexity**: Medium-High
**Estimated Development Time**: 3-4 months
**BGA Architecture**: Modular with reusable framework components

---

## 1. Game State Architecture

### 1.1 Core Game State Variables

#### Global Game State
```php
// Stored in globals table via $this->globals (modern any-type API)
// Use string constants for global names
const GLOBAL_CURRENT_ROUND = 'currentRound';
const GLOBAL_TITAN_STRENGTH = 'titanStrength';
const GLOBAL_FIRST_GAME_MODE = 'firstGameMode';
const GLOBAL_BOARD_LAYOUT = 'boardLayout';
const GLOBAL_ACTIVE_PHASE = 'activePhase';

// Access via modern API:
$this->globals->set(GLOBAL_CURRENT_ROUND, 1);
$round = $this->globals->get(GLOBAL_CURRENT_ROUND, 1);
$this->globals->inc(GLOBAL_CURRENT_ROUND, 1);

// Data types (supports any type, not just integers):
- 'currentRound' => int              // Current round number
- 'titanStrength' => int             // Last rolled Titan Die value (0-6)
- 'firstGameMode' => bool            // Using simplified first-game rules
- 'boardLayout' => array             // Board tile positions (auto JSON serialized)
- 'activePhase' => string            // 'injury_check', 'actions', 'oracle_consult'
```

#### Player State (per player)
```php
// Stored in player table (extended columns)
- player_id (primary key)
- player_score (default 0, not used for winning - tracks progress)
- player_score_aux (tasks completed count)
- player_color
- player_ship_location => int        // Water space ID where ship is located
- player_shield_strength => int      // Current shield level (0-10)
- player_favor_tokens => int         // Favor token count
- player_ship_tile_id => int         // Which Ship Tile variant (1-8)
- player_has_titan_die => bool       // TRUE for last player
```

### 1.2 Database Schema

#### board_spaces Table
```sql
CREATE TABLE IF NOT EXISTS board_spaces (
    space_id INT PRIMARY KEY AUTO_INCREMENT,
    space_type VARCHAR(16) NOT NULL,           -- 'water', 'island', 'city'
    tile_id INT NOT NULL,                      -- Which board tile (0-17)
    position_on_tile INT NOT NULL,             -- Hex position within tile
    hex_color VARCHAR(16) DEFAULT NULL,        -- Color for water spaces
    PRIMARY KEY (space_id),
    INDEX idx_type (space_type),
    INDEX idx_tile (tile_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

#### island_tiles Table
```sql
CREATE TABLE IF NOT EXISTS island_tiles (
    island_tile_id INT PRIMARY KEY AUTO_INCREMENT,
    space_id INT NOT NULL,                     -- Links to board_spaces
    tile_type VARCHAR(16) NOT NULL,            -- 'offering', 'monster', 'statue', 'temple', 'shrine', 'special'
    is_revealed BOOLEAN DEFAULT FALSE,
    player_color VARCHAR(16) DEFAULT NULL,     -- For shrine islands (blue/red/etc)
    greek_letter VARCHAR(8) DEFAULT NULL,      -- For special reward islands (alpha/beta/gamma/omega)
    has_component BOOLEAN DEFAULT TRUE,        -- Does island still have its component?
    FOREIGN KEY (space_id) REFERENCES board_spaces(space_id),
    INDEX idx_space (space_id),
    INDEX idx_revealed (is_revealed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

#### components Table
```sql
CREATE TABLE IF NOT EXISTS components (
    component_id INT PRIMARY KEY AUTO_INCREMENT,
    component_type VARCHAR(32) NOT NULL,       -- 'offering', 'statue', 'monster', 'shrine'
    component_color VARCHAR(16) NOT NULL,      -- 'red', 'blue', 'green', 'yellow', 'white', 'black'
    location VARCHAR(32) NOT NULL,             -- 'board', 'ship', 'completed', 'available'
    location_id INT DEFAULT NULL,              -- space_id or player_id depending on location
    player_id INT DEFAULT NULL,                -- Owner if on ship or completed
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_type_color (component_type, component_color),
    INDEX idx_location (location, location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

#### gods Table
```sql
CREATE TABLE IF NOT EXISTS gods (
    god_id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    god_color VARCHAR(16) NOT NULL,            -- 'blue', 'yellow', 'green', 'red', 'black', 'pink'
    god_name VARCHAR(32) NOT NULL,             -- 'Poseidon', 'Apollon', 'Artemis', 'Aphrodite', 'Ares', 'Hermes'
    position INT NOT NULL DEFAULT 0,           -- Current row on god track (0-4)
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_player (player_id),
    INDEX idx_position (position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

#### oracle_dice Table
```sql
CREATE TABLE IF NOT EXISTS oracle_dice (
    dice_id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    die_number INT NOT NULL,                   -- 1, 2, or 3
    die_color VARCHAR(16) DEFAULT NULL,        -- Current color (after roll)
    is_used BOOLEAN DEFAULT FALSE,             -- Used this turn?
    oracle_position INT DEFAULT NULL,          -- Position on oracle (1-6)
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

#### cards Table
```sql
CREATE TABLE IF NOT EXISTS cards (
    card_id INT PRIMARY KEY AUTO_INCREMENT,
    card_type VARCHAR(32) NOT NULL,            -- 'injury', 'oracle', 'equipment', 'companion'
    card_type_arg INT NOT NULL,                -- Specific card ID within type
    card_location VARCHAR(32) NOT NULL,        -- 'deck', 'hand', 'discard', 'display', 'active'
    card_location_arg INT DEFAULT 0,           -- Position in location
    player_id INT DEFAULT NULL,                -- Owner if in hand
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_type_location (card_type, card_location),
    INDEX idx_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

#### zeus_tiles Table
```sql
CREATE TABLE IF NOT EXISTS zeus_tiles (
    zeus_tile_id INT PRIMARY KEY AUTO_INCREMENT,
    player_id INT NOT NULL,
    task_type VARCHAR(16) NOT NULL,            -- 'shrine', 'statue', 'offering', 'monster'
    task_number INT NOT NULL,                  -- 1, 2, or 3 (first/second/third of type)
    required_color VARCHAR(16) DEFAULT NULL,   -- Specific color required (or NULL for "any")
    is_completed BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (player_id) REFERENCES player(player_id),
    INDEX idx_player (player_id),
    INDEX idx_completed (is_completed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

### 1.3 Data Structures

#### Ship Cargo System
```php
class ShipCargo {
    private int $playerId;
    private int $maxCapacity;      // From Ship Tile (usually 2)
    private array $cargo = [];     // Array of component_ids

    public function canLoadMore(): bool;
    public function addCargo(int $componentId): bool;
    public function removeCargo(int $componentId): bool;
    public function getCargoCount(): int;
    public function getCargoByType(string $type): array;
}
```

#### Oracle System
```php
class Oracle {
    private int $playerId;
    private array $dicePositions = [];  // die_number => oracle_position (1-6)
    private int $recolorCost = 1;       // Favor tokens per step

    public function rollDice(): array;
    public function recolorDie(int $dieNumber, int $targetPosition, int $steps): void;
    public function useDie(int $dieNumber): void;
    public function getAvailableDice(): array;
}
```

#### Board Graph Structure
```php
class BoardGraph {
    private array $spaces = [];     // space_id => SpaceNode
    private array $adjacency = [];  // space_id => [adjacent_space_ids]

    public function getAdjacentSpaces(int $spaceId): array;
    public function findPath(int $from, int $to, int $maxDistance): ?array;
    public function getReachableSpaces(int $from, int $maxRange, string $endColor): array;
}
```

---

## 2. Component Models

### 2.1 Physical Components Data

#### Board Tiles (12 large hexagonal tiles)
```php
const BOARD_TILES = [
    1 => ['type' => 'large', 'water_spaces' => 19, 'island_spaces' => 7, 'has_hole' => true],
    2 => ['type' => 'large', 'water_spaces' => 19, 'island_spaces' => 7, 'has_hole' => true],
    3 => ['type' => 'large', 'water_spaces' => 19, 'island_spaces' => 7, 'has_hole' => true],
    4 => ['type' => 'large', 'water_spaces' => 21, 'island_spaces' => 6, 'has_hole' => false],
    5 => ['type' => 'large', 'water_spaces' => 21, 'island_spaces' => 6, 'has_hole' => false],
    6 => ['type' => 'large', 'water_spaces' => 21, 'island_spaces' => 6, 'has_hole' => false],
    7 => ['type' => 'medium', 'water_spaces' => 15, 'island_spaces' => 5, 'has_hole' => false],
    8 => ['type' => 'medium', 'water_spaces' => 15, 'island_spaces' => 5, 'has_hole' => false],
    9 => ['type' => 'medium', 'water_spaces' => 15, 'island_spaces' => 5, 'has_hole' => false],
    10 => ['type' => 'small', 'water_spaces' => 13, 'island_spaces' => 4, 'has_hole' => false],
    11 => ['type' => 'small', 'water_spaces' => 13, 'island_spaces' => 4, 'has_hole' => false],
    12 => ['type' => 'zeus', 'water_spaces' => 6, 'island_spaces' => 1, 'has_hole' => false],  // Zeus tile (start/end)
];
```

#### Island Tiles (12 double-sided tiles)
```php
const ISLAND_TILES = [
    // 3 Shrine Islands (player-color specific, marked with Greek letters)
    // Each player needs 3 matching colored islands for shrines
    // Plus 9 generic islands for other components
    'types' => ['shrine_alpha', 'shrine_beta', 'shrine_gamma', 'offering', 'monster', 'statue', 'special'],
    'special_rewards' => [
        'psi' => '4_favor_tokens',      // Ψ symbol
        'phi_omega' => '2_oracle_cards', // ΦΩ symbols
        'sigma' => '3_god_steps',        // Σ symbol
        'omega_helm' => 'discard_injuries_plus_shield', // Ω+helmet
    ]
];
```

#### Gods (6 types, each player has one of each)
```php
const GODS = [
    'blue' => [
        'name' => 'Poseidon',
        'special_action' => 'teleport_ship',
        'description' => 'Place your Ship on a water space of your choice'
    ],
    'yellow' => [
        'name' => 'Apollon',
        'special_action' => 'any_color_dice',
        'description' => 'Draw 1 Oracle Card. This turn, use Oracle Dice/Card as any color'
    ],
    'green' => [
        'name' => 'Artemis',
        'special_action' => 'explore_island',
        'description' => 'Uncover a face down Island Tile and take reward'
    ],
    'red' => [
        'name' => 'Aphrodite',
        'special_action' => 'discard_all_injuries',
        'description' => 'Discard all your Injury Cards'
    ],
    'black' => [
        'name' => 'Ares',
        'special_action' => 'auto_defeat_monster',
        'description' => 'If adjacent to Monster: Defeat without rolling Battle Die'
    ],
    'pink' => [
        'name' => 'Hermes',
        'special_action' => 'load_any_statue',
        'description' => 'If adjacent to City Tile: Take Statue from any City Tile'
    ]
];
```

#### Ship Tiles (8 variants with unique abilities)
```php
const SHIP_TILES = [
    1 => [
        'ability' => 'shield_bonus',
        'description' => 'At start: Move Shield +2',
        'storage_capacity' => 2,
        'range_bonus' => 0
    ],
    2 => [
        'ability' => 'range_bonus',
        'description' => 'Ship range +2',
        'storage_capacity' => 2,
        'range_bonus' => 2
    ],
    3 => [
        'ability' => 'god_advancement',
        'description' => 'All Gods start at player count row; return there after use',
        'storage_capacity' => 2,
        'range_bonus' => 0
    ],
    4 => [
        'ability' => 'favor_multiplier',
        'description' => 'When taking Favor Tokens, take +1 more (including starting tokens)',
        'storage_capacity' => 2,
        'range_bonus' => 0
    ],
    5 => [
        'ability' => 'skip_task',
        'description' => 'Return 1 Zeus Tile without reward; need only 11 tasks to win',
        'storage_capacity' => 2,
        'range_bonus' => 0
    ],
    6 => [
        'ability' => 'starting_cards',
        'description' => 'At start: Take 1 Equipment Card from display + draw 1 Oracle Card',
        'storage_capacity' => 2,
        'range_bonus' => 0
    ],
    7 => [
        'ability' => 'recolor_discount',
        'description' => 'Recoloring Oracle Dice costs -1 Favor Token (minimum 0)',
        'storage_capacity' => 2,
        'range_bonus' => 0
    ],
    8 => [
        'ability' => 'bidirectional_recolor_capacity',
        'description' => 'Can recolor in either direction on Oracle; storage capacity +2',
        'storage_capacity' => 4,
        'range_bonus' => 0
    ]
];
```

#### Cards

**Injury Cards (42 total, 6 colors + skull)**
```php
const INJURY_CARDS = [
    'red' => 6, 'blue' => 6, 'green' => 6,
    'yellow' => 6, 'black' => 6, 'pink' => 6,
    'skull' => 6  // Universal/wild injuries
];
```

**Oracle Cards (30 total)**
```php
const ORACLE_CARDS = [
    'red' => 5, 'blue' => 5, 'green' => 5,
    'yellow' => 5, 'black' => 5, 'pink' => 5
];
```

**Equipment Cards (22 total)**
```php
const EQUIPMENT_CARDS = [
    1 => ['type' => 'range', 'effect' => 'range_plus_1'],
    2 => ['type' => 'range', 'effect' => 'cross_shallows'],
    3 => ['type' => 'god_boost', 'effect' => 'advance_god_on_task_reward'],
    4 => ['type' => 'capacity', 'effect' => 'storage_plus_1'],
    5 => ['type' => 'shield', 'effect' => 'shield_plus_1', 'one_time' => true],
    6 => ['type' => 'distance', 'effect' => 'act_from_distance_monster_shrine'],
    7 => ['type' => 'distance', 'effect' => 'act_from_distance_statue'],
    8 => ['type' => 'colored_action', 'effect' => 'blue_action_benefits'],
    9 => ['type' => 'distance', 'effect' => 'act_from_distance_offering'],
    10 => ['type' => 'injury', 'effect' => 'recover_at_4_or_8'],
    11 => ['type' => 'extra_action', 'effect' => 'spend_3_favor_for_action'],
    12 => ['type' => 'favor', 'effect' => 'gain_2_favor_on_colored_dice'],
    13 => ['type' => 'instant_statue', 'effect' => 'load_colored_statue', 'one_time' => true],
    14 => ['type' => 'instant_god', 'effect' => 'advance_colored_god_to_top', 'one_time' => true],
    15 => ['type' => 'instant_offering', 'effect' => 'load_colored_offering', 'one_time' => true],
    16 => ['type' => 'instant_explore', 'effect' => 'explore_2_islands', 'one_time' => true],
    17 => ['type' => 'instant_combo', 'effect' => '3_favor_1_oracle_2_god_steps', 'one_time' => true],
    // ... (up to 22 equipment cards)
];
```

**Companion Cards (18 total, 3 per color)**
```php
const COMPANION_CARDS = [
    // Each color has 3 types: Hero, Demigod, Creature
    'red_hero' => ['type' => 'hero', 'color' => 'red', 'shield_bonus' => 2, 'discard_injury' => 'red'],
    'red_demigod' => ['type' => 'demigod', 'color' => 'red', 'oracle_card' => true, 'wildcard_die' => true],
    'red_creature' => ['type' => 'creature', 'color' => 'red', 'movement_bonus' => 3, 'any_color_end' => true],
    // ... (repeat for blue, green, yellow, black, pink)
];
```

### 2.2 Component Positioning

#### Zeus Tiles (Task Tracking)
- Top of player board area
- 4 groups of 3 tiles each: [Shrines] [Statues] [Offerings] [Monsters]
- Visual indication: face-up = active, removed = completed

#### Player Board Elements
- Central Oracle (circular, 6 colored segments)
- 3 Oracle Dice positions on oracle circle
- God Track (6 gods, vertical track with 5 rows: 0 to player_count to max)
- Shield Track (horizontal, values 0-10)
- Ship Tile display
- Shrines (3 building slots)
- Cargo area (visual representation of loaded Statues/Offerings)

#### Main Game Board
- Hexagonal water and island spaces
- Ships positioned on water hexes
- City Tiles around periphery (6 cities)
- Zeus central position (start/end)
- Island Tiles on designated island hexes (face-down until explored)

---

## 3. Game Flow

### 3.1 Game Setup Sequence

```
1. Board Setup (State: gameSetup)
   ├─ If firstGameMode = true:
   │  ├─ Use fixed recommended compact layout
   │  └─ Place tiles in predetermined positions
   └─ Else:
      ├─ Generate compact board layout algorithmically
      └─ Ensure all water spaces connected

2. Component Placement
   ├─ Place Zeus on center water tile
   ├─ Place 6 City Tiles around periphery
   ├─ Place 6 Temples on Temple Islands
   ├─ Distribute Offerings (per player count, no duplicates per island)
   ├─ Distribute Monsters (per player count, no duplicates per island)
   ├─ Place 3 Statues of each color on respective City Tiles
   └─ Shuffle and place Island Tiles face-down

3. Player Setup
   ├─ Determine starting player (random)
   ├─ Distribute Favor Tokens (start player: 3, +1 per player clockwise)
   ├─ Distribute Ship Tiles:
   │  ├─ If firstGameMode: Use 4 recommended tiles randomly
   │  └─ Else: Random or draft all 8 tiles
   ├─ Place ships at Zeus starting location
   ├─ Each player draws 1 Injury Card
   ├─ Advance matching God to player_count row
   ├─ Distribute 12 Zeus Tiles per player:
   │  ├─ If firstGameMode: Only 8 tiles (skip 1 Shrine, 1 Statue, 1 Monster, 1 Offering)
   │  └─ Else: All 12 tiles, randomize 2 Offering/Monster colors
   └─ Apply Ship Tile starting abilities

4. Initial Dice Roll
   └─ All players roll 3 Oracle Dice and place on oracle

State Transition: gameSetup → playerTurn (first player)
```

### 3.2 Turn Structure

#### Phase 1: Check Injury Cards (state: checkInjuryCards)
```
IF player has 3 equally colored Injury Cards OR 6 total Injury Cards:
    ├─ Player must RECOVER
    ├─ Action: Discard 3 Injury Cards of choice
    └─ Skip to state: consultOracle (end turn)
ELSE IF player has 0 Injury Cards:
    ├─ Reward: Take 2 Favor Tokens OR advance 1 God by 1 step
    └─ Continue to state: playerActions
ELSE:
    └─ Continue to state: playerActions (most common)
```

#### Phase 2: Perform Actions (state: playerActions)
```
Available Actions (any order):
├─ Use up to 3 Oracle Dice for actions
├─ Use 1 Oracle Card for an action (optional)
└─ Use Special Actions of Gods on top row (optional)

Before using a die/card:
└─ May recolor Oracle Dice (pay 1 Favor Token per step clockwise)

Each action must complete before starting next action.

Color-Independent Actions (any die):
├─ Draw 1 Oracle Card
├─ Take 2 Favor Tokens
└─ Look at 2 face-down Island Tiles

Color-Dependent Actions (die color must match):
├─ Move Ship (3 spaces base + bonuses, end on matching color)
├─ Fight Monster (Battle Die rolls vs Shield+Monster strength)
├─ Explore Island (reveal Island Tile, take reward)
├─ Build Shrine (place Shrine on revealed matching island)
├─ Load Offering (take from adjacent Offering Island)
├─ Make Offering (deliver to adjacent Temple)
├─ Load Statue (take from adjacent City Tile)
├─ Raise Statue (place on adjacent Statue Island)
├─ Discard Injury Cards (all of matching color)
└─ Advance God (advance matching God by 1 step)

Transition: When all actions done → consultOracle
```

#### Phase 3: Consult Oracle (state: consultOracle)
```
1. Player rolls 3 Oracle Dice
2. Place dice on matching colored oracle positions
3. Announce the resulting colors rolled

4. Other players may advance Gods:
   ├─ IF any of their Gods (not on lowest row) match announced colors:
   └─ May advance 1 matching God by 1 step

5. If player is last player of round:
   ├─ Also roll Titan's Die
   ├─ Titan attacks all players:
   │  ├─ IF Titan rolls 6: All players draw 2 Injury Cards
   │  └─ ELSE: Each player with Shield < Titan draws 1 Injury Card

Transition: consultOracle → nextPlayer (or checkEndGame if tasks complete)
```

### 3.3 Win Condition Check

```
After any player completes all Zeus Tiles:
├─ Player must return Ship to Zeus using normal movement
├─ First player to reach Zeus triggers END OF GAME
├─ Current round finishes (all players take their turns)
└─ Winner determination:
    ├─ 1. Player(s) who returned to Zeus
    ├─ 2. Tiebreaker: Most Oracle Cards
    ├─ 3. Tiebreaker: Most Favor Tokens
    └─ 4. Shared victory if still tied
```

### 3.4 State Machine Diagram

```
gameSetup (GAME)
    ↓
playerTurn (ACTIVE_PLAYER)
    ↓
checkInjuryCards (ACTIVE_PLAYER)
    ↓ (most common)
    ↓ (3 same/6 total)
    ↓────→ recoverFromInjuries → consultOracle
playerActions (ACTIVE_PLAYER)
    ↓
    ├─ moveShip (confirmation if needed)
    ├─ fightMonster → monsterCombat → monsterResult
    ├─ exploreIsland → exploreReward
    ├─ buildShrine
    ├─ loadOffering / makeOffering
    ├─ loadStatue / raiseStatue
    ├─ discardInjuries
    ├─ advanceGod
    ├─ drawOracleCard
    ├─ takeFavorTokens
    ├─ lookAtIslands
    └─ useGodSpecialAction
    ↓
consultOracle (ACTIVE_PLAYER)
    ↓
titanAttack (GAME, if last player)
    ↓
nextPlayer → playerTurn
    ↓
checkVictory → gameEnd (GAME)
```

---

## 4. Rules Implementation

### 4.1 Movement System

#### Ship Movement Rules
```php
class ShipMovement {
    /**
     * Calculate reachable spaces for ship movement
     *
     * @param int $playerId
     * @param string $dieColor - Oracle die color used
     * @return array - List of valid destination space_ids
     */
    public function getReachableSpaces(int $playerId, string $dieColor): array {
        $ship = $this->getPlayerShip($playerId);
        $baseRange = 3;

        // Apply ship tile bonuses
        $range = $baseRange + $ship->getRangeBonus();

        // Apply equipment bonuses
        $range += $this->getEquipmentRangeBonus($playerId);

        // Apply creature companion bonuses (if die color matches)
        $range += $this->getCreatureBonus($playerId, $dieColor);

        // Find all water spaces within range
        $reachable = $this->board->breadthFirstSearch(
            $ship->location,
            $range,
            ['water']  // Only water spaces allowed
        );

        // Filter to only spaces matching die color (unless creature allows any)
        if (!$this->hasAnyColorEndAbility($playerId, $dieColor)) {
            $reachable = array_filter($reachable, function($space) use ($dieColor) {
                return $space->color === $dieColor;
            });
        }

        return $reachable;
    }

    /**
     * Validate ship movement
     */
    public function validateMovement(int $playerId, int $targetSpaceId, string $dieColor): bool {
        $reachable = $this->getReachableSpaces($playerId, $dieColor);
        return in_array($targetSpaceId, array_column($reachable, 'space_id'));
    }

    /**
     * Execute ship movement
     */
    public function moveShip(int $playerId, int $targetSpaceId): void {
        // Update player ship location
        $this->DbQuery("UPDATE player SET player_ship_location = $targetSpaceId
                        WHERE player_id = $playerId");

        // Notify all players (modern API)
        $this->notify->all('shipMoved',
            clienttranslate('${player_name} moved their ship'),
            [
                'player_id' => $playerId,
                'space_id' => $targetSpaceId
                // Note: player_name auto-populated by notification decorator
            ]
        );
    }
}
```

#### Board Graph Generation
```php
class BoardGenerator {
    /**
     * Generate hexagonal board from tiles
     * Each tile is positioned with axial coordinates
     */
    public function generateBoard(array $tileLayout): array {
        $spaces = [];
        $adjacency = [];

        foreach ($tileLayout as $position => $tileId) {
            $tile = BOARD_TILES[$tileId];

            // Generate spaces for this tile
            $tileSpaces = $this->generateTileSpaces($tileId, $position);
            $spaces = array_merge($spaces, $tileSpaces);

            // Calculate adjacency between spaces
            $tileAdjacency = $this->calculateTileAdjacency($tileSpaces);
            $adjacency = array_merge($adjacency, $tileAdjacency);
        }

        // Calculate inter-tile adjacency
        $interTileAdjacency = $this->calculateInterTileAdjacency($spaces, $tileLayout);
        $adjacency = array_merge_recursive($adjacency, $interTileAdjacency);

        return ['spaces' => $spaces, 'adjacency' => $adjacency];
    }

    /**
     * First game mode - fixed compact layout
     */
    public function getFirstGameLayout(): array {
        // Predetermined layout matching rulebook diagram
        return [
            ['tile' => 1, 'position' => [0, 0]],
            ['tile' => 2, 'position' => [1, -1]],
            ['tile' => 3, 'position' => [-1, 1]],
            ['tile' => 4, 'position' => [2, -1]],
            ['tile' => 5, 'position' => [0, 2]],
            ['tile' => 6, 'position' => [-2, 1]],
            ['tile' => 7, 'position' => [1, 1]],
            ['tile' => 8, 'position' => [-1, -1]],
            ['tile' => 9, 'position' => [2, 0]],
            ['tile' => 10, 'position' => [0, -2]],
            ['tile' => 11, 'position' => [-2, 0]],
            ['tile' => 12, 'position' => [0, 0]],  // Zeus tile at center
        ];
    }
}
```

### 4.2 Monster Combat System

```php
class MonsterCombat {
    /**
     * Initiate monster fight
     */
    public function startFight(int $playerId, string $monsterColor): array {
        $monster = $this->getMonster($monsterColor, $playerId);
        $shield = $this->getPlayerShieldStrength($playerId);

        $monsterStrength = 9 - $shield;

        // Store combat state in globals
        $this->globals->set('combat_state', [
            'player_id' => $playerId,
            'monster_color' => $monsterColor,
            'monster_strength' => $monsterStrength,
            'rounds' => 0
        ]);

        return [
            'monster_color' => $monsterColor,
            'monster_strength' => $monsterStrength,
            'shield_strength' => $shield,
            'target_roll' => $monsterStrength
        ];
    }

    /**
     * Process combat round
     */
    public function combatRound(int $playerId, int $battleDieRoll, bool $continueFighting): array {
        $combatState = $this->globals->get('combat_state');
        $combatState['rounds']++;

        // Check if roll defeats monster
        if ($battleDieRoll >= $combatState['monster_strength']) {
            return $this->defeatMonster($playerId, $combatState);
        }

        // Roll 0 = draw injury
        if ($battleDieRoll === 0) {
            $this->drawInjuryCard($playerId);
        }

        // Continue fighting?
        if ($continueFighting) {
            // Pay 1 Favor Token
            if (!$this->payFavorTokens($playerId, 1)) {
                return ['result' => 'surrender', 'reason' => 'insufficient_favor'];
            }

            // Reduce monster strength by 1
            $combatState['monster_strength']--;
            $this->globals->set('combat_state', $combatState);

            return [
                'result' => 'continue',
                'new_target' => $combatState['monster_strength'],
                'rounds' => $combatState['rounds']
            ];
        } else {
            // Surrender
            $this->globals->delete('combat_state');
            return ['result' => 'surrender'];
        }
    }

    /**
     * Complete monster defeat
     */
    private function defeatMonster(int $playerId, array $combatState): array {
        $monsterColor = $combatState['monster_color'];

        // Mark monster as defeated
        $this->DbQuery("UPDATE components
                        SET location = 'completed', player_id = $playerId
                        WHERE component_type = 'monster'
                        AND component_color = '$monsterColor'
                        AND player_id IS NULL");

        // Complete Zeus Tile
        $zeusReward = $this->completeZeusTile($playerId, 'monster', $monsterColor);

        // Take Equipment Card reward
        $equipmentCard = $this->drawEquipmentCard($playerId);

        // Clean up combat state
        $this->globals->delete('combat_state');

        return [
            'result' => 'victory',
            'zeus_reward' => $zeusReward,
            'equipment_card' => $equipmentCard
        ];
    }
}
```

### 4.3 Task Completion System

```php
class TaskManager {
    /**
     * Complete a Zeus Tile and award reward
     */
    public function completeZeusTile(int $playerId, string $taskType, string $color): array {
        // Find matching Zeus Tile
        $zeusId = $this->getObjectFromDB(
            "SELECT zeus_tile_id, required_color
             FROM zeus_tiles
             WHERE player_id = $playerId
             AND task_type = '$taskType'
             AND is_completed = FALSE
             AND (required_color = '$color' OR required_color IS NULL OR required_color = 'any')
             LIMIT 1"
        );

        if (!$zeusId) {
            throw new BgaUserException("No matching Zeus Tile found");
        }

        // Mark as completed
        $this->DbQuery("UPDATE zeus_tiles
                        SET is_completed = TRUE
                        WHERE zeus_tile_id = {$zeusId['zeus_tile_id']}");

        // Award task-specific reward
        $reward = $this->awardTaskReward($playerId, $taskType, $color);

        // Update player progress
        $this->DbQuery("UPDATE player
                        SET player_score_aux = player_score_aux + 1
                        WHERE player_id = $playerId");

        // Check if all tasks complete
        $remainingTasks = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM zeus_tiles
             WHERE player_id = $playerId AND is_completed = FALSE"
        );

        return [
            'zeus_tile_id' => $zeusId['zeus_tile_id'],
            'reward' => $reward,
            'remaining_tasks' => $remainingTasks,
            'can_return_to_zeus' => ($remainingTasks === 0)
        ];
    }

    /**
     * Award rewards based on task type
     */
    private function awardTaskReward(int $playerId, string $taskType, string $color): array {
        switch ($taskType) {
            case 'shrine':
                // Advance any God by 1 step
                return ['type' => 'god_step', 'amount' => 1, 'god' => 'any'];

            case 'statue':
                // Take Companion Card matching statue color
                $companion = $this->takeCompanionCard($playerId, $color);
                return ['type' => 'companion', 'card' => $companion];

            case 'offering':
                // Take 3 Favor Tokens
                $this->addFavorTokens($playerId, 3);
                return ['type' => 'favor', 'amount' => 3];

            case 'monster':
                // Take Equipment Card from display
                $equipment = $this->drawEquipmentCard($playerId);
                return ['type' => 'equipment', 'card' => $equipment];
        }
    }

    /**
     * Check if player can return to Zeus
     */
    public function canReturnToZeus(int $playerId): bool {
        $remaining = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM zeus_tiles
             WHERE player_id = $playerId AND is_completed = FALSE"
        );

        return $remaining === 0;
    }
}
```

### 4.4 Oracle Dice System

```php
class OracleSystem {
    const ORACLE_POSITIONS = [
        1 => 'blue',    // Poseidon
        2 => 'yellow',  // Apollon
        3 => 'green',   // Artemis
        4 => 'red',     // Aphrodite
        5 => 'black',   // Ares
        6 => 'pink'     // Hermes
    ];

    /**
     * Roll oracle dice for player
     */
    public function rollDice(int $playerId): array {
        $rolls = [];

        for ($dieNum = 1; $dieNum <= 3; $dieNum++) {
            // Roll d6 (1-6)
            $position = bga_rand(1, 6);
            $color = self::ORACLE_POSITIONS[$position];

            // Update database
            $this->DbQuery("UPDATE oracle_dice
                            SET die_color = '$color',
                                oracle_position = $position,
                                is_used = FALSE
                            WHERE player_id = $playerId
                            AND die_number = $dieNum");

            $rolls[] = [
                'die_number' => $dieNum,
                'position' => $position,
                'color' => $color
            ];
        }

        return $rolls;
    }

    /**
     * Recolor a die (move clockwise on oracle)
     */
    public function recolorDie(int $playerId, int $dieNumber, int $steps): array {
        // Check if player has bidirectional ability (Ship Tile 8)
        $canGoCounterclockwise = $this->hasShipTileAbility($playerId, 'bidirectional_recolor');

        // Get current position
        $die = $this->getObjectFromDB(
            "SELECT oracle_position FROM oracle_dice
             WHERE player_id = $playerId AND die_number = $dieNumber"
        );

        $currentPos = $die['oracle_position'];

        // Calculate new position (wraps around 1-6)
        if ($steps > 0) {
            // Clockwise
            $newPos = (($currentPos - 1 + $steps) % 6) + 1;
        } else {
            // Counterclockwise (only if allowed)
            if (!$canGoCounterclockwise) {
                throw new BgaUserException("Cannot move counterclockwise");
            }
            $newPos = (($currentPos - 1 + $steps + 6) % 6) + 1;
        }

        $newColor = self::ORACLE_POSITIONS[$newPos];

        // Calculate cost (apply discount from Ship Tile 7)
        $costPerStep = $this->hasShipTileAbility($playerId, 'recolor_discount') ? 0 : 1;
        $totalCost = abs($steps) * $costPerStep;

        // Pay favor tokens
        if (!$this->payFavorTokens($playerId, $totalCost)) {
            throw new BgaUserException("Insufficient Favor Tokens");
        }

        // Update die
        $this->DbQuery("UPDATE oracle_dice
                        SET die_color = '$newColor',
                            oracle_position = $newPos
                        WHERE player_id = $playerId
                        AND die_number = $dieNumber");

        return [
            'die_number' => $dieNumber,
            'old_position' => $currentPos,
            'new_position' => $newPos,
            'new_color' => $newColor,
            'cost' => $totalCost
        ];
    }

    /**
     * Use a die for an action
     */
    public function useDie(int $playerId, int $dieNumber): void {
        $this->DbQuery("UPDATE oracle_dice
                        SET is_used = TRUE
                        WHERE player_id = $playerId
                        AND die_number = $dieNumber");
    }

    /**
     * Get available (unused) dice
     */
    public function getAvailableDice(int $playerId): array {
        return $this->getObjectListFromDB(
            "SELECT die_number, oracle_position, die_color
             FROM oracle_dice
             WHERE player_id = $playerId
             AND is_used = FALSE"
        );
    }
}
```

### 4.5 God Advancement System

```php
class GodManager {
    /**
     * Advance a god on the track
     */
    public function advanceGod(int $playerId, string $godColor, int $steps = 1): array {
        $god = $this->getObjectFromDB(
            "SELECT god_id, position, god_name
             FROM gods
             WHERE player_id = $playerId
             AND god_color = '$godColor'"
        );

        $currentPos = $god['position'];
        $playerCount = count($this->loadPlayersBasicInfos());

        // Calculate new position
        if ($currentPos === 0) {
            // Advancing from bottom: go to player count row
            $newPos = $playerCount;
        } else {
            // Normal advancement
            $newPos = min($currentPos + $steps, 4); // Max row is 4
        }

        // Update position
        $this->DbQuery("UPDATE gods
                        SET position = $newPos
                        WHERE god_id = {$god['god_id']}");

        // Check if reached top row (special action available)
        $specialActionAvailable = ($newPos === 4);

        return [
            'god_id' => $god['god_id'],
            'god_name' => $god['god_name'],
            'god_color' => $godColor,
            'old_position' => $currentPos,
            'new_position' => $newPos,
            'special_action_available' => $specialActionAvailable
        ];
    }

    /**
     * Use god special action (returns god to bottom)
     */
    public function useGodSpecialAction(int $playerId, string $godColor): void {
        $playerCount = count($this->loadPlayersBasicInfos());

        // Check if player has Ship Tile 3 ability (return to player count row)
        $returnRow = $this->hasShipTileAbility($playerId, 'god_advancement')
                     ? $playerCount
                     : 0;

        $this->DbQuery("UPDATE gods
                        SET position = $returnRow
                        WHERE player_id = $playerId
                        AND god_color = '$godColor'");
    }

    /**
     * Get gods available for special actions
     */
    public function getAvailableGodActions(int $playerId): array {
        return $this->getObjectListFromDB(
            "SELECT god_id, god_name, god_color
             FROM gods
             WHERE player_id = $playerId
             AND position = 4"
        );
    }

    /**
     * Other players advance gods (after oracle consultation)
     */
    public function othersAdvanceGods(int $activePlayerId, array $rolledColors): void {
        $allPlayers = $this->loadPlayersBasicInfos();

        foreach ($allPlayers as $pid => $player) {
            if ($pid === $activePlayerId) continue;

            // Check if any of their gods (not on lowest row) match colors
            $matchingGods = $this->getObjectListFromDB(
                "SELECT god_id, god_color, god_name, position
                 FROM gods
                 WHERE player_id = $pid
                 AND position > 0
                 AND god_color IN ('" . implode("','", $rolledColors) . "')"
            );

            if (count($matchingGods) > 0) {
                // Player MAY advance one of these gods
                $this->notifyPlayer($pid, 'canAdvanceGod', '', [
                    'gods' => $matchingGods,
                    'rolled_colors' => $rolledColors
                ]);
            }
        }
    }
}
```

### 4.6 Injury and Recovery System

```php
class InjuryManager {
    /**
     * Draw injury cards
     */
    public function drawInjuryCards(int $playerId, int $count): array {
        $drawn = [];

        for ($i = 0; $i < $count; $i++) {
            $card = $this->drawCardFromDeck('injury', $playerId);
            $drawn[] = $card;
        }

        return $drawn;
    }

    /**
     * Check if player must recover
     */
    public function mustRecover(int $playerId): bool {
        $injuries = $this->getPlayerInjuryCards($playerId);
        $total = count($injuries);

        // Check for 6 total
        if ($total >= 6) {
            return true;
        }

        // Check for 3 of same color
        $colorCounts = [];
        foreach ($injuries as $card) {
            $color = $card['card_type_arg']; // Color is stored in type_arg
            $colorCounts[$color] = ($colorCounts[$color] ?? 0) + 1;

            if ($colorCounts[$color] >= 3) {
                return true;
            }
        }

        return false;
    }

    /**
     * Check if player has no injuries (reward)
     */
    public function hasNoInjuries(int $playerId): bool {
        $count = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM cards
             WHERE player_id = $playerId
             AND card_type = 'injury'
             AND card_location = 'hand'"
        );

        return $count === 0;
    }

    /**
     * Discard injury cards
     */
    public function discardInjuryCards(int $playerId, array $cardIds): void {
        $cardIdList = implode(',', $cardIds);

        $this->DbQuery("UPDATE cards
                        SET card_location = 'discard'
                        WHERE card_id IN ($cardIdList)
                        AND player_id = $playerId
                        AND card_type = 'injury'");
    }

    /**
     * Discard all injuries of specific color
     */
    public function discardInjuriesByColor(int $playerId, string $color): int {
        // Get color ID
        $colorId = array_search($color, array_keys(INJURY_CARDS));

        $count = $this->getUniqueValueFromDB(
            "SELECT COUNT(*) FROM cards
             WHERE player_id = $playerId
             AND card_type = 'injury'
             AND card_type_arg = $colorId
             AND card_location = 'hand'"
        );

        $this->DbQuery("UPDATE cards
                        SET card_location = 'discard'
                        WHERE player_id = $playerId
                        AND card_type = 'injury'
                        AND card_type_arg = $colorId
                        AND card_location = 'hand'");

        return $count;
    }
}
```

---

## 5. Development Roadmap

### Phase 1: Core Mechanics (MVP) - Weeks 1-4

**Goal**: Playable 2-player game with basic rules and minimal UI

**Backend Tasks**:
- [ ] Setup database schema (all 7 tables)
- [ ] Implement board generation (first game mode only)
- [ ] Basic state machine (setup → playerTurn → actions → consultOracle)
- [ ] Ship movement system with range calculation
- [ ] Oracle dice rolling and placement
- [ ] Task completion (simple: Shrines only)
- [ ] Basic Zeus Tile tracking
- [ ] Favor Token system
- [ ] Win condition detection (return to Zeus)

**Frontend Tasks**:
- [ ] Basic board rendering (hexagonal grid)
- [ ] Ship token display
- [ ] Player board layout (oracle, gods, shield)
- [ ] Oracle dice display and rolling animation
- [ ] Action buttons for basic moves
- [ ] Zeus Tiles progress indicator
- [ ] Simple notifications for player actions

**Testing**:
- [ ] 2-player game start to finish
- [ ] Ship movement validation
- [ ] Dice rolling and placement
- [ ] Basic task completion

### Phase 2: Complete Rule Set - Weeks 5-8

**Goal**: Full game with all mechanics, all player counts, edge cases handled

**Backend Tasks**:
- [ ] Monster combat system (Battle Die, favor costs)
- [ ] Statue system (loading, cargo, delivery)
- [ ] Offering system (loading, cargo, delivery)
- [ ] Island exploration (reveal, rewards, Greek letters)
- [ ] God advancement system
- [ ] God special actions (all 6 gods)
- [ ] Injury card system (recovery, 3-of-a-kind, 6 total)
- [ ] Titan attack system (last player, die roll, injuries)
- [ ] Oracle Cards (draw, use as action)
- [ ] Equipment Cards (all 22 cards, one-time effects)
- [ ] Companion Cards (Heroes, Demigods, Creatures)
- [ ] Ship Tiles (all 8 variants with abilities)
- [ ] Cargo capacity management
- [ ] Color matching validation (actions, destinations)
- [ ] Dice recoloring (favor cost, bidirectional)
- [ ] Zeus Tile randomization (Offering/Monster colors)
- [ ] All edge cases and special interactions

**Frontend Tasks**:
- [ ] Monster combat UI (Battle Die, continue/surrender)
- [ ] Cargo display in ship
- [ ] Island Tile flip animation
- [ ] God track visualization
- [ ] God special action buttons
- [ ] Shield track display
- [ ] Injury card hand display
- [ ] Oracle Card display and usage
- [ ] Equipment Card display
- [ ] Companion Card benefits display
- [ ] City Tiles with Statues
- [ ] Temple Islands with Offerings
- [ ] Favor Token spending UI
- [ ] Dice recoloring interface
- [ ] Action validation feedback (highlight valid moves)

**Testing**:
- [ ] 2-player, 3-player, 4-player games
- [ ] All 12 task types completion
- [ ] All god special actions
- [ ] All ship tile abilities
- [ ] Monster combat (win, lose, surrender)
- [ ] Injury recovery triggers
- [ ] Titan attacks
- [ ] Win condition with ties

### Phase 3: UI/UX Polish - Weeks 9-10

**Goal**: Professional look, smooth animations, excellent user experience

**Frontend Tasks**:
- [ ] Sprite sheet creation for UI icons
- [ ] Board tile artwork integration
- [ ] Ship token designs (4 player colors)
- [ ] Component artwork (Statues, Offerings, Monsters)
- [ ] Smooth ship movement animation
- [ ] Dice roll animations
- [ ] Card flip animations
- [ ] Component transfer animations (load/deliver)
- [ ] God advancement animations
- [ ] Damage/injury visual feedback
- [ ] Victory animation sequence
- [ ] Color-blind friendly design
- [ ] Dark mode support
- [ ] Tooltips for all components
- [ ] Help overlays for complex rules
- [ ] Player aid (available actions)
- [ ] Turn indicator
- [ ] Score progress display
- [ ] Log message formatting

**CSS/SCSS**:
- [ ] Responsive layout for all screen sizes
- [ ] Hover effects for interactive elements
- [ ] Selected/highlighted states
- [ ] Disabled state styling
- [ ] Loading states
- [ ] Transition effects

**Testing**:
- [ ] Visual consistency across browsers
- [ ] Animation smoothness
- [ ] Tooltip accuracy
- [ ] Color-blind mode
- [ ] Dark mode

### Phase 4: Board Layouts & Game Options - Weeks 11-12

**Goal**: Dynamic board generation, game variants, full feature set

**Backend Tasks**:
- [ ] Board layout algorithm (compact, minimal shallows)
- [ ] Board layout validation (all water connected)
- [ ] Board layout presets (beginner/standard/advanced)
- [ ] "First Game Mode" option implementation:
  - [ ] 8 Zeus Tiles instead of 12
  - [ ] 4 recommended Ship Tiles
  - [ ] Fixed board layout
- [ ] Ship Tile selection modes (random vs draft)
- [ ] Game options JSON configuration
- [ ] Statistics tracking (turns, tasks per type, etc.)

**Frontend Tasks**:
- [ ] Board layout visualization
- [ ] Game setup screen with options
- [ ] Ship Tile selection interface (if draft mode)
- [ ] Board generation loading state
- [ ] End-game statistics display

**Testing**:
- [ ] Board generation algorithm (100+ layouts)
- [ ] First Game Mode vs Standard Mode
- [ ] All game options
- [ ] Statistics accuracy

### Phase 5: Zombie Mode & Optimization - Weeks 13-14

**Goal**: AI player behavior, performance optimization, final polish

**Backend Tasks**:
- [ ] Zombie player implementation (Level 1: Random valid moves)
- [ ] Zombie recovery behavior
- [ ] Zombie task prioritization
- [ ] Database query optimization
- [ ] State machine optimization
- [ ] Memory usage optimization

**Frontend Tasks**:
- [ ] Performance profiling
- [ ] Image optimization (all sprites under 2MB)
- [ ] CSS minification
- [ ] JavaScript optimization
- [ ] Memory leak detection and fixes
- [ ] Animation performance tuning

**Testing**:
- [ ] Zombie player completing full games
- [ ] Performance benchmarks
- [ ] Memory usage monitoring
- [ ] Browser compatibility (Chrome, Firefox, Safari)
- [ ] Mobile device testing

### Phase 6: Alpha Release Preparation - Weeks 15-16

**Goal**: Production-ready game, documentation, submission

**Tasks**:
- [ ] Final bug fixes
- [ ] Complete rules reference
- [ ] Quick start guide
- [ ] Known issues documentation
- [ ] Pre-release checklist completion
- [ ] Game description and metadata
- [ ] Screenshots and promotional images
- [ ] Beta testing with focus group
- [ ] Address beta feedback
- [ ] BGA alpha submission

---

## 6. Technical Specifications

### 6.1 Backend Architecture

#### Module Organization (Modular Pattern)
```
modules/
├── php/
│   ├── BoardManager.php           # Board generation, space management
│   ├── ShipManager.php             # Ship movement, cargo
│   ├── OracleManager.php           # Dice rolling, recoloring
│   ├── TaskManager.php             # Zeus Tiles, completion tracking
│   ├── CombatManager.php           # Monster fights
│   ├── GodManager.php              # God advancement, special actions
│   ├── CardManager.php             # All card types (Injury, Oracle, Equipment, Companion)
│   ├── InjuryManager.php           # Injury tracking, recovery
│   ├── ComponentManager.php        # Offerings, Statues, Monsters, Shrines
│   └── Constants.php               # Game constants and configuration
└── js/
    ├── BoardUI.js                  # Board rendering and interaction
    ├── ShipUI.js                   # Ship visualization
    ├── OracleUI.js                 # Oracle and dice display
    ├── PlayerBoardUI.js            # Player area rendering
    ├── CardUI.js                   # Card displays
    └── AnimationManager.js         # Animation helpers
```

#### State Machine (State Classes)

**Key States**:
```php
States/
├── GameSetup.php               # Initial game setup
├── PlayerTurn.php              # Active player's turn
├── CheckInjuries.php           # Phase 1: Check injury cards
├── PlayerActions.php           # Phase 2: Perform actions
│   ├── MoveShip.php           # Confirmation substates if needed
│   ├── FightMonster.php       # Combat sequence
│   ├── ExploreIsland.php      # Exploration and rewards
│   └── ... (action substates as needed)
├── ConsultOracle.php           # Phase 3: Roll dice
├── TitanAttack.php             # Last player titan die
├── NextPlayer.php              # Transition to next player
└── GameEnd.php                 # Victory and scoring
```

#### Key Algorithms

**1. Hexagonal Pathfinding (A* for movement validation)**
```php
/**
 * Find shortest path between hexes
 * Uses axial coordinate system
 */
function findPath($fromSpace, $toSpace, $maxDistance, $allowedTypes = ['water']) {
    // A* pathfinding with hex distance heuristic
    // Returns path or null if unreachable
}
```

**2. Board Layout Generation**
```php
/**
 * Generate compact board layout
 * Prioritize minimal shallows, connected water
 */
function generateBoardLayout($playerCount) {
    // Place center tile (Zeus)
    // Add surrounding tiles to form compact shape
    // Validate all water spaces connected
    // Place 6 City Tiles around periphery
    // Minimize shallows (holes between tiles)
}
```

**3. Task Availability Calculation**
```php
/**
 * Determine which actions are available
 * Based on ship location, cargo, dice colors
 */
function getAvailableActions($playerId) {
    // Check ship adjacency to islands/cities/temples
    // Check available oracle dice colors
    // Check cargo capacity and contents
    // Check god special actions
    // Return array of valid actions
}
```

### 6.2 Frontend Architecture

#### JavaScript Organization (Vanilla JS with BGA Patterns)

**Main Game File** (`theoracleofdelphi.js`):
```javascript
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
            // Setup board
            this.boardManager = new BoardManager(this, gamedatas);
            this.shipManager = new ShipManager(this, gamedatas);
            this.oracleManager = new OracleManager(this, gamedatas);

            // Setup player boards
            this.setupPlayerBoards(gamedatas.players);

            // Setup notifications
            this.setupNotifications();
        },

        onEnteringState: function(stateName, args) {
            // Handle state-specific UI
            switch(stateName) {
                case 'playerActions':
                    this.updateAvailableActions(args.args);
                    break;
                case 'fightMonster':
                    this.showCombatUI(args.args);
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
        }
    });
});
```

**Component Managers**:
```javascript
// BoardManager.js - Board rendering and interaction
var BoardManager = {
    game: null,
    spaces: {},

    setup: function(game, boardData) {
        this.game = game;
        this.renderBoard(boardData);
    },

    renderBoard: function(boardData) {
        // Create hex grid
        // Position tiles
        // Add components (islands, cities)
    },

    highlightReachableSpaces: function(spaceIds) {
        // Visual feedback for valid moves
    }
};

// OracleManager.js - Dice and oracle display
var OracleManager = {
    rollDice: function(playerId) {
        // Animate dice roll
        // Update oracle positions
    },

    showRecolorUI: function(dieNumber) {
        // Show recolor options
        // Calculate costs
    }
};
```

#### Asset Strategy

**Image Files** (in `img/` directory):
```
img/
├── board-tiles.jpg              # Sprite sheet: 12 board tiles
├── components.png               # Sprite sheet: Statues, Offerings, Monsters, Shrines
├── ships.png                    # Sprite sheet: 4 player color ships
├── cards-injury.png             # Sprite sheet: Injury card backs
├── cards-oracle.png             # Sprite sheet: Oracle card faces
├── cards-equipment.png          # Sprite sheet: Equipment cards
├── cards-companion.png          # Sprite sheet: Companion cards
├── ui-elements.png              # Sprite sheet: Icons, tokens, dice
├── zeus-tiles.png               # Sprite sheet: Zeus Tile graphics
├── player-boards.png            # Sprite sheet: Oracle, god track, shield track
├── city-tiles.jpg               # Sprite sheet: 6 City Tiles
└── gods.png                     # Sprite sheet: 6 God tokens
```

Total: **12 image files** (within BGA limit)

**CSS Organization**:
```scss
// src/scss/main.scss
@import 'variables';
@import 'utilities';
@import 'board';
@import 'player-area';
@import 'cards';
@import 'components';
@import 'animations';

// Compiles to: theoracleofdelphi.css
```

### 6.3 Game Options Configuration

**gameoptions.json**:
```json
{
  "100": {
    "name": "Game Mode",
    "values": {
      "1": {
        "name": "First Game Mode",
        "description": "Simplified setup: 8 tasks, 4 ship tiles, fixed board",
        "tmdisplay": "First Game"
      },
      "2": {
        "name": "Standard Game",
        "description": "Full game: 12 tasks, all ship tiles, random board",
        "tmdisplay": "Standard"
      }
    },
    "default": 2,
    "displaycondition": []
  },
  "101": {
    "name": "Ship Tile Selection",
    "values": {
      "1": {
        "name": "Random",
        "description": "Each player receives a random Ship Tile"
      },
      "2": {
        "name": "Draft",
        "description": "Players draft Ship Tiles in reverse turn order"
      }
    },
    "default": 1,
    "displaycondition": [
      {
        "type": "otheroption",
        "id": 100,
        "value": [2]
      }
    ]
  }
}
```

### 6.4 Development Environment Setup

#### IDE Helper Files

**Modern BGA Framework Support**:
- **`_ide_helper.php`** - PHP auto-completion and type hints for BGA framework
- **`bga-framework.d.ts`** - TypeScript definitions for JavaScript development

**Setup Instructions**:
1. Download latest versions from BGA Studio FTP directory
2. Place in project root directory
3. VS Code (recommended) will automatically detect and use them
4. Sync regularly from BGA Studio for framework updates

**Benefits**:
- Auto-completion for BGA framework methods
- Type checking and error detection during development
- Inline documentation for framework APIs
- Catch errors before deploying to BGA Studio

#### Build Pipeline

**SCSS Compilation**:
```bash
# Install dependencies
npm install --save-dev sass

# Watch mode during development
npm run watch-css

# Production build
npm run build-css
```

**SFTP Sync** (VS Code):
- Use SFTP extension for auto-upload on save
- Configure `.vscode/sftp.json` with BGA Studio credentials
- Ignore: `.git`, `node_modules`, `src`, `plan` directories

#### Recommended Development Tools

- **IDE**: VS Code with PHP Intelephense and SFTP extensions
- **Version Control**: Git with .gitignore for `/img` directory
- **Node.js**: For SCSS compilation
- **Browser**: Chrome/Firefox for testing
- **BGA Studio**: For integration testing and deployment

**Reference**: See `bga-framework.md` for complete development workflow and modern framework patterns.

---

### 6.5 Statistics Configuration

**stats.json**:
```json
{
  "table": {
    "turns_number": {
      "id": 10,
      "name": "Number of turns",
      "type": "int"
    },
    "rounds_number": {
      "id": 11,
      "name": "Number of rounds",
      "type": "int"
    }
  },
  "player": {
    "shrines_built": {
      "id": 20,
      "name": "Shrines built",
      "type": "int"
    },
    "statues_raised": {
      "id": 21,
      "name": "Statues raised",
      "type": "int"
    },
    "offerings_made": {
      "id": 22,
      "name": "Offerings made",
      "type": "int"
    },
    "monsters_defeated": {
      "id": 23,
      "name": "Monsters defeated",
      "type": "int"
    },
    "gods_special_actions": {
      "id": 24,
      "name": "God special actions used",
      "type": "int"
    },
    "favor_tokens_spent": {
      "id": 25,
      "name": "Favor tokens spent",
      "type": "int"
    },
    "injuries_received": {
      "id": 26,
      "name": "Injury cards received",
      "type": "int"
    },
    "dice_recolors": {
      "id": 27,
      "name": "Times recolored dice",
      "type": "int"
    }
  }
}
```

---

## 7. Open Questions / Clarifications Needed

### 7.1 Resolved
✅ Board layout: Start with first game mode, add algorithm later
✅ Turn structure: BGA handles turn-based mechanics
✅ Undo system: BGA framework handles this
✅ AI/Solo mode: Skip for initial release
✅ Game variants: Focus on full game, make 8-tile part of First Game Mode
✅ Mobile optimization: BGA framework handles responsive design

### 7.2 Still To Clarify

1. **Equipment Card Interpretations**: Some Equipment Cards have ambiguous timing or effects. Need to verify exact implementation for:
   - "Act from distance" cards: Does this bypass adjacency requirement entirely?
   - "Colored action benefits": What exactly counts as a "colored action"?

2. **Companion Card Interactions**:
   - Demigod "wildcard die" ability: Can it be used for movement color requirement, or just action type?
   - Creature movement bonus: Does it stack with ship tile bonuses?

3. **Edge Cases**:
   - What happens if a player needs to load an Offering but all of that color are already taken?
   - Can a player explore an Island Tile that doesn't match any of their remaining Zeus Tiles?
   - If Ship Tile 5 removes a Zeus Tile, can player choose one they haven't started yet?

4. **Visual Design Priorities**:
   - Should we create custom artwork or use simplified placeholder graphics initially?
   - Priority for animation quality vs development speed?

---

## 8. Fidelity Checklist

### Core Rules Implementation
- [ ] All 12 task types can be completed
- [ ] Ship movement follows exact range and color rules
- [ ] Oracle dice system works exactly as physical version
- [ ] Monster combat uses correct Battle Die mechanics
- [ ] Titan attack affects all players correctly
- [ ] Gods advance with correct timing and rewards
- [ ] Injury system triggers recovery at 3-of-a-kind or 6 total
- [ ] Cargo system enforces capacity limits
- [ ] Color matching validated for all actions

### Turn Structure
- [ ] 3 phases execute in correct order
- [ ] Injury check happens before actions
- [ ] Oracle consultation ends turn
- [ ] Last player rolls Titan Die
- [ ] Other players can advance gods after consultation

### Component Behavior
- [ ] All 8 Ship Tiles function as described
- [ ] All 6 God special actions work correctly
- [ ] All 22 Equipment Cards implemented
- [ ] All 18 Companion Cards provide correct benefits
- [ ] Island Tiles reveal correct rewards
- [ ] Zeus Tiles track progress accurately

### Win Conditions
- [ ] Must complete all tasks before returning to Zeus
- [ ] Returning to Zeus requires normal movement
- [ ] First to reach Zeus triggers end of round
- [ ] Tiebreakers: Oracle Cards > Favor Tokens > Shared victory

### Random Elements
- [ ] Oracle dice use d6 (1-6) probabilities
- [ ] Battle Die uses d10 (0-9) probabilities
- [ ] Titan Die uses d6 (1-6) probabilities
- [ ] Card draws are properly randomized
- [ ] Board layout generation is fair and balanced

### Player Counts
- [ ] 2-player games work correctly
- [ ] 3-player games work correctly
- [ ] 4-player games work correctly
- [ ] Component distribution scales with player count
- [ ] God advancement tracks scale with player count

### Game Variants
- [ ] First Game Mode uses 8 Zeus Tiles
- [ ] First Game Mode uses 4 recommended Ship Tiles
- [ ] First Game Mode uses fixed compact board
- [ ] Standard Mode uses all 12 Zeus Tiles
- [ ] Standard Mode allows all Ship Tiles

---

## 9. Success Metrics

**Alpha Release Goals**:
- [ ] Game completion rate > 95% (no stuck states)
- [ ] Average load time < 3 seconds
- [ ] Bug reports < 2 per day during beta
- [ ] Player satisfaction > 4.5/5
- [ ] Rules questions < 1 per 10 games

**Performance Targets**:
- [ ] All images load < 5 seconds total
- [ ] Turn actions respond < 500ms
- [ ] Animations run at 60fps
- [ ] No memory leaks after 1-hour session
- [ ] Database queries < 100ms average

**Code Quality**:
- [ ] All functions documented
- [ ] State machine fully tested
- [ ] Zombie mode completes games successfully
- [ ] No hardcoded magic numbers
- [ ] Clean separation of concerns (modules)

---

## Summary

**The Oracle of Delphi** is a complex medium-weight game requiring careful implementation of:
- Hexagonal board movement with color matching
- Dice placement and manipulation system
- Multiple resource types and cargo management
- Combat system with progressive difficulty
- Task tracking across 4 categories × 3 tasks each
- Card systems (4 types with unique mechanics)
- Player progression (Gods, Shield, Injuries)

**Recommended Architecture**: Modular with separate managers for each major system
**Estimated Timeline**: 16 weeks to alpha release
**Key Challenges**: Board generation algorithm, combat UI, cargo management, state machine complexity
**Critical Path**: Phase 1 (Core Mechanics) → Phase 2 (Complete Rules) → Phase 3 (Polish)

This plan provides a complete roadmap for implementing a faithful digital version of The Oracle of Delphi on Board Game Arena, maintaining all original rules and game feel while leveraging BGA's framework capabilities.
