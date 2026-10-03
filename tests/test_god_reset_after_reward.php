<?php
/**
 * A god whose power starts an action drops to the bottom of its track only
 * once the whole action has resolved.
 *
 * Rules: "Only after it is completed does the God move down to the bottom row
 * from where it may advance up again."
 *
 * Reported: Ares was lowered before all the side effects of his action were
 * done. Ares' auto-defeat stashes pending_god_reset='ares' and goes to
 * CombatVictory, whose actSelectEquipment asked nextStateAfterDieAction for
 * the exit (which consumes the reset) BEFORE applying the picked card's
 * one-time effect and Blessed Reward. So Ares dropped first, and a god advance
 * from that reward (card 007 / 021, Blessed Reward) could move him straight
 * back up -- the exact thing the deferral exists to prevent.
 *
 * Fixed by asking for the exit without consuming (nextStateAfterDieAction(...,
 * false)) and consuming at the real end of the chain: the bottom of
 * actSelectEquipment when the reward resolves inline, or
 * resolvePostActivationExit, which every one-time sub-state and Blessed
 * Reward's god step leave through.
 *
 * Artemis uses the same deferral through ExploreIsland and was checked here
 * too: every bonus that opens a sub-state returns before the reset, and each
 * sub-state ends through nextStateAfterDieAction. These assertions pin both.
 *
 * A source lint because Game extends \Bga\GameFramework\Table and cannot be
 * instantiated off-platform.
 *
 * Run: php tests/test_god_reset_after_reward.php
 */
$root = __DIR__ . '/..';
$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}
function stripComments(string $src): string {
    return preg_replace('!//[^\n]*!', '', preg_replace('!/\*.*?\*/!s', '', $src));
}
function methodBody(string $src, string $name): string {
    $src = stripComments($src);
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
$game    = file_get_contents("$root/modules/php/Game.php");
$victory = file_get_contents("$root/modules/php/States/CombatVictory.php");
$god     = file_get_contents("$root/modules/php/States/UseGodAbility.php");
$explore = file_get_contents("$root/modules/php/States/ExploreIsland.php");
$choose  = file_get_contents("$root/modules/php/States/ChooseGodAdvancement.php");
$injury  = file_get_contents("$root/modules/php/States/ChooseInjuryColor.php");
$scout   = file_get_contents("$root/modules/php/States/ScoutIslands.php");

// ---- nextStateAfterDieAction can be asked without consuming --------------
$next = methodBody($game, 'nextStateAfterDieAction');
check((bool)preg_match('/function nextStateAfterDieAction\(int \$playerId, bool \$consumeGodReset = true\)/', $game),
    'nextStateAfterDieAction takes $consumeGodReset, defaulting to true so every other caller is unchanged');
check((bool)preg_match('/if \(\$consumeGodReset\)\s*\{\s*\$this->consumePendingGodReset\(\$playerId\);\s*\}/', $next),
    'and only consumes the reset when asked to');

// ---- Ares: CombatVictory holds the reset until the reward is done --------
$select = methodBody($victory, 'actSelectEquipment');
$aresBranch = substr($select, strpos($select, 'if ($isAresDefeat)'), strpos($select, '} else {') - strpos($select, 'if ($isAresDefeat)'));
check(str_contains($aresBranch, 'nextStateAfterDieAction($activePlayerId, false)'),
    'the Ares branch asks for its exit without dropping Ares');
check(!str_contains($aresBranch, 'afterCombatTransition') && !str_contains($aresBranch, 'consumePendingGodReset'),
    'and nothing in that branch drops him');
$oneTime  = strpos($select, 'applyOneTimeEquipmentEffect');
$blessed  = strpos($select, 'maybeGrantBlessedRewardGodStep');
$consume  = strrpos($select, 'consumePendingGodReset');
$lastRet  = strrpos($select, 'return $nextState;');
check($oneTime !== false && $blessed !== false && $consume !== false && $lastRet !== false
    && $oneTime < $consume && $blessed < $consume && $consume < $lastRet,
    'Ares drops only after the one-time card effect and Blessed Reward, just before the inline exit');
check(substr_count($select, 'consumePendingGodReset') === 1,
    'and only there, so the sub-state exits are left to resolvePostActivationExit');

// ---- the end of every reward sub-state drops a held god ------------------
$exit = methodBody($game, 'resolvePostActivationExit');
$react = strpos($exit, 'maybeGrantBlessedRewardGodStep');
$drop  = strpos($exit, 'consumePendingGodReset');
$ret   = strrpos($exit, 'return $exit;');
check($react !== false && $drop !== false && $ret !== false && $react < $drop && $drop < $ret,
    'resolvePostActivationExit drops a held god after the Blessed Reward step, as the chain\'s final exit');
check((bool)preg_match('/if \(\$post === \'\'\)\s*\{\s*\$this->game->consumePendingGodReset\(.*?\);\s*return PlayerActions::class;/s', stripComments($scout)),
    'Island Scout\'s fallback exit, which skips resolvePostActivationExit, drops it too');
foreach (['SelectOfferingFromAnyIsland', 'SelectStatueFromAnyCity', 'SelectGodForTopStep'] as $state) {
    $src = file_get_contents("$root/modules/php/States/$state.php");
    check(str_contains(methodBody($src, 'popExitState'), 'resolvePostActivationExit'),
        "$state leaves through resolvePostActivationExit");
}
check(str_contains(methodBody($choose, 'finish'), 'resolvePostActivationExit'),
    'a card\'s god advancement (card 007, Blessed Reward) leaves through it too');

// ---- Ares sets the deferral, never resets directly -----------------------
$defeat = methodBody($god, 'actDefeatMonster');
check(str_contains($defeat, "set('pending_god_reset', 'ares')") && !str_contains($defeat, 'resetGod('),
    'Ares\' power defers his reset rather than resetting on use');

// ---- Artemis: verified correct, kept that way ----------------------------
$artemis = methodBody($god, 'actExploreIsland');
check(str_contains($artemis, "set('pending_god_reset', 'artemis')") && !str_contains($artemis, 'resetGod('),
    'Artemis\' power defers her reset too');
$exploreSrc = stripComments($explore);
check(!str_contains($exploreSrc, 'consumePendingGodReset') && !str_contains($exploreSrc, 'resetGod('),
    'ExploreIsland never drops the god while a bonus is resolving');
check(str_contains(methodBody($explore, 'returnToActions'), 'nextStateAfterDieAction($playerId)'),
    'it drops only on its way back to the player\'s actions, after every inline bonus');
check(str_contains(methodBody($choose, 'finish'), 'return $this->game->nextStateAfterDieAction($playerId);'),
    'a Sigma or own-shrine god advancement drops it when the player finishes advancing');
check(str_contains(methodBody($injury, 'finish'), 'nextStateAfterDieAction($playerId)'),
    'Omega\'s injury discard drops it when the discard is done');

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
