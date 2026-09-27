<?php
/**
 * A Zeus tile returned to the box reads as returned on the panel, even in a
 * game that began before the zeus_tiles_returned global existed.
 *
 * Reported with Head Start: the returned wild monster tile came back
 * done:true, returned:false, completionValue:null, so the panel drew it as a
 * finished tile with no grey and no X.
 *
 * For a colour tile the row settles it: every real completion goes through
 * completeZeusTileForType, which stamps completion_value with the colour or
 * monster used (a non-null string by its signature), so only a return leaves
 * a done colour tile without one. A shrine completion never stamps it, so a
 * shrine still depends on the global.
 *
 * Run: php tests/test_returned_tile_inference.php
 */
$src = file_get_contents(__DIR__ . '/../modules/php/Game.php');
$pass = 0; $fail = 0;
function check($cond, $msg) { global $pass, $fail; if ($cond) $pass++; else { $fail++; echo "  FAIL: $msg\n"; } }

// The rule, lifted from getAllDatas and run on the reported rows.
check((bool)preg_match('/\$returned = (isset\(\$returnedTileIds\[\(int\)\$row\[\'id\'\]\]\)\s*\|\|\s*\(\$row\[\'type\'\] !== \'shrine\' && \(bool\)\$row\[\'done\'\] && \$completionValue === null\));/', $src, $m),
    'getAllDatas derives returned from the global, or from a done colour tile with no completion value');
$rule = function (array $row, array $returnedTileIds) use ($m) {
    $completionValue = $row['completionValue'];
    return eval('return ' . ($m[1] ?? 'false') . ';');
};
check($rule(['id' => 23, 'type' => 'monster', 'done' => 1, 'completionValue' => null], []) === true,
    'the reported tile: a done wild monster with no value is returned, with no global');
check($rule(['id' => 8, 'type' => 'offering', 'done' => 1, 'completionValue' => 'blue'], []) === false,
    'a colour tile finished for real (it has a value) is not');
check($rule(['id' => 9, 'type' => 'statue', 'done' => 0, 'completionValue' => null], []) === false,
    'an open tile is not');
check($rule(['id' => 13, 'type' => 'shrine', 'done' => 1, 'completionValue' => null], []) === false,
    'a built shrine (never has a value) is not, without the global');
check($rule(['id' => 13, 'type' => 'shrine', 'done' => 1, 'completionValue' => null], [13 => 0]) === true,
    'a shrine is returned when the global says so');
check(strpos($src, "'returned'        => \$returned,") !== false, 'and the panel state carries it');

// The premise: every colour completion stamps a value.
check((bool)preg_match('/function completeZeusTileForType\(int \$playerId, string \$taskType, string \$value\)/', $src),
    'completeZeusTileForType takes the colour as a non-null string');
check((bool)preg_match('/completeZeusTileForType[^{]*\{[^}]*markZeusTileCompleted\(\$playerId, \$tileId, \$taskType, \$value\)/s', $src),
    'and passes it through to be stamped');
preg_match_all('/markZeusTileCompleted\(([^)]*)\)/', $src, $calls);
$callers = array_filter($calls[1], function ($a) { return strpos($a, 'int $playerId') === false; });
check(count($callers) === 2 && count(array_filter($callers, function ($a) { return strpos($a, "'shrine'") !== false; })) === 1,
    'the only other completion is the shrine one, which stamps nothing');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
