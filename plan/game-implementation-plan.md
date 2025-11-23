# The Oracle of Delphi - Digital Implementation Plan

> **📚 Code Examples**: All implementation examples are in separate files.
> See **[CODE_EXAMPLES_INDEX.md](CODE_EXAMPLES_INDEX.md)** for quick reference.

## Executive Summary

**Game**: The Oracle of Delphi by Stefan Feld
**Type**: Dice placement, resource management, racing game
**Players**: 2-4
**Complexity**: Medium-High
**BGA Architecture**: Modular with reusable framework components

---

## ⚠️ CRITICAL: State Persistence

> **All game state MUST be persisted to the database.**
>
> Local variables in code examples are for **temporary computation only** within a single request.
> When a player refreshes their browser, `getAllDatas()` reconstructs the **complete game state from the database**.
>
> **See [STATE_PERSISTENCE_GUIDE.md](STATE_PERSISTENCE_GUIDE.md)** for comprehensive explanation.
> **See [GameStateManager.php](code-examples/php/GameStateManager.php)** for implementation example.

---

## 1. Game State Architecture

### 1.1 Core Game State Variables

> **Note**: All variables described here are **persisted to the database**. The examples show the data structure, but actual storage uses database tables and the globals API. See [STATE_PERSISTENCE_GUIDE.md](STATE_PERSISTENCE_GUIDE.md).

#### Global Game State

**Storage**: Modern `$this->globals` API (supports any type, auto JSON serialization)
**Persistence**: Stored in database, survives page refresh

**Variables**:
- `currentRound` (int) - Current round number
- `titanStrength` (int) - Last rolled Titan Die value (0-6)
- `firstGameMode` (bool) - Using simplified first-game rules
- `boardLayout` (array) - Board tile positions
- `activePhase` (string) - 'injury_check', 'actions', 'oracle_consult'

**Usage Pattern**:
```php
// Use string constants for global names
const GLOBAL_CURRENT_ROUND = 'currentRound';

// Access via modern API
$this->globals->set(GLOBAL_CURRENT_ROUND, 1);
$round = $this->globals->get(GLOBAL_CURRENT_ROUND, 1);
$this->globals->inc(GLOBAL_CURRENT_ROUND, 1);
```

#### Player State

**Storage**: Extended `player` table columns in database
**Persistence**: Queried on every request, updated immediately on changes

**Columns**:
- `player_ship_location` - Water space ID where ship is located
- `player_shield_strength` - Current shield level (0-10)
- `player_favor_tokens` - Favor token count
- `player_ship_tile_id` - Which Ship Tile variant (1-8)
- `player_has_titan_die` - TRUE for last player

### 1.2 Database Schema

**Complete Schema**: See [database-schema.sql](code-examples/sql/database-schema.sql)

**7 Tables**:
1. **board_spaces** - Hexagonal water and island spaces
2. **island_tiles** - Face-down exploration tiles
3. **components** - Offerings, Statues, Monsters, Shrines
4. **gods** - 6 gods per player on advancement track
5. **oracle_dice** - 3 dice per player
6. **cards** - Injury, Oracle, Equipment, Companion cards
7. **zeus_tiles** - Task tracking (12 per player)

**Key Design Decisions**:
- Hexagonal board as graph (spaces + adjacency)
- Components track location and ownership
- Cards use type/type_arg pattern for variants
- Gods track position on 5-row advancement track

### 1.3 Data Structures

#### Ship Cargo System
- Max capacity from Ship Tile (usually 2)
- Stores component IDs
- Validates capacity before loading
- Tracks Statues and Offerings separately

#### Oracle System
- 3 dice per player
- Position on 6-segment circle
- Recoloring costs Favor Tokens (1 per step)
- Used dice move to center

#### Board Graph
- Hex spaces with axial coordinates
- Adjacency lists for navigation
- Pathfinding for movement validation
- Connectivity checks for layout generation

---

## 2. Component Models

### 2.1 Physical Components

#### Board Tiles (12 hexagonal tiles)
- **Types**: Large (3), Medium (3), Small (3), Zeus (1) with 3 center-hole tiles
- **Content**: Mix of water spaces (colored) and island spaces
- **Layout**: Arranged to form connected water area with minimal shallows

#### Island Tiles (12 double-sided)
- **Shrine Islands**: 3 per player color with Greek letters
- **Component Islands**: Offerings, Monsters, Statues, Temples
- **Special Islands**: Reward tiles with Greek letter symbols (Ψ, ΦΩ, Σ, Ω+helmet)

