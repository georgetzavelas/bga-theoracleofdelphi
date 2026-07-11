# Undo System — design spec

Status: approved (brainstorm 2026-07-11). Single-level, player-facing undo
of clean actions within the active player's own turn. New mechanism; there
is no existing undo to preserve.

## Goal

Let the active player take back their most recent action within their own
turn, but only when that action revealed no hidden information, resolved no
randomness, and granted no hidden reward. Undo must be:

- **Fair.** Never a way to re-roll dice, scout an island for free, or peek
  the deck. The moment anything hidden or random happens, undo is gone.
- **Delightful.** Instant, no confirmation dialog, clearly signposted.
- **Robust.** Correctness comes from restoring a full state snapshot, not
  from hand-written per-action inverse bookkeeping.

## The one rule

**An action is undoable until a SEAL fires.** A seal is exactly one of four
things:

1. **Reveal** — a hidden board tile is flipped face up (explore an island,
   look at islands).
2. **Draw** — a card moves from a deck into a hand (draw oracle card, the
   demigod companion's bonus oracle draw, the equipment display refill after
   a pick).
3. **Roll** — `bga_rand` resolves an outcome (regular monster combat, see
   [CombatRound.php:40](../../../modules/php/States/CombatRound.php)).
4. **Reward-pick** — the active player commits an amber action's reward
   (equipment via `CombatVictory`, companion via `SelectReward`). This is the
   commit point of the two "undoable until you pick" actions.

Everything else, all the deterministic progress in the game (favor, god
track, offering and statue placement, shrine build), reveals nothing and is
fully reversible, so it never seals. This is the "R" philosophy chosen at
brainstorm: only information and randomness lock a turn, not progress.

Why this is safe in this codebase specifically:

- The board is deterministic. Islands are placed at setup in the `hex` table;
  exploring only sets `is_revealed = 1`
  ([ExploreIsland.php:25](../../../modules/php/States/ExploreIsland.php)). But
  a reveal is a seal, so a revealed island is never inside a clean undo.
- Dice re-roll at the turn boundary, not mid-turn
  ([ConsultOracle.php:58](../../../modules/php/States/ConsultOracle.php)), so
  nothing you undo within a turn can re-roll them.
- Card draws are ordered (`ORDER BY card_order ASC`), so a draw is
  reproducible, but draws are seals anyway.

Net: with reveal/draw/roll/reward-pick all sealing, the classic undo
exploits (save-scumming, free scouting, deck-peeking) are structurally
impossible.

## Taxonomy

Which concrete actions land in each bucket, and why.

### Green — always undoable (no seal ever)

| Action | Source | Why clean |
|---|---|---|
| Move ship | `MoveShip` | reposition on known water |
| Poseidon teleport | `UseGodAbility::actTeleportShip` | reposition |
| Load offering | `LoadCargo` | pick up known cargo |
| Load statue | `LoadCargo` | pick up known cargo |
| Hermes grab statue | `UseGodAbility::actGrabStatue` | pick up known cargo |
| Recolor die | `SelectAction::actRecolorDie` | deterministic |
| Recolor oracle card | `SelectAction::actRecolorCard` | deterministic |
| Apollo (dice wild) | `PlayerActions::useApollo` | die modifier |
| Aphrodite (discard injuries) | `discard_all_injuries` | discards own cards |
| Take favor tokens | `SelectAction::actTakeFavorTokens` | known reward, reversible |
| Advance god | `SelectAction::actAdvanceGod` | deterministic track step |
| Make offering | `DeliverCargo` (offering path) | favor + optional god step, no reveal |
| Build shrine | `BuildShrine` | deterministic, no reveal |

### Amber — undoable until the reward-pick

| Action | Undoable while in | Seals on |
|---|---|---|
| Ares auto-defeat | `CombatVictory` (equipment display is **face-up**, so nothing leaks) | picking the equipment card (which then refill-draws) |
| Raise statue | `SelectReward` (companion options are a **fixed known set** of that color, so nothing leaks) | picking the companion (demigod also draws an oracle card) |

The amber behaviour is not special-cased in the engine; it falls out of "the
slot stays valid until a seal fires" (see Architecture).

