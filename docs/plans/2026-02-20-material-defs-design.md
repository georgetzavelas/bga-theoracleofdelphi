# MaterialDefs.php Design

## Overview

Single PHP class (`modules/php/MaterialDefs.php`) containing all game reference data as `const` arrays. Accessed via `MaterialDefs::MONSTERS`, `MaterialDefs::GODS`, etc. No runtime initialization needed.

## Constants

### COLORS
6 game colors: `['red', 'yellow', 'green', 'blue', 'pink', 'black']`

### MONSTERS (6)
Keyed by monster name, maps to color. Source: `misc/monster-and-gods.md`
- chimera=yellow, cyclops=red, gorgon=green, hydra=pink, minotaur=black, siren=blue

### GODS (6)
Keyed by god name, maps to color + ability ID. Source: `misc/monster-and-gods.md`, rules p.8
- aphrodite=red, apollo=yellow, ares=black, artemis=green, hermes=pink, poseidon=blue

### SHIP_TILES (8)
Keyed by numeric ID (matches `img/ship-tiles/ship-{id}.jpg`). Source: `misc/ship-tiles.md`
- Each has: ability string, storage capacity (2 for all except #2 which is 4), description

### EQUIPMENT_CARDS (22)
Keyed by numeric ID (matches `img/equipment/card-{id:03d}.jpg`). Source: `misc/equipment-cards.md`
- Each has: type (permanent/one_time/mixed), ability string, description
- Some have extra fields: `god`, `colors`, `gods` for parameterized abilities

### COMPANION_TYPES (3)
Template types multiplied by 6 colors to generate 18 cards. Source: `misc/companion-cards.md`
- Index matches image filename `img/companion/{color}-card-{index}.png`
- 0=creature (move range+3), 1=demigod (die wild color), 2=hero (shield+2, discard injuries)

### ORACLE_CARDS_PER_COLOR = 5
30 total = 6 colors x 5. Image: `img/oracle/{color}.jpg`. No unique abilities.

### INJURY_CARDS_PER_COLOR = 7
42 total = 6 colors x 7. Image: `img/injury/{color}.jpg`. No unique abilities.

### SHRINE_LETTERS
Per player color, which 3 Greek letters they get. From asset files:
- red=[omega, phi, psi], yellow=[omega, psi, sigma], green=[phi, psi, sigma], blue=[omega, phi, sigma]

### SHRINE_BONUSES
Greek letter to reward when another player explores your shrine island:
- psi=4 Favor, phi=2 Oracle Cards, sigma=advance gods 3 steps, omega=discard injuries+1 shield

### DUAL_SIDED_TILES (4)
Pairs an offering color with a monster type on reverse side. During setup, 2 randomly placed offering-up, 2 monster-up. Source: physical game tiles.
- blue/siren, yellow/chimera, pink/cyclops, green/minotaur

## Usage Pattern
```php
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

// Look up monster color
$color = MaterialDefs::MONSTERS['chimera']['color']; // 'yellow'

// Get god ability
$ability = MaterialDefs::GODS['poseidon']['ability']; // 'teleport_ship'

// Get ship tile storage
$storage = MaterialDefs::SHIP_TILES[2]['storage']; // 4

// Generate companion deck
foreach (MaterialDefs::COLORS as $color) {
    foreach (MaterialDefs::COMPANION_TYPES as $index => $type) {
        // create card with color + subtype
    }
}
```
