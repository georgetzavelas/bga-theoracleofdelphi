<?php
/**
 * The "Ship tile" player stat records which ship tile each player used.
 *
 * Stored as tile id + 1, so the stat's starting 0 means "None", and named
 * through stats.json value_labels. That list has to follow
 * MaterialDefs::shipTileNames() exactly, or a stat would show the wrong
 * tile; this test keeps the two in step.
 *
 * Run: php tests/test_ship_tile_stat.php
 */
$root = __DIR__ . '/..';
$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

$stats = json_decode(file_get_contents("$root/stats.json"), true);
$stat = $stats['player']['ship_tile'] ?? null;
check($stat !== null && $stat['type'] === 'int' && $stat['name'] === 'Ship tile', 'a player stat "Ship tile" exists');

// Player and table ids are separate lists (several overlap already), but
// value_labels is keyed by id alone and applies to both, so the id must be
// unique among player stats and unused by any table stat.
$playerIds = array_map(fn($s) => (int)$s['id'], array_values($stats['player']));
$tableIds  = array_map(fn($s) => (int)$s['id'], array_values($stats['table']));
check(count($playerIds) === count(array_unique($playerIds)), 'its id is unique among player stats');
check(!in_array((int)$stat['id'], $tableIds, true), 'and no table stat shares it, so its labels apply to it alone');

$labels = $stats['value_labels'][(string)($stat['id'] ?? '')] ?? null;
check(is_array($labels) && $labels[0] === 'None', 'value 0 reads "None"');

// Tile names from MaterialDefs, read from source (clienttranslate is a BGA helper).
$defs = file_get_contents("$root/modules/php/MaterialDefs.php");
preg_match('/function shipTileNames\(\): array\s*\{\s*return \[(.*?)\];/s', $defs, $m);
preg_match_all("/(\d+) => clienttranslate\('([^']+)'\)/", $m[1] ?? '', $names, PREG_SET_ORDER);
check(count($names) >= 8, 'ship tile names found');
foreach ($names as [, $id, $name]) {
    check(($labels[(int)$id + 1] ?? null) === $name, "tile $id ($name) has label " . ((int)$id + 1));
}
check(count($labels) === count($names) + 1, 'no extra labels');

$end = file_get_contents("$root/modules/php/States/EndScore.php");
check((bool)preg_match('/statInc\(\(int\)\$tileId \+ 1, \'ship_tile\', \$playerId\)/', $end),
    'EndScore records the tile as id + 1');
check(str_contains($end, '$this->recordShipTile($pid);'), 'for every player');
$game = file_get_contents("$root/modules/php/Game.php");
check((bool)preg_match("/'ship_tile',\s*\];/", $game), 'and the stat is initialised at setup');

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
