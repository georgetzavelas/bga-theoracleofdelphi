<?php
/**
 * Tests for HexPathfinder: "where can this ship move to?"
 *
 * Every turn runs through here. MoveShip builds the pathfinder from the water
 * hexes in the DB (plus the Zeus hex once a player is eligible), then hands it
 * the shallows as ZERO-COST hexes when the player owns Equipment 014 (Shallow
 * Runner) — "shallows do not count as a space".
 *
 * That zero-cost rule is why this is a 0-1 BFS and not a plain BFS, and it is
 * the part worth pinning: a cost-blind search settles a hex at the first
 * distance it sees, so a target reachable in 1 via a free detour but 2 via the
 * direct route reads as out of range for a 1-movement die. The player then
 * cannot click a space the rules say they can reach. The `free detour beats
 * the direct route` block below is that exact shape.
 *
 * Run: php tests/test_hex_pathfinder.php
 */

require_once __DIR__ . '/../modules/php/HexPathfinder.php';

use Bga\Games\theoracleofdelphi\HexPathfinder;

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

/**
 * Build hex rows the way loadWaterHexes receives them. The DB hands back
 * strings, and the method casts them, so the fixtures are strings too.
 * @param list<string> $keys "q,r" pairs
 */
function water(array $keys): array {
    return array_map(function (string $k): array {
        [$q, $r] = explode(',', $k);
        return ['q' => $q, 'r' => $r];
    }, $keys);
}

/** Compare a reachable-map against an expected "q,r" => distance map. */
function sameMap(array $got, array $want, string $m): void {
    ksort($got); ksort($want);
    check($got === $want, $m . "\n     got:  " . json_encode($got)
        . "\n     want: " . json_encode($want));
}

/** Axial hex distance, for generating discs. */
function hexDist(int $q, int $r): int {
    return (int)((abs($q) + abs($q + $r) + abs($r)) / 2);
}

// ---- open water -------------------------------------------------------------
// A straight channel east from the ship: (0,0) -> (1,0) -> ... -> (4,0).
$line = water(['0,0', '1,0', '2,0', '3,0', '4,0']);

$pf = new HexPathfinder();
$pf->loadWaterHexes($line);

sameMap($pf->getReachableHexes(0, 0, 2), ['1,0' => 1, '2,0' => 2],
    'a 2-movement die reaches exactly two hexes down an open channel');

check(!isset($pf->getReachableHexes(0, 0, 2)['0,0']),
    'the hex the ship is already on is never offered as a destination');

sameMap($pf->getReachableHexes(0, 0, 0), [],
    'a 0-movement budget reaches nothing when no hex is free to enter');

sameMap($pf->getReachableHexes(0, 0, 99), ['1,0' => 1, '2,0' => 2, '3,0' => 3, '4,0' => 4],
    'a huge budget still stops at the edge of the water, not past it');

// Distances are symmetric from a mid-channel start, and negatives work.
sameMap($pf->getReachableHexes(2, 0, 1), ['1,0' => 1, '3,0' => 1],
    'from mid-channel both directions are one step away');

// ---- land blocks ------------------------------------------------------------
// Same channel with (2,0) left out: it is an island, so it is not passable and
// nothing beyond it can be reached however large the budget.
$blocked = water(['0,0', '1,0', '3,0', '4,0']);
$pf = new HexPathfinder();
$pf->loadWaterHexes($blocked);

sameMap($pf->getReachableHexes(0, 0, 99), ['1,0' => 1],
    'an island mid-channel blocks everything behind it');

// ---- a full disc: distances match hex geometry -------------------------------
// Every hex within 2 of the origin is water. A ship in the middle should see
// the 6 neighbours at 1 and the whole 18-hex disc at 2.
$discKeys = [];
for ($q = -2; $q <= 2; $q++) {
    for ($r = -2; $r <= 2; $r++) {
        if (hexDist($q, $r) <= 2) { $discKeys[] = "$q,$r"; }
    }
}
$pf = new HexPathfinder();
$pf->loadWaterHexes(water($discKeys));

$ring1 = $pf->getReachableHexes(0, 0, 1);
check(count($ring1) === 6, 'a 1-movement die reaches exactly the 6 adjacent hexes, got ' . count($ring1));
check(array_values(array_unique(array_values($ring1))) === [1],
    'every hex in the first ring is at distance 1');