#### Gods (6 types per player)
- **Poseidon** (blue) - Teleport ship to any water space
- **Apollon** (yellow) - Draw Oracle Card, use dice as any color
- **Artemis** (green) - Explore face-down island tile
- **Aphrodite** (red) - Discard all Injury Cards
- **Ares** (black) - Auto-defeat adjacent monster
- **Hermes** (pink) - Load any statue from any city

#### Ship Tiles (8 variants)
1. Shield +2 at start
2. Range +2 permanently
3. Gods start at player count row
4. +1 Favor Token when taking tokens
5. Skip 1 task (11 instead of 12)
6. Start with Equipment + Oracle Card
7. Recolor cost -1
8. Bidirectional recolor + capacity +2

#### Cards
- **Injury** (42): 6 colors + skull (6 each)
- **Oracle** (30): 6 colors (5 each)
- **Equipment** (22): Various permanent/one-time effects
- **Companion** (18): Heroes, Demigods, Creatures (3 per color)

---

## 3. Game Flow

### 3.1 Game Setup Sequence

**Board Setup**:
1. If `firstGameMode` → Use fixed recommended layout
2. Else → Generate compact board algorithmically
3. Ensure all water spaces connected

**Component Placement**:
1. Place Zeus on center tile
2. Place 6 City Tiles around periphery
3. Place 6 Temples on Temple Islands
4. Distribute Offerings (per player count, no duplicates per island)
5. Distribute Monsters (per player count, no duplicates per island)
6. Place 3 Statues of each color on respective cities
7. Shuffle and place Island Tiles face-down

**Player Setup**:
1. Determine starting player (random)
2. Distribute Favor Tokens (start player: 3, +1 per player clockwise)
3. Distribute Ship Tiles (First Game Mode: 4 recommended, random; Standard: all 8, random or draft)
4. Place ships at Zeus starting location
5. Draw 1 Injury Card each, advance matching God
6. Distribute Zeus Tiles (First Game Mode: 8 tiles; Standard: 12 tiles)
7. Apply Ship Tile starting abilities
8. Roll initial Oracle Dice

### 3.2 Turn Structure

#### Phase 1: Check Injury Cards

**Outcomes**:
- **3 same color OR 6+ total** → Must RECOVER (discard 3, skip turn)
- **0 injuries** → Reward: Take 2 Favor Tokens OR advance 1 God
- **Otherwise** → Continue to actions (most common)

#### Phase 2: Perform Actions

**Available Actions** (any order):
- Use up to 3 Oracle Dice
- Use 1 Oracle Card (optional)
- Use God Special Actions (if on top row)

**Before using die**: May recolor (pay 1 Favor Token per step clockwise)

**Color-Independent Actions**:
- Draw 1 Oracle Card
- Take 2 Favor Tokens
- Look at 2 face-down Island Tiles

**Color-Dependent Actions** (die color must match):
- Move Ship (3 spaces base, end on matching color)
- Fight Monster (Battle Die vs Monster strength)
- Explore Island (reveal tile, take reward)
- Build Shrine (on revealed matching island)
- Load/Make Offering
- Load/Raise Statue
- Discard Injury Cards (all of matching color)
- Advance God (matching color by 1 step)

#### Phase 3: Consult Oracle

1. Roll 3 Oracle Dice
2. Place on matching oracle positions
3. Announce colors rolled
4. **Other players** may advance matching Gods (not on lowest row) by 1 step
5. **If last player**: Roll Titan's Die
   - Titan = 6 → All players draw 2 Injury Cards
   - Else → Players with Shield < Titan draw 1 Injury Card

### 3.3 Win Condition

**Trigger**: Player completes all Zeus Tiles and returns ship to Zeus
**Resolution**: Current round finishes
**Winner**:
1. Player(s) who returned to Zeus
2. Tiebreaker: Most Oracle Cards
3. Tiebreaker: Most Favor Tokens
4. Shared victory if still tied

### 3.4 State Machine

```
gameSetup → playerTurn → checkInjuryCards
    ↓ (recover)              ↓ (normal)
recoverFromInjuries      playerActions
    ↓                        ↓ (various substates)
consultOracle ← ─ ─ ─ ─ ─ ─ ┘
    ↓
titanAttack (if last player)
    ↓
nextPlayer → checkVictory → gameEnd
```

---

## 4. Rules Implementation

> **💡 All implementation examples are in `code-examples/` directory**

