# Code Examples for The Oracle of Delphi

This directory contains code examples referenced in the main implementation plan.

## Directory Structure

```
code-examples/
├── php/                    # Backend PHP examples
│   ├── ShipMovement.php           # Ship navigation system
│   ├── MonsterCombat.php          # Monster fighting mechanics
│   ├── OracleSystem.php           # Dice rolling and manipulation
│   ├── TaskManager.php            # Zeus Tile completion
│   ├── GodManager.php             # God advancement system
│   ├── InjuryManager.php          # Injury card handling
│   └── BoardGenerator.php         # Board layout generation
│
├── javascript/             # Frontend JavaScript examples
│   ├── GameUI.js                  # Main game interface
│   ├── BoardManager.js            # Board rendering
│   ├── OracleManager.js           # Oracle and dice UI
│   └── AnimationManager.js        # Animation helpers
│
├── sql/                    # Database schemas
│   └── database-schema.sql        # Complete table definitions
│
├── config/                 # Configuration files
│   ├── gameoptions.json           # Game options
│   ├── gamepreferences.json       # Player preferences
│   └── stats.json                 # Statistics tracking
│
└── README.md              # This file
```

## Usage

These examples are referenced in the main implementation plan (`game-implementation-plan.md`) using relative paths:

```markdown
See implementation example: [ShipMovement.php](code-examples/php/ShipMovement.php)
```

## Notes

- All PHP examples use modern BGA Framework 2024 APIs
- JavaScript examples use Promise-based notification system
- Examples demonstrate best practices and patterns
- Code is documented with PHPDoc/JSDoc comments
- Examples are meant as reference implementations, not production code

## Integration with Main Plan

The main plan document (`game-implementation-plan.md`) focuses on:
- Architecture and design decisions
- Game logic explanations
- Implementation strategy
- Task breakdown and roadmap

While this directory provides:
- Concrete code examples
- Implementation patterns
- API usage demonstrations
- Reference implementations

This separation keeps the plan readable while providing detailed technical examples when needed.