$disc2 = $pf->getReachableHexes(0, 0, 2);
check(count($disc2) === 18, 'a 2-movement die reaches the whole 18-hex disc, got ' . count($disc2));
check($disc2['2,0'] === 2 && $disc2['-2,2'] === 2 && $disc2['0,-2'] === 2,
    'the outer ring sits at distance 2 in every direction');

// ---- Equipment 014: shallows are free ---------------------------------------
// Channel east, with (1,0) (2,0) (3,0) all shallows the Shallow Runner may
// cross for nothing, and (4,0) ordinary water beyond them.
$runner = water(['0,0', '1,0', '2,0', '3,0', '4,0']);
$pf = new HexPathfinder();
$pf->loadWaterHexes($runner);
$pf->setZeroCostHexes(['1,0' => true, '2,0' => true, '3,0' => true]);

sameMap($pf->getReachableHexes(0, 0, 0),
    ['1,0' => 0, '2,0' => 0, '3,0' => 0],
    'a whole chain of shallows crosses for free, even on a 0 budget');

sameMap($pf->getReachableHexes(0, 0, 1),
    ['1,0' => 0, '2,0' => 0, '3,0' => 0, '4,0' => 1],
    'the budget is spent only on the ordinary water past the shallows');

// ---- the 0-1 BFS case: a free detour beats the direct route ------------------
// Direct:  (0,0) -> (1,0) -> (2,0)            = 2 movement
// Shallow: (0,0) -> (0,1) -> (1,1) -> (2,0)   = 1 movement, the first two free
// A cost-blind BFS settles (2,0) at 2 and hides it from a 1-movement die.
$detour = water(['0,0', '1,0', '2,0', '0,1', '1,1']);
$pf = new HexPathfinder();
$pf->loadWaterHexes($detour);
$pf->setZeroCostHexes(['0,1' => true, '1,1' => true]);

sameMap($pf->getReachableHexes(0, 0, 1),
    ['0,1' => 0, '1,1' => 0, '1,0' => 1, '2,0' => 1],
    'a target is found at its cheapest cost, not the cost of the first route seen');

check($pf->isReachable(0, 0, 2, 0, 1),
    'the far hex is reachable on a 1-movement die via the free shallows');

sameMap($pf->getReachableHexes(0, 0, 0), ['0,1' => 0, '1,1' => 0],
    'on a 0 budget only the free hexes are on offer');

// ---- zero-cost bookkeeping ---------------------------------------------------
// Keys that are not water are ignored, so a stale zero-cost set can never make
// land passable. MoveShip loads water first and only then marks shallows, but
// loadWaterHexes resets the passable set without clearing zero-cost, so this
// is the invariant that keeps that ordering harmless.
$pf = new HexPathfinder();
$pf->loadWaterHexes(water(['0,0', '1,0']));
$pf->setZeroCostHexes(['9,9' => true, '1,0' => true]);
sameMap($pf->getReachableHexes(0, 0, 0), ['1,0' => 0],
    'a zero-cost key that is not water does not become a destination');

$pf->loadWaterHexes(water(['0,0', '0,1']));
sameMap($pf->getReachableHexes(0, 0, 1), ['0,1' => 1],
    'reloading the water replaces the old map, and the stale zero-cost keys do nothing');

// ---- isReachable agrees with the map ----------------------------------------
$pf = new HexPathfinder();
$pf->loadWaterHexes($line);

check($pf->isReachable(0, 0, 2, 0, 2), 'isReachable: in range');
check(!$pf->isReachable(0, 0, 3, 0, 2), 'isReachable: one step past the budget');
check(!$pf->isReachable(0, 0, 7, 7, 99), 'isReachable: a hex that is not water');
check(!$pf->isReachable(0, 0, 0, 0, 3),
    'isReachable: the ship cannot "move" to the hex it is already on');

$reach = $pf->getReachableHexes(0, 0, 3);
$agree = true;
foreach (['1,0', '2,0', '3,0', '4,0', '9,9'] as $key) {
    [$q, $r] = array_map('intval', explode(',', $key));
    if ($pf->isReachable(0, 0, $q, $r, 3) !== isset($reach[$key])) { $agree = false; }
}
check($agree, 'isReachable never disagrees with getReachableHexes');

echo "$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