### 4.1 Movement System

**Implementation**: [ShipMovement.php](code-examples/php/ShipMovement.php) | [BoardGenerator.php](code-examples/php/BoardGenerator.php)

**Core Movement Rules**:
- **Base Range**: 3 water spaces per turn
- **Range Modifiers**: Ship Tile (+2), Equipment (+1), Creatures (+3), Favor Tokens (+1 each)
- **Color Restriction**: Must end on water space matching oracle die color
- **Exceptions**: Creatures allow ending on any color; Equipment allows crossing shallows

**Validation Logic**:
1. Calculate total range from all modifiers
2. Breadth-first search to find reachable spaces
3. Filter by color requirement (unless exception)
4. Return valid destination space IDs

**Board Generation**:
- **First Game Mode**: Fixed predetermined layout from rulebook
- **Standard Mode**: Algorithm minimizes shallows, ensures connectivity
- **Hex Coordinates**: Axial coordinate system (q, r)
- **Validation**: Flood fill ensures all water spaces connected

### 4.2 Monster Combat System

**Implementation**: [MonsterCombat.php](code-examples/php/MonsterCombat.php)

**Combat Mechanics**:
- **Starting Strength**: 9 - Player's Shield strength
- **Battle Die**: d10 (0-9)
- **Victory**: Roll ≥ Monster strength
- **Roll 0**: Draw 1 Injury Card
- **Continue**: Pay 1 Favor Token, reduce Monster strength by 1
- **Surrender**: End fight, no additional penalties

**Victory Rewards**:
- Complete matching Zeus Tile
- Draw 1 Equipment Card from display
- Monster token to player board

**Special Cases**:
- Ares God Action: Auto-defeat without rolling
- Equipment Cards: Fight from distance
- Insufficient Favor Tokens: Auto-surrender

### 4.3 Task Completion System

**Implementation**: [TaskManager.php](code-examples/php/TaskManager.php)

**Zeus Tiles (12 tasks per player)**:
- **3 Shrines**: Build on player-colored islands
- **3 Statues**: Raise on Statue Islands (different colors)
- **3 Offerings**: Deliver to matching Temples (specific colors)
- **3 Monsters**: Defeat monsters (specific colors)

**Task-Specific Rewards**:
- **Shrine** → Advance any God by 1 step
- **Statue** → Take matching Companion Card
- **Offering** → Take 3 Favor Tokens
- **Monster** → Take Equipment Card from display

**White Icons**: "Any color" (no color chosen twice per task type)

**First Game Mode**: Only 8 tiles (remove 1 Shrine, 1 Statue, 1 colored Offering, 1 colored Monster)

### 4.4 Oracle Dice System

**Implementation**: [OracleSystem.php](code-examples/php/OracleSystem.php)

**Oracle Positions** (6 segments):
1. Blue (Poseidon)
2. Yellow (Apollon)
3. Green (Artemis)
4. Red (Aphrodite)
5. Black (Ares)
6. Pink (Hermes)

**Dice Mechanics**:
- Roll d6 (1-6) for each of 3 dice
- Place on matching oracle position
- Use for actions (move to center when used)
- Reset at end of turn (Consult Oracle)

**Recoloring**:
- Cost: 1 Favor Token per step clockwise
- Ship Tile 7: Cost -1 (minimum 0)
- Ship Tile 8: Can move counterclockwise
- Apply before using die for action

### 4.5 God Advancement System

**Implementation**: [GodManager.php](code-examples/php/GodManager.php)

**God Track** (5 rows):
- **Row 0**: Starting position (lowest)
- **Row 1-3**: Player count row to row 3
- **Row 4**: Top row (special action available)

**Advancement Rules**:
- From row 0 → Jump to player count row
- From any other row → Advance 1 row (max 4)
- After special action → Return to row 0 (or player count row with Ship Tile 3)

**Special Actions** (detailed in [GodManager.php](code-examples/php/GodManager.php)):
- Each god has unique powerful ability
- Available when on top row
- Executed immediately
- God returns to bottom after use

**Other Players Advance**:
- When active player Consults Oracle
- If god (not on lowest row) matches rolled color
- May advance 1 matching god by 1 step

### 4.6 Injury and Recovery System

**Implementation**: [InjuryManager.php](code-examples/php/InjuryManager.php)

**Recovery Triggers**:
- **3 same color** OR **6+ total** injuries (standard)
- **4 same color** OR **8+ total** (with special Equipment Card)

