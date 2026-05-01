<?php
/**
 * Smoke test for BoardGenerator.
 * Run: php tests/test_board_generator.php
 */

require_once(__DIR__ . '/../modules/php/BoardGenerator.php');

$pass = 0;
$fail = 0;

function assert_true(bool $condition, string $msg): void {
    global $pass, $fail;
    if ($condition) {
        echo "  PASS: $msg\n";
        $pass++;
    } else {
        echo "  FAIL: $msg\n";
        $fail++;
    }
}

// =============================================
// Test 1: ClusterDefinitions sanity
// =============================================
echo "=== ClusterDefinitions ===\n";
$defs = new ClusterDefinitions();

assert_true(count($defs->getCityClusters()) === 6, '6 city clusters');
assert_true(count($defs->getClustersBySize(7)) === 6, '6 clusters of size 7');
assert_true(count($defs->getClustersBySize(9)) === 3, '3 clusters of size 9');
assert_true(count($defs->getClustersBySize(11)) === 3, '3 clusters of size 11');
assert_true($defs->getCluster('cluster-7-0') !== null, 'cluster-7-0 exists');
assert_true($defs->getCluster('nonexistent') === null, 'nonexistent returns null');

// Test rotation: 0 steps = identity
$rot0 = $defs->rotateHex(1, -1, 0);
assert_true($rot0['dq'] === 1 && $rot0['dr'] === -1, 'rotateHex 0 steps is identity');

// Test rotation: 6 steps = identity
$rot6 = $defs->rotateHex(1, -1, 6);
assert_true($rot6['dq'] === 1 && $rot6['dr'] === -1, 'rotateHex 6 steps is identity');

// Test rotation: 1 step of E(1,0) clockwise -> SE(0,1)
$rot1 = $defs->rotateHex(1, 0, 1);
assert_true($rot1['dq'] === 0 && $rot1['dr'] === 1, 'rotateHex (1,0) by 1 step -> (0,1)');

// =============================================
// Test 2: HexUtils
// =============================================
echo "\n=== HexUtils ===\n";
assert_true(HexUtils::hexDistance(0, 0, 0, 0) === 0, 'distance to self is 0');
assert_true(HexUtils::hexDistance(0, 0, 1, 0) === 1, 'adjacent distance is 1');
assert_true(HexUtils::hexDistance(0, 0, 2, -1) === 2, 'distance (0,0)→(2,-1) is 2');

$ring1 = HexUtils::getHexesAtDistance(0, 0, 1);
assert_true(count($ring1) === 6, 'ring at distance 1 has 6 hexes');

$ring0 = HexUtils::getHexesAtDistance(0, 0, 0);
assert_true(count($ring0) === 1, 'ring at distance 0 has 1 hex');

// =============================================
// Test 3: BoardGenerator - full board generation
// =============================================
echo "\n=== BoardGenerator ===\n";
$startTime = microtime(true);

$generator = new BoardGenerator(['maxBuildAttempts' => 50]);
$result = $generator->generate();

$elapsed = microtime(true) - $startTime;

assert_true($result['valid'] === true, "Board is valid (took {$result['attempts']} attempt(s))");
echo "  Time: " . round($elapsed * 1000) . "ms\n";

// Count clusters
$islandCount = 0;
$cityCount = 0;
foreach ($result['clusters'] as $p) {
    $size = $p['cluster']['size'];
    if ($size === 7 || $size === 9 || $size === 11) $islandCount++;
    elseif ($size === 3) $cityCount++;
}

assert_true($islandCount === 12, "12 island clusters (got $islandCount)");
assert_true($cityCount === 6, "6 city clusters (got $cityCount)");
assert_true(count($result['clusters']) === 18, "18 total clusters (got " . count($result['clusters']) . ")");

// Count hex types
$waterCount = 0;
$islandHexCount = 0;
$shallowsCount = 0;
foreach ($result['hexes'] as $hex) {
    if ($hex['type'] === 'water') $waterCount++;
    elseif ($hex['type'] === 'island') $islandHexCount++;
    elseif ($hex['type'] === 'shallows') $shallowsCount++;
}

$totalHexes = count($result['hexes']);
echo "  Total hexes: $totalHexes (water=$waterCount, island=$islandHexCount, shallows=$shallowsCount)\n";
assert_true($totalHexes > 100, "Hex count > 100 (got $totalHexes)");

// Zeus position
assert_true($result['zeusPosition'] !== null, 'Zeus position found');
if ($result['zeusPosition']) {
    echo "  Zeus at ({$result['zeusPosition']['q']}, {$result['zeusPosition']['r']})\n";
}

// =============================================
// Test 4: Multiple generations for reliability
// =============================================
echo "\n=== Reliability (5 runs) ===\n";
$successes = 0;
for ($run = 0; $run < 5; $run++) {
    $gen = new BoardGenerator(['maxBuildAttempts' => 50]);
    $r = $gen->generate();
    if ($r['valid']) {
        $successes++;
        echo "  Run " . ($run + 1) . ": OK ({$r['attempts']} attempts, " . count($r['hexes']) . " hexes)\n";
    } else {
        echo "  Run " . ($run + 1) . ": FAILED\n";
    }
}
assert_true($successes === 5, "All 5 runs produced valid boards ($successes/5)");

// =============================================
// Test 5: projectHexToPixel
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

// =============================================
// Summary
// =============================================
echo "\n=== Summary ===\n";
echo "  Passed: $pass\n";
echo "  Failed: $fail\n";
exit($fail > 0 ? 1 : 0);
