# Explore Island + Build Shrine — Design Document

## Overview

Implements the Explore Island action (Phase 4 of game plan). Players spend a die matching a shrine hex's **exploration color** to reveal hidden shrine content. If it's their own shrine, it auto-builds. If another player's, the exploring player receives a bonus.

There are 12 shrine island hexes total (4 player colors × 3 Greek letters). Each hex has a visible exploration color border (one of the 6 die colors) that is independent of the hidden shrine owner/letter.

## Exploration Color Mapping

Each shrine hex has an `explorationColor` — the die color required to explore it:

| Cluster | Hex Offset (dq, dr) | Exploration Color |
|---------|---------------------|-------------------|
| cluster-7-1 | (-1, 0) | green |
| cluster-7-2 | (-1, 0) | green |
| cluster-7-3 | (0, -1) | black |
| cluster-7-4 | (-1, 0) | blue |
| cluster-7-5 | (-1, 0) | blue |
| cluster-9-0 | (0, 0) | yellow |
| cluster-9-1 | (0, -1) | black |
| cluster-9-2 | (1, -1) | red |
| cluster-11-0 | (-1, 0) | red |
| cluster-11-0 | (-1, 3) | pink |
| cluster-11-1 | (1, 0) | yellow |
| cluster-11-2 | (-2, 2) | pink |

Distribution: 2 hexes per die color (2 green, 2 black, 2 blue, 2 yellow, 2 red, 2 pink).

## Shrine Content (Hidden Until Explored)

Each player is assigned 3 shrines at game setup, one per Greek letter. The shrine owner color and letter are stored in the DB but hidden from players until explored.

From `MaterialDefs::SHRINE_LETTERS`:

| Player Color | Letters |
|-------------|---------|
| red | omega, phi, psi |
| yellow | omega, psi, sigma |
| green | phi, psi, sigma |
| blue | omega, phi, sigma |

## Shrine Bonuses (Applied to Exploring Player)

From `MaterialDefs::SHRINE_BONUSES`:

| Letter | Bonus | Implementation |
|--------|-------|----------------|
| Psi (Ψ) | Take 4 Favor Tokens | **Now** — uses existing favor system |
| Phi (Φ) | Draw 2 Oracle Cards | **Now** — uses existing card draw |
| Sigma (Σ) | Advance 1+ Gods by total of 3 steps | **Deferred** — god track not built yet, log only |
| Omega (Ω) | Discard all Injury Cards of chosen color + Shield +1 | **Deferred** — injury system not built yet, log only |

## State Machine

No new states needed beyond the existing skeletons. `BuildShrine` (id:37) is **not used** — shrine placement is automatic within `ExploreIsland`.

```
SelectAction (21)
  actExploreIsland(hexQ, hexR)
    → validates: adjacency, die matches explorationColor, hex not revealed
    → spends die, marks hex revealed, records who revealed it
    → ExploreIsland (36) [game-type, auto-resolves]
      onEnteringState:
        reads shrine content (owner + letter)
        IF own shrine:
          → auto-build shrine (move piece from player board to hex)
          → complete Zeus tile
          → notify all
          → PlayerActions (20)
        IF other player's shrine:
          → apply bonus (Psi/Phi now; Sigma/Omega logged)
          → notify all
          → PlayerActions (20)
```

## PHP Validation & Logic

### SelectAction.php — Entry Point

**`getExplorableIslands()`** — returns list of explorable shrine hexes for active player:
1. Get ship position and selected die color
2. Query `hex` table for hexes where:
   - `island_content = 'shrine'`
   - `is_revealed = 0`
   - hex distance from ship ≤ 1 (adjacent)
3. For each candidate hex, look up its `explorationColor` from cluster definitions
4. Filter to hexes where `explorationColor` matches the selected die color
5. Return matching hexes (may be 0, 1, or 2+)

**`actExploreIsland(int $activePlayerId, int $hexQ, int $hexR)`**:
1. Validate hex is in `getExplorableIslands()` result
2. Spend the selected die
3. Update `hex` table: `is_revealed = 1`, `revealed_by_player_id = activePlayerId`
4. Store target hex in globals for ExploreIsland state
5. Return `ExploreIsland::class`

