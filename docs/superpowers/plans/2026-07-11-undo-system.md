# Undo System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-level, in-turn undo of clean actions for the active player, gated by a four-way "seal" model so undo can never re-roll, scout, or peek.

**Architecture:** One `undo_snapshot` row holds a full-game-state JSON blob taken at the start of each player action. Any state that reveals / draws / rolls / commits a reward calls `sealUndo()` to lock the slot. `performUndo()` restores the blob and pushes a fresh full-state payload to every client, which re-renders dynamic pieces in place. Depth-1 falls out of the single slot; the amber "undo until you pick" behaviour falls out of "slot stays valid until a seal".

**Tech Stack:** PHP 8 (BGA GameFramework state classes), MySQL, Dojo-based BGA client JS, standalone `php`/`node` smoke-test scripts.

**Design spec:** [docs/superpowers/specs/2026-07-11-undo-system-design.md](../specs/2026-07-11-undo-system-design.md). Read it first; this plan implements it verbatim.

## Global Constraints

- **Commit style:** plain messages only. NEVER add `Co-Authored-By:` or any AI-attribution trailer (repo HARD RULE in `CLAUDE.md`).
- **Post-commit:** after each task's commit, merge the feature branch into `master` with `git -C /Users/georgetzavelas/src/theoracleofdelphi merge --no-ff <branch>` then `git -C /Users/georgetzavelas/src/theoracleofdelphi push`. Tasks 1-6 add dormant server code (no behaviour change until Task 7 wires the button), so incremental merges keep `master` green.
- **Cache-bust:** any change to `theoracleofdelphi.js` requires bumping `JS_VERSION` and the six `?v<NNN>` `define([...])` URLs in that file (repo `CLAUDE.md` rule). Only Task 7 touches JS.
- **Snapshot scope:** capture the mutable game-content tables + framework `player` + `stats` + the globals backing table. NEVER snapshot `undo_snapshot` itself, and exclude static tables `temple` and `board_placement`.
- **Fairness invariant:** a missed `sealUndo()` site is the only way this design leaks. Task 5's site list is exhaustive against the spec; do not add undoable behaviour to any state that reveals/draws/rolls.
- **Namespace:** all PHP is `namespace Bga\Games\theoracleofdelphi;` (Game, helpers) or `...\States;` (state classes). Match the existing file headers exactly.

---

## File Structure

- **Create** `modules/php/UndoState.php` — pure, DB-free serialization contract (`encode`/`decode` a `{tables, globals}` associative array to/from JSON). Unit-testable with the repo's standalone harness.
- **Create** `modules/php/States/UndoableState.php` — a trait providing `actUndo()` and the `undoAvailable`/`undoActionLabel` args merge, mixed into the three states that can offer undo.
- **Create** `tests/test_undo_state.php` — standalone smoke test for `UndoState` round-trip.
- **Modify** `dbmodel.sql` — add the `undo_snapshot` table.
- **Modify** `modules/php/Game.php` — add `undoCheckpoint`, `sealUndo`, `undoAvailable`, `performUndo`, `captureUndoState`, `restoreUndoState`, the `UNDO_SNAPSHOT_TABLES` manifest, the `upgradeTableDb` migration block, and the `getAllDatas` payload builder reused by `performUndo`.
- **Modify** `modules/php/States/PlayerActions.php` — call `undoCheckpoint()` at the six action initiators.
- **Modify** `modules/php/States/ExploreIsland.php`, `SelectAction.php`, `CombatRound.php`, `CombatVictory.php`, `SelectReward.php`, `ConsultOracle.php` — add `sealUndo()` calls.
- **Modify** `modules/php/States/PlayerActions.php`, `CombatVictory.php`, `SelectReward.php` — `use UndoableState;` and merge undo args into `getArgs`.
- **Modify** `theoracleofdelphi.js` — `notif_undoRestore`, `applyDynamicState`, the Undo action button, cache-bust bump.

---

## Task 1: Schema + alpha-game migration

**Files:**
- Modify: `dbmodel.sql` (append new table near the other `CREATE TABLE` blocks)
- Modify: `modules/php/Game.php:980-1007` (`upgradeTableDb`)

**Interfaces:**
- Produces: table `undo_snapshot(id TINYINT PK, payload MEDIUMTEXT NULL, available TINYINT(1), action_label VARCHAR(64) NULL)` present on both fresh and in-progress games.

- [ ] **Step 1: Add the table to `dbmodel.sql`**