### Red — sealing (never undoable)

| Action | Seal category |
|---|---|
| Explore island (incl. Artemis free-explore) | Reveal |
| Look at islands | Reveal |
| Draw oracle card | Draw |
| Regular fight monster | Roll (`bga_rand`) |
| End turn | Roll (re-rolls next player's dice); slot cleared anyway |

Equipment activation inherits its inner behaviour: clean equipment (grab an
offering/statue) is undoable; revealing equipment (card 013 `look_and_explore`)
seals via its inner reveal; deterministic equipment (card 007 `big_bonus`
god advance) stays undoable. Each card is tagged in the seal audit.

## Locked decisions

- **D1 — Philosophy R.** Only reveal / draw / roll / reward-pick seals.
  Deterministic progress stays undoable.
- **D2 — Depth-1, no chaining.** Undo reverses only the single most recent
  action. Implemented as a single snapshot slot, so reaching two actions back
  is structurally impossible.
- **D3 — Full-state snapshot.** Snapshot the whole mutable game state (game
  tables + turn globals + stats), not a hand-picked subset. Correctness is
  boring instead of clever, and it cannot silently miss a table.
- **D4 — Instant snap-back.** On undo the client runs one
  `applyDynamicState(gamedatas)` routine that snaps dynamic state back into
  place. No bespoke per-action reverse-animations.
- **D5 — No confirmation dialog.** Undo is cheap and safe; a confirm would
  kill the delight.
- **D6 — Own turn only.** Undo never crosses a turn boundary and never
  touches an opponent's action.

## Architecture

### Server: one snapshot slot + one seal flag

New single-row-per-game table:

```sql
CREATE TABLE IF NOT EXISTS `undo_snapshot` (
  `id`           TINYINT UNSIGNED NOT NULL DEFAULT 1,  -- always 1
  `payload`      MEDIUMTEXT NULL,                       -- JSON: tables + globals + stats
  `available`    TINYINT(1) NOT NULL DEFAULT 0,         -- valid + unsealed
  `action_label` VARCHAR(64) NULL,                      -- button text, e.g. "move ship"
  PRIMARY KEY (`id`)
);
```

Only one player is ever active, so a single row is enough. New `Game` methods:

- `undoCheckpoint(string $label)` — serialize the mutable tables + globals +
  stats into `payload`, set `available = 1`, `action_label = $label`.
- `sealUndo()` — set `available = 0`. Idempotent.
- `undoAvailable(): bool` — read `available`. Treats a missing `undo_snapshot`
  table as `false` (see Schema migration), so a not-yet-migrated game shows no
  undo button instead of erroring.
- `performUndo()` — if available: restore the payload, set `available = 0`,
  send the `undoRestore` notification, return `PlayerActions::class`.

Snapshot scope (D3): the game-content tables that can change during a turn
(`hex`, `monster`, `offering`, `statue`, `shrine`, `oracle_die`,
`player_god`, `zeus_tile`, `god_advancement_queue`,
`player_island_knowledge`, `card`), plus the framework `player` and `stats`
tables, plus all turn-scoped `globals`. Static tables (`temple`,
`board_placement`) are excluded (never change post-setup). Restore game-content
tables by replacing that game's rows; restore `player` and `stats` by
column-level `UPDATE` (never delete a framework `player` row). Exact column
lists belong to the implementation plan.

The `undo_snapshot` table is never itself part of the snapshot.

### Schema migration (existing alpha games)

Editing `dbmodel.sql` alone does not touch games already in progress, so an
existing alpha game would 500 the instant the engine queries a table it lacks.
The risk is not "adding a table", it is "referencing a table an old game does
not have". The repo already has the machinery for this:

- **Fresh games:** add `undo_snapshot` to `dbmodel.sql` (also covered by the
  `ensureCustomSchema()` createGame guard at
  [Game.php:138](../../../modules/php/Game.php)).
- **In-progress games:** add a new versioned block to `upgradeTableDb()`
  ([Game.php:980](../../../modules/php/Game.php)), e.g.
  `if ($from_version <= 2607111200) { DbQuery("CREATE TABLE IF NOT EXISTS undo_snapshot (...)"); }`.
  BGA runs it once on next load, matching the documented `YYMMDDHHMM` workflow.

This is lower-risk than the past `hex.tile_type` migration on two counts: it is
a brand-new table (so `CREATE TABLE IF NOT EXISTS` actually creates it, with no
stale-column no-op trap), and it is a disposable buffer (no historical data to
preserve). As belt-and-suspenders, the read path treats a missing table as
"undo unavailable", so even a not-yet-run or failed migration degrades to a
hidden undo button rather than a broken turn.

### The checkpoint hook

`undoCheckpoint($label)` is called as the first line of each action-initiation
method in the turn hub `PlayerActions`:

- `actSelectDie`, `actPlayOracleCard`, `actPlayWildOracleCard`,
  `actUseGodAbility`, `actActivateEquipment`, `actUseBonusAction`.

The checkpoint is taken optimistically at action start. If the action turns
out to be red, its inner `sealUndo()` locks the slot before control returns,
so undo is simply never offered. One uniform hook; the seal flag does the
gating. Undoing restores to before the source was even committed (the die is
un-spent, the ship is back), which is the correct depth-1 meaning of "take
back that action".

### Seal audit (where `sealUndo()` goes)

- `ExploreIsland::onEnteringState` (reveal; covers regular explore and
  Artemis free-explore, both route here).
- `SelectAction::actLookAtIslands` and the peek flow (reveal).
- `SelectAction::actDrawOracleCard` (draw).
- `CombatRound` (roll).
- `CombatVictory::actSelectEquipment` (reward-pick + refill draw).
- `SelectReward::selectCompanion` (reward-pick; demigod oracle draw).
- Revealing/drawing equipment activations (audit `MaterialDefs::EQUIPMENT_CARDS`,
  e.g. card 013 `look_and_explore`).
- `ConsultOracle::onEnteringState` (turn boundary: clear the slot).

### Client: `applyDynamicState`

One routine, `this.applyDynamicState(gamedatas)`, updates all dynamic board
and panel state in place from a fresh payload: ship positions, cargo on ships
and temples, oracle dice faces and used flags, favor counts, god tracks, deck
sizes, revealed hexes, hands. It reuses the existing per-section updaters and
must not tear down static scaffold (board hexes, panels). It is triggered by
a new `undoRestore` notification carrying the payload, and is sent to all
clients so every board snaps back together.

### UX

- A single **Undo** button in the active player's action area, rendered in
  `onUpdateActionButtons` only when `args.undoAvailable` is true. Label:
  `Undo <action_label>`.
- Availability is exposed via `getArgs` on the states that can offer undo:
  `PlayerActions` (after a green action returns) and the amber pickers
  `CombatVictory` and `SelectReward` (before the pick).
- `actUndo` is a shared action (via an `UndoableState` trait) on those same
  three states, delegating to `Game::performUndo()`.
- No confirmation dialog. The button simply disappears the instant a seal
  fires.
- Undo is available right up until "End turn" is pressed.

### Coexistence with the existing cancel

`SelectAction::actCancelDieSelection` and the various `actPass` release an
in-progress, not-yet-resolved action (pre-commit). Undo reverses a fully
resolved clean action (post-commit). They are two layers, no conflict, and
can share the "return to `PlayerActions` with the source released" end-state.

## Edge cases

- **Zombie / timeout.** `zombie()` paths never undo; the slot is abandoned
  and cleared at turn end. No special handling.
- **Opponents' view.** Green actions are public (`shipMoved`, `loadCargo`).
  The `undoRestore` notification goes to all, so every client snaps back.
  Nothing hidden was ever shown, so there is no leak.
- **Turn boundary.** `ConsultOracle` clears the slot; undo can never reach
  into the next player's turn or the dice re-roll.
- **One-time equipment.** Undoing a clean one-time equipment activation
  restores the card to hand automatically (it is in the snapshot).
- **Stats.** Reverted automatically (the `stats` table is snapshotted).
- **Multi-source turns** (bonus action, wild cards). Each source commit is
  its own checkpoint; depth-1 still means only the latest is undoable.
- **No auto-advance.** `Game::nextStateAfterDieAction` always returns to the
  hub `PlayerActions`, even when all dice are used and no non-die actions
  remain. Turns end only via the explicit `actEndTurn` (or `zombie()`, which
  delegates to it), so the final action of a turn stays undoable at the hub
  until the player actually presses End Turn. `PlayerActions::getArgs`
  exposes `noActionsLeft` so the client can prompt the player to end their
  turn once nothing else is left to do.
- **Zeus landing seals undo.** Reaching Zeus (`Game::registerZeusReach`) is a
  public, game-ending commit: it announces the final round to every player,
  and its win globals (`zeus_reachers`, `winner_player_id`) are intentionally
  not part of the undo snapshot. It calls `sealUndo()` immediately so it can
  never be undone, independent of the normal seal audit above.

## Non-goals

- Multi-level or whole-turn rewind (explicitly rejected in favour of depth-1).
- Cross-turn undo, or undoing an opponent's action.
- Undo of sealed actions (explore, look, draw, roll, reward-pick).
- Reverse-animations (snap-back only).

## Testing strategy

- **Snapshot round-trip.** Serialize, mutate tables/globals/stats, restore,
  assert byte-for-byte equality of the snapshotted state.
- **Seal gating.** After each red action, `undoAvailable()` is false; after
  each green action, true.
- **Depth-1.** Two greens then undo restores only the second, and undo is
  unavailable immediately after (no second undo without a new action).
- **Amber (Ares).** Defeat monster, undo in `CombatVictory` restores the
  monster, the die, and the god; then pick equipment and assert undo gone.
- **Amber (raise statue).** Raise, undo in `SelectReward` restores the statue
  to the ship; then pick a companion and assert undo gone.
- **Client parity.** `applyDynamicState` from a restored payload renders
  identically to a fresh `setup()` (no orphan DOM; correct ship, cargo, dice,
  favor, gods, decks, hexes).
- **Seal completeness guard.** A test asserting that every state performing a
  reveal/draw/roll calls `sealUndo()` (grep-based or a runtime assertion).

## Implementation checklist (for the plan)

1. `undo_snapshot` in `dbmodel.sql` (fresh games) AND a new versioned
   `upgradeTableDb()` block with `CREATE TABLE IF NOT EXISTS` for in-progress
   alpha games, plus the defensive "missing table means undo unavailable" read,
   plus the `JS_VERSION` cache-bust bump. See Schema migration.
2. `Game::undoCheckpoint` / `sealUndo` / `performUndo` / `undoAvailable`, plus
   the serializer/deserializer over the mutable tables + globals + stats.
3. Checkpoint hooks in the six `PlayerActions` initiators.
4. `sealUndo()` at every audited seal site.
5. `UndoableState` trait (`actUndo` + `getArgs` merge of
   `undoAvailable`/`action_label`) on `PlayerActions`, `CombatVictory`,
   `SelectReward`.
6. `undoRestore` notification + client `applyDynamicState`, refactoring the
   shared section updaters out of `setup()` so both call the same code.
7. Undo button in `onUpdateActionButtons`.
8. Tests per the strategy above.

## Open risks

- 🟡 **R1 — `applyDynamicState` reentrancy.** Some section renderers may
  assume first-time DOM. Mitigation: extract idempotent updaters shared with
  `setup()`; the client-parity test proves restore-render equals fresh render.
- 🟡 **R2 — Seal-site completeness.** A missed seal site would allow an unfair
  undo. Mitigation: the audit list above plus the seal-completeness guard test.
- 🟡 **R3 — Snapshot size/perf.** Negligible for one game's tables; the slot
  is a single overwritten `MEDIUMTEXT` row, so it cannot grow across a turn.
- 🟡 **R4 — Alpha-game migration.** Referencing `undo_snapshot` before it
  exists on an in-progress game would 500. Mitigation: the `upgradeTableDb`
  block (see Schema migration) plus the defensive "missing table means undo
  unavailable" read, so the worst case is a hidden button, not a broken turn.
