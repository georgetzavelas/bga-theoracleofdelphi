<?php
/**
 * Tests for HexUtils::findEnclosedGapHexes — the "artificial shallows"
 * (enclosed holes between assembled cluster tiles) that Shallow Runner
 * (Equipment 014) must be able to cross.
 * Run: php tests/test_gap_shallows.php
 */
require_once __DIR__ . '/../modules/php/ClusterDefinitions.php';
require_once __DIR__ . '/../modules/php/HexUtils.php';
require_once __DIR__ . '/../modules/php/BoardGenerator.php';

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}
function occ(array $keys): array {
    $r = [];
    foreach ($keys as $k) { [$q, $rr] = explode(',', $k); $r[] = ['q' => (int)$q, 'r' => (int)$rr]; }
    return $r;
}
function gapKeys(array $gaps): string {
    $k = [];
    foreach ($gaps as $g) { $k[] = $g['q'] . ',' . $g['r']; }
    sort($k);
    return implode(' ', $k);
}

// Empty input is safe.
check(HexUtils::findEnclosedGapHexes([]) === [], 'empty board yields no gaps');

// A single hex surrounded by its six neighbours is an enclosed hole.
$ring = occ(['1,-1', '2,-1', '2,0', '1,1', '0,1', '0,0']);
check(gapKeys(HexUtils::findEnclosedGapHexes($ring)) === '1,0',
    'single enclosed hole is detected');

// An open line has no enclosed holes.
check(HexUtils::findEnclosedGapHexes(occ(['0,0', '1,0', '2,0', '3,0'])) === [],
    'open line has no gaps');

// A C-shape (ring with one wall hex missing) leaves the interior open to
// the ocean — a bay, not an enclosed hole.
$cshape = occ(['1,-1', '2,-1', '2,0', '1,1', '0,1']);
check(HexUtils::findEnclosedGapHexes($cshape) === [],
    'open bay (C-shape) is not an enclosed gap');

// Filling a detected gap leaves nothing enclosed — the routine is
// idempotent, so setup + the backfill migration can both run safely.
$filled = array_merge($ring, occ(['1,0']));
check(HexUtils::findEnclosedGapHexes($filled) === [],
    'filling the gap yields no further gaps (idempotent)');

// A two-hex enclosed pocket is fully reported.
$wall = occ(['1,-1', '2,-1', '1,1', '0,1', '0,0', '3,-1', '3,0', '2,1']);
check(gapKeys(HexUtils::findEnclosedGapHexes($wall)) === '1,0 2,0',
    'multi-hex enclosed pocket is detected');

// Adjacency matches the ship pathfinder's six directions exactly, so an
// "enclosed" hex is one a ship could actually route through.
$pfDirs = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];
$defDirs = array_map(fn($d) => [$d['dq'], $d['dr']], ClusterDefinitions::DIRECTION_LIST);
check($defDirs === $pfDirs, 'gap adjacency matches HexPathfinder directions');

// ---------------------------------------------------------------------------
// Real-board property: EVERY gap shallow must be fully enclosed ("within a
// ring of water or other hexes") — no gap may have an escape route to the
// open ocean, or the algorithm would be turning open sea into fake shallows.
// Verified two independent ways against the production routine:
//   (a) a per-hex BFS from each gap cannot reach the far edge of a generous
//       box (margin 10) through empty hexes; and
//   (b) the production 1-hex-margin result equals a generous 6-hex-margin
//       recompute (proves the small margin never misses an escape path).
// ---------------------------------------------------------------------------
$PF_DIRS = [[0, -1], [1, -1], [1, 0], [0, 1], [-1, 1], [-1, 0]];

$bounds = function (array $hexes): array {
    $minQ = PHP_INT_MAX; $maxQ = PHP_INT_MIN; $minR = PHP_INT_MAX; $maxR = PHP_INT_MIN;
    foreach ($hexes as $h) {
        $q = (int)$h['q']; $r = (int)$h['r'];
        $minQ = min($minQ, $q); $maxQ = max($maxQ, $q);
        $minR = min($minR, $r); $maxR = max($maxR, $r);
    }
    return [$minQ, $maxQ, $minR, $maxR];
};

// Independent enclosure recompute at an arbitrary margin (not the production code).
$enclosedAtMargin = function (array $hexes, int $margin) use ($PF_DIRS, $bounds): array {
    $occ = [];
    foreach ($hexes as $h) { $occ[(int)$h['q'] . ',' . (int)$h['r']] = true; }
    [$minQ, $maxQ, $minR, $maxR] = $bounds($hexes);
    $loQ = $minQ - $margin; $hiQ = $maxQ + $margin;
    $loR = $minR - $margin; $hiR = $maxR + $margin;
    $out = ["$loQ,$loR" => true]; $queue = [[$loQ, $loR]];
    while ($queue) {
        [$q, $r] = array_shift($queue);
        foreach ($PF_DIRS as $d) {
            $nq = $q + $d[0]; $nr = $r + $d[1];
            if ($nq < $loQ || $nq > $hiQ || $nr < $loR || $nr > $hiR) continue;
            $k = "$nq,$nr";
            if (isset($occ[$k]) || isset($out[$k])) continue;
            $out[$k] = true; $queue[] = [$nq, $nr];
        }
    }
    $g = [];
    for ($q = $minQ; $q <= $maxQ; $q++) for ($r = $minR; $r <= $maxR; $r++) {
        $k = "$q,$r";
        if (!isset($occ[$k]) && !isset($out[$k])) $g[$k] = true;
    }
    return $g;
};

