# Board Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture a versioned 32-bit board-generation seed at game setup, persist it via BGA globals, report it as a table stat, and provide a PHP CLI to reproduce any board from its seed — so debugging, replay, and player visibility are all served from one identifier.

**Architecture:** Add a small Mulberry32 `SeededRandom` PRNG class and a `BoardSeed` encode/decode helper. At `setupNewGame`, generate a 31-bit seed via `bga_rand`, construct `SeededRandom`, feed it into `BoardGenerator`'s existing `randFn` constructor slot, then persist (BGA globals) + report (stats). Old games predate the feature and read seed=0; the regen script refuses on version mismatch. JS unchanged — gameplay is server-authoritative.

**Tech Stack:** PHP 8 (server-side), plain-PHP test runner (`tests/test_board_generator.php`), BGA framework (`bga_rand`, `initGameStateLabels`, `setGameStateValue`, `statInc`).

**Spec:** [docs/superpowers/specs/2026-04-30-board-seed-design.md](../specs/2026-04-30-board-seed-design.md)

---

## File structure

**Created:**
- `modules/php/SeededRandom.php` — Mulberry32 PRNG class.
- `modules/php/BoardSeed.php` — Static `encode`/`decode` Crockford-base32 helpers.
- `tests/regenerate_board.php` — CLI tool for reproducing a board from a seed.

**Modified:**
- `modules/php/BoardGenerator.php` — Add one public constant `ALGORITHM_VERSION = 1`. No other code changes.
- `modules/php/Game.php` — Two-line edit in `__construct` (register globals labels) and ~6-line edit in `setupNewGame` (generate seed → seed RNG → persist → stat).
- `stats.json` — Add 2 table stats.
- `tests/test_board_generator.php` — Append unit tests for `SeededRandom`, `BoardSeed`, seeded-board determinism, and seed sensitivity.

**Untouched:** `modules/js/BoardBuilder.js`, `BoardRenderer.js`, the TPL, the CSS, all other PHP modules.

---

## Task 1: `SeededRandom` PRNG class

Smallest possible foothold. Pure class, instance-scoped state, deterministic across PHP versions.

**Files:**
- Create: `modules/php/SeededRandom.php`
- Test: `tests/test_board_generator.php` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_board_generator.php` (after the existing test sections, before the final summary):

```php
// =============================================
// Test: SeededRandom
// =============================================
echo "\n=== SeededRandom ===\n";

require_once(__DIR__ . '/../modules/php/SeededRandom.php');

// Determinism: two instances with the same seed produce the same sequence.
$rng1 = new SeededRandom(424242);
$rng2 = new SeededRandom(424242);
$seq1 = [];
$seq2 = [];
for ($i = 0; $i < 100; $i++) {
    $seq1[] = $rng1->rand(0, 1000);
    $seq2[] = $rng2->rand(0, 1000);
}
assert_true($seq1 === $seq2, 'same seed produces identical 100-element sequence');

// Range: rand(0, N) stays within [0, N] inclusive.
$rng3 = new SeededRandom(7);
$inRange = true;
for ($i = 0; $i < 200; $i++) {
    $v = $rng3->rand(0, 9);
    if ($v < 0 || $v > 9) { $inRange = false; break; }
}
assert_true($inRange, 'rand(0, 9) always returns a value in [0, 9]');

// Different seeds produce different first values (high probability).
$rng4 = new SeededRandom(1);
$rng5 = new SeededRandom(2);
assert_true($rng4->rand(0, 1000000) !== $rng5->rand(0, 1000000),
            'seeds 1 and 2 produce different first values');
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pwd  # confirm /Users/georgetzavelas/src/theoracleofdelphigzed/.claude/worktrees/zealous-panini-0aadb3
git branch --show-current  # confirm claude/zealous-panini-0aadb3
php tests/test_board_generator.php
```

Expected: FAIL — `require_once` errors with "Failed opening required `.../SeededRandom.php`".

- [ ] **Step 3: Create the class**

Create `modules/php/SeededRandom.php`:

```php
<?php
/**
 * SeededRandom.php — Deterministic PRNG for reproducible board generation.
 *
 * Mulberry32 algorithm. Instance-scoped state — does NOT touch global mt_srand.
 * Used by BoardGenerator when a fixed seed is needed (debug, replay, tests).
 */

class SeededRandom
{
    private int $state;

    public function __construct(int $seed)
    {
        $this->state = $seed & 0xFFFFFFFF;
    }

