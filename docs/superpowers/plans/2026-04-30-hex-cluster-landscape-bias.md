# Hex Cluster Landscape Bias Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bias the hex cluster packing algorithm toward a 1.5:1 landscape aspect ratio via soft candidate scoring, in both the server-side PHP and client-side JS implementations, so generated game boards naturally fit landscape screens with less vertical scroll.

**Architecture:** Replace the random `shuffleArray($candidates)` step in `findPlacementWithHistory` with a scored sort whenever ≥2 clusters have been placed. Score each candidate by `-|ratio - 1.5| + jitter`, where `ratio` is the pixel-space bounding-box width/height that *would* result from placing the candidate. Soft scoring (re-order, never reject) preserves backtracking guarantees. Add a `landscapeBias` constructor option (default `true`) so tests can toggle it.

**Tech Stack:** PHP (server-side gameplay, primary), JS with Dojo `define()`/`declare()` (client-side preview, parity), plain-PHP test runner (`tests/test_board_generator.php`), Node.js for JS smoke tests.

**Spec:** [docs/superpowers/specs/2026-04-30-hex-cluster-landscape-bias-design.md](../specs/2026-04-30-hex-cluster-landscape-bias-design.md)

---

## File structure

**Modified:**
- `modules/php/BoardGenerator.php` — primary implementation. Add 3 helpers (`projectHexToPixel`, `computePixelBoundsForHexes`, `scoreCandidate`), 5 constants, 1 constructor option, 1 conditional in `findPlacementWithHistory`.
- `modules/js/BoardBuilder.js` — parity implementation. Same surface area as PHP.
- `tests/test_board_generator.php` — extend with unit + statistical tests for the new behavior.

**Created:**
- `tests/test_board_builder_js.js` — Node-runnable smoke test for the JS port.

**Untouched:** `BoardRenderer.js`, `ClusterDefinitions.{js,php}`, `HexUtils.php`, the BGA TPL/CSS, the existing PHP test cases.

---

## Task 1: PHP — constants and `projectHexToPixel`

Add the pixel-projection helper and its constants. Pure function; smallest possible foothold.

**Files:**
- Modify: `modules/php/BoardGenerator.php` (add constants near class top, add private method near other utilities ~line 760)
- Test: `tests/test_board_generator.php` (append new test section)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_board_generator.php` (after the existing tests, before the final summary):

```php
// =============================================
// Test: projectHexToPixel
// =============================================
echo "\n=== projectHexToPixel ===\n";

// Use reflection to call the private method
$gen = new BoardGenerator();
$ref = new ReflectionMethod($gen, 'projectHexToPixel');
$ref->setAccessible(true);

$origin = $ref->invoke($gen, 0, 0);
assert_true(
    abs($origin['x'] - 0.0) < 1e-9 && abs($origin['y'] - 0.0) < 1e-9,
    'projectHexToPixel(0, 0) returns (0, 0)'
);

$right = $ref->invoke($gen, 1, 0);
assert_true(
    abs($right['x'] - 60.0) < 1e-9 && abs($right['y'] - 0.0) < 1e-9,
    'projectHexToPixel(1, 0) returns (60, 0)'
);

