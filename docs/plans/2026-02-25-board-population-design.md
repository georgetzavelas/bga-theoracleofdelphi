# Board Hex & Piece Population Design (Phase 3b)

## Overview

After BoardGenerator creates the board layout, `populateBoard()` in Game.php populates the DB with hexes and game pieces. Called from `setupNewGame()` after cluster placements are saved.

## Hex Table Population

INSERT all hexes from BoardGenerator output into the `hex` table:

| DB Column | Source |
|-----------|--------|
| `q`, `r` | Hex coordinates |
| `tile_type` | Hex `type` (water/island/shallows) |
| `color` | Hex `color` (water hexes only, null for islands) |
| `island_content` | Hex `attribute` (monster, offering, shrine, temple, statue, city, two_monster, null) |
| `is_revealed` | 0 at setup (islands start face-down) |
| `cluster_id` | Foreign key to `board_placement` |
| `cluster_type` | Cluster definition name (e.g., `cluster-7-3`) |
| `cluster_rotation` | 0-5 rotation value |

`island_content` is populated at setup from ClusterDefinitions `attribute` field. Server knows what's under each island, but only sends to client when `is_revealed=1` OR player has peeked (via `player_island_knowledge` table).

## Monster Placement (Rule 6)

- N monsters per color (N = player count): 12/18/24 total for 2/3/4 players
- 3 `two_monster` hexes get 2 different monsters each (6 total on marked islands)
- 6 `monster` hexes get remaining monsters distributed evenly, no color twice per island
- Monster type derived from color via `MaterialDefs::MONSTERS` (e.g., red -> cyclops)
- DB row: `color`, `monster_type`, `hex_q`, `hex_r`, `is_defeated=0`, `defeated_by_player_id=NULL`
- On defeat: `is_defeated=1`, `defeated_by_player_id` set. Hex coords preserved for history.

## Offering Placement (Rule 4)

- N offering cubes per color (N = player count): 12/18/24 total
- 6 offering islands, distributed evenly, no color twice per island
- DB row: `color`, `origin_hex_q`, `origin_hex_r`, `player_id=NULL`, `is_delivered=0`
- Lifecycle: on island -> loaded into cargo (`player_id` set) -> delivered to temple (`is_delivered=1`, destination coords set)

## Temple Placement (Rule 5)

- 6 temples, one per color, randomly assigned 1:1 to 6 temple hexes
- DB row: `color`, `hex_q`, `hex_r`
- Temples are fixed once placed, never move

## Statue Placement (Rule 7)

- 3 statues of each color on the respective city tile (18 total)
- City color from cluster ID (e.g., `city-red` -> red)
- DB row: `color`, `origin_hex_q`, `origin_hex_r`, `player_id=NULL`, `is_raised=0`
- Lifecycle: on city -> loaded into cargo (`player_id` set) -> raised at statue island (`is_raised=1`, destination coords set)

## Schema Addition

New table for tracking player-specific island peek state (equipment card #13):

```sql
CREATE TABLE IF NOT EXISTS `player_island_knowledge` (
    `player_id` INT NOT NULL,
    `hex_q` INT NOT NULL,
    `hex_r` INT NOT NULL,
    PRIMARY KEY (`player_id`, `hex_q`, `hex_r`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

## getAllDatas() Updates

Add to response: `hexes`, `monsters`, `offerings`, `statues`, `temples`.

- Hexes: all rows, but `island_content` only included if `is_revealed=1` OR player has row in `player_island_knowledge`
- Monsters: non-defeated for board + defeated grouped by `defeated_by_player_id` for player boards
- Offerings: on-island for board + in-cargo per player + delivered
- Statues: same lifecycle states as offerings
- Temples: all 6 (fixed positions)

## Not In Scope

- Shrine/statue-destination hexes don't get pieces at setup (gameplay destinations only)
- Player initialization (3c), Zeus tiles (3d), card decks (3e), oracle roll (3f) are separate sub-tasks

## Island Attribute Counts (from ClusterDefinitions)

| Attribute | Count | Notes |
|-----------|-------|-------|
| city | 6 | Color from cluster ID |
| monster | 6 | Regular monster islands |
| two_monster | 3 | Marked islands, 2 monsters each |
| offering | 6 | Offering islands |
| temple | 6 | Temple islands |
| statue | 6 | Raise-statue destinations (no setup pieces) |
| shrine | 12 | Build-shrine destinations (no setup pieces) |
