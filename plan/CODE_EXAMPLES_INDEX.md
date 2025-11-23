# Code Examples Index

Quick reference for all code examples in the implementation plan.

## 📁 Directory Structure

```
plan/code-examples/
├── php/               # Backend implementation examples
├── javascript/        # Frontend UI examples
├── sql/              # Database schemas
└── config/           # Configuration files
```

## 🔧 PHP Examples (Backend)

| File | Purpose | Lines | Referenced In Plan |
|------|---------|-------|-------------------|
| **[GameStateManager.php](code-examples/php/GameStateManager.php)** ⭐ | **State persistence, getAllDatas(), database patterns** | **~300** | **Section 1, Critical** |
| [ShipMovement.php](code-examples/php/ShipMovement.php) | Ship navigation, range calculation, movement validation | ~70 | Section 4.1 |
| [MonsterCombat.php](code-examples/php/MonsterCombat.php) | Monster fighting, Battle Die mechanics, combat rounds | ~95 | Section 4.2 |
| [OracleSystem.php](code-examples/php/OracleSystem.php) | Dice rolling, placement, recoloring with Favor Tokens | ~110 | Section 4.4 |
| [TaskManager.php](code-examples/php/TaskManager.php) | Zeus Tile completion, reward distribution, setup | ~130 | Section 4.3 |
| [GodManager.php](code-examples/php/GodManager.php) | God advancement, all 6 special actions | ~215 | Section 4.5 |
| [InjuryManager.php](code-examples/php/InjuryManager.php) | Injury cards, recovery system, Titan attacks | ~180 | Section 4.6 |
| [BoardGenerator.php](code-examples/php/BoardGenerator.php) | Board layout generation, first game mode, algorithms | ~250 | Section 4.1 |

⭐ = **Essential reading** - demonstrates critical BGA concepts

## 🎨 JavaScript Examples (Frontend)

| File | Purpose | Lines | Referenced In Plan |
|------|---------|-------|-------------------|
| [GameUI.js](code-examples/javascript/GameUI.js) | Main game interface, modern BGA patterns, Promise-based notifications | ~85 | Section 6.2 |
| [BoardManager.js](code-examples/javascript/BoardManager.js) | Board rendering, hex grid display, ship placement | ~250 | Section 6.2 |
| [OracleManager.js](code-examples/javascript/OracleManager.js) | Oracle and dice visualization, recoloring UI | ~200 | Section 6.2 |
| [AnimationManager.js](code-examples/javascript/AnimationManager.js) | Reusable animation utilities (fade, slide, pulse, shake, etc.) | ~200 | Section 6.2 |

## 🗄️ SQL Examples (Database)

| File | Purpose | Tables | Referenced In Plan |
|------|---------|--------|-------------------|
| [database-schema.sql](code-examples/sql/database-schema.sql) | Complete database table definitions | 7 tables | Section 1.2 |

## ⚙️ Configuration Examples

| File | Purpose | Items | Referenced In Plan |
|------|---------|-------|-------------------|
| [gameoptions.json](code-examples/config/gameoptions.json) | Game mode options, ship tile selection | 2 options | Section 6.3 |
| [stats.json](code-examples/config/stats.json) | Statistics tracking (3 table + 16 player stats) | 19 stats | Section 6.5 |
| [gamepreferences.json](code-examples/config/gamepreferences.json) | Player preferences (display, animations, accessibility) | 7 prefs | Section 6.3 |

## 📖 How to Use

1. **Reading the Plan**: The main plan (`game-implementation-plan.md`) focuses on architecture, logic, and strategy
2. **Code Reference**: When you see "See: [filename]" links, refer to these examples for concrete implementations
3. **Development**: Use these as starting templates for actual implementation
4. **Adaptation**: Modify examples to fit your specific needs and coding style

## 🔗 Quick Links

- **Main Plan**: [game-implementation-plan.md](game-implementation-plan.md)
- **Code Examples Directory**: [code-examples/](code-examples/)
- **BGA Framework Reference**: [../bga-framework.md](../bga-framework.md)

## 💡 Best Practices

- Examples use **modern BGA Framework 2024** APIs
- All code includes **PHPDoc/JSDoc** comments
- Follows **BGA coding standards** and conventions
- Demonstrates **error handling** and validation patterns
- Uses **modern Promise-based** notifications (JavaScript)
- Implements **strict typing** where applicable (PHP 8.4)

## 📚 Essential Guides

| File | Purpose | Importance |
|------|---------|------------|
| **[STATE_PERSISTENCE_GUIDE.md](STATE_PERSISTENCE_GUIDE.md)** | Complete guide to BGA state management and database persistence | ⭐⭐⭐ CRITICAL |

## 📊 Statistics

**Total Code Examples**: 15 files (+ 1 comprehensive guide)
- **PHP Backend**: 8 files (~1,350 lines) - includes GameStateManager
- **JavaScript Frontend**: 4 files (~735 lines)
- **SQL Database**: 1 file (~150 lines)
- **Configuration**: 3 files (~150 lines)

**Total Lines**: ~2,385 lines of reference code
**Documentation**: STATE_PERSISTENCE_GUIDE.md (~400 lines)

---

## 🎯 Quick Navigation by System

### ⭐ State Management (START HERE)
- **Essential Guide**: [STATE_PERSISTENCE_GUIDE.md](STATE_PERSISTENCE_GUIDE.md)
- **Backend Example**: [GameStateManager.php](code-examples/php/GameStateManager.php)
- **Concept**: All state in database, local vars temporary only

### Movement & Board
- **Backend**: [ShipMovement.php](code-examples/php/ShipMovement.php), [BoardGenerator.php](code-examples/php/BoardGenerator.php)
- **Frontend**: [BoardManager.js](code-examples/javascript/BoardManager.js)
- **Database**: [database-schema.sql](code-examples/sql/database-schema.sql) (board_spaces table)

### Combat
- **Backend**: [MonsterCombat.php](code-examples/php/MonsterCombat.php)
- **Animations**: [AnimationManager.js](code-examples/javascript/AnimationManager.js) (battle animations)

### Oracle & Dice
- **Backend**: [OracleSystem.php](code-examples/php/OracleSystem.php)
- **Frontend**: [OracleManager.js](code-examples/javascript/OracleManager.js)
- **Database**: [database-schema.sql](code-examples/sql/database-schema.sql) (oracle_dice table)

### Tasks & Progress
- **Backend**: [TaskManager.php](code-examples/php/TaskManager.php)
- **Database**: [database-schema.sql](code-examples/sql/database-schema.sql) (zeus_tiles table)
- **Stats**: [stats.json](code-examples/config/stats.json)

### Gods
- **Backend**: [GodManager.php](code-examples/php/GodManager.php)
- **Database**: [database-schema.sql](code-examples/sql/database-schema.sql) (gods table)

### Injuries
- **Backend**: [InjuryManager.php](code-examples/php/InjuryManager.php)
- **Database**: [database-schema.sql](code-examples/sql/database-schema.sql) (cards table)

### Configuration
- **Game Options**: [gameoptions.json](code-examples/config/gameoptions.json)
- **User Preferences**: [gamepreferences.json](code-examples/config/gamepreferences.json)
- **Statistics**: [stats.json](code-examples/config/stats.json)