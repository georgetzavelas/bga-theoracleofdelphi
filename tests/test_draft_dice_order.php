<?php
/**
 * Regression lint: in Ship Tile draft mode the oracle is consulted AFTER every
 * player has taken a tile.
 *
 * setupNewGame used to call rollInitialDice() unconditionally, before the
 * `if ($draftMode)` branch that hands control to DraftShipTile. So in draft
 * mode the three starting dice — and their "consults the oracle for 3 starting
 * oracle dice" log lines — landed on screen before anyone had chosen a tile,
 * which is the wrong order: the draft happens first.
 *
 * The roll now happens at the single exit from the draft. Two things have to
 * hold together, and the second is easy to forget:
 *
 *   1. SERVER — setupNewGame skips the roll in draft mode, and both
 *      DraftShipTile exits (the last pick, and zombie()'s fallback when no
 *      tiles remain) route through finishDraft() -> rollInitialDiceIfNeeded().
 *      The guard matters because those two exits can both be reached.
 *
 *   2. CLIENT — notif_startingDiceRolled used to be an empty no-op, and could
 *      be: the roll happened during setup, so the notif only ever reached a
 *      client as replayed history whose gamedatas already held the dice.
 *      Deferring it makes the notif arrive mid-session with a live client and
 *      an empty gamedatas.oracleDice, so an empty handler means no dice appear
 *      until the player reloads.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_draft_dice_order.php
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

$gameSrc  = file_get_contents("$root/modules/php/Game.php");
$draftSrc = file_get_contents("$root/modules/php/States/DraftShipTile.php");
$js       = file_get_contents("$root/theoracleofdelphi.js");
$css      = file_get_contents("$root/theoracleofdelphi.css");

// ---------------------------------------------------------------------------
// 1. setupNewGame only rolls in random mode.
// ---------------------------------------------------------------------------
$setup = methodBody($gameSrc, 'setupNewGame');
check($setup !== '', 'Game::setupNewGame() is extractable');
check(preg_match('/if\s*\(\s*!\$draftMode\s*\)\s*\{[^}]*rollInitialDice\(/s', $setup) === 1,
      'setupNewGame rolls the starting dice ONLY when !$draftMode');

// Guard against the original bug returning as a stray unconditional call.
$rollCalls = preg_match_all('/\$this->rollInitialDice\(/', $setup);
check($rollCalls === 1,
      "setupNewGame calls rollInitialDice exactly once (got $rollCalls)");

// ---------------------------------------------------------------------------
// 2. The deferred entry point exists, is callable from a state, and is guarded.
// ---------------------------------------------------------------------------
$deferred = methodBody($gameSrc, 'rollInitialDiceIfNeeded');
check($deferred !== '', 'Game::rollInitialDiceIfNeeded() exists');
check(preg_match('/public function rollInitialDiceIfNeeded/', $gameSrc) === 1,
      'it is public, so DraftShipTile can call it');
check(str_contains($deferred, 'COUNT(*) FROM oracle_die'),
      'it checks for existing dice rows');
check(preg_match('/if\s*\(\s*\$existing\s*>\s*0\s*\)\s*return;/', $deferred) === 1,
      'it returns early when dice already exist — both draft exits may reach it, '
      . 'and a second roll would overwrite everyone\'s dice');

// ---------------------------------------------------------------------------
// 3. Every draft exit goes through finishDraft().
// ---------------------------------------------------------------------------
$finish = methodBody($draftSrc, 'finishDraft');
check($finish !== '', 'DraftShipTile::finishDraft() exists');
check(str_contains($finish, 'rollInitialDiceIfNeeded'),
      'finishDraft rolls the starting dice');
check(str_contains($finish, 'RoundStart::class'),
      'finishDraft still hands off to RoundStart');

foreach (['actDraftTile', 'zombie'] as $exit) {
    $body = methodBody($draftSrc, $exit);
    check($body !== '', "DraftShipTile::$exit() is extractable");
    check(!preg_match('/return\s+RoundStart::class/', $body),
          "$exit() does not return RoundStart directly — it must go through "
          . 'finishDraft so the dice are rolled');
    check(str_contains($body, 'finishDraft'),
          "$exit() routes through finishDraft()");
}

// ---------------------------------------------------------------------------
// 4. The client can no longer ignore the notif.
// ---------------------------------------------------------------------------
$handler = '';
if (preg_match('/notif_startingDiceRolled: function\(args\) \{(.*?)\n        \}/s', $js, $m)) {
    $handler = $m[1];
}
check(trim($handler) !== '',
      'notif_startingDiceRolled is not an empty no-op — the notif now arrives '
      . 'mid-session, so an empty handler means no dice until reload');
check(str_contains($handler, 'createOracleDice'),
      'it builds the local player\'s dice tray');
check(str_contains($handler, 'updateDice'),
      'it refreshes the player-panel dice strip');
check(str_contains($handler, "querySelector('.delphi-die')"),
      'it only creates when the tray is empty, so random mode / F5 (dice already '
      . 'built from gamedatas) does not get duplicates');

// ---------------------------------------------------------------------------
// 5. Draft-only title centring is scoped and cleaned up.
// ---------------------------------------------------------------------------
check(str_contains($css, '#page-title.delphi-draft-title #pagemaintitletext'),
      'the centring rule is scoped to the draft class, not applied to every state');
check(str_contains($js, "pageTitle.classList.add('delphi-draft-title')"),
      '_setupDraftRail marks the title');
check(str_contains($js, "classList.remove('delphi-draft-title')"),
      'the teardown unmarks it, so the combat status strip and other prompts '
      . 'are unaffected once the draft ends');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
