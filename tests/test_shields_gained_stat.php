<?php
/**
 * "Shields gained" (stat shield_raised, id 35) counts every shield level a
 * player gets, starting ones included, so it always equals their shield.
 *
 * Reported: a player raised their shield to 2 and the stat said 1. It counted
 * raises, not levels: a Hero companion's +2 added 1, and the shield ship
 * tile's starting +2 added nothing. Shields never go down, so counting levels
 * everywhere makes the stat equal the final shield value.
 *
 * Every write to shield_value must be paired with a statInc of the levels it
 * added. Source lint: the game classes cannot run off-platform.
 *
 * Run: php tests/test_shields_gained_stat.php
 */
$root = __DIR__ . '/..';
$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

$stats = json_decode(file_get_contents("$root/stats.json"), true);
$found = null;
array_walk_recursive($stats, function () {});
foreach ($stats as $section) {
    if (is_array($section) && isset($section['shield_raised'])) $found = $section['shield_raised'];
}
check($found !== null && $found['name'] === 'Shields gained' && (int)$found['id'] === 35,
    'the stat is named "Shields gained" and keeps id 35, so past games still map to it');

// Every shield write in the game, and the stat increment that must sit with it.
$sites = [];
foreach (glob("$root/modules/php/{,States/}*.php", GLOB_BRACE) as $file) {
    $src = file_get_contents($file);
    if (!preg_match_all('/shield_value = (?!\$shieldValue,)[^"\n]*WHERE player_id/', $src, $m, PREG_OFFSET_CAPTURE)) continue;
    foreach ($m[0] as [$text, $at]) {
        $window = substr($src, $at, 700);
        $sites[] = [basename($file), $text, $window];
    }
}
check(count($sites) === 4, 'four in-game shield writes (draft tile, Reinforced Hull, Omega, Hero), found ' . count($sites));
foreach ($sites as [$file, $text, $window]) {
    $levels = preg_match('/statInc\(\$newShield - \$currentShield, \'shield_raised\'/', $window)
        || (str_contains($text, 'shield_value + 2') && preg_match('/statInc\(2, \'shield_raised\'/', $window));
    check((bool)$levels, "$file: \"$text\" counts the levels it adds");
}
$game = file_get_contents("$root/modules/php/Game.php");
check((bool)preg_match('/shield_value = \$shieldValue,.*?if \(\$shieldValue > 0\) \{\s*\$this->statInc\(\$shieldValue, \'shield_raised\'/s', $game),
    'random setup counts the starting shield from the shield ship tile');
check(!preg_match('/statInc\(1, \'shield_raised\'/', $game . file_get_contents("$root/modules/php/States/ExploreIsland.php")
        . file_get_contents("$root/modules/php/States/SelectReward.php")),
    'nothing still counts a raise as 1 regardless of levels');

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