**Recovery Action**:
- Discard 3 Injury Cards of choice
- Skip turn (no actions, no Consult Oracle)

**Injury Sources**:
- Titan attack (end of round)
- Monster combat (roll 0)

**Removal Methods**:
- Recover action (discard 3)
- Color-specific action (all of one color)
- Hero Companion Cards (matching color)
- Aphrodite God Action (all injuries)

**Titan Attack**:
- Last player rolls Titan's Die (d6)
- If Titan = 6 → All draw 2 injuries
- Else → Players with Shield < Titan draw 1 injury

---

## 5. Development Roadmap

### Phase 1: Core Mechanics (MVP) - Weeks 1-4

**Goal**: Playable 2-player game with basic rules

**Backend**:
- ✅ Database schema (all 7 tables)
- ✅ Board generation (first game mode only)
- ✅ Basic state machine
- ✅ Ship movement system
- ✅ Oracle dice rolling
- ✅ Simple task completion (Shrines only)
- ✅ Favor Token system
- ✅ Win condition detection

**Frontend**:
- ✅ Basic hex board rendering
- ✅ Ship tokens display
- ✅ Player board layout (oracle, gods, shield)
- ✅ Oracle dice with rolling animation
- ✅ Action buttons
- ✅ Zeus Tiles progress indicator
- ✅ Basic notifications

**Deliverable**: 2-player game start to finish

### Phase 2: Complete Rule Set - Weeks 5-8

**Goal**: Full game with all mechanics, all player counts

**Backend**:
- ✅ Monster combat system
- ✅ Statue system (loading, cargo, delivery)
- ✅ Offering system
- ✅ Island exploration
- ✅ God advancement + special actions (all 6)
- ✅ Injury card system + recovery
- ✅ Titan attack system
- ✅ Oracle Cards
- ✅ Equipment Cards (all 22)
- ✅ Companion Cards (all 18)
- ✅ Ship Tiles (all 8 variants)
- ✅ Cargo capacity management
- ✅ Dice recoloring
- ✅ Zeus Tile randomization
- ✅ All edge cases

**Frontend**:
- ✅ Monster combat UI
- ✅ Cargo display
- ✅ Island flip animation
- ✅ God track visualization
- ✅ God special action buttons
- ✅ Shield track display
- ✅ Injury card hand
- ✅ Oracle/Equipment/Companion Cards
- ✅ City Tiles with Statues
- ✅ Favor Token spending UI
- ✅ Dice recoloring interface
- ✅ Action validation feedback

**Deliverable**: Full game for 2-4 players

### Phase 3: UI/UX Polish - Weeks 9-10

**Goal**: Professional look and smooth animations

**Tasks**:
- ✅ Sprite sheet creation
- ✅ Board tile artwork
- ✅ Ship designs (4 colors)
- ✅ Component artwork
- ✅ Smooth animations (ship, dice, cards, etc.)
- ✅ Color-blind friendly design
- ✅ Dark mode support
- ✅ Tooltips and help overlays
- ✅ Player aid
- ✅ Log message formatting

**Deliverable**: Polished, professional UI

### Phase 4: Board Layouts & Options - Weeks 11-12

**Goal**: Dynamic board generation and game variants

**Tasks**:
- ✅ Board layout algorithm (compact, minimal shallows)
- ✅ Board validation (connectivity)
- ✅ First Game Mode option
- ✅ Ship Tile selection (random vs draft)
- ✅ Game options configuration
- ✅ Statistics tracking

**Deliverable**: Full feature set with options

### Phase 5: Zombie Mode & Optimization - Weeks 13-14

**Goal**: AI behavior and performance tuning

**Tasks**:
- ✅ Zombie player (Level 1: Random valid moves)
- ✅ Zombie recovery behavior
- ✅ Database query optimization
- ✅ Frontend performance profiling
- ✅ Image optimization
- ✅ Memory leak detection

**Deliverable**: Optimized, AI-capable game

### Phase 6: Alpha Release - Weeks 15-16

**Goal**: Production-ready submission

**Tasks**:
- ✅ Final bug fixes
- ✅ Complete documentation
- ✅ Quick start guide
- ✅ Game description and metadata
- ✅ Screenshots
- ✅ Beta testing
- ✅ BGA alpha submission

**Deliverable**: Alpha release on BGA

---

## 6. Technical Specifications

### 6.1 Backend Architecture

