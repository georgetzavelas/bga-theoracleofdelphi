<?php
/**
 * Regression lint: Blessed Reward (Equipment 011) must fire when the monster
 * reward picked is Island Scout (Equipment 013) and the player explores with it.
 *
 * Reported from a live game: the player owned Blessed Reward, defeated a monster,
 * took Island Scout, revealed a psi shrine, and never got the god step.
 *
 * CombatVictory defers the Blessed Reward step behind the one-time card's
 * sub-state (pending_blessed_reward_type) and stashes its exit in
 * equipment_post_activation_state. Both are only acted on by
 * Game::resolvePostActivationExit. Island Scout's reveal hands off to
 * ExploreIsland, whose exits went straight to nextStateAfterDieAction, so the
 * deferred step was dropped and PlayerTurnStart silently cleared it next turn.
 * The sigma and own-shrine branches lost it too: they overwrote
 * god_advance_reason ('equipment_13'), so ChooseGodAdvancement::finish took its
 * non-equipment exit. The Omega branch lost it through ChooseInjuryColor.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_blessed_reward_island_scout.php
 */

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

$gameSrc    = file_get_contents("$root/modules/php/Game.php");
$exploreSrc = file_get_contents("$root/modules/php/States/ExploreIsland.php");
$injurySrc  = file_get_contents("$root/modules/php/States/ChooseInjuryColor.php");
$scoutSrc   = file_get_contents("$root/modules/php/States/ScoutIslands.php");

// ---------------------------------------------------------------------------
// 1. Island Scout tags the explore as part of an equipment chain. Everything
//    below keys off this tag.
// ---------------------------------------------------------------------------
$reveal = methodBody($scoutSrc, 'actRevealIsland');
check(str_contains($reveal, "'god_advance_reason', 'equipment_13'"),
      'ScoutIslands::actRevealIsland tags the explore with equipment_13');

// ---------------------------------------------------------------------------
// 2. The shared explore exit routes an equipment-chain explore through
//    resolvePostActivationExit, which is the only place the deferred Blessed
//    Reward step fires.
// ---------------------------------------------------------------------------
$helper = methodBody($gameSrc, 'nextStateAfterExplore');
check($helper !== '', 'Game::nextStateAfterExplore() exists');
check(str_contains($helper, "'god_advance_reason'") && str_contains($helper, "'equipment_'"),
      'the explore exit detects an equipment-chain explore from god_advance_reason');
check(str_contains($helper, "'equipment_post_activation_state'"),
      'the explore exit reads the stashed equipment exit');
check(str_contains($helper, 'resolvePostActivationExit'),
      'the explore exit hands an equipment-chain explore to resolvePostActivationExit, '
      . 'so a deferred Blessed Reward step fires');
check(str_contains($helper, 'nextStateAfterDieAction'),
      'a plain die explore still exits through nextStateAfterDieAction');
check(preg_match("/set\('god_advance_reason',\s*null\)/", $helper) === 1,
      'the explore exit clears the equipment tag so it cannot leak into a later explore');
check(preg_match("/set\('equipment_post_activation_state',\s*null\)/", $helper) === 1,
      'the explore exit consumes the stash so it cannot leak into a later chain');

// ---------------------------------------------------------------------------
// 3. Every exit of the reveal chain uses that helper. Psi, Phi, an empty
//    island and an unmatched bonus leave via ExploreIsland::returnToActions;
//    Omega with injuries leaves via ChooseInjuryColor.
// ---------------------------------------------------------------------------
$return = methodBody($exploreSrc, 'returnToActions');
check(str_contains($return, 'nextStateAfterExplore'),
      'ExploreIsland::returnToActions exits through nextStateAfterExplore');
check(!str_contains($return, 'nextStateAfterDieAction'),
      'ExploreIsland::returnToActions does not bypass the helper');

$injuryFinish = methodBody($injurySrc, 'finish');
check(str_contains($injuryFinish, 'nextStateAfterExplore'),
      'ChooseInjuryColor::finish (Omega) exits through nextStateAfterExplore');
check(!str_contains($injuryFinish, 'nextStateAfterDieAction'),
      'ChooseInjuryColor::finish does not bypass the helper');

// ---------------------------------------------------------------------------
// 4. The sigma and own-shrine branches open ChooseGodAdvancement. They must not
//    overwrite an equipment_ reason, or ChooseGodAdvancement::finish takes its
//    non-equipment exit and the deferred step is lost again.
// ---------------------------------------------------------------------------
$exploreCode = stripComments($exploreSrc);
check(preg_match("/set\('god_advance_reason',\s*'(shrine_reward|sigma_bonus)'\)/", $exploreCode) === 0,
      'ExploreIsland never writes shrine_reward/sigma_bonus over the reason directly');
$tag = methodBody($exploreSrc, 'tagGodAdvanceReason');
check($tag !== '' && str_contains($tag, "'equipment_'"),
      'ExploreIsland::tagGodAdvanceReason keeps an existing equipment_ reason');
check(substr_count($exploreCode, "tagGodAdvanceReason('shrine_reward')") === 1
      && substr_count($exploreCode, "tagGodAdvanceReason('sigma_bonus')") === 1,
      'both god-advance branches tag their reason through the guarded helper');

$godFinish = methodBody(file_get_contents("$root/modules/php/States/ChooseGodAdvancement.php"), 'finish');
check(preg_match("/str_starts_with\(\\\$reason,\s*'equipment_'\).*resolvePostActivationExit/s", $godFinish) === 1,
      'ChooseGodAdvancement::finish routes an equipment_ reason through resolvePostActivationExit');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