Append after the last `CREATE TABLE` block:

```sql
-- =====================================================
-- UNDO BUFFER (disposable; single overwritten row per game)
-- =====================================================
CREATE TABLE IF NOT EXISTS `undo_snapshot` (
    `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
    `payload` MEDIUMTEXT DEFAULT NULL,
    `available` TINYINT(1) NOT NULL DEFAULT 0,
    `action_label` VARCHAR(64) DEFAULT NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

- [ ] **Step 2: Add the migration block to `upgradeTableDb`**

Inside `upgradeTableDb($from_version)`, after the existing `if ($from_version <= 2605131800)` block:

```php
        if ($from_version <= 2607111200) {  // 2026-07-11 12:00 — add undo buffer
            // Brand-new disposable table. IF NOT EXISTS genuinely creates it
            // on in-progress games (no stale-column trap since it is a new
            // table, not a new column). Losing an in-flight undo is harmless.
            static::DbQuery(
                "CREATE TABLE IF NOT EXISTS `undo_snapshot` (
                    `id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
                    `payload` MEDIUMTEXT DEFAULT NULL,
                    `available` TINYINT(1) NOT NULL DEFAULT 0,
                    `action_label` VARCHAR(64) DEFAULT NULL,
                    PRIMARY KEY (`id`)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8"
            );
        }
```

- [ ] **Step 3: Verify (Studio)**

Create a new table in Studio, then run in the Studio DB console:
Run: `SHOW COLUMNS FROM undo_snapshot;`
Expected: four rows `id, payload, available, action_label`.

- [ ] **Step 4: Commit**

```bash
git add dbmodel.sql modules/php/Game.php
git commit -m "feat(undo): add undo_snapshot table + alpha migration"
```
Then merge to master (no-ff) and push per Global Constraints.

---

## Task 2: `UndoState` serialization contract (pure, unit-tested)

**Files:**
- Create: `modules/php/UndoState.php`
- Test: `tests/test_undo_state.php`

**Interfaces:**
- Produces: `UndoState::encode(array $state): string` (JSON) and `UndoState::decode(string $json): array`. `$state` shape: `['tables' => ['<name>' => [ <rows> ]], 'globals' => [ '<key>' => <value> ]]`. `decode(encode($s)) === $s` for any JSON-safe `$s`.

- [ ] **Step 1: Write the failing test**

Create `tests/test_undo_state.php`:

```php
<?php
/**
 * Smoke test for UndoState JSON round-trip.
 * Run: php tests/test_undo_state.php
 */
require_once __DIR__ . '/../modules/php/UndoState.php';

use Bga\Games\theoracleofdelphi\UndoState;

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

$state = [
    'tables' => [
        'player' => [
            ['player_id' => '5', 'ship_q' => '2', 'ship_r' => '-1', 'favor_tokens' => '3'],
        ],
        'monster' => [],
    ],
    'globals' => [
        'selected_die_index' => 1,
        'active_god_ability' => null,
        'oracle_card_play_colors' => ['red', 'blue'],
    ],
];

$round = UndoState::decode(UndoState::encode($state));
check($round === $state, 'round-trip preserves nested tables + globals exactly');
check(is_string(UndoState::encode($state)), 'encode returns a string');
check(UndoState::decode('not json') === ['tables' => [], 'globals' => []],
      'decode of garbage yields empty state, not a crash');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `php tests/test_undo_state.php`
Expected: FATAL, `UndoState.php` / class not found.

- [ ] **Step 3: Implement `UndoState`**

Create `modules/php/UndoState.php`:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi;

/**
 * Pure serialization contract for the undo buffer. No DB access, no framework
 * dependency, so it is unit-testable with the standalone smoke-test harness.
 * The Game class reads/writes rows; this class only turns the resulting
 * associative array into JSON and back.
 */
