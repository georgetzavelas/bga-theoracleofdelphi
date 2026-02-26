<?php
/**
 * Test color distribution algorithm.
 * Run: php tests/test_distribute_colors.php
 */

require_once __DIR__ . '/../modules/php/MaterialDefs.php';

// Inline the function to test without BGA framework
function distributeColorRounds(int $rounds): array
{
    if ($rounds < 0 || $rounds > 6) {
        throw new \InvalidArgumentException(
            "rounds must be 0-6 (only 6 colors available), got $rounds"
        );
    }
    $slots = array_fill(0, 6, []);
    for ($r = 0; $r < $rounds; $r++) {
        do {
            $colors = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
            shuffle($colors);
            $valid = true;
            for ($i = 0; $i < 6; $i++) {
                if (in_array($colors[$i], $slots[$i], true)) {
                    $valid = false;
                    break;
                }
            }
        } while (!$valid);
        for ($i = 0; $i < 6; $i++) {
            $slots[$i][] = $colors[$i];
        }
    }
    return $slots;
}

$passed = 0;
$failed = 0;

function assert_true(bool $condition, string $message): void {
    global $passed, $failed;
    if ($condition) { $passed++; } else { $failed++; echo "FAIL: $message\n"; }
}

// Test with 1 round (2-player monster regular islands)
$result = distributeColorRounds(1);
assert_true(count($result) === 6, '1 round: should have 6 slots');
foreach ($result as $i => $colors) {
    assert_true(count($colors) === 1, "1 round: slot $i should have 1 color");
}
// All 6 colors should appear exactly once
$allColors = array_merge(...$result);
sort($allColors);
$expected = \Bga\Games\theoracleofdelphigzed\MaterialDefs::COLORS;
sort($expected);
assert_true($allColors === $expected, '1 round: all 6 colors should appear once');

// Test with 4 rounds (4-player offerings)
$result = distributeColorRounds(4);
assert_true(count($result) === 6, '4 rounds: should have 6 slots');
foreach ($result as $i => $colors) {
    assert_true(count($colors) === 4, "4 rounds: slot $i should have 4 colors");
    // No duplicates per slot
    assert_true(count(array_unique($colors)) === count($colors),
        "4 rounds: slot $i should have no duplicate colors");
}
// Total should be 24 (6 colors x 4)
$allColors = array_merge(...$result);
assert_true(count($allColors) === 24, '4 rounds: should have 24 total pieces');
// Each color appears exactly 4 times
$colorCounts = array_count_values($allColors);
foreach ($colorCounts as $color => $count) {
    assert_true($count === 4, "4 rounds: color $color should appear 4 times, got $count");
}

// Test with 2 rounds (2-player offerings)
$result = distributeColorRounds(2);
foreach ($result as $i => $colors) {
    assert_true(count($colors) === 2, "2 rounds: slot $i should have 2 colors");
    assert_true($colors[0] !== $colors[1], "2 rounds: slot $i should have different colors");
}

// Run 100 iterations to verify no-duplicate invariant holds
for ($trial = 0; $trial < 100; $trial++) {
    $result = distributeColorRounds(3);
    foreach ($result as $i => $colors) {
        assert_true(count(array_unique($colors)) === 3,
            "Trial $trial, slot $i: duplicate colors found: " . implode(',', $colors));
    }
}

echo "\n$passed passed, $failed failed out of " . ($passed + $failed) . " assertions\n";
exit($failed > 0 ? 1 : 0);
