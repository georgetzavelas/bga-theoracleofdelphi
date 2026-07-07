# Ship Tile Draft — design spec

Status: approved (brainstorm 2026-07-06). Build behind a game option; the
existing random path stays the default and must remain untouched.

## Goal

Add the rulebook's Ship Tile draft variant: instead of dealing one random
tile to each player, lay out `players + 1` tiles face up and let players
choose one each, starting with the last player and proceeding in reverse
turn order.

## Current state (random mode)

`setupNewGame()` runs atomically with no player interaction:

- `initPlayers()` shuffles `[0..7]`, deals the first N tiles by index, and
  applies each tile's *automatic* bonus inline (shield, favor, gods-at-
  player-count-row), writing `ship_tile_id`.
- `applyShipTileBonuses()` handles the card-drawing bonus for Quartermaster
  (`starting_equipment`): draws 1 oracle inline and sets the per-player
  global `pending_starting_equipment_<pid>`.
- `setupNewGame` returns `RoundStart::class`.
- `RoundStart::onEnteringState` detours the pending Quartermaster player
  through `SelectStartingEquipment` (id 6) and the Head Start
  (`fewer_tasks`) player through `DiscardZeusTile` (id 5), then restores
  `first_player_id` as active and enters round 1.

The two setup-time *decisions* (Quartermaster's equipment pick, Head Start's
Zeus-tile return) are already deferred to those pre-round-1 detour states.
This is the pattern the draft reuses.

## Tile setup behaviors

- **Automatic** (applied on pick, no choice): Bronze Aegis (`shield_start`),
  Golden Touch (`favor_plus_1`), Divine Patronage (`god_track_high`).
- **Interactive** (needs a follow-up turn): Quartermaster
  (`starting_equipment` → `SelectStartingEquipment`), Head Start
  (`fewer_tasks` → `DiscardZeusTile`).
- **Passive** (nothing at setup): Deep Hold, Swift Sails, Thrifty Wheel.

Because the pool holds each tile at most once, at most one of each
interactive follow-up can ever fire.

## Locked decisions

- **D1 — Exposure:** a BGA game option `ship_tile_mode` (Random = default,
  Draft). Both paths kept.
- **D2 — Follow-up timing:** resolve Quartermaster / Head Start follow-ups
  *after the whole draft*, via the existing `RoundStart` detours. No new
  interactive code for them.
- **D3 — UI:** a live **Draft Rail** in the action-bar region. Tile art
  cropped to the top half of the card; the rail renders name + ability as
  text. Claimed tiles dimmed with the owner's colour. Pick-flight animates
  the chosen tile into the drafter's ship-tile panel slot (reuse
  `_runPickFlight`).
- **D4 — Draft order:** descending `player_no` (reverse turn order). Last
  player (highest `player_no`) picks first, walking back to the first
  player.

## Resolved edge cases

- **Q1 Leftover tile:** dropped silently once the draft ends. No "not in
  play" display.
- **Q2 Reconnect:** `getAllDatas` exposes the pool + who-claimed-what so a
  rejoining player rebuilds the rail; `DraftShipTile::getArgs` supplies the
  live state.
- **Q3 Zombie:** auto-pick the first available tile (mirrors
  `SelectStartingEquipment::zombie`).
- **Q4 Tests:** setup / distribution tests get a mode-aware branch covering
  both random and draft.
- **Q5 Solo / 2p:** by the book. N+1 holds (2p → 3 tiles); no special-case.

## Architecture

### Server (PHP)

1. **Game option** `ship_tile_mode` in `gameoptions.json` (id `100`):
   value `1` = Random (default), `2` = Draft. Read in `setupNewGame` from
   the `$options` argument (confirm exact accessor against the framework;
   `$this->tableOptions->get(100)` is the runtime fallback).

2. **Refactor:** extract the inline automatic-bonus block from
   `initPlayers` into `applyImmediateTileBonuses(int $playerId, int
   $tileId): void` (shield, golden-touch favor, god-track-high start step).
   Both random setup and draft picks call it, so the bonus rules live in one
   place. Make `applyShipTileBonuses` callable per-player as well (extract
   `applyShipTileBonusForPlayer(int $playerId): void`) so a draft pick can
   trigger the Quartermaster oracle-draw + pending flag on demand.

