# Player Setup Design (Phases 3c-3f)

## Overview

Complete player initialization during `setupNewGame()`, covering ship placement, resources, Zeus tiles, card decks, and initial oracle roll. All setup logic lives in Game.php as private helper methods, consistent with the Phase 3b board population pattern.

## Call Order in setupNewGame()

```
1. populateBoard()           — hexes, monsters, offerings, temples, statues (existing, 3b)
2. createCardDecks()         — all 4 decks shuffled, equipment display dealt (3e)
3. distributeZeusTiles()     — 12 per player with global flip (3d)
4. initPlayers()             — ships at Zeus, ship tiles, favor, shrines, gods (3c)
5. Starting injury draw + god advancement (part of 3c, after decks exist)
6. Ship tile bonuses         — Prepared Ship draws from existing decks (part of 3c)
7. rollInitialDice()         — 3 dice per player (3f)
```

Decks (3e) come before player init (3c) because starting injuries and ship tile bonuses draw cards.

## Phase 3c: Player Initialization

### initPlayers(array $players, array $zeusHex)

**Ship placement:**
- All ships start at Zeus hex coordinates (`ship_q`, `ship_r`)
- No per-player offset in DB — the 2x2 visual offset is a JS rendering concern

**Ship tile assignment:**
- Shuffle `[0..7]` via `bgaShuffle()`, deal first N to N players
- UPDATE each player's `ship_tile_id`

**Starting resources (by player_no order):**
- `shield_value` = 0
- `favor_tokens` = 2 + player_no (Player 1 gets 3, Player 2 gets 4, etc.)
- `tasks_completed` = 0

**Ship tile immediate bonuses (applied inline):**
- `shield_bonus` (tile 0): +2 to shield_value
- `starting_cards` (tile 5): draw 1 equipment from display + 1 oracle from deck
- All other tile abilities are ongoing, not setup bonuses
- Draft variant for ship tile selection deferred to Phase 6

**Shrine init:**
- INSERT 3 rows per player: `(player_id, shrine_index 0/1/2, is_built=0)`

**God track init:**
- INSERT 6 rows per player: one per god, all at `track_row=0`

**Starting injury draw + god advancement:**
- Each player draws 1 injury card from top of shuffled injury deck
- Each player advances their OWN matching-color god from row 0 to player-count row
- Player-count row mapping: 2p → row 3, 3p → row 2, 4p → row 1

**God track mechanics:**
- Row 0: starting position (bottom)
- Advancing FROM row 0 always jumps to the player-count row (not +1)
- After that, each advance is +1 row
- Row 6: top — triggers god's special ability
- Player-count rows: 4p → row 1, 3p → row 2, 2p → row 3

**Titan's die:**
- Set global `titan_holder_id` = player with highest player_no (last player)

## Phase 3d: Zeus Tile Distribution

### distributeZeusTiles(array $playerIds, string $firstPlayerColor)

**Step 1 — Global dual-sided flip:**
- `DUAL_SIDED_TILES` has 4 entries: blue/siren, yellow/chimera, pink/cyclops, green/minotaur
- Randomly pick 2 of 4 to show offering side; other 2 show monster side
- Store flip selection as game global `zeus_flip_colors` (JSON array of 2 offering colors)

**Step 2 — Per player, INSERT 12 zeus_tile rows:**

| Group | Count | task_type | task_color | task_letter | Notes |
|-------|-------|-----------|------------|-------------|-------|
| Shrine | 3 | `shrine` | NULL | from SHRINE_LETTERS[playerColor] | Fixed per player color, same for all players of that color |
| Statue | 3 | `statue` | NULL | NULL | Generic — raise any 3 statues |
| Offering | 3 | `offering` | any + 2 unflipped colors | NULL | "any" = null task_color |
| Monster | 3 | `monster` | any + 2 flipped monster types | NULL | "any" = null task_color, flipped = monster_type from DUAL_SIDED_TILES |

**Step 3 — Shuffle & sort_order:**
- Shuffle within each group of 3 using `bgaShuffle()`
- Assign `sort_order` 0-2 per group (4 groups x 3 = 12 tiles, displayed as 4 columns of 3)

**Offering tile images:** `img/zeus-tiles/offerings/{player}-player-{color|any}.jpg`
**Monster tile images:** `img/zeus-tiles/monsters/{player}-player-{type|any}.jpg`
**Shrine tile images:** `img/zeus-tiles/shrines/{player}-player-{letter}.jpg`
**Statue tile images:** `img/zeus-tiles/statues/{player}-player.jpg`

## Phase 3e: Card Deck Setup

### createCardDecks(array $playerIds)

**Oracle deck (30 cards):**
- 5 per color x 6 colors = 30
- `card_type='oracle'`, `card_type_arg={color}`, `card_location='deck'`
- Shuffle via `bgaShuffle()` on indices, assign as `card_order`

**Equipment deck (22 cards):**
- From `EQUIPMENT_CARDS` definitions
- `card_type='equipment'`, `card_type_arg={card_id}`, `card_location='deck'`
- Shuffle, then set first 6 to `card_location='display'` (visible market)

**Companion deck (18 cards):**
- From `COMPANION_CARDS` definitions
- `card_type='companion'`, `card_type_arg={card_id}`, `card_location='deck'`
- Shuffle via `card_order`

**Injury deck (42 cards):**
- 7 per color x 6 colors = 42
- `card_type='injury'`, `card_type_arg={color}`, `card_location='deck'`
- Shuffle via `card_order`

## Phase 3f: Initial Oracle Roll

### rollInitialDice(array $playerIds)

**Per player, INSERT 3 oracle_die rows:**
- `die_index` = 0, 1, 2
- `color` = random from 6 colors via `bga_rand(0, 5)` indexing into `MaterialDefs::COLORS`
- `original_color` = same as `color`
- `is_used` = 0

No constraints on duplicate colors — a player can roll 3 of the same color.

## getAllDatas() Updates

After 3c-3f, `getAllDatas()` needs to return:
- Player positions (ship_q, ship_r, shield_value, favor_tokens, ship_tile_id, tasks_completed)
- Shrines per player (shrine_id, player_id, shrine_index, is_built, location)
- Gods per player (god_name, track_row)
- Oracle dice per player (die_index, color, original_color, is_used)
- Zeus tiles per player (task_type, task_color, task_letter, is_completed, sort_order)
- Cards: player hands (oracle, injury), equipment display, companion count
- Game globals: titan_holder_id, zeus_flip_colors

## MaterialDefs Updates Needed

- Update `DUAL_SIDED_TILES` constant — already exists, no changes needed
- `SHRINE_LETTERS` — already exists, no changes needed
- May need to add `PLAYER_COUNT_ROW` mapping: `[2 => 3, 3 => 2, 4 => 1]`

---

*Design approved: March 2026*
*Covers Phases 3c, 3d, 3e, 3f of game-implementation-plan.md*
