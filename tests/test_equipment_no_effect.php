<?php
/**
 * Equipment cards that would do nothing for the picking player are flagged on
 * the pick, so nobody takes one by accident.
 *
 * Inventory of the 22 cards (the rest always do something):
 *   17/18 offering Hooks, 19/20 statue Hooks: nothing useful to take (ship
 *     full, no open task for their colours, or none of those on the board).
 *     Reported: two statue tasks done and the third claimed by a statue on
 *     the ship still offered the Cool Statue Hook.
 *   13 Island Scout: fewer than 2 face-down islands (rulebook: cannot be used)
 *   21 Divine Surge: its four gods all on the top row
 *    9 Long Hook: no statue task left        12 Altar Caller: no offering task
 *   11 Blessed Reward: no offering/statue/monster task left
 *   16 Reinforced Hull: no cargo task left and shield already 5
 *
 * Also fixes the Hooks opening an empty picker: they only checked that an item
 * of their colours was on the board, not that the player could use one.
 *
 * Source lint: the game classes cannot run off-platform.
 *
 * Run: php tests/test_equipment_no_effect.php
 */
$root = __DIR__ . '/..';
$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}
function methodBody(string $src, string $name): string {
    $at = strpos($src, "function $name(");
    if ($at === false) return '';
    $open = strpos($src, '{', $at);
    $depth = 0;
    for ($i = $open, $n = strlen($src); $i < $n; $i++) {
        if ($src[$i] === '{') $depth++;
        if ($src[$i] === '}' && --$depth === 0) return substr($src, $open, $i - $open + 1);
    }
    return '';
}
$game = file_get_contents("$root/modules/php/Game.php");
$reason = methodBody($game, 'equipmentNoEffectReason');

$expect = [
    '17' => "hookNoEffectReason(\$playerId, 'offering'", '18' => "hookNoEffectReason(\$playerId, 'offering'",
    '19' => "hookNoEffectReason(\$playerId, 'statue'",   '20' => "hookNoEffectReason(\$playerId, 'statue'",
    '13' => "'scout_islands'", '21' => "'surge_gods'", '9' => "'statues_done'",
    '12' => "'offerings_done'", '11' => "'rewards_done'", '16' => "'hull_done'",
];
foreach ($expect as $card => $needle) {
    check((bool)preg_match('/case ' . $card . ':.*?' . preg_quote($needle, '/') . '/s', $reason),
        "card $card is checked ($needle)");
}
foreach ([0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 14, 15] as $card) {
    check(!preg_match('/case ' . $card . ':/', $reason), "card $card is never flagged: it always does something");
}
check((bool)preg_match("/\\\$faceDown < 2 \\? 'scout_islands'/", $reason),
    'Island Scout follows the rulebook: fewer than 2 face-down islands');
check(str_contains($reason, "findCompletableZeusTileForType(\$playerId, 'monster', \$pendingMonsterType)"),
    'Blessed Reward discounts the monster task this very pick completes');

$hook = methodBody($game, 'hookNoEffectReason');
check(str_contains($hook, "return 'ship_full'") && str_contains($hook, 'getCargoCapacity'), 'a Hook needs a free cargo slot');
check(str_contains($hook, 'usefulCargoColors($playerId, $type)') && str_contains($hook, "return 'hook_no_task'"),
    'and a colour that fills an open task the player is not already carrying (the pickers\' own gate)');
check(str_contains($hook, "'hook_none_on_board'"), 'and one of those on the board');

check(str_contains(methodBody($game, 'setupOfferingPick'), "hookNoEffectReason(\$playerId, 'offering', \$colors) !== null")
    && str_contains(methodBody($game, 'setupStatuePick'), "hookNoEffectReason(\$playerId, 'statue', \$colors) !== null"),
    'a Hook with nothing usable is spent at once, not dropped into an empty picker');

$victory = file_get_contents("$root/modules/php/States/CombatVictory.php");
$starting = file_get_contents("$root/modules/php/States/SelectStartingEquipment.php");
check(str_contains(methodBody($victory, 'getArgs'), "'equipmentNoEffect' => \$this->game->equipmentNoEffectMap("),
    'the monster-reward pick sends the reasons');
check(str_contains(methodBody($starting, 'getArgs'), "'equipmentNoEffect' => \$this->game->equipmentNoEffectMap("),
    'and so does the starting-equipment pick');

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
