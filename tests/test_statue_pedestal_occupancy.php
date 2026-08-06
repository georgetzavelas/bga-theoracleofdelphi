<?php
/**
 * Regression lint: one statue per pedestal.
 *
 * A statue island carries three pedestals, one per colour, and the three
 * colours on any island are distinct (MaterialDefs::STATUE_ISLAND_COLORS).
 * Each colour has exactly three pedestals, spread one-per-island across three
 * islands, and there are exactly three statues of each colour — so the
 * intended fit is one statue per pedestal, with no slack anywhere.
 *
 * Both raise paths only asked "does this island have a pedestal of the die's
 * colour?" and never "is it still free?". The island query is unfiltered, and
 * the commit is a bare `UPDATE statue SET is_raised = 1, raised_at_hex_q = …`.
 * So two players each carrying a red statue, each adjacent to the same island,
 * could both raise onto its single red pedestal. It showed: DeliverCargo
 * derives the pedestal slot with array_search(colour) alone, so the second
 * statue rendered at the identical offset, on top of the first.
 *
 * (A single player could not normally reach it — the LOAD paths gate on
 * wouldCompleteZeusTileForType and a player never holds two statue tasks of
 * the same colour. That protection is incidental, not a pedestal rule, which
 * is why the check belongs here.)
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_statue_pedestal_occupancy.php
 */

require_once __DIR__ . '/../modules/php/MaterialDefs.php';

use Bga\Games\theoracleofdelphi\MaterialDefs;

$root = $argv[1] ?? (__DIR__ . '/..');
$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

function stripComments(string $src): string {
    return preg_replace('!//[^\n]*!', '', preg_replace('!/\*.*?\*/!s', '', $src));
}

/** Extract a method body by brace matching, comments removed. */
function methodBody(string $src, string $name): string {
    $src = stripComments($src);
    $at = strpos($src, "function $name(");
    if ($at === false) return '';
    $open = strpos($src, '{', $at);
    if ($open === false) return '';
    $depth = 0;
    for ($i = $open, $n = strlen($src); $i < $n; $i++) {
        if ($src[$i] === '{') $depth++;
        if ($src[$i] === '}' && --$depth === 0) return substr($src, $open, $i - $open + 1);
    }
    return '';
}

// ---------------------------------------------------------------------------
// 1. The board premise the rule rests on. If a future layout ever gave one
//    island two pedestals of the same colour, "one statue of colour X per
//    island" would stop being the right rule and this whole check would need
//    rethinking — so assert it rather than assume it.
// ---------------------------------------------------------------------------
$islands = MaterialDefs::STATUE_ISLAND_COLORS;
check(count($islands) === 6, 'six statue islands, got ' . count($islands));

$dupes = [];
$perColour = [];
foreach ($islands as $cluster => $colors) {
    check(count($colors) === 3, "$cluster has 3 pedestals");
    if (count(array_unique($colors)) !== count($colors)) $dupes[] = $cluster;
    foreach ($colors as $c) { $perColour[$c] = ($perColour[$c] ?? 0) + 1; }
}
check($dupes === [],
      'no island has two pedestals of one colour: ' . implode(', ', $dupes));

$wrong = array_keys(array_filter($perColour, fn($n) => $n !== 3));
check($wrong === [],
      'each colour has exactly 3 pedestals board-wide; off: ' . implode(', ', $wrong));
check(count($perColour) === 6, 'all six colours appear');

// ---------------------------------------------------------------------------
// 2. The shared occupancy helper.
// ---------------------------------------------------------------------------
$gameSrc = file_get_contents("$root/modules/php/Game.php");
$helper  = methodBody($gameSrc, 'statuePedestalOccupied');
check($helper !== '', 'Game::statuePedestalOccupied() exists');
check(preg_match('/public function statuePedestalOccupied/', $gameSrc) === 1,
      'it is public, so both states can call it');
check(str_contains($helper, 'is_raised = 1'), 'it only counts RAISED statues');
check(str_contains($helper, 'raised_at_hex_q') && str_contains($helper, 'raised_at_hex_r'),
      'it is scoped to one island hex, not the whole board');
check(preg_match("/color = '\\\$safeColor'/", $helper) === 1,
      'it is scoped to the one pedestal colour, so a red statue does not block '
      . 'the same island\'s black pedestal');
check(str_contains($helper, 'addslashes'), 'the colour is escaped');

// ---------------------------------------------------------------------------
// 3. BOTH raise paths consult it. The args layer stops the hex being offered
//    and highlighted; the commit stops a stale client racing it. A fix applied
//    to only one would look correct in play until two picks collided.
// ---------------------------------------------------------------------------
$paths = [
    'SelectAction.php' => 'getDeliverableStatues',
    'DeliverCargo.php' => 'getDeliverableStatuesForPlayer',
];
foreach ($paths as $file => $fn) {
    $src  = file_get_contents("$root/modules/php/States/$file");
    $body = methodBody($src, $fn);
    check($body !== '', "$file::$fn() is extractable");
    check(str_contains($body, 'statuePedestalOccupied'),
          "$file checks pedestal occupancy");
    // It must SKIP the island, not merely compute the fact.
    check(preg_match('/statuePedestalOccupied\([^)]*\)\)\s*continue;/', $body) === 1,
          "$file skips an occupied pedestal");
    // Still gated on the island actually having that colour — the new check
    // supplements the colour match, it does not replace it.
    check(str_contains($body, 'STATUE_ISLAND_COLORS'),
          "$file still requires the island to have a pedestal of that colour");
}

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
