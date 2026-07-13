<?php
/**
 * Tests for HexUtils::findEnclosedGapHexes — the "artificial shallows"
 * (enclosed holes between assembled cluster tiles) that Shallow Runner
 * (Equipment 014) must be able to cross.
 * Run: php tests/test_gap_shallows.php
 */
require_once __DIR__ . '/../modules/php/ClusterDefinitions.php';
require_once __DIR__ . '/../modules/php/HexUtils.php';

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

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