**Module Organization** (Modular Pattern):
```
modules/php/
├── BoardManager.php        # Board generation, space management
├── ShipManager.php          # Ship movement, cargo
├── OracleManager.php        # Dice rolling, recoloring
├── TaskManager.php          # Zeus Tiles, completion
├── CombatManager.php        # Monster fights
├── GodManager.php           # God advancement, special actions
├── CardManager.php          # All card types
├── InjuryManager.php        # Injury tracking, recovery
├── ComponentManager.php     # Offerings, Statues, Monsters, Shrines
└── Constants.php            # Game constants
```

**State Machine**: Key states defined in game.php using BGA state machine pattern

**Key Algorithms**:
1. **Hexagonal Pathfinding**: A* for movement validation
2. **Board Layout Generation**: Greedy placement to minimize shallows
3. **Task Availability Calculation**: Based on ship location, cargo, dice colors

**Reference Implementations**: See [code-examples/php/](code-examples/php/)

### 6.2 Frontend Architecture

**JavaScript Organization** (Vanilla JS with BGA Patterns):

**Main Game File** (`theoracleofdelphi.js`):
- Modern Promise-based notification system
- Auto-detected notification handlers (`notif_*` prefix)
- State-specific UI updates

**Component Managers**:
- [BoardManager.js](code-examples/javascript/BoardManager.js) - Hex grid rendering
- [OracleManager.js](code-examples/javascript/OracleManager.js) - Dice visualization
- [AnimationManager.js](code-examples/javascript/AnimationManager.js) - Reusable animations

**Reference**: See [GameUI.js](code-examples/javascript/GameUI.js) for complete example

**Asset Strategy** (12 image files within BGA limit):
```
img/
├── board-tiles.jpg          # 12 board tiles
├── components.png           # Statues, Offerings, Monsters, Shrines
├── ships.png                # 4 player color ships
├── cards-injury.png         # Injury card backs
├── cards-oracle.png         # Oracle card faces
├── cards-equipment.png      # Equipment cards
├── cards-companion.png      # Companion cards
├── ui-elements.png          # Icons, tokens, dice
├── zeus-tiles.png           # Zeus Tile graphics
├── player-boards.png        # Oracle, god track, shield track
├── city-tiles.jpg           # 6 City Tiles
└── gods.png                 # 6 God tokens
```

### 6.3 Game Options & Preferences

**Game Options**: See [gameoptions.json](code-examples/config/gameoptions.json)
- Game Mode (First Game / Standard)
- Ship Tile Selection (Random / Draft)

**Player Preferences**: See [gamepreferences.json](code-examples/config/gamepreferences.json)
- Display Mode (Classic / Compact)
- Animation Speed (Normal / Fast / Instant)
- Show Valid Moves (Always / Hover / Never)
- Board Zoom (75% / 100% / 125% / 150%)
- Card Display (All / Active only)
- Color Blind Mode (Off / Deuteranopia / Protanopia / Tritanopia)
- Theme (Light / Dark)

### 6.4 Statistics Configuration

**Statistics**: See [stats.json](code-examples/config/stats.json)

**Table Stats** (3):
- Turns number
- Rounds number
- Average turns per player

**Player Stats** (16):
- Shrines built, Statues raised, Offerings made, Monsters defeated
- Gods special actions, Favor tokens spent, Injuries received
- Dice recolors, Oracle cards used, Equipment/Companion cards gained
- Times recovered, Ship spaces moved, Islands explored
- Titan damage, Monster combat rounds

### 6.5 Development Environment

**Tools**:
- **IDE**: VS Code with PHP Intelephense and SFTP extensions
- **Version Control**: Git with .gitignore for `/img`
- **Build Pipeline**: SCSS compilation (`npm run watch-css`)
- **SFTP Sync**: Auto-upload on save to BGA Studio
- **Browser**: Chrome/Firefox for testing

**IDE Helper Files**:
- `_ide_helper.php` - PHP auto-completion for BGA framework
- `bga-framework.d.ts` - TypeScript definitions for JavaScript

**Reference**: See `bga-framework.md` for complete workflow

---

## 7. Open Questions / Clarifications

### 7.1 Resolved ✅
- Board layout: First game mode + algorithm later
- Turn structure: BGA handles automatically
- Undo system: BGA framework handles
- AI/Solo mode: Skip for initial release
- Game variants: Focus on full game
- Mobile optimization: BGA framework handles

### 7.2 Implementation Clarifications Needed

1. **Equipment Card Specifics**:
   - "Act from distance" cards: Bypass adjacency entirely?
   - "Colored action benefits": What counts as "colored action"?