3. **Random mode:** unchanged behavior. `initPlayers` still deals + applies
   bonuses inline (now via the extracted helper); `setupNewGame` returns
   `RoundStart::class`.

4. **Draft mode:**
   - `initPlayers` leaves `ship_tile_id` NULL and applies no tile bonus.
     Base favor (`2 + player_no`) and the always-present shrines/gods still
     initialise; Golden Touch's `+1` starting favor is applied later, at
     pick time (it is a tile bonus).
   - Pick `players + 1` distinct tile ids into a `draft_pool` global
     (shuffle `[0..7]`, take N+1).
   - Activate the last player (highest `player_no`) and return
     `DraftShipTile::class`.

5. **New state `DraftShipTile`** (id `7`, `ACTIVE_PLAYER`):
   - `getArgs`: return `draftPool` (tile ids still available) and `claims`
     (`player_id → tile_id` for tiles already taken this draft).
   - `actDraftTile(int $tile_id, int $activePlayerId)`: validate the tile is
     in the pool and unclaimed; set `ship_tile_id`; call
     `applyImmediateTileBonuses` + `applyShipTileBonusForPlayer`; notify
     `startingShipTile` (the JS handler already exists); advance active
     player to the next drafter (next-lower `player_no`, stopping when all
     have a tile); return `DraftShipTile::class` to re-enter.
   - `onEnteringState`: if every player has a `ship_tile_id`, transition to
     `RoundStart::class` (which then runs the existing detours + starts
     round 1); otherwise stay (active player = current drafter).
   - `zombie(int $playerId)`: auto-pick the first available pool tile via
     `actDraftTile`.

6. **`RoundStart`, `SelectStartingEquipment`, `DiscardZeusTile`:**
   unchanged. After the draft, `ship_tile_id` and the `pending_*` flags are
   set exactly as random mode leaves them, so the detours resolve the
   interactive follow-ups with no changes. `first_player_id` is still set in
   `initPlayers`, so the first-player restore in `RoundStart` still works.

### Client (JS)

1. `onEnteringState` / `onLeavingState` / `onUpdateActionButtons`: add a
   `DraftShipTile` case.
2. **Draft Rail** rendered in the action-bar region: one card per pool tile,
   art cropped to the top half, name + ability + storage + category. For the
   active drafter, unclaimed tiles are pickable (`click → actDraftTile`);
   claimed tiles are dimmed and badged with the owner's player colour.
   Non-active players see the same rail read-only, updating live.
3. On a successful pick, animate the chosen tile into the drafter's
   ship-tile panel slot with `_runPickFlight` (same helper as the equipment
   supply pick), then update the panel via the existing ship-tile setup.
4. `shipTileDefs` is already sent to the client and
   `_buildShipTileTooltipHtml` already exists, so tooltips + ability text
   are reused as-is.
5. `getAllDatas` exposes `draftPool` + `claims` for reconnect / spectator so
   the rail rebuilds on reload.
6. Notification handling: reuse `notif_startingShipTile` to paint the
   claimed tile onto the owner's panel; a light `notif` (or the state
   `getArgs` refresh) keeps every client's rail in sync as picks land.

## Failure modes / compatibility

- Random mode must be byte-for-byte behaviorally identical; the option
  defaults to Random and the refactor only relocates existing inline logic
  behind a shared helper. A regression test asserts random-mode setup is
  unchanged.
- `dbmodel.sql` needs no change: `ship_tile_id` already allows NULL, which
  is exactly the "not yet drafted" state.
- Replay / determinism: pool selection uses `bgaShuffle` (deterministic
  `bga_rand`), consistent with existing setup.
- Draft-order edge: with a single player (solo), the draft still runs with
  N+1 = 2 tiles and one pick; verify the single-drafter path transitions to
  `RoundStart`.

## Test plan

- `applyImmediateTileBonuses` unit coverage for each automatic ability.
- Draft-mode setup: pool size = players + 1, all ids distinct, no
  `ship_tile_id` assigned pre-draft.
- Draft order = descending `player_no`; each pick removes the tile from the
  available set; leftover tile never assigned.
- Post-draft: Quartermaster pick still routes through
  `SelectStartingEquipment`; Head Start still routes through
  `DiscardZeusTile`.
- Random mode unchanged (regression).