final class UndoState
{
    public static function encode(array $state): string
    {
        return json_encode([
            'tables'  => $state['tables']  ?? [],
            'globals' => $state['globals'] ?? [],
        ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }

    /** @return array{tables: array, globals: array} */
    public static function decode(string $json): array
    {
        $decoded = json_decode($json, true);
        if (!is_array($decoded)) {
            return ['tables' => [], 'globals' => []];
        }
        return [
            'tables'  => $decoded['tables']  ?? [],
            'globals' => $decoded['globals'] ?? [],
        ];
    }
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `php tests/test_undo_state.php`
Expected: `3 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add modules/php/UndoState.php tests/test_undo_state.php
git commit -m "feat(undo): add UndoState JSON serialization contract + test"
```
Then merge to master (no-ff) and push.

---

## Task 3: Undo engine methods on `Game`

**Files:**
- Modify: `modules/php/Game.php` (add methods + `UNDO_SNAPSHOT_TABLES` const + `UNDO_GLOBAL_KEYS` const; require `UndoState`)

**Interfaces:**
- Consumes: `UndoState::encode/decode` (Task 2); table `undo_snapshot` (Task 1).
- Produces:
  - `undoCheckpoint(string $label): void`
  - `sealUndo(): void`
  - `undoAvailable(): bool`
  - `performUndo(): string` (returns `PlayerActions::class` FQCN string)
  - `captureUndoState(): array` and `restoreUndoState(array $state): void` (internal, but named here so later tasks and reviewers can reason about them)

- [ ] **Step 1: Discovery — confirm the globals backing table name (Studio)**

Run in the Studio DB console for an in-progress game:
Run: `SHOW TABLES LIKE '%global%';`
Expected: one table (commonly `global`). Record its exact name and its
value column via `SHOW COLUMNS FROM <name>;`. If it exists and is snapshot-safe,
Step 3 snapshots it wholesale. If the framework hides it, fall back to the
explicit `UNDO_GLOBAL_KEYS` manifest path shown in Step 3's comment.

- [ ] **Step 2: Add the table + globals manifests near the top of the `Game` class**

At the top of `modules/php/Game.php`, after the existing `require_once`
lines, add:

```php
require_once(__DIR__ . '/UndoState.php');
```

Inside the `Game` class body (near the other consts), add:

```php
    /**
     * Game-content tables captured by the undo buffer. Static tables
     * (temple, board_placement) are excluded because they never change
     * after setup. `player` and `stats` are handled separately (column
     * UPDATE, never delete). `undo_snapshot` is never itself captured.
     */
    private const UNDO_SNAPSHOT_TABLES = [
        'hex', 'monster', 'offering', 'statue', 'shrine', 'oracle_die',
        'player_god', 'zeus_tile', 'god_advancement_queue',
        'player_island_knowledge', 'card',
    ];

    /**
     * Turn-scoped globals captured by the undo buffer. These are the keys
     * that any single clean action can mutate. Cross-turn/setup globals
     * (first_player_id, titan_holder_id, zeus_position, ...) are stable
     * within a turn, so omitting them is safe. Keep in sync with any new
     * turn-scratch global introduced in a state class.
     */
    private const UNDO_GLOBAL_KEYS = [
        'selected_die_index', 'selected_oracle_card_id', 'oracle_card_played',
        'oracle_card_play_colors', 'active_god_ability', 'god_explore_source',
        'explore_hex_q', 'explore_hex_r', 'cargo_action_type', 'cargo_item_id',
        'combat_monster_id', 'combat_strength', 'combat_roll', 'ares_auto_defeat',
        'god_steps_remaining', 'god_advance_reason', 'pending_god_reset',
        'reward_type', 'reward_color', 'apollo_wild_active',
        'apollo_pending_recolor', 'wild_card_chosen_color',
        'bonus_action_color', 'bonus_action_spent_color', 'pre_bonus_die_index',
        'eq13_card_id', 'eq17_card_id', 'eq17_color_options', 'eq21_card_id',
        'eq_statue_card_id', 'equipment_post_activation_state',
        'peek_viewing', 'peek_hexes',
    ];
```

Note: the `UNDO_GLOBAL_KEYS` list is the fallback. If Step 1 found a
snapshot-safe globals table, prefer capturing it inside `UNDO_SNAPSHOT_TABLES`
and drop this constant. This plan uses the explicit-key path because it does
not depend on an unconfirmed framework table name.

- [ ] **Step 3: Add `captureUndoState` / `restoreUndoState`**

Add to `Game`:

```php
    /** @return array{tables: array, globals: array} */
    public function captureUndoState(): array
    {
        $tables = [];
        foreach (self::UNDO_SNAPSHOT_TABLES as $t) {
            $tables[$t] = $this->getObjectListFromDB("SELECT * FROM `$t`");
        }
        // player + stats captured as full rows; restored by column UPDATE.
        $tables['player'] = $this->getObjectListFromDB("SELECT * FROM player");
        $tables['stats']  = $this->getObjectListFromDB("SELECT * FROM stats");

        $globals = [];
        foreach (self::UNDO_GLOBAL_KEYS as $k) {
            $globals[$k] = $this->globals->get($k);
        }
        return ['tables' => $tables, 'globals' => $globals];
    }

    public function restoreUndoState(array $state): void
    {
        $tables  = $state['tables'] ?? [];
        $globals = $state['globals'] ?? [];

        // Game-content tables: wipe + reinsert this game's rows.
        foreach (self::UNDO_SNAPSHOT_TABLES as $t) {
            $this->DbQuery("DELETE FROM `$t`");
            foreach (($tables[$t] ?? []) as $row) {
                $this->insertRow($t, $row);
            }
        }
        // player + stats: never delete framework rows; UPDATE columns in place.
        foreach (($tables['player'] ?? []) as $row) {
            $this->updateRowByKey('player', 'player_id', $row);
        }
        foreach (($tables['stats'] ?? []) as $row) {
            // stats PK is (stats_type, stats_player_id); update by both.
            $this->updateStatsRow($row);
        }
        foreach ($globals as $k => $v) {
            $this->globals->set($k, $v);
        }
    }

    private function insertRow(string $table, array $row): void
    {
        $cols = array_map(fn($c) => "`$c`", array_keys($row));
        $vals = array_map(fn($v) => $v === null ? 'NULL' : "'" . addslashes((string)$v) . "'", array_values($row));
        $this->DbQuery("INSERT INTO `$table` (" . implode(',', $cols) . ") VALUES (" . implode(',', $vals) . ")");
    }

    private function updateRowByKey(string $table, string $keyCol, array $row): void
    {
        if (!isset($row[$keyCol])) return;
        $sets = [];
        foreach ($row as $c => $v) {
            if ($c === $keyCol) continue;
            $sets[] = "`$c` = " . ($v === null ? 'NULL' : "'" . addslashes((string)$v) . "'");
        }
        if (!$sets) return;
        $key = addslashes((string)$row[$keyCol]);
        $this->DbQuery("UPDATE `$table` SET " . implode(',', $sets) . " WHERE `$keyCol` = '$key'");
    }

    private function updateStatsRow(array $row): void
    {
        if (!isset($row['stats_type'], $row['stats_player_id'])) return;
        $type = addslashes((string)$row['stats_type']);
        $pid  = addslashes((string)$row['stats_player_id']);
        $val  = $row['stats_value'] === null ? 'NULL' : "'" . addslashes((string)$row['stats_value']) . "'";
        $this->DbQuery(
            "UPDATE stats SET stats_value = $val WHERE stats_type = '$type' AND stats_player_id = '$pid'"
        );
    }
```

Note on `stats` columns: confirm the exact column names in Studio via
`SHOW COLUMNS FROM stats;` (BGA standard is `stats_type`, `stats_player_id`,
`stats_value`). Adjust `updateStatsRow` if the build differs.

- [ ] **Step 4: Add the four engine methods (with defensive missing-table read)**

```php
    private function undoTableExists(): bool
    {
        $row = $this->getObjectFromDB("SHOW TABLES LIKE 'undo_snapshot'");
        return $row !== null;
    }

    public function undoCheckpoint(string $label): void
    {
        if (!$this->undoTableExists()) return;
        $payload = UndoState::encode($this->captureUndoState());
        $safe = addslashes($payload);
        $safeLabel = addslashes(substr($label, 0, 64));
        // Single-row upsert (id = 1 always).
        $this->DbQuery(
            "INSERT INTO undo_snapshot (id, payload, available, action_label)
             VALUES (1, '$safe', 1, '$safeLabel')
             ON DUPLICATE KEY UPDATE payload = '$safe', available = 1, action_label = '$safeLabel'"
        );
    }

    public function sealUndo(): void
    {
        if (!$this->undoTableExists()) return;
        $this->DbQuery("UPDATE undo_snapshot SET available = 0 WHERE id = 1");
    }

    public function undoAvailable(): bool
    {
        if (!$this->undoTableExists()) return false;  // not-yet-migrated game
        return (int)$this->getUniqueValueFromDB(
            "SELECT available FROM undo_snapshot WHERE id = 1"
        ) === 1;
    }

    public function performUndo(): string
    {
        if (!$this->undoAvailable()) {
            // Defensive: nothing to undo. Return to the hub unchanged.
            return \Bga\Games\theoracleofdelphi\States\PlayerActions::class;
        }
        $json = $this->getUniqueValueFromDB("SELECT payload FROM undo_snapshot WHERE id = 1");
        $this->restoreUndoState(UndoState::decode((string)$json));
        $this->sealUndo();  // consume the slot: depth-1, no chaining

        $activePlayerId = (int)$this->getActivePlayerId();
        $this->notify->all("undoRestore", clienttranslate('${player_name} takes back their last action'), [
            "player_id"   => $activePlayerId,
            "player_name" => $this->getPlayerNameById($activePlayerId),
            "state"       => $this->getAllDatas($activePlayerId),
        ]);
        return \Bga\Games\theoracleofdelphi\States\PlayerActions::class;
    }
```

Note: `getAllDatas` is `protected`; `performUndo` is a method on the same
class so it may call it directly. The `state` payload is the same shape the
client already consumes at load, so `applyDynamicState` (Task 7) can reuse
every existing per-section reader.

- [ ] **Step 5: Guard test (pure) — table manifest excludes forbidden tables**

Append to `tests/test_undo_state.php` a static check that the manifest is
sane. Since `UNDO_SNAPSHOT_TABLES` is private, expose the list via a tiny
public accessor `Game::undoSnapshotTables()` returning the const, OR assert
against a copied literal in the test. Add to the test file:

```php
$forbidden = ['undo_snapshot', 'temple', 'board_placement'];
$manifest = [
    'hex', 'monster', 'offering', 'statue', 'shrine', 'oracle_die',
    'player_god', 'zeus_tile', 'god_advancement_queue',
    'player_island_knowledge', 'card',
];
foreach ($forbidden as $f) {
    check(!in_array($f, $manifest, true), "manifest must not capture $f");
}
```

Run: `php tests/test_undo_state.php`
Expected: `6 passed, 0 failed`.

- [ ] **Step 6: Verify PHP parses**

Run: `php -l modules/php/Game.php`
Expected: `No syntax errors detected`.

- [ ] **Step 7: Commit**

```bash
git add modules/php/Game.php tests/test_undo_state.php
git commit -m "feat(undo): snapshot capture/restore + checkpoint/seal/perform engine"
```
Then merge to master (no-ff) and push.

---

## Task 4: Checkpoint hooks in `PlayerActions`

**Files:**
- Modify: `modules/php/States/PlayerActions.php` (six `#[PossibleAction]` initiators)

**Interfaces:**
- Consumes: `Game::undoCheckpoint(string $label)` (Task 3).

- [ ] **Step 1: Add a checkpoint as the first line of each initiator**

In `PlayerActions.php`, add `$this->game->undoCheckpoint('<label>');` as the
first statement inside each of these methods (labels drive the button text):

- `actSelectDie` → `$this->game->undoCheckpoint(clienttranslate('action'));`
- `actPlayOracleCard` → `$this->game->undoCheckpoint(clienttranslate('play card'));`
- `actPlayWildOracleCard` → `$this->game->undoCheckpoint(clienttranslate('play card'));`
- `actUseGodAbility` → `$this->game->undoCheckpoint(clienttranslate('god ability'));`
- `actActivateEquipment` → `$this->game->undoCheckpoint(clienttranslate('equipment'));`
- `actUseBonusAction` → `$this->game->undoCheckpoint(clienttranslate('bonus action'));`

Example for `actSelectDie` (line ~172):

```php
    public function actSelectDie(int $die_index, int $activePlayerId) {
        $this->game->undoCheckpoint(clienttranslate('action'));
        // ... existing body unchanged ...
```

Rationale: the checkpoint is taken before the source is committed, so undo
restores to "die un-spent, ship back". Red actions (explore/fight) will call
`sealUndo()` downstream (Task 5), which locks this checkpoint so undo is
never offered for them.

- [ ] **Step 2: Verify PHP parses**

Run: `php -l modules/php/States/PlayerActions.php`
Expected: `No syntax errors detected`.

- [ ] **Step 3: Commit**

```bash
git add modules/php/States/PlayerActions.php
git commit -m "feat(undo): checkpoint at the six PlayerActions initiators"
```
Then merge to master (no-ff) and push.

---

## Task 5: Seal-site audit

**Files:**
- Modify: `ExploreIsland.php`, `SelectAction.php`, `CombatRound.php`, `CombatVictory.php`, `SelectReward.php`, `ConsultOracle.php` (all under `modules/php/States/`)

**Interfaces:**
- Consumes: `Game::sealUndo()` (Task 3).

- [ ] **Step 1: Seal on reveal — `ExploreIsland::onEnteringState`**

As the first statement of `ExploreIsland::onEnteringState` (line ~18), add:

```php
        $this->game->sealUndo();  // island reveal is a hard commit
```

This covers both normal explore and Artemis free-explore (both route here).

- [ ] **Step 2: Seal on reveal/draw — `SelectAction`**

In `SelectAction::actLookAtIslands` (line ~797) and `SelectAction::actDrawOracleCard`
(line ~771), add as the first statement of each:

```php
        $this->game->sealUndo();  // reveal / draw is a hard commit
```

- [ ] **Step 3: Seal on roll — `CombatRound`**

Immediately after the `bga_rand` roll in `CombatRound` (line ~40, right after
`$this->game->globals->set('combat_roll', $roll);`), add:

```php
        $this->game->sealUndo();  // random roll is a hard commit
```

- [ ] **Step 4: Seal on reward-pick — `CombatVictory` + `SelectReward`**

In `CombatVictory::actSelectEquipment` (the equipment-pick action), add as the
first statement:

```php
        $this->game->sealUndo();  // equipment reward committed
```

In `SelectReward::selectCompanion` (line ~86), add as the first statement:

```php
        $this->game->sealUndo();  // companion reward committed
```

- [ ] **Step 5: Clear the slot at turn end — `ConsultOracle::onEnteringState`**

As the first statement of `ConsultOracle::onEnteringState` (line ~14), add:

```php
        $this->game->sealUndo();  // turn boundary: no undo across the dice re-roll
```

- [ ] **Step 6: Audit revealing equipment activations**

Open `Game.php` around the equipment-activation dispatch (search
`equipment_post_activation_state`, `eq13_card_id`, `look_and_explore`). For
each one-time/permanent equipment whose effect reveals a tile or draws a card
(card 013 `look_and_explore` is the known case; check `big_bonus` (007) which
only advances gods = no seal), add `$this->sealUndo();` at the point the
reveal/draw happens. List each card id touched in the commit message.

- [ ] **Step 7: Verify all touched files parse**

Run: `for f in ExploreIsland SelectAction CombatRound CombatVictory SelectReward ConsultOracle; do php -l modules/php/States/$f.php; done && php -l modules/php/Game.php`
Expected: `No syntax errors detected` for each.

- [ ] **Step 8: Commit**

```bash
git add modules/php/States/ExploreIsland.php modules/php/States/SelectAction.php modules/php/States/CombatRound.php modules/php/States/CombatVictory.php modules/php/States/SelectReward.php modules/php/States/ConsultOracle.php modules/php/Game.php
git commit -m "feat(undo): seal the reveal/draw/roll/reward-pick/turn-end sites"
```
Then merge to master (no-ff) and push.

---

## Task 6: `UndoableState` trait + `actUndo` on the three offering states

**Files:**
- Create: `modules/php/States/UndoableState.php`
- Modify: `PlayerActions.php`, `CombatVictory.php`, `SelectReward.php` (`use UndoableState;` + merge args)

**Interfaces:**
- Consumes: `Game::undoAvailable()`, `Game::performUndo()` (Task 3).
- Produces: `actUndo(int $activePlayerId): string` on each of the three states; `undoArgs(): array` returning `['undoAvailable' => bool, 'undoActionLabel' => ?string]` for merging into `getArgs`.

- [ ] **Step 1: Create the trait**

Create `modules/php/States/UndoableState.php`:

```php
<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphi\States;

use Bga\GameFramework\States\PossibleAction;

/**
 * Mixed into every state that can OFFER undo: the hub (PlayerActions) after a
 * clean action returns, and the two amber pickers (CombatVictory, SelectReward)
 * before the reward is committed. actUndo simply delegates to the engine, which
 * restores the single snapshot and routes back to PlayerActions.
 */
trait UndoableState
{
    #[PossibleAction]
    public function actUndo(int $activePlayerId): string
    {
        return $this->game->performUndo();
    }

    /** Merge into a state's getArgs() return so the client can show the button. */
    protected function undoArgs(): array
    {
        return [
            'undoAvailable'   => $this->game->undoAvailable(),
            'undoActionLabel' => $this->game->undoAvailable()
                ? $this->game->getUniqueValueFromDB("SELECT action_label FROM undo_snapshot WHERE id = 1")
                : null,
        ];
    }
}
```

- [ ] **Step 2: Wire the trait into `PlayerActions`**

In `PlayerActions.php`, add `use UndoableState;` inside the class body (top),
and merge `undoArgs()` into the `getArgs()` return array:

```php
        return array_merge([
            // ... existing PlayerActions args ...
        ], $this->undoArgs());
```

- [ ] **Step 3: Wire the trait into `CombatVictory` and `SelectReward`**

Same two edits (`use UndoableState;` + `array_merge(..., $this->undoArgs())`
in `getArgs`) for `CombatVictory.php` and `SelectReward.php`.

- [ ] **Step 4: Verify PHP parses**

Run: `for f in UndoableState PlayerActions CombatVictory SelectReward; do php -l modules/php/States/$f.php; done`
Expected: `No syntax errors detected` for each.

- [ ] **Step 5: Commit**

```bash
git add modules/php/States/UndoableState.php modules/php/States/PlayerActions.php modules/php/States/CombatVictory.php modules/php/States/SelectReward.php
git commit -m "feat(undo): UndoableState trait + actUndo on hub and amber pickers"
```
Then merge to master (no-ff) and push.

---

## Task 7: Client — restore notification, dynamic re-render, and the Undo button

**Files:**
- Modify: `theoracleofdelphi.js` (`setupNotifications` ~8181, `onUpdateActionButtons`, add `notif_undoRestore` + `applyDynamicState`, cache-bust bump)

**Interfaces:**
- Consumes: `undoRestore` notification `{player_id, state}` (Task 3); `undoAvailable`/`undoActionLabel` state args (Task 6).
- Produces: server action `actUndo` invoked via `bgaPerformAction`.

- [ ] **Step 1: Discovery — list the per-section renderers to call**

The notif handlers already contain the in-place renderers. Grep and record the
function bodies to reuse (do not re-run `setup()`, which builds static scaffold):
Run: `grep -n "notif_shipMoved\|notif_loadCargo\|notif_favorTokensChanged\|notif_islandRevealed\|notif_diceRolled\|deckSizes\|notif_godAdvanced\|notif_consultOracle" theoracleofdelphi.js`
For each, note the DOM-update calls (ship placement, cargo tokens, favor panel,
hex reveal, dice faces, deck strip, god tracks). `applyDynamicState` calls the
same helpers after overwriting `this.gamedatas` subtrees.

- [ ] **Step 2: Register the notification**

In `setupNotifications` (line ~8181), add:

```javascript
            dojo.subscribe('undoRestore', this, 'notif_undoRestore');
            this.notifqueue.setSynchronous('undoRestore', 500);
```

- [ ] **Step 3: Implement `notif_undoRestore` + `applyDynamicState`**

Add these methods (near the other `notif_` handlers):

```javascript
        notif_undoRestore: async function(args) {
            // Full-state snap-back. Overwrite dynamic gamedatas from the
            // server payload, then re-run the in-place section renderers.
            this.gamedatas = Object.assign(this.gamedatas || {}, args.state);
            this.applyDynamicState(this.gamedatas);
        },

        applyDynamicState: function(gamedatas) {
            // Re-render dynamic pieces only (never the static board scaffold).
            // Each call mirrors the corresponding notif_* handler's DOM update.
            this._renderAllShips(gamedatas);        // from notif_shipMoved body
            this._renderAllCargo(gamedatas);        // from notif_loadCargo / deliver
            this._renderAllOracleDice(gamedatas);   // from notif_diceRolled body
            this._renderAllFavor(gamedatas);        // from notif_favorTokensChanged
            this._renderAllGodTracks(gamedatas);    // from god-advance renderer
            this._renderRevealedHexes(gamedatas);   // from notif_islandRevealed
            this._renderDeckStrip(gamedatas);       // deckSizes updater (~2524)
            this._renderAllHands(gamedatas);        // oracle/equipment/companion hands
        },
```

Note: the `_renderAll*` names above are TARGETS to create in this step by
extracting the DOM-update bodies identified in Step 1 into named helpers that
BOTH `setup()`/`notif_*` and `applyDynamicState` call. Extract one helper per
line, keeping each handler calling the new helper so behaviour is unchanged.
Do not invent behaviour; move existing code. If a section has no discrete
renderer yet, wrap its existing inline update into a helper of the listed name.

- [ ] **Step 4: Add the Undo button**

In `onUpdateActionButtons` (search the function; it dispatches on
`stateName`), add, for every state that merges `undoArgs` (`PlayerActions`,
`CombatVictory`, `SelectReward`):

```javascript
            if (args && args.undoAvailable) {
                var undoLabel = args.undoActionLabel
                    ? dojo.string.substitute(_('Undo ${a}'), { a: _(args.undoActionLabel) })
                    : _('Undo');
                this.statusBar.addActionButton(undoLabel, () => {
                    this.bgaPerformAction('actUndo', {});
                }, { color: 'secondary' });
            }
```

- [ ] **Step 5: Cache-bust bump**

Bump `JS_VERSION` and all six `?v<NNN>` `define([...])` URLs in
`theoracleofdelphi.js` to the next integer (repo `CLAUDE.md` rule).

- [ ] **Step 6: Verify JS parses**

Run: `node --check theoracleofdelphi.js`
Expected: no output (exit 0).

- [ ] **Step 7: Commit**

```bash
git add theoracleofdelphi.js
git commit -m "feat(undo): client restore notif, applyDynamicState, undo button"
```
Then merge to master (no-ff) and push.

---

## Task 8: End-to-end verification (Studio)

**Files:** none (manual/scripted playthrough in BGA Studio). This is the
integration gate the standalone harness cannot cover; run every row.

**Interfaces:** exercises the whole feature.

- [ ] **Step 1: Green undo restores fully**

Move ship (green). Confirm an "Undo action" button appears. Click it.
Expected: ship snaps back to origin, the die returns to the pool unused, and
the button disappears. Opponent clients also show the ship back.

- [ ] **Step 2: Red action seals**

Explore an island (red). Expected: no Undo button after the reveal. Repeat for
draw oracle card, look at islands, and a regular monster fight (dice roll).

- [ ] **Step 3: Depth-1, no chaining**

Move ship, then load a statue (two greens). Undo once.
Expected: only the load reverts; the button then disappears (cannot undo the
move). Take a new action to re-arm undo.

- [ ] **Step 4: Amber — Ares**

Use Ares to auto-defeat a monster. In the equipment picker, confirm the Undo
button is present; click it.
Expected: the monster is un-defeated, the god/die restored. Redo Ares, then
PICK an equipment card. Expected: undo gone.

- [ ] **Step 5: Amber — raise statue**

Raise a statue. In the companion picker, confirm Undo is present; click it.
Expected: statue back on the ship, die restored. Redo, then pick a companion.
Expected: undo gone.

- [ ] **Step 6: Client parity**

After any undo, hard-reload the page (fresh `getAllDatas` render). Expected:
the board looks identical to the post-undo `applyDynamicState` render (ship,
cargo, dice, favor, gods, decks, revealed hexes all match). Any mismatch means
a `_renderAll*` helper missed a section — fix and re-run.

- [ ] **Step 7: Alpha migration**

Load a game created BEFORE this feature (or one where `undo_snapshot` was
dropped). Expected: no 500; the game plays normally; the Undo button simply
does not appear until the migration runs, after which it works.

- [ ] **Step 8: Commit (docs only, if any notes captured)**

If verification surfaced fixes, they were committed in their own task above.
No code change here unless a parity fix was needed.

---

## Self-Review Notes (author)

- **Spec coverage:** the one rule (4 seals) → Task 5; taxonomy green/amber/red
  → Tasks 4/5/6 + verification Task 8; depth-1 single slot → Tasks 1/3;
  full-state snapshot → Tasks 2/3; instant snap-back → Task 7; schema migration
  + defensive read → Tasks 1/3; UX button/no-confirm → Task 7; coexistence with
  cancel → unchanged existing `actCancelDieSelection` (no task needed);
  edge cases (zombie, opponents, turn boundary, stats) → Tasks 3/5 + Task 8.
- **Known discovery points (not placeholders, explicit Studio confirmations):**
  globals table name (Task 3 Step 1), `stats` column names (Task 3 Step 3),
  the per-section renderer names (Task 7 Step 1), revealing-equipment card ids
  (Task 5 Step 6).
- **Type consistency:** `undoCheckpoint(string)`, `sealUndo()`,
  `undoAvailable(): bool`, `performUndo(): string`, `captureUndoState(): array`,
  `restoreUndoState(array)`, `UndoState::encode/decode` used identically across
  Tasks 2/3/6.
- **Risk R1 (client reentrancy):** mitigated by Task 7 Step 3 (extract shared
  helpers, never re-run setup) and Task 8 Step 6 (parity check).