### ExploreIsland.php — Resolve (Game-Type State)

**`onEnteringState()`**:
1. Read target hex from globals
2. Look up shrine at this hex: query `shrine` table for matching `built_at_hex_q/r` or use hex→shrine mapping
3. Get shrine owner (`player_id`) and letter (`shrine_index` → letter lookup)

**If own shrine** (shrine owner == active player):
1. Update `shrine` table: `is_built = 1`, `built_at_hex_q = q`, `built_at_hex_r = r`
2. Call `completeZeusTile()` for the shrine letter
3. Send `notif_islandRevealed` + `notif_shrineBuilt`
4. Return `PlayerActions::class`

**If another player's shrine** (shrine owner != active player):
1. Apply bonus based on letter:
   - **Psi**: Add 4 favor tokens to exploring player
   - **Phi**: Draw 2 oracle cards for exploring player
   - **Sigma**: Log "earned 3 god advancement steps" (deferred)
   - **Omega**: Log "earned heal+shield bonus" (deferred)
2. Send `notif_islandRevealed` + `notif_shrineExplored`
3. Return `PlayerActions::class`

## DB Changes

### hex table — add column
```sql
ALTER TABLE `hex` ADD COLUMN `revealed_by_player_id` INT DEFAULT NULL;
```
Add to `dbmodel.sql` and any setup migration.

### Exploration color storage
The exploration color is a **static property** of each cluster definition, not stored in the DB. It's looked up from `ClusterDefinitions` using the hex's `cluster_type` and relative position within the cluster.

A helper method `getExplorationColor(int $q, int $r)` on `ClusterDefinitions.php` will:
1. Look up the hex's `cluster_type` and compute relative position
2. Return the `explorationColor` from the cluster definition

## JS Client-Side

### SelectAction — Action Buttons

In `onUpdateActionButtons` for state `selectAction`:
- Call server to check `getExplorableIslands()` (or include in `getArgs()`)
- If **1 explorable hex**: show button **"Explore Island"**
- If **2+ explorable hexes**: show one button per hex **"Explore [Color] Island"** (e.g., "Explore Green Island")
- Button click calls `bgaPerformAction("actExploreIsland", { hexQ, hexR })`

### ExploreIsland — State Entry

In `onEnteringState` for state `exploreIsland`:
- No player interaction needed (game-type auto-resolves on server)
- Could show a brief "Revealing island..." visual if desired

### Notification Handlers

| Notification | Data | JS Action |
|-------------|------|-----------|
| `notif_islandRevealed` | hexQ, hexR, shrineOwnerColor, shrineLetter | Update hex visual to show revealed shrine content (owner color indicator + Greek letter) |
| `notif_shrineBuilt` | playerId, hexQ, hexR, shrineIndex | Move shrine piece from player board to hex on main board |
| `notif_favorTokensChanged` | playerId, newCount | Update favor token display (existing handler) |
| `notif_oracleCardsDrawn` | playerId, cards | Add cards to player's hand (existing handler or new) |
| `notif_shrineExplored` | exploringPlayerId, shrineOwnerColor, shrineLetter, bonusType, bonusDescription | Log message showing bonus earned |

## Visual Representation

### Revealed Shrine Hex
- After reveal, the hex shows the shrine owner's color and Greek letter
- Exact visual TBD — could be a colored overlay with letter text, or a small icon

### Shrine Piece on Board
- All shrine pieces are **white** (not player-colored)
- Piece moves from below the corresponding Zeus tile on the player board to the hex on the main board
- Uses existing shrine component rendering

## Polish (Phase 6)

- [ ] Annotate the shrine owner's matching Zeus tile when their shrine is discovered by another player (visual indicator so they know it's been found)
- [ ] Implement Sigma bonus: dedicated state for distributing 3 steps across gods
- [ ] Implement Omega bonus: state for choosing injury color to discard + shield increase
- [ ] Exploration animation (flip/reveal effect on the hex)
- [ ] Sound effect on shrine discovery