    /**
     * Returns an int uniformly in [$min, $max] inclusive.
     */
    public function rand(int $min, int $max): int
    {
        $this->state = ($this->state + 0x6D2B79F5) & 0xFFFFFFFF;
        $t = $this->state;
        $t = (($t ^ ($t >> 15)) * ($t | 1)) & 0xFFFFFFFF;
        $t ^= ($t + (($t ^ ($t >> 7)) * ($t | 61))) & 0xFFFFFFFF;
        $t = ($t ^ ($t >> 14)) & 0xFFFFFFFF;
        return $min + ($t % ($max - $min + 1));
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
php tests/test_board_generator.php
```

Expected: PASS — three new PASS lines for `SeededRandom`. All prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add modules/php/SeededRandom.php tests/test_board_generator.php
git commit -m "feat(board-gen): add SeededRandom PRNG for deterministic board generation"
```

- [ ] **Step 6: Merge to master**

```bash
cd /Users/georgetzavelas/src/theoracleofdelphigzed
git merge --no-ff claude/zealous-panini-0aadb3 -m "Merge branch 'claude/zealous-panini-0aadb3'"
```

Then `cd` back to the worktree path.

---

## Task 2: `BoardSeed` encode/decode

Static encode/decode between 32-bit ints and `v{version}-XXXX-XXX` Crockford base32.

**Files:**
- Create: `modules/php/BoardSeed.php`
- Test: `tests/test_board_generator.php` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_board_generator.php`:

```php
// =============================================
// Test: BoardSeed encode/decode
// =============================================
echo "\n=== BoardSeed ===\n";

require_once(__DIR__ . '/../modules/php/BoardSeed.php');

// Roundtrip: encode then decode returns the original
$seeds = [0, 1, 12345, 424242, 2147483647];
foreach ($seeds as $seed) {
    $encoded = BoardSeed::encode($seed, 1);
    $decoded = BoardSeed::decode($encoded);
    assert_true(
        $decoded !== null && $decoded['seed'] === $seed && $decoded['version'] === 1,
        "roundtrip seed=$seed version=1 (encoded as $encoded)"
    );
}

// Encoded format: v1-XXXX-XXX (11 chars, dashes at positions 2 and 7)
$enc = BoardSeed::encode(424242, 1);
assert_true(strlen($enc) === 11, "encoded length is 11 (got $enc, len=" . strlen($enc) . ")");
assert_true($enc[0] === 'v' && $enc[1] === '1' && $enc[2] === '-' && $enc[7] === '-',
            "encoded format v1-XXXX-XXX (got $enc)");

// Version captured: encoded with version=2 returns version=2 on decode
$enc2 = BoardSeed::encode(424242, 2);
$dec2 = BoardSeed::decode($enc2);
assert_true($dec2 !== null && $dec2['version'] === 2, "version 2 is encoded/decoded correctly");

// Decoder accepts lowercase
$decLower = BoardSeed::decode(strtolower(BoardSeed::encode(12345, 1)));
assert_true($decLower !== null && $decLower['seed'] === 12345, 'decoder accepts lowercase input');

// Decoder accepts missing second dash
$noDash = str_replace('-', '', substr(BoardSeed::encode(12345, 1), 3));  // "XXXXXXX"
$decNoDash = BoardSeed::decode("v1-" . $noDash);
assert_true($decNoDash !== null && $decNoDash['seed'] === 12345, 'decoder accepts missing second dash');

// Malformed inputs return null
$malformed = [
    '',
    'not-a-seed',
    'v1-K7F3',          // too short
    'v1-K7F3-9DRA',     // too long
    'K7F3-9DR',          // missing version prefix
    'v1-IIII-OOO',       // alphabet violations (I and O are excluded)
];
foreach ($malformed as $bad) {
    assert_true(BoardSeed::decode($bad) === null, "decoder rejects malformed input: '$bad'");
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php tests/test_board_generator.php
```

Expected: FAIL — `require_once` error (`BoardSeed.php` does not exist).

- [ ] **Step 3: Create the class**

Create `modules/php/BoardSeed.php`:

```php
<?php
/**
 * BoardSeed.php — Encode/decode between 32-bit board seeds and a human-friendly
 * Crockford base32 string of the form 'v{version}-XXXX-XXX'.
 *
 * Crockford alphabet (no I, L, O, U) prevents transcription confusion.
 * The decoder is permissive: case-insensitive, optional second dash.
 */

class BoardSeed
{
    private const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

    public static function encode(int $seed, int $version): string
    {
        $seed = $seed & 0xFFFFFFFF;
        $chars = '';
        for ($i = 0; $i < 7; $i++) {
            $chars .= self::ALPHABET[$seed & 0x1F];
            $seed >>= 5;
        }
        return "v{$version}-" . substr($chars, 0, 4) . '-' . substr($chars, 4);
    }

    /**
     * @return array{seed: int, version: int}|null  null on malformed input.
     */
    public static function decode(string $encoded): ?array
    {
        if (!preg_match('/^v(\d+)-?([0-9A-Z]{4})-?([0-9A-Z]{3})$/i', $encoded, $m)) {
            return null;
        }
        $version = (int)$m[1];
        $body = strtoupper($m[2] . $m[3]);
        $seed = 0;
        for ($i = 6; $i >= 0; $i--) {
            $idx = strpos(self::ALPHABET, $body[$i]);
            if ($idx === false) {
                return null;
            }
            $seed = ($seed << 5) | $idx;
        }
        return ['seed' => $seed, 'version' => $version];
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
php tests/test_board_generator.php
```

Expected: PASS — all new BoardSeed assertions (~13) pass. All prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add modules/php/BoardSeed.php tests/test_board_generator.php
git commit -m "feat(board-gen): add BoardSeed Crockford base32 encode/decode"
```

- [ ] **Step 6: Merge to master**

```bash
cd /Users/georgetzavelas/src/theoracleofdelphigzed
git merge --no-ff claude/zealous-panini-0aadb3 -m "Merge branch 'claude/zealous-panini-0aadb3'"
```

Then `cd` back to the worktree path.

---

## Task 3: `ALGORITHM_VERSION` constant + seeded-board determinism

Verify that `SeededRandom` plugged into `BoardGenerator`'s existing `randFn` slot produces deterministic boards. This is the load-bearing assertion for the whole feature — if it ever fails, the seed concept is broken.

**Files:**
- Modify: `modules/php/BoardGenerator.php` (add one constant near the class top, around line 17)
- Test: `tests/test_board_generator.php` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_board_generator.php`:

```php
// =============================================
// Test: ALGORITHM_VERSION constant exists
// =============================================
echo "\n=== ALGORITHM_VERSION ===\n";

assert_true(defined('BoardGenerator::ALGORITHM_VERSION'),
            'BoardGenerator::ALGORITHM_VERSION is defined');
assert_true(is_int(BoardGenerator::ALGORITHM_VERSION),
            'ALGORITHM_VERSION is an int');
assert_true(BoardGenerator::ALGORITHM_VERSION >= 1,
            'ALGORITHM_VERSION is at least 1');

// =============================================
// Test: Seeded board determinism
// =============================================
echo "\n=== Seeded board determinism ===\n";

$rng1 = new SeededRandom(424242);
$rng2 = new SeededRandom(424242);
$g1 = new BoardGenerator(['randFn' => [$rng1, 'rand']]);
$g2 = new BoardGenerator(['randFn' => [$rng2, 'rand']]);
$r1 = $g1->generate();
$r2 = $g2->generate();

assert_true($r1['valid'] && $r2['valid'], 'both seeded generations succeed');
assert_true(json_encode($r1['hexes']) === json_encode($r2['hexes']),
            'same seed produces identical hex layout');
assert_true(json_encode($r1['clusters']) === json_encode($r2['clusters']),
            'same seed produces identical cluster placements');
assert_true(json_encode($r1['zeusPosition']) === json_encode($r2['zeusPosition']),
            'same seed produces identical Zeus position');

// =============================================
// Test: Seed sensitivity (different seeds -> different boards)
// =============================================
echo "\n=== Seed sensitivity ===\n";

$rng3 = new SeededRandom(424242);
$rng4 = new SeededRandom(424243);
$g3 = new BoardGenerator(['randFn' => [$rng3, 'rand']]);
$g4 = new BoardGenerator(['randFn' => [$rng4, 'rand']]);
$r3 = $g3->generate();
$r4 = $g4->generate();

assert_true($r3['valid'] && $r4['valid'], 'both differently-seeded generations succeed');
assert_true(json_encode($r3['hexes']) !== json_encode($r4['hexes']),
            'seeds 424242 and 424243 produce different hex layouts');
```

- [ ] **Step 2: Run test to verify it fails**

```bash
php tests/test_board_generator.php
```

Expected: FAIL — first failure on `BoardGenerator::ALGORITHM_VERSION` (undefined). The determinism tests may also fail if reached; both will be addressed in Step 3.

- [ ] **Step 3: Add the constant**

Open `modules/php/BoardGenerator.php`. Find the line `class BoardGenerator` (around line 16) — directly inside the class body. The first existing constants are `HEX_WIDTH_PX` etc. Add this constant *before* them (immediately after the opening `{` of the class):

```php
    /** Bumps when packing algorithm changes meaningfully (e.g., bias tuning). */
    public const ALGORITHM_VERSION = 1;
```

Place it as the very first line inside the class body so it's visible at the top.

- [ ] **Step 4: Run test to verify it passes**

```bash
php tests/test_board_generator.php
```

Expected: PASS — `ALGORITHM_VERSION` checks pass; the determinism + sensitivity tests also pass because `SeededRandom` plugs straight into `BoardGenerator`'s existing `randFn` slot.

If determinism tests fail despite the constant being added: the most likely cause is a non-deterministic source somewhere in `BoardGenerator` that doesn't go through `randFn`. Search for `bga_rand` or `mt_rand` calls inside `BoardGenerator.php` — there should be none (the file was designed to flow all randomness through `randFn`). If you find one, that's the bug; replace with `$this->rand(...)`.

- [ ] **Step 5: Commit**

```bash
git add modules/php/BoardGenerator.php tests/test_board_generator.php
git commit -m "feat(board-gen): add ALGORITHM_VERSION constant; verify seeded determinism"
```

- [ ] **Step 6: Merge to master**

```bash
cd /Users/georgetzavelas/src/theoracleofdelphigzed
git merge --no-ff claude/zealous-panini-0aadb3 -m "Merge branch 'claude/zealous-panini-0aadb3'"
```

Then `cd` back to the worktree path.

---

## Task 4: Game.php integration — globals + setupNewGame + stats

Wire seeded generation into the actual game setup. Register BGA globals labels, generate the seed, pass it to `BoardGenerator`, persist the seed/version, and report them as table stats.

**Files:**
- Modify: `modules/php/Game.php` (`__construct` ~line 35; `setupNewGame` ~line 2124)
- Modify: `stats.json`

**Note:** This task does NOT have a TDD test cycle for the integration itself — `setupNewGame` runs inside the BGA framework and isn't unit-testable from a CLI. The unit-level coverage from Tasks 1–3 (PRNG determinism, board determinism) gives the load-bearing guarantee; Task 5's regeneration script gives a manual end-to-end check.

- [ ] **Step 1: Register globals labels in `__construct`**

Open `modules/php/Game.php`. Find the constructor (around line 35):

```php
    public function __construct()
    {
        parent::__construct();
        $this->initGameStateLabels([]); // mandatory, even if the array is empty
    }
```

Replace the `$this->initGameStateLabels([])` line with:

```php
        $this->initGameStateLabels([
            'board_seed_decimal' => 20,
            'board_algorithm_version' => 21,
        ]);
```

- [ ] **Step 2: Add the stats to `stats.json`**

Open `stats.json`. Find the `"table"` section. Currently:

```json
"table": {
    "rounds_played": {
        "id": 10,
        "name": "Rounds played",
        "type": "int"
    }
},
```

Replace with:

```json
"table": {
    "rounds_played": {
        "id": 10,
        "name": "Rounds played",
        "type": "int"
    },
    "board_seed_decimal": {
        "id": 11,
        "name": "Board seed",
        "type": "int"
    },
    "board_algorithm_version": {
        "id": 12,
        "name": "Board algorithm version",
        "type": "int"
    }
},
```

- [ ] **Step 3: Wire seeded generation into `setupNewGame`**

Open `modules/php/Game.php`. Find `setupNewGame` (around line 2047). Within it, find the existing block that generates the board (around line 2122):

```php
        // Generate the game board
        require_once(__DIR__ . '/BoardGenerator.php');
        $generator = new \BoardGenerator();
        $result = $generator->generate();

        if (!$result['valid']) {
            throw new \BgaSystemException('Board generation failed');
        }
```

Replace with:

```php
        // Generate the game board (with seeded RNG for replay support)
        require_once(__DIR__ . '/BoardGenerator.php');
        require_once(__DIR__ . '/SeededRandom.php');
        $boardSeed = (int)bga_rand(0, 2147483647);
        $rng = new \SeededRandom($boardSeed);
        $generator = new \BoardGenerator(['randFn' => [$rng, 'rand']]);
        $result = $generator->generate();

        if (!$result['valid']) {
            throw new \BgaSystemException('Board generation failed');
        }

        // Persist the seed and algorithm version for stats and replay.
        $this->setGameStateValue('board_seed_decimal', $boardSeed);
        $this->setGameStateValue('board_algorithm_version', \BoardGenerator::ALGORITHM_VERSION);
        $this->statInc($boardSeed, 'board_seed_decimal');
        $this->statInc(\BoardGenerator::ALGORITHM_VERSION, 'board_algorithm_version');
```

- [ ] **Step 4: Lint check — verify the file still parses**

```bash
php -l modules/php/Game.php
```

Expected: `No syntax errors detected in modules/php/Game.php`.

- [ ] **Step 5: Run the existing test suite to confirm no regressions**

```bash
php tests/test_board_generator.php
php tests/test_player_panel_data.php
```

Expected: both report `Failed: 0`. The existing tests don't exercise `setupNewGame` directly (it requires the BGA harness), but they do exercise `BoardGenerator` and other helpers, so this is a sanity check.

- [ ] **Step 6: Commit**

```bash
git add modules/php/Game.php stats.json
git commit -m "feat(board-gen): persist board seed via BGA globals + stats"
```

- [ ] **Step 7: Merge to master**

```bash
cd /Users/georgetzavelas/src/theoracleofdelphigzed
git merge --no-ff claude/zealous-panini-0aadb3 -m "Merge branch 'claude/zealous-panini-0aadb3'"
```

Then `cd` back to the worktree path.

---

## Task 5: Regeneration CLI script

Dev tool that takes a seed (decimal or encoded), reproduces the board, and prints placements. The end-to-end manual check for Task 4's integration.

**Files:**
- Create: `tests/regenerate_board.php`

- [ ] **Step 1: Create the script**

Create `tests/regenerate_board.php`:

```php
<?php
/**
 * regenerate_board.php — Reproduce a board from a seed.
 *
 * Usage:
 *   php tests/regenerate_board.php <seed>
 *
 * <seed> is either a decimal integer or an encoded form like 'v1-K7F3-9DR'.
 * Refuses on algorithm-version mismatch with current code.
 */

require_once(__DIR__ . '/../modules/php/SeededRandom.php');
require_once(__DIR__ . '/../modules/php/BoardSeed.php');
require_once(__DIR__ . '/../modules/php/BoardGenerator.php');

if ($argc < 2) {
    fwrite(STDERR, "Usage: php tests/regenerate_board.php <seed>\n");
    fwrite(STDERR, "  <seed> = decimal int or encoded form like 'v1-K7F3-9DR'\n");
    exit(1);
}

$input = $argv[1];

if (preg_match('/^v\d+/i', $input)) {
    $parsed = BoardSeed::decode($input);
    if ($parsed === null) {
        fwrite(STDERR, "ERROR: invalid encoded seed: $input\n");
        exit(2);
    }
    $seed = $parsed['seed'];
    $version = $parsed['version'];
} else {
    $seed = (int)$input;
    $version = BoardGenerator::ALGORITHM_VERSION;
}

if ($version !== BoardGenerator::ALGORITHM_VERSION) {
    fwrite(STDERR, "ERROR: seed is for algorithm v{$version}; current is v"
                 . BoardGenerator::ALGORITHM_VERSION . ".\n");
    fwrite(STDERR, "       Old seeds cannot be reproduced against the current algorithm.\n");
    exit(3);
}

$rng = new SeededRandom($seed);
$generator = new BoardGenerator(['randFn' => [$rng, 'rand']]);
$result = $generator->generate();

if (!$result['valid']) {
    fwrite(STDERR, "ERROR: generation failed for seed $seed after {$result['attempts']} attempts.\n");
    exit(4);
}

echo "Seed: $seed\n";
echo "Encoded: " . BoardSeed::encode($seed, $version) . "\n";
echo "Algorithm version: $version\n";
echo "Hexes: " . count($result['hexes']) . "\n";
echo "Cluster placements:\n";
foreach ($result['clusters'] as $i => $p) {
    printf("  [%2d] %-14s anchor=(%2d,%2d) rot=%d\n",
        $i, $p['cluster']['id'], $p['anchorQ'], $p['anchorR'], $p['rotation']);
}
$z = $result['zeusPosition'];
echo "Zeus: ({$z['q']}, {$z['r']})\n";
```

- [ ] **Step 2: Smoke test — decimal seed**

```bash
php tests/regenerate_board.php 424242
```

Expected output (exact placements may vary by algorithm — this is what the test verifies):
- Lines: `Seed: 424242`, `Encoded: v1-XXXX-XXX`, `Algorithm version: 1`, `Hexes: 120`, then 12 cluster placement lines, then `Zeus: (q, r)`.
- Exit code 0.

- [ ] **Step 3: Smoke test — encoded seed roundtrip**

Capture the encoded form from Step 2's output (the `Encoded:` line). Re-run with the encoded form:

```bash
php tests/regenerate_board.php v1-XXXX-XXX  # use whatever Step 2 printed
```

Expected: identical output to Step 2 (same seed → same board).

- [ ] **Step 4: Smoke test — version mismatch refused**

Try a v999 seed string:

```bash
php tests/regenerate_board.php v999-K7F3-9DR
```

Expected: ERROR message about version mismatch, exit code 3.

- [ ] **Step 5: Smoke test — malformed input refused**

```bash
php tests/regenerate_board.php "not-a-seed-format"
```

Expected: this is treated as decimal, becomes `(int)"not-a-seed-format" = 0`, generator may run with seed=0. Note: this is a known limitation — only the `v...` prefix activates the encoded-seed code path. Decimals are accepted as-is. If you want stricter rejection of arbitrary strings, the script could be tightened in a follow-up, but it's not in scope here.

- [ ] **Step 6: Commit**

```bash
git add tests/regenerate_board.php
git commit -m "feat(board-gen): add regenerate_board.php CLI for seed-based replay"
```

- [ ] **Step 7: Merge to master**

```bash
cd /Users/georgetzavelas/src/theoracleofdelphigzed
git merge --no-ff claude/zealous-panini-0aadb3 -m "Merge branch 'claude/zealous-panini-0aadb3'"
```

Then `cd` back to the worktree path.

---

## Task 6: Final regression

Run the full PHP test suite end-to-end to confirm nothing regressed.

- [ ] **Step 1: Run all PHP test scripts**

```bash
php tests/test_board_generator.php
php tests/test_distribute_colors.php
php tests/test_material_defs.php
php tests/test_player_panel_data.php
node tests/test_board_builder_js.js
```

Expected: every test prints `Failed: 0` (or `0 failed`). Total assertions should be the previous baseline (840) plus the new ones from Tasks 1–3 (roughly +20 = 860).

- [ ] **Step 2: Sanity-check the regen script one more time**

```bash
php tests/regenerate_board.php 1
php tests/regenerate_board.php 2147483647
```

Expected: both produce valid output with exit code 0 (different boards).

- [ ] **Step 3: No commit needed unless tests were adjusted**

If a test threshold needed adjustment, commit with: `test(board-gen): adjust seed-test thresholds`.

---

## Spec coverage check

| Spec section | Implemented in |
|--------------|----------------|
| `SeededRandom` Mulberry32 PRNG | Task 1 |
| `BoardSeed::encode`/`decode` | Task 2 |
| `BoardGenerator::ALGORITHM_VERSION` constant | Task 3 |
| Seeded-board determinism (load-bearing) | Task 3 (tests) |
| `Game::__construct` `initGameStateLabels` registration (IDs 20, 21) | Task 4 step 1 |
| `Game::setupNewGame` seed generation, RNG construction, BoardGenerator wiring | Task 4 step 3 |
| `setGameStateValue` for seed and version | Task 4 step 3 |
| `statInc` for seed and version (stats IDs 11, 12) | Task 4 step 3 |
| `stats.json` table-stat additions | Task 4 step 2 |
| Regeneration CLI accepts decimal AND encoded seeds | Task 5 |
| Regeneration CLI refuses version mismatch | Task 5 step 4 |
| Backward compat: pre-feature games show seed=0 | No new code; default `getGameStateValue` behavior covers this; UI is out of scope |
| Full regression sweep | Task 6 |

## Spec items intentionally NOT in this plan

- **In-game UI display.** Per spec, no live board display of the seed; BGA's stats panel covers visibility. No TPL/CSS/JS changes.
- **JS reproduction.** Per spec, gameplay is server-authoritative; client-side preview doesn't need seeded reproduction.
- **Seed sharing UI.** Future work — players can read the decimal from the BGA stats panel and pass it to the regen script directly.
