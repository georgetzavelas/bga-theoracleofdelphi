<?php
/**
 * The player board and the player panel list each Zeus column in the same
 * order.
 *
 * The panel's tiles come from a query ordered by sort_order. The board fills
 * its slots in the order gamedatas.zeusTiles arrives, and that query had no
 * ORDER BY, so its order was whatever the database chose. It matched only
 * because setup happens to insert tiles in sort_order.
 *
 * Run: php tests/test_zeus_tile_order.php
 */
$src = file_get_contents(__DIR__ . '/../modules/php/Game.php');
$pass = 0; $fail = 0;
function check($cond, $msg) { global $pass, $fail; if ($cond) $pass++; else { $fail++; echo "  FAIL: $msg\n"; } }

$at = strpos($src, "\$result['zeusTiles'] = self::getObjectListFromDB(");
check($at !== false, 'the board query is found');
$sql = substr($src, $at, strpos($src, ');', $at) - $at);
check((bool)preg_match('/ORDER BY player_id, task_type, sort_order/', $sql),
    'the board query orders each column by sort_order');

$panelSql = substr($src, strpos($src, 'completion_value AS completionValue'), 400);
check((bool)preg_match('/ORDER BY player_id, task_type, sort_order/', $panelSql),
    'the same order as the panel query');

echo "\n$pass passed, $fail failed\n";
exit($fail ? 1 : 0);