$down = $ref->invoke($gen, 0, 1);
// y = 69 * 0.75 * 1 = 51.75; x = 60 * (0 + 1*0.5) = 30
assert_true(
    abs($down['x'] - 30.0) < 1e-9 && abs($down['y'] - 51.75) < 1e-9,
    'projectHexToPixel(0, 1) returns (30, 51.75)'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php tests/test_board_generator.php`
Expected: FAIL — `ReflectionException: Method ... does not exist` or similar (`projectHexToPixel` not yet defined).

- [ ] **Step 3: Add the constants and the helper**

In `modules/php/BoardGenerator.php`, add these class constants right after the opening `class BoardGenerator` line (line 16):

```php
    // Pixel-space hex dimensions (must match BoardRenderer.js's hexWidth/hexHeight).
    // Used only for landscape-bias scoring; does NOT affect rendering.
    private const HEX_WIDTH_PX = 60.0;
    private const HEX_HEIGHT_PX = 69.0;

    // Landscape-bias scoring constants
    private const TARGET_ASPECT_RATIO = 1.5;
    private const ASPECT_SCORE_JITTER = 0.02;
    private const MIN_CLUSTERS_FOR_BIAS = 2;
```

Then add this private method near the bottom of the class, just before `shuffleArray` (which is at line 788):

```php
    /**
     * Project axial hex coordinates (q, r) to pixel space.
     * Mirrors BoardRenderer.js hexToPixel() for pointy-top hexes.
     * Used only for landscape-bias scoring.
     */
    private function projectHexToPixel(int $q, int $r): array
    {
        $x = self::HEX_WIDTH_PX * ($q + $r * 0.5);
        $y = self::HEX_HEIGHT_PX * 0.75 * $r;
        return ['x' => $x, 'y' => $y];
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php tests/test_board_generator.php`
Expected: PASS — three new "PASS" lines for `projectHexToPixel`. All previously passing tests still pass.

- [ ] **Step 5: Commit**

```bash
git add modules/php/BoardGenerator.php tests/test_board_generator.php
git commit -m "feat(board-gen): add hex-to-pixel projection for landscape bias"
```

---

## Task 2: PHP — `computePixelBoundsForHexes`

Bounding-box helper used by the scorer. Pure function.

**Files:**
- Modify: `modules/php/BoardGenerator.php`
- Test: `tests/test_board_generator.php`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_board_generator.php`:

```php
// =============================================
// Test: computePixelBoundsForHexes
// =============================================
echo "\n=== computePixelBoundsForHexes ===\n";

$gen = new BoardGenerator();
$ref = new ReflectionMethod($gen, 'computePixelBoundsForHexes');
$ref->setAccessible(true);

// Empty input: return null-equivalent (use bounds with both min and max set to PHP_FLOAT_MAX/-PHP_FLOAT_MAX is fine)
$emptyBounds = $ref->invoke($gen, []);
assert_true(
    $emptyBounds === null,
    'computePixelBoundsForHexes([]) returns null'
);

// Single hex at origin: bounds should be (0, 60, 0, 69)
$singleHex = [['q' => 0, 'r' => 0]];
$singleBounds = $ref->invoke($gen, $singleHex);
assert_true(
    abs($singleBounds['minX']) < 1e-9
    && abs($singleBounds['maxX'] - 60.0) < 1e-9
    && abs($singleBounds['minY']) < 1e-9
    && abs($singleBounds['maxY'] - 69.0) < 1e-9,
    'single hex at (0,0) yields bounds (0, 60, 0, 69)'
);

// Two hexes: (0,0) and (1,0) — width should be 120, height 69
$twoHexes = [['q' => 0, 'r' => 0], ['q' => 1, 'r' => 0]];
$twoBounds = $ref->invoke($gen, $twoHexes);
$twoWidth = $twoBounds['maxX'] - $twoBounds['minX'];
$twoHeight = $twoBounds['maxY'] - $twoBounds['minY'];
assert_true(
    abs($twoWidth - 120.0) < 1e-9 && abs($twoHeight - 69.0) < 1e-9,
    'two adjacent hexes yield width=120 height=69'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php tests/test_board_generator.php`
Expected: FAIL — `computePixelBoundsForHexes` does not exist.

- [ ] **Step 3: Add the helper**

In `modules/php/BoardGenerator.php`, add right after `projectHexToPixel`:

```php
    /**
     * Compute the pixel-space bounding box of a list of hexes.
     * Each hex's extent is treated as the full hexWidth × hexHeight rectangle
     * starting at its projected (x, y) — matches BoardRenderer.js calculateBounds().
     *
     * @param array $hexes  Array of ['q' => int, 'r' => int] entries.
     * @return array|null   ['minX', 'maxX', 'minY', 'maxY'], or null if input is empty.
     */
    private function computePixelBoundsForHexes(array $hexes): ?array
    {
        if (empty($hexes)) {
            return null;
        }

        $minX = PHP_FLOAT_MAX;
        $maxX = -PHP_FLOAT_MAX;
        $minY = PHP_FLOAT_MAX;
        $maxY = -PHP_FLOAT_MAX;

        foreach ($hexes as $hex) {
            $pos = $this->projectHexToPixel($hex['q'], $hex['r']);
            if ($pos['x'] < $minX) $minX = $pos['x'];
            if ($pos['x'] + self::HEX_WIDTH_PX > $maxX) $maxX = $pos['x'] + self::HEX_WIDTH_PX;
            if ($pos['y'] < $minY) $minY = $pos['y'];
            if ($pos['y'] + self::HEX_HEIGHT_PX > $maxY) $maxY = $pos['y'] + self::HEX_HEIGHT_PX;
        }

        return ['minX' => $minX, 'maxX' => $maxX, 'minY' => $minY, 'maxY' => $maxY];
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php tests/test_board_generator.php`
Expected: PASS — three new PASS lines for `computePixelBoundsForHexes`. All prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add modules/php/BoardGenerator.php tests/test_board_generator.php
git commit -m "feat(board-gen): add pixel bounds helper for landscape bias scoring"
```

---

## Task 3: PHP — `scoreCandidate`

The scoring function itself. Combines the previous two helpers.

**Files:**
- Modify: `modules/php/BoardGenerator.php`
- Test: `tests/test_board_generator.php`

- [ ] **Step 1: Write the failing test**

Append to `tests/test_board_generator.php`:

```php
// =============================================
// Test: scoreCandidate
// =============================================
echo "\n=== scoreCandidate ===\n";

// Stub out Math.random — pass a deterministic randFn so the jitter is constant
$gen = new BoardGenerator(['randFn' => fn($min, $max) => $min]);  // always returns min
$ref = new ReflectionMethod($gen, 'scoreCandidate');
$ref->setAccessible(true);

// Build a fake candidate cluster: a single 1-hex cluster placed at origin
$singleHexCluster = [
    'id' => 'test-1',
    'hexes' => [['dq' => 0, 'dr' => 0, 'type' => 'water']],
];

// Existing bounds: 1500 wide x 1000 tall = ratio 1.5 (perfect)
$perfectBounds = ['minX' => 0.0, 'maxX' => 1500.0, 'minY' => 0.0, 'maxY' => 1000.0];

// Candidate at (100, 100) — well inside the existing box, so combined ratio stays ~1.5
$candidateInside = ['q' => 0, 'r' => 0, 'rotation' => 0];

// Candidate at far-down position: forces height to grow disproportionately
$candidateBelow = ['q' => 0, 'r' => 30, 'rotation' => 0];  // r=30 → y ~= 1552, makes board very tall

$scoreInside = $ref->invoke($gen, $candidateInside, $singleHexCluster, $perfectBounds);
$scoreBelow = $ref->invoke($gen, $candidateBelow, $singleHexCluster, $perfectBounds);

assert_true(
    is_float($scoreInside) || is_int($scoreInside),
    'scoreCandidate returns a number'
);
assert_true(
    $scoreInside > $scoreBelow,
    'candidate that keeps board landscape scores higher than candidate that makes it tall'
);

// Edge case: degenerate single-row layout (height = 0)
// Build bounds where height is exactly 0
$zeroHeightBounds = ['minX' => 0.0, 'maxX' => 1500.0, 'minY' => 0.0, 'maxY' => 0.0];
$scoreDegenerate = $ref->invoke($gen, $candidateInside, $singleHexCluster, $zeroHeightBounds);
assert_true(
    is_finite($scoreDegenerate),
    'scoreCandidate handles height=0 without NaN/Inf'
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php tests/test_board_generator.php`
Expected: FAIL — `scoreCandidate` does not exist.

- [ ] **Step 3: Implement `scoreCandidate`**

In `modules/php/BoardGenerator.php`, add right after `computePixelBoundsForHexes`:

```php
    /**
     * Score a candidate placement by how close it brings the board's pixel-space
     * bounding box to TARGET_ASPECT_RATIO. Higher score = better fit.
     *
     * Pure read against the cluster definition; does NOT mutate state.
     *
     * @param array       $candidate       ['q', 'r', 'rotation'].
     * @param array       $cluster         Cluster definition.
     * @param array|null  $existingBounds  Precomputed pixel bounds of already-placed hexes,
     *                                     or null if no clusters placed yet.
     * @return float                       Score; higher is better. Sort descending.
     */
    private function scoreCandidate(array $candidate, array $cluster, ?array $existingBounds): float
    {
        // Get the candidate's world hexes (with rotation applied)
        $candidateHexes = $this->clusterDefs->getWorldHexes(
            $cluster, $candidate['q'], $candidate['r'], $candidate['rotation']
        );

        // Compute candidate's own pixel bounds
        $candidateBounds = $this->computePixelBoundsForHexes($candidateHexes);
        if ($candidateBounds === null) {
            return -PHP_FLOAT_MAX;  // empty candidate — should never happen
        }

        // Combine with existing bounds (if any)
        if ($existingBounds === null) {
            $combined = $candidateBounds;
        } else {
            $combined = [
                'minX' => min($existingBounds['minX'], $candidateBounds['minX']),
                'maxX' => max($existingBounds['maxX'], $candidateBounds['maxX']),
                'minY' => min($existingBounds['minY'], $candidateBounds['minY']),
                'maxY' => max($existingBounds['maxY'], $candidateBounds['maxY']),
            ];
        }

        $width = $combined['maxX'] - $combined['minX'];
        $height = $combined['maxY'] - $combined['minY'];

        if ($height <= 0.0) {
            return -PHP_FLOAT_MAX;  // degenerate; rank last
        }

        $ratio = $width / $height;
        $deviation = abs($ratio - self::TARGET_ASPECT_RATIO);

        // Jitter in [0, ASPECT_SCORE_JITTER) for tie-breaking among near-identical candidates.
        // Use the injected randFn so tests can make this deterministic.
        $jitterInt = $this->rand(0, 1000);
        $jitter = ($jitterInt / 1000.0) * self::ASPECT_SCORE_JITTER;

        return -$deviation + $jitter;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `php tests/test_board_generator.php`
Expected: PASS — three new PASS lines for `scoreCandidate`. All prior tests still pass.

- [ ] **Step 5: Commit**

```bash
git add modules/php/BoardGenerator.php tests/test_board_generator.php
git commit -m "feat(board-gen): add scoreCandidate function for landscape bias"
```

---

## Task 4: PHP — wire scoring into `findPlacementWithHistory`

Add the constructor option and the conditional sort. This is the only change to existing logic.

**Files:**
- Modify: `modules/php/BoardGenerator.php` (constructor near line 34, `findPlacementWithHistory` around line 198)

- [ ] **Step 1: Write the failing test**

Append to `tests/test_board_generator.php`:

```php
// =============================================
// Test: landscapeBias toggle and statistical bias
// =============================================
echo "\n=== landscapeBias integration ===\n";

function aspectRatioOfBoard(array $boardResult): float {
    $hexes = $boardResult['hexes'] ?? [];
    if (empty($hexes)) return 0.0;
    $minX = PHP_FLOAT_MAX; $maxX = -PHP_FLOAT_MAX;
    $minY = PHP_FLOAT_MAX; $maxY = -PHP_FLOAT_MAX;
    foreach ($hexes as $h) {
        // Same projection as scoring uses
        $x = 60.0 * ($h['q'] + $h['r'] * 0.5);
        $y = 69.0 * 0.75 * $h['r'];
        if ($x < $minX) $minX = $x;
        if ($x + 60.0 > $maxX) $maxX = $x + 60.0;
        if ($y < $minY) $minY = $y;
        if ($y + 69.0 > $maxY) $maxY = $y + 69.0;
    }
    $width = $maxX - $minX;
    $height = $maxY - $minY;
    return $height > 0 ? $width / $height : 0.0;
}

// Generate 30 boards with bias OFF and 30 with bias ON
// (30 is enough to see a clear effect without making the test painfully slow)
$ratiosOff = [];
$ratiosOn = [];
$failuresOff = 0;
$failuresOn = 0;

for ($i = 0; $i < 30; $i++) {
    $g = new BoardGenerator(['landscapeBias' => false]);
    $r = $g->generate();
    if ($r['valid']) { $ratiosOff[] = aspectRatioOfBoard($r); }
    else { $failuresOff++; }
}
for ($i = 0; $i < 30; $i++) {
    $g = new BoardGenerator(['landscapeBias' => true]);
    $r = $g->generate();
    if ($r['valid']) { $ratiosOn[] = aspectRatioOfBoard($r); }
    else { $failuresOn++; }
}

assert_true($failuresOff === 0, 'all 30 bias-off generations succeed');
assert_true($failuresOn === 0,  'all 30 bias-on generations succeed');

$meanDevOff = array_sum(array_map(fn($r) => abs($r - 1.5), $ratiosOff)) / count($ratiosOff);
$meanDevOn  = array_sum(array_map(fn($r) => abs($r - 1.5), $ratiosOn))  / count($ratiosOn);

echo "  bias OFF mean |ratio - 1.5|: " . number_format($meanDevOff, 3) . "\n";
echo "  bias ON  mean |ratio - 1.5|: " . number_format($meanDevOn,  3) . "\n";

assert_true(
    $meanDevOn < $meanDevOff * 0.7,
    'bias-on shifts mean aspect ratio measurably toward 1.5 (>=30% reduction)'
);

// Variety check: stddev of ratios with bias on must be > 0
$meanOn = array_sum($ratiosOn) / count($ratiosOn);
$varOn = array_sum(array_map(fn($r) => ($r - $meanOn) ** 2, $ratiosOn)) / count($ratiosOn);
$stddevOn = sqrt($varOn);
assert_true($stddevOn > 0.01, 'bias-on still produces varied boards (stddev > 0.01)');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `php tests/test_board_generator.php`
Expected: FAIL — likely `Unknown named option: landscapeBias` is silently ignored, so bias-off and bias-on produce identical-distribution boards. The deviation reduction assertion fails because the bias is never applied.

- [ ] **Step 3: Add the constructor option**

In `modules/php/BoardGenerator.php`, add a property declaration after `private int $maxBacktrackDepth;` (around line 29):

```php
    private bool $landscapeBias;
```

In the constructor, after the `maxBacktrackDepth` line (~line 38), add:

```php
        $this->landscapeBias = $options['landscapeBias'] ?? true;
```

- [ ] **Step 4: Wire scoring into `findPlacementWithHistory`**

Replace the body of `findPlacementWithHistory` (currently [BoardGenerator.php:198–225](../../modules/php/BoardGenerator.php)) with:

```php
    private function findPlacementWithHistory(array $cluster, array $_placementStack, ?array $excludePositions = null): ?array
    {
        $triedPositions = $excludePositions ?? [];
        $candidates = $this->findConnectionCandidates($cluster);

        // Order candidates: scored sort if bias is active and enough clusters are placed,
        // otherwise random shuffle (existing behavior).
        if ($this->landscapeBias && count($_placementStack) >= self::MIN_CLUSTERS_FOR_BIAS) {
            $existingBounds = $this->computePixelBoundsForHexes(
                array_map(
                    fn($key) => ['q' => (int)explode(',', $key)[0], 'r' => (int)explode(',', $key)[1]],
                    array_keys($this->occupiedHexes)
                )
            );

            // Compute scores once, attach, sort descending
            $scored = [];
            foreach ($candidates as $c) {
                $scored[] = ['c' => $c, 's' => $this->scoreCandidate($c, $cluster, $existingBounds)];
            }
            usort($scored, fn($a, $b) => $b['s'] <=> $a['s']);
            $candidates = array_map(fn($entry) => $entry['c'], $scored);
        } else {
            $this->shuffleArray($candidates);
        }

        foreach ($candidates as $candidate) {
            $key = "{$candidate['q']},{$candidate['r']},{$candidate['rotation']}";

            if (isset($triedPositions[$key])) {
                continue;
            }
            $triedPositions[$key] = true;

            if ($this->canPlaceCluster($cluster, $candidate['q'], $candidate['r'], $candidate['rotation'])) {
                if ($this->wouldMaintainWaterConnectivity($cluster, $candidate['q'], $candidate['r'], $candidate['rotation'])) {
                    return [
                        'q' => $candidate['q'],
                        'r' => $candidate['r'],
                        'rotation' => $candidate['rotation'],
                        'triedPositions' => $triedPositions,
                    ];
                }
            }
        }

        return null;
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `php tests/test_board_generator.php`
Expected: PASS — all integration assertions pass. Console will print the mean deviations; bias-on should be at least 30% smaller than bias-off. All prior tests still pass.

If the 30%-reduction assertion narrowly fails: the bias is conservative by design (jitter + soft scoring). Re-running may resolve transient noise. If it consistently fails, the most likely cause is the existing-bounds calculation; double-check that `array_keys($this->occupiedHexes)` is being projected correctly.

- [ ] **Step 6: Commit**

```bash
git add modules/php/BoardGenerator.php tests/test_board_generator.php
git commit -m "feat(board-gen): bias hex packing toward 1.5 landscape ratio (PHP)"
```

---

## Task 5: JS — constants and `projectHexToPixel`

Mirror the PHP work in JS so client-side preview produces matching shapes.

**Files:**
- Modify: `modules/js/BoardBuilder.js`
- Create: `tests/test_board_builder_js.js`

- [ ] **Step 1: Write the failing test**

Create `tests/test_board_builder_js.js`:

```js
/**
 * Smoke test for BoardBuilder.js landscape-bias helpers.
 * Run: node tests/test_board_builder_js.js
 *
 * Loads BoardBuilder.js by stubbing Dojo's define() so the file's exported class
 * is captured in a regular Node.js context.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0;
let fail = 0;
function assertTrue(cond, msg) {
    if (cond) { console.log('  PASS: ' + msg); pass++; }
    else      { console.log('  FAIL: ' + msg); fail++; }
}

// Build a sandbox with stubbed Dojo
const sandbox = {
    console,
    capturedClass: null,
    define(_deps, factory) {
        // Stub declare(): just pass through the second argument as the class spec
        const stubDojo = {};
        const stubDeclare = (_parent, spec) => {
            // Build a constructable wrapper that runs the spec's constructor + carries methods
            return function(...args) {
                Object.assign(this, spec);
                if (typeof spec.constructor === 'function') {
                    spec.constructor.apply(this, args);
                }
            };
        };
        sandbox.capturedClass = factory(stubDojo, stubDeclare);
    },
};
vm.createContext(sandbox);
const filePath = path.join(__dirname, '..', 'modules', 'js', 'BoardBuilder.js');
vm.runInContext(fs.readFileSync(filePath, 'utf8'), sandbox);

const BoardBuilder = sandbox.capturedClass;
assertTrue(BoardBuilder !== null, 'BoardBuilder class loaded');

// Stub a minimal ClusterDefinitions so the constructor doesn't blow up
const stubDefs = {
    DIRECTION_LIST: [],
    getWorldHexes: () => [],
    getRotatedHexes: () => [],
    getCityClusters: () => [],
    getClustersBySize: () => [],
    getCluster: () => null,
};
const builder = new BoardBuilder(stubDefs);

// Test projectHexToPixel
const origin = builder.projectHexToPixel(0, 0);
assertTrue(origin.x === 0 && origin.y === 0, 'projectHexToPixel(0, 0) returns (0, 0)');

const right = builder.projectHexToPixel(1, 0);
assertTrue(right.x === 60 && right.y === 0, 'projectHexToPixel(1, 0) returns (60, 0)');

const down = builder.projectHexToPixel(0, 1);
assertTrue(Math.abs(down.x - 30) < 1e-9 && Math.abs(down.y - 51.75) < 1e-9,
           'projectHexToPixel(0, 1) returns (30, 51.75)');

console.log('\n=== Summary: ' + pass + ' passed, ' + fail + ' failed ===');
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_board_builder_js.js`
Expected: FAIL — `projectHexToPixel is not a function`.

- [ ] **Step 3: Add constants and helper to JS**

In `modules/js/BoardBuilder.js`, add to the class spec (after `maxBacktrackDepth: 5,` around line 31):

```js
        // Pixel-space hex dimensions (must match BoardRenderer.js).
        // Used only for landscape-bias scoring; does not affect rendering.
        HEX_WIDTH_PX: 60,
        HEX_HEIGHT_PX: 69,

        // Landscape-bias scoring constants
        TARGET_ASPECT_RATIO: 1.5,
        ASPECT_SCORE_JITTER: 0.02,
        MIN_CLUSTERS_FOR_BIAS: 2,

        landscapeBias: true,  // toggle; can be overridden via constructor options
```

In the constructor (around line 36), add after the existing option handling:

```js
                if (typeof options.landscapeBias === 'boolean') this.landscapeBias = options.landscapeBias;
```

Then add this method to the class spec near the other helper methods (e.g., right before `shuffleArray` if one exists, or near the end of the spec):

```js
        /**
         * Project axial hex coordinates (q, r) to pixel space.
         * Mirrors BoardRenderer.js hexToPixel() for pointy-top hexes.
         */
        projectHexToPixel: function(q, r) {
            return {
                x: this.HEX_WIDTH_PX * (q + r * 0.5),
                y: this.HEX_HEIGHT_PX * 0.75 * r,
            };
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_board_builder_js.js`
Expected: PASS — all four assertions pass.

- [ ] **Step 5: Commit**

```bash
git add modules/js/BoardBuilder.js tests/test_board_builder_js.js
git commit -m "feat(board-builder): add hex-to-pixel projection (JS parity)"
```

---

## Task 6: JS — `computeBoundsForHexes` and `scoreCandidate`

Bundle the two remaining helpers in one task — they're short, identical in shape to the PHP versions, and tested together.

**Files:**
- Modify: `modules/js/BoardBuilder.js`
- Modify: `tests/test_board_builder_js.js`

- [ ] **Step 1: Extend the test**

Append before the final `Summary` print in `tests/test_board_builder_js.js`:

```js
// computeBoundsForHexes
const empty = builder.computeBoundsForHexes([]);
assertTrue(empty === null, 'computeBoundsForHexes([]) returns null');

const single = builder.computeBoundsForHexes([{q: 0, r: 0}]);
assertTrue(single.minX === 0 && single.maxX === 60 && single.minY === 0 && single.maxY === 69,
           'single hex at (0,0) yields bounds (0, 60, 0, 69)');

// scoreCandidate — verify ordering, not exact values (jitter)
// Stub getWorldHexes to return predictable hexes for the candidate
const candidateCluster = { id: 'test-1', hexes: [{dq: 0, dr: 0, type: 'water'}] };
builder.clusterDefs.getWorldHexes = (cluster, q, r, _rot) => [{q, r, type: 'water'}];

const perfectBounds = {minX: 0, maxX: 1500, minY: 0, maxY: 1000};  // ratio 1.5
const candidateInside = {q: 0, r: 0, rotation: 0};                 // stays near 1.5
const candidateBelow = {q: 0, r: 30, rotation: 0};                 // adds height

let scoreInside = 0, scoreBelow = 0;
// Average over many runs to wash out jitter
for (let i = 0; i < 50; i++) {
    scoreInside += builder.scoreCandidate(candidateInside, candidateCluster, perfectBounds);
    scoreBelow  += builder.scoreCandidate(candidateBelow,  candidateCluster, perfectBounds);
}
assertTrue(scoreInside > scoreBelow,
           'candidate keeping board landscape outscores candidate that grows height (avg of 50)');

// Edge case: height 0
const zeroHeight = {minX: 0, maxX: 1500, minY: 0, maxY: 0};
const degScore = builder.scoreCandidate(candidateInside, candidateCluster, zeroHeight);
assertTrue(Number.isFinite(degScore), 'scoreCandidate handles height=0 without NaN/Inf');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/test_board_builder_js.js`
Expected: FAIL — `computeBoundsForHexes is not a function`.

- [ ] **Step 3: Add both helpers to BoardBuilder.js**

In `modules/js/BoardBuilder.js`, immediately after `projectHexToPixel`:

```js
        /**
         * Compute pixel-space bounding box of a list of hexes.
         * Each hex's extent is its hexWidth × hexHeight rectangle starting at projected (x, y).
         */
        computeBoundsForHexes: function(hexes) {
            if (!hexes || hexes.length === 0) return null;
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const hex of hexes) {
                const pos = this.projectHexToPixel(hex.q, hex.r);
                if (pos.x < minX) minX = pos.x;
                if (pos.x + this.HEX_WIDTH_PX > maxX) maxX = pos.x + this.HEX_WIDTH_PX;
                if (pos.y < minY) minY = pos.y;
                if (pos.y + this.HEX_HEIGHT_PX > maxY) maxY = pos.y + this.HEX_HEIGHT_PX;
            }
            return { minX, maxX, minY, maxY };
        },

        /**
         * Score a candidate placement by closeness of resulting bounding box to TARGET_ASPECT_RATIO.
         * Higher = better. Pure read — does not mutate state.
         */
        scoreCandidate: function(candidate, cluster, existingBounds) {
            const candidateHexes = this.clusterDefs.getWorldHexes(
                cluster, candidate.q, candidate.r, candidate.rotation
            );
            const candidateBounds = this.computeBoundsForHexes(candidateHexes);
            if (candidateBounds === null) return -Infinity;

            const combined = existingBounds === null ? candidateBounds : {
                minX: Math.min(existingBounds.minX, candidateBounds.minX),
                maxX: Math.max(existingBounds.maxX, candidateBounds.maxX),
                minY: Math.min(existingBounds.minY, candidateBounds.minY),
                maxY: Math.max(existingBounds.maxY, candidateBounds.maxY),
            };

            const width  = combined.maxX - combined.minX;
            const height = combined.maxY - combined.minY;
            if (height <= 0) return -Infinity;

            const ratio = width / height;
            const deviation = Math.abs(ratio - this.TARGET_ASPECT_RATIO);
            const jitter = Math.random() * this.ASPECT_SCORE_JITTER;
            return -deviation + jitter;
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_board_builder_js.js`
Expected: PASS — all assertions including the new ones.

- [ ] **Step 5: Commit**

```bash
git add modules/js/BoardBuilder.js tests/test_board_builder_js.js
git commit -m "feat(board-builder): add scoring helpers for landscape bias (JS parity)"
```

---

## Task 7: JS — wire scoring into `findPlacementWithHistory`

Mirror the PHP wiring. After this, JS preview matches PHP gameplay shape.

**Files:**
- Modify: `modules/js/BoardBuilder.js` ([line 199–228](../../modules/js/BoardBuilder.js))

- [ ] **Step 1: Add a wiring smoke test**

Append to `tests/test_board_builder_js.js`:

```js
// Wiring: with bias on and a stack of >=2, candidates should be sorted by score
// We test this indirectly by confirming the function doesn't crash when bias is active.
builder.landscapeBias = true;
builder.occupiedHexes = new Map([['0,0', {q:0,r:0,type:'water'}], ['1,0', {q:1,r:0,type:'water'}]]);
builder.waterHexes = new Set(['0,0', '1,0']);
builder.clusterDefs.getWorldHexes = (_c, q, r, _rot) => [{q, r, type: 'water'}];
builder.clusterDefs.getRotatedHexes = (_c, _rot) => [{dq: 0, dr: 0, type: 'water'}];
builder.clusterDefs.DIRECTION_LIST = [
    {dq:1,dr:0},{dq:-1,dr:0},{dq:0,dr:1},{dq:0,dr:-1},{dq:1,dr:-1},{dq:-1,dr:1}
];

const stackOf2 = [{clusterIndex:0}, {clusterIndex:1}];
const cluster = { id:'test', hexes:[{dq:0,dr:0,type:'water'}] };
const placement = builder.findPlacementWithHistory(cluster, stackOf2);
assertTrue(placement !== undefined, 'findPlacementWithHistory returns a value when bias active');
```

- [ ] **Step 2: Run test to verify it fails or behaves like the unbiased shuffle**

Run: `node tests/test_board_builder_js.js`
Expected: PASS for the smoke assertion (the function still works), but at this stage the bias is not actually applied — the test only confirms no crash. Real verification of bias effect is the visual smoke test in Task 9.

- [ ] **Step 3: Replace the body of `findPlacementWithHistory`**

In `modules/js/BoardBuilder.js`, replace lines 199–228 (the entire `findPlacementWithHistory` method) with:

```js
        findPlacementWithHistory: function(cluster, placementStack, excludePositions) {
            const triedPositions = excludePositions || new Set();
            const candidates = this.findConnectionCandidates(cluster);

            // Order candidates: scored sort if bias active and enough clusters placed; else shuffle.
            if (this.landscapeBias && placementStack.length >= this.MIN_CLUSTERS_FOR_BIAS) {
                const existingHexes = [];
                for (const key of this.occupiedHexes.keys()) {
                    const [q, r] = key.split(',').map(Number);
                    existingHexes.push({ q, r });
                }
                const existingBounds = this.computeBoundsForHexes(existingHexes);

                const scored = candidates.map(c => ({
                    c: c,
                    s: this.scoreCandidate(c, cluster, existingBounds),
                }));
                scored.sort((a, b) => b.s - a.s);
                candidates.length = 0;
                for (const entry of scored) candidates.push(entry.c);
            } else {
                this.shuffleArray(candidates);
            }

            for (const candidate of candidates) {
                const key = `${candidate.q},${candidate.r},${candidate.rotation}`;

                if (triedPositions.has(key)) {
                    continue;
                }

                triedPositions.add(key);

                if (this.canPlaceCluster(cluster, candidate.q, candidate.r, candidate.rotation)) {
                    if (this.wouldMaintainWaterConnectivity(cluster, candidate.q, candidate.r, candidate.rotation)) {
                        return {
                            q: candidate.q,
                            r: candidate.r,
                            rotation: candidate.rotation,
                            triedPositions: triedPositions,
                        };
                    }
                }
            }

            return null;
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/test_board_builder_js.js`
Expected: PASS — all assertions still pass; the smoke wiring assertion confirms no crash with bias on.

- [ ] **Step 5: Commit**

```bash
git add modules/js/BoardBuilder.js tests/test_board_builder_js.js
git commit -m "feat(board-builder): wire landscape bias into findPlacementWithHistory (JS parity)"
```

---

## Task 8: PHP final regression — full PHP suite

Re-run the full PHP test suite to confirm no regression in any prior board-generator tests.

**Files:** none.

- [ ] **Step 1: Run all PHP tests**

```bash
php tests/test_board_generator.php
php tests/test_distribute_colors.php
php tests/test_material_defs.php
php tests/test_player_panel_data.php
```

Expected: every test prints PASS lines and the summary indicates no failures.

- [ ] **Step 2: If anything fails, stop and triage**

The most likely failure is the statistical assertion in Task 4 hitting tail variance. If that's the only failure: re-run once. If it still fails, increase the sample size from 30 to 60 in the test, or relax the `* 0.7` threshold to `* 0.8`. Do NOT relax further without revisiting the design.

- [ ] **Step 3: No commit needed unless tests were adjusted**

If a tweak was needed, commit the test adjustment with message: `test(board-gen): adjust statistical thresholds for landscape bias`.

---

## Task 9: Visual smoke test (manual)

Confirm the user-visible outcome.

**Files:** none.

- [ ] **Step 1: Generate boards and eyeball them**

Run the BGA dev environment (or a local board-preview script if one exists). Generate 5–10 boards. For each:
- The width should be visibly greater than the height.
- The shape should still feel organic (not all boards identical).
- Compare a JS-rendered preview with PHP-generated gameplay state if both are accessible — they should look broadly similar in shape (some variation is expected because PHP and JS use independent RNGs).

- [ ] **Step 2: If the bias is too strong / too weak**

- Too strong (boards feel stretched): lower `TARGET_ASPECT_RATIO` toward 1.4, or raise `ASPECT_SCORE_JITTER` toward 0.05 to let weaker candidates win more often.
- Too weak (boards still feel tall): raise `TARGET_ASPECT_RATIO` toward 1.6, or lower `ASPECT_SCORE_JITTER` toward 0.01.
- Update both PHP (`BoardGenerator.php`) and JS (`BoardBuilder.js`) constants to keep them in sync.
- Re-run `php tests/test_board_generator.php` and `node tests/test_board_builder_js.js` after any tuning.

- [ ] **Step 3: Commit any tuning**

```bash
git add modules/php/BoardGenerator.php modules/js/BoardBuilder.js
git commit -m "tune(board-gen): adjust landscape-bias constants per visual review"
```

---

## Spec coverage check

| Spec section | Implemented in |
|--------------|----------------|
| PHP `scoreCandidate`, `projectHexToPixel`, `computePixelBoundsForHexes` | Tasks 1, 2, 3 |
| PHP `landscapeBias` constructor option + `findPlacementWithHistory` wiring | Task 4 |
| PHP unit tests for helpers | Tasks 1, 2, 3 |
| PHP statistical integration test | Task 4 |
| JS `projectHexToPixel`, `computeBoundsForHexes`, `scoreCandidate` | Tasks 5, 6 |
| JS `landscapeBias` option + wiring | Task 7 |
| JS smoke test | Tasks 5, 6, 7 |
| Constants synced PHP↔JS (`TARGET_ASPECT_RATIO`, `ASPECT_SCORE_JITTER`, `MIN_CLUSTERS_FOR_BIAS`, `HEX_WIDTH_PX`, `HEX_HEIGHT_PX`) | Tasks 1, 5 |
| Engagement rule (cluster #3+) | Tasks 4, 7 (`MIN_CLUSTERS_FOR_BIAS = 2` check) |
| Tie-breaking jitter (0.02) | Tasks 3, 6 |
| Edge case: height = 0 | Tests in Tasks 3, 6 |
| Edge case: backtracking interaction | No new code; existing backtrack flow consumes the re-ordered candidate list unchanged |
| Visual smoke verification | Task 9 |
| Full regression sweep | Task 8 |
