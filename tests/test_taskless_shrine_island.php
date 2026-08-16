<?php
/**
 * Regression lint: exploring your OWN shrine island with no shrine task left.
 *
 * Rules p.11, "Explore an Island", branches on whether the revealed image
 * "matches 1 of your Zeus Tiles" — NOT on whether the island is your player
 * colour. The code branched on colour:
 *
 *     if ($shrinePlayerId === $playerId) buildOwnShrine(...)   // build path
 *     else                               applyExplorerBonus(...)   // letter reward
 *
 * Those agree only while shrine TOKENS and shrine TASKS stay in lockstep. They
 * don't. Setup deals 3 shrine tokens and 3 shrine Zeus tiles, but the
 * fewer_tasks ship tile (MaterialDefs::SHIP_TILES[6], "Return a Zeus Tile of
 * your choice to the box") can return a shrine tile, leaving 3 own-colour
 * islands against 2 tasks. On the third island the owner matched no Zeus tile,
 * so by the rules they were owed the Greek-letter reward — and got nothing:
 *
 *     slosser explores an island, revealing a phi shrine
 *     slosser builds a shrine
 *     slosser ends their turn            <- no task completed, no reward
 *
 * Two separate defects behind that log. markShrineBuiltAndComplete placed the
 * token and fired shrineBuilt BEFORE looking for a task, so a shrine landed on
 * a taskless island; and buildOwnShrine returned straight to the action loop
 * instead of falling through to the letter reward. Both are asserted here.
 *
 * The same mismatch reaches the deliberate Build a Shrine action, where it is
 * worse — the player spends a die for a token and no task — so the gate that
 * offers it is asserted too.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform. The
 * assertions are ORDER-based, which a comment cannot satisfy: they compare
 * positions of statements inside a comment-stripped body.
 *
 * Run: php tests/test_taskless_shrine_island.php
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
$actionSrc  = file_get_contents("$root/modules/php/States/SelectAction.php");

// ---- 1. the token must not be placed before a task is found ----------------
$build = methodBody($gameSrc, 'markShrineBuiltAndComplete');
check($build !== '', 'markShrineBuiltAndComplete found');

$lookupAt  = strpos($build, 'FROM zeus_tile');
$bailAt    = strpos($build, 'if (!$zeusTile) return null;');
$placeAt   = strpos($build, 'UPDATE shrine SET is_built = 1');
$notifyAt  = strpos($build, '"shrineBuilt"');

check($lookupAt !== false, 'zeus_tile lookup present');
check($bailAt !== false, 'null bail-out present when no task matches');
check($placeAt !== false, 'shrine placement present');
check($notifyAt !== false, 'shrineBuilt notif present');

// The whole fix in one assertion: bail BEFORE any observable side effect.
check($bailAt < $placeAt,
    'must return null BEFORE the UPDATE that sets is_built = 1 '
    . '(otherwise a shrine token lands on a taskless island)');
check($bailAt < $notifyAt,
    'must return null BEFORE firing shrineBuilt '
    . '(otherwise the log claims a shrine that completed no task)');
check($lookupAt < $bailAt, 'the lookup precedes its own bail-out');

// ---- 2. the owner falls through to the Greek-letter reward -----------------
$own = methodBody($exploreSrc, 'buildOwnShrine');
check($own !== '', 'buildOwnShrine found');
check(strpos($own, 'applyExplorerBonus') !== false,
    'buildOwnShrine must fall through to applyExplorerBonus when no tile completes '
    . '(rules p.11: an island matching none of your Zeus tiles pays the letter reward, '
    . 'and the owner is not exempt)');

// It must be the FALLBACK, not the reward for a completed tile: the god-step
// branch has to return first, or completing a task would pay both.
$godBranchAt = strpos($own, 'ChooseGodAdvancement::class');
$bonusAt     = strpos($own, 'applyExplorerBonus');
check($godBranchAt !== false, 'the completed-task god step is still there');
check($godBranchAt < $bonusAt,
    'the god-step return must come first, so a completed task pays the Zeus tile '
    . 'reward only and never both rewards');

// ---- 3. the deliberate Build a Shrine action is gated the same way ---------
$gate = methodBody($actionSrc, 'getBuildableShrines');
check($gate !== '', 'getBuildableShrines found');
check(strpos($gate, 'hasIncompleteShrineTask') !== false,
    'getBuildableShrines must refuse to offer a build with no shrine task left '
    . '(it spends the die and completes nothing)');

// The guard is worthless below the loop that has already built the list.
$guardAt = strpos($gate, 'hasIncompleteShrineTask');
$loopAt  = strpos($gate, 'foreach');
check($loopAt !== false, 'getBuildableShrines still loops over candidate rows');
check($guardAt < $loopAt, 'the no-task guard runs before the candidate loop');

// ---- 4. the predicate asks about TASKS, not tokens -------------------------
// The bug is precisely that the two counts drift apart, so a predicate reading
// the shrine table would restate it rather than fix it.
$pred = methodBody($gameSrc, 'hasIncompleteShrineTask');
check($pred !== '', 'Game::hasIncompleteShrineTask exists');
check(strpos($pred, 'zeus_tile') !== false,
    'the predicate counts zeus_tile rows (the tasks)');
check(strpos($pred, "task_type = 'shrine'") !== false, 'restricted to shrine tasks');
check(strpos($pred, 'is_completed = 0') !== false, 'restricted to incomplete tasks');
check(strpos($pred, 'FROM shrine') === false,
    'the predicate must NOT count the shrine token table — tokens are always 3 '
    . 'and that mismatch is the bug');

echo ($failed ? "FAILED" : "OK") . ": $passed passed, $failed failed\n";
exit($failed ? 1 : 0);