2. **Companion Card Interactions**:
   - Demigod wildcard: Movement color requirement or just action type?
   - Creature movement bonus: Stack with ship tile bonuses?

3. **Edge Cases**:
   - All Offerings of a color taken: Can player still complete task?
   - Island Tile doesn't match remaining Zeus Tiles: Can still explore?
   - Ship Tile 5 removes Zeus Tile: Can choose uncompleted tile?

4. **Visual Design**:
   - Custom artwork or simplified placeholders initially?
   - Animation quality vs development speed priority?

---

## 8. Fidelity Checklist

### Core Rules ✅
- [ ] All 12 task types completable
- [ ] Ship movement follows exact range and color rules
- [ ] Oracle dice system matches physical version
- [ ] Monster combat uses correct Battle Die mechanics
- [ ] Titan attack affects all players correctly
- [ ] Gods advance with correct timing
- [ ] Injury system triggers at 3-of-a-kind or 6 total
- [ ] Cargo enforces capacity limits
- [ ] Color matching validated for all actions

### Turn Structure ✅
- [ ] 3 phases execute in order
- [ ] Injury check before actions
- [ ] Oracle consultation ends turn
- [ ] Last player rolls Titan Die
- [ ] Other players advance gods after consultation

### Components ✅
- [ ] All 8 Ship Tiles function correctly
- [ ] All 6 God special actions work
- [ ] All 22 Equipment Cards implemented
- [ ] All 18 Companion Cards provide benefits
- [ ] Island Tiles reveal correct rewards
- [ ] Zeus Tiles track progress accurately

### Win Conditions ✅
- [ ] Must complete all tasks before returning
- [ ] Return requires normal movement
- [ ] First to Zeus triggers end of round
- [ ] Tiebreakers: Oracle Cards > Favor Tokens > Shared

### Random Elements ✅
- [ ] Oracle dice: d6 (1-6)
- [ ] Battle Die: d10 (0-9)
- [ ] Titan Die: d6 (1-6)
- [ ] Card draws properly randomized
- [ ] Board layout generation fair

### Player Counts ✅
- [ ] 2-player games work
- [ ] 3-player games work
- [ ] 4-player games work
- [ ] Component distribution scales
- [ ] God tracks scale with player count

### Variants ✅
- [ ] First Game Mode: 8 Zeus Tiles
- [ ] First Game Mode: 4 recommended Ship Tiles
- [ ] First Game Mode: Fixed board
- [ ] Standard Mode: 12 Zeus Tiles
- [ ] Standard Mode: All Ship Tiles

---

## 9. Success Metrics

### Alpha Release Goals
- [ ] Game completion rate > 95%
- [ ] Average load time < 3 seconds
- [ ] Bug reports < 2 per day during beta
- [ ] Player satisfaction > 4.5/5
- [ ] Rules questions < 1 per 10 games

### Performance Targets
- [ ] All images load < 5 seconds total
- [ ] Turn actions respond < 500ms
- [ ] Animations run at 60fps
- [ ] No memory leaks after 1-hour session
- [ ] Database queries < 100ms average

### Code Quality
- [ ] All functions documented
- [ ] State machine fully tested
- [ ] Zombie mode completes games
- [ ] No hardcoded magic numbers
- [ ] Clean separation of concerns

---

## Summary

**The Oracle of Delphi** is a complex medium-weight game requiring careful implementation of:
- Hexagonal board movement with color matching
- Dice placement and manipulation system
- Multiple resource types and cargo management
- Combat system with progressive difficulty
- Task tracking across 4 categories × 3 tasks
- Card systems (4 types with unique mechanics)
- Player progression (Gods, Shield, Injuries)

**Architecture**: Modular with separate managers for each major system
**Timeline**: 16 weeks to alpha release
**Key Challenges**: Board generation, combat UI, cargo management, state machine complexity
**Critical Path**: Phase 1 (Core) → Phase 2 (Complete Rules) → Phase 3 (Polish)

---

## Quick Reference

- **Code Examples**: [code-examples/](code-examples/)
- **Code Index**: [CODE_EXAMPLES_INDEX.md](CODE_EXAMPLES_INDEX.md)
- **BGA Framework**: [bga-framework.md](../bga-framework.md)
- **Database Schema**: [database-schema.sql](code-examples/sql/database-schema.sql)
- **Game Options**: [gameoptions.json](code-examples/config/gameoptions.json)
- **Statistics**: [stats.json](code-examples/config/stats.json)
