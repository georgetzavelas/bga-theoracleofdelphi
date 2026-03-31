# Turn Flow Completion & Remaining Phase 4 Actions — Design Spec

## Overview

Complete the core turn loop by implementing:
1. God advancement at turn start (from other players' oracle rolls)
2. Injury check / recovery / no-injury bonus
3. Oracle consultation enhancement (create advancement queue entries)
4. Look at 2 islands action
5. Favor-based movement range extension

---

## 1. God Advancement at Turn Start

### Rule
When a player consults the oracle, they announce the 3 dice colors. All OTHER players may advance 1 god matching one of those colors by 1 step, provided that god is not on the lowest row (row 0).

### Implementation: Per-Turn-Start Sequential Prompts

**Timing:** At the start of each player's turn, before injury check.

**Tracking:** Queue entries accumulate between a player's turns. In a 4-player game, player 4 may have up to 3 pending advancement opportunities when their turn starts.

**New table:**

```sql
CREATE TABLE IF NOT EXISTS `god_advancement_queue` (
    `id` INT(10) UNSIGNED NOT NULL AUTO_INCREMENT,
    `player_id` INT NOT NULL,           -- player who gets the opportunity
    `source_player_id` INT NOT NULL,    -- player whose oracle roll generated it
    PRIMARY KEY (`id`),
    KEY `player` (`player_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

- `id` auto-increment provides ordering (earlier rolls = lower id)
- Colors are NOT stored — read from `source_player_id`'s current oracle dice at prompt time

**State flow:**

```
PlayerTurnStart
  → query god_advancement_queue WHERE player_id = active, ORDER BY id ASC
  → if entries exist → CheckGodAdvancement (with first entry)
  → if no entries → CheckInjuries
```

**CheckGodAdvancement (ACTIVE_PLAYER, ID 9):**
- Read source player's oracle dice colors from `oracle_die` table
- Deduplicate colors (3 dice may have repeats)
- Find active player's gods matching those colors with `track_row > 0` and `track_row < max_row`
- If eligible gods exist: show prompt — "[Source Player] rolled [colors]. Advance a god?"
  - `actAdvanceGod($godName)` — advance chosen god by 1 row, delete queue entry, check for more
  - `actPass()` — skip this opportunity, delete queue entry, check for more
- If no eligible gods: auto-pass, delete queue entry, check for more
- When queue empty → CheckInjuries

**ConsultOracle modification:**
After rolling dice, INSERT one queue entry per other player:
```php
foreach ($otherPlayerIds as $pid) {
    INSERT INTO god_advancement_queue (player_id, source_player_id)
    VALUES ($pid, $activePlayerId);
}
```

**Recovery turns:** No oracle consultation = no queue entries created. Source player's dice in DB remain from their prior roll, but no queue entry references them, so no issue.

---

## 2. Injury Check / Recovery / No-Injury Bonus

### Rule
At the start of your turn (after god advancement), check injuries:
- **3 same-color OR 6+ total:** Recovery turn — discard 3 injury cards of your choice, turn ends (no actions, no oracle consultation)
- **0 injuries:** Bonus — choose +2 favor OR advance 1 god by 1 step
- **Otherwise:** Nothing, proceed to actions

### State Flow

```
CheckInjuries (GAME, ID 11)
  → count injuries by color from card table
  → if 3 same-color OR 6+ total → Recover (ID 12)
  → if 0 injuries → NoInjuryBonus (ID 13)
  → otherwise → PlayerActions (ID 20)
```

**Recover (ACTIVE_PLAYER, ID 12):**
- Query player's injury cards, send to client
- Player selects exactly 3 cards to discard
- `actDiscardInjuries($cardIds)` — validate exactly 3, all are player's injury cards
- Discard selected cards, notify
- Transition to NextPlayer (skip actions AND oracle consultation)

**NoInjuryBonus (ACTIVE_PLAYER, ID 13):**
- Two options presented: "Take 2 Favor" / "Advance God"
- `actTakeFavor()` — grant 2 favor tokens, notify, → PlayerActions
- `actAdvanceGod($godName)` — player picks any god not at max row, advance 1 step, notify, → PlayerActions

---

## 3. Oracle Consultation Enhancement

### Current State
ConsultOracle (ID 40) already re-rolls all 3 oracle dice and notifies. Flows to NextPlayer.

### Changes
After rolling dice, before transitioning to NextPlayer:
1. Get the active player's newly rolled colors
2. For each other player, INSERT into `god_advancement_queue`
3. Notify all players of the announced colors (existing notification, may need enhancement to show colors prominently in game log)

No other changes to this state.

---

## 4. Look at 2 Islands

### Rule
Spend any die (no color matching required) to peek at 2 unrevealed shrine hexes. The contents are privately revealed to the player.

### New State: PeekIslands (ACTIVE_PLAYER)

**State ID:** Needs assignment (suggest ID 41)

**Entry:** From SelectAction via `actLookAtIslands()`

**Validation in SelectAction:**
- At least 1 unrevealed shrine hex exists that the player hasn't already peeked at

**PeekIslands flow:**
1. On enter: send list of valid shrine hexes (unrevealed AND not in `player_island_knowledge` for this player)
2. Client highlights valid hexes on board
3. Player clicks hexes one at a time (up to 2, or fewer if fewer available)
4. `actConfirmPeek($hexCoords)` — array of 1-2 `{q, r}` pairs
5. Validate: all hexes are valid shrine targets, correct count
6. INSERT into `player_island_knowledge` for each hex
7. Send **private** notification to player revealing island contents (`shrine` color/type from `hex.island_content`)
8. Consume die → PlayerActions or ConsultOracle (standard unused-die check)

**Edge case:** If only 1 valid island remains, player peeks at just 1. Action unavailable in SelectAction if 0 valid islands.

---

## 5. Favor Movement Range Extension

### Rule
When moving your ship, you may spend favor tokens to extend movement range. Each favor = +1 hex. Ship must still end on a water hex matching the die color.

### Changes to MoveShip (ID 30)

**Current behavior:** BFS with range 3 (or 5 for swift ship tile), destination must match die color.

**New behavior:**
1. Calculate base range (3, or 5 for swift ship)
2. Calculate max range = base range + player's current favor tokens
3. BFS runs with max range, tagging each reachable hex with its distance
4. Filter destinations to die-color-matching water hexes (unchanged)
5. Client highlights all valid destinations within max range
6. Player selects destination
7. `actConfirmMove()` — calculate shortest path distance to chosen hex
8. If distance > base range: deduct `distance - base_range` favor tokens
9. Execute move as normal

**UI approach:** All reachable color-matching hexes shown at once. No separate favor-spending step. Favor cost is implicit based on distance — could show cost on hover or in confirmation.

**PHP validation:** On confirm, recalculate BFS distance, verify player has enough favor for the extension, deduct favor, then move.

---

## State Machine Summary

Updated turn sequence:

```
RoundStart (ID 2)
  ↓
PlayerTurnStart (ID 10)
  ↓
CheckGodAdvancement (ID 9) ← loop through queue entries
  ↓
CheckInjuries (ID 11)
  ├→ Recover (ID 12) → NextPlayer (ID 50) [skip actions + oracle]
  ├→ NoInjuryBonus (ID 13) → PlayerActions (ID 20)
  └→ PlayerActions (ID 20)
       ↓
  [... existing action states ...]
  [+ PeekIslands (ID 41) for Look at 2 Islands]
  [+ MoveShip (ID 30) now supports favor range extension]
       ↓
ConsultOracle (ID 40) [+ creates god_advancement_queue entries]
  ↓
NextPlayer (ID 50)
  ↓
[loop to PlayerTurnStart for next player]
```

---

## New Database Objects

| Object | Type | Purpose |
|--------|------|---------|
| `god_advancement_queue` | Table | Track pending god advancement opportunities |

No other new tables needed. `player_island_knowledge` already exists for peek tracking.

---

## Notifications (New/Modified)

| Notification | Scope | Data |
|-------------|-------|------|
| `godAdvancementPrompt` | Active player | Source player name, available colors, eligible gods |
| `recoveryRequired` | Active player | Injury cards, count info |
| `noInjuryBonus` | Active player | Choice options |
| `islandsPeeked` | Private to player | Hex coords + revealed island contents |
| `favorSpentForMovement` | All | Player, favor spent, new total |

Existing `notif_consultOracle` may need enhancement to display announced colors in game log for all players.