// Can an empty hex reach the far border of a generous box? (= NOT enclosed)
$canEscape = function (array $occ, string $start, array $b) use ($PF_DIRS): bool {
    [$loQ, $hiQ, $loR, $hiR] = $b;
    $seen = [$start => true]; $queue = [$start];
    while ($queue) {
        $cur = array_shift($queue);
        [$q, $r] = array_map('intval', explode(',', $cur));
        if ($q === $loQ || $q === $hiQ || $r === $loR || $r === $hiR) return true;
        foreach ($PF_DIRS as $d) {
            $nq = $q + $d[0]; $nr = $r + $d[1]; $k = "$nq,$nr";
            if ($nq < $loQ || $nq > $hiQ || $nr < $loR || $nr > $hiR) continue;
            if (isset($occ[$k]) || isset($seen[$k])) continue;
            $seen[$k] = true; $queue[] = $k;
        }
    }
    return false;
};

$boards = 8; $escapes = 0; $mismatches = 0; $sawGaps = false; $checked = 0;
for ($i = 0; $i < $boards; $i++) {
    $res = (new BoardGenerator(['maxBuildAttempts' => 50]))->generate();
    if (empty($res['valid'])) continue;
    $checked++;
    $hexes = $res['hexes'];

    $prod = [];
    foreach (HexUtils::findEnclosedGapHexes($hexes) as $g) { $prod[$g['q'] . ',' . $g['r']] = true; }
    if ($prod) $sawGaps = true;

    if ($prod !== $enclosedAtMargin($hexes, 6)) $mismatches++;

    $occ = [];
    foreach ($hexes as $h) { $occ[(int)$h['q'] . ',' . (int)$h['r']] = true; }
    [$minQ, $maxQ, $minR, $maxR] = $bounds($hexes);
    $box = [$minQ - 10, $maxQ + 10, $minR - 10, $maxR + 10];
    foreach (array_keys($prod) as $k) {
        if ($canEscape($occ, $k, $box)) $escapes++;
    }
}
check($checked > 0, 'board generator produced at least one valid board to test');
check($sawGaps, 'real boards actually contain enclosed gap shallows (test has teeth)');
check($escapes === 0, 'every gap shallow is fully enclosed — none can reach open ocean');
check($mismatches === 0, "production 1-hex margin matches a generous 6-hex recompute");

// ---------------------------------------------------------------------------
// HexUtils::connectedRegionSizes — backs BoardGenerator's cap on how large a
// single patch of artificial shallows may be.
// ---------------------------------------------------------------------------
check(HexUtils::connectedRegionSizes([]) === [], 'no hexes yields no regions');
check(HexUtils::connectedRegionSizes(occ(['0,0'])) === [1], 'a lone hex is a 1-region');

// A straight line of three is one region; adjacency must follow the ship's
// six-neighbour rule, the same one findEnclosedGapHexes uses.
check(HexUtils::connectedRegionSizes(occ(['0,0', '1,0', '2,0'])) === [3],
    'three in a line form one region of 3');

// An L bend is still one region.
check(HexUtils::connectedRegionSizes(occ(['0,0', '1,0', '1,1'])) === [3],
    'an L bend of three is one region of 3');

// Two hexes far apart are two separate regions, never merged.
check(HexUtils::connectedRegionSizes(occ(['0,0', '9,9'])) === [1, 1],
    'distant hexes stay separate regions');

// Sizes come back largest first, so callers can read $sizes[0].
check(HexUtils::connectedRegionSizes(occ(['5,5', '0,0', '1,0', '2,0'])) === [3, 1],
    'sizes are ordered largest first');

// The size the cap actually rejects.
check(HexUtils::connectedRegionSizes(occ(['0,0', '1,0', '2,0', '3,0'])) === [4],
    'a four-hex patch measures 4, which exceeds the cap');

// Duplicate coordinates must not inflate a region.
check(HexUtils::connectedRegionSizes(occ(['0,0', '0,0', '1,0'])) === [2],
    'duplicate hexes are counted once');

// ---------------------------------------------------------------------------
// The generator must never emit a board over the cap.
// ---------------------------------------------------------------------------
$cap = BoardGenerator::MAX_SHALLOWS_AREA;
check($cap === 3, "shallows patch cap is 3 (got $cap)");

$boards = 0; $worst = 0; $sawAtCap = false; $failedGen = 0;
for ($i = 0; $i < 40; $i++) {
    mt_srand(7000 + $i);
    $gen = new BoardGenerator(['randFn' => 'mt_rand']);
    $res = $gen->generate();
    if (empty($res['valid'])) { $failedGen++; continue; }
    $boards++;
    $sizes = HexUtils::connectedRegionSizes(HexUtils::findEnclosedGapHexes($res['hexes']));
    $largest = $sizes ? $sizes[0] : 0;
    if ($largest > $worst) $worst = $largest;
    if ($largest === $cap) $sawAtCap = true;
}
check($boards > 0, 'generator produced boards to measure');
check($failedGen === 0, "the cap must not make generation fail (failed: $failedGen)");
check($worst <= $cap, "no generated board exceeds the cap (worst patch seen: $worst)");
// Teeth: if the generator never even approached the cap, this would pass
// vacuously and a regression could slip through unnoticed.
check($sawAtCap, 'boards do reach the cap, so the assertion above has teeth');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
