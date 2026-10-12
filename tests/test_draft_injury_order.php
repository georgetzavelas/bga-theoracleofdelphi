<?php
/**
 * Regression lint: in Ship Tile draft mode the starting injuries (and their
 * matching god bump) come AFTER every player has taken a tile.
 *
 * Setup order is ship tile, then injury + god, then oracle dice. setupNewGame
 * drew the injuries unconditionally, before handing control to DraftShipTile,
 * so in draft mode they landed before anyone had chosen a tile.
 *
 * Same shape as test_draft_dice_order.php:
 *
 *   1. SERVER — setupNewGame skips the draw in draft mode, and finishDraft()
 *      (the single draft exit) draws them through a guarded entry point,
 *      BEFORE rolling the dice. The guard matters because both draft exits
 *      can reach finishDraft, and because a game already mid-draft when this
 *      ships drew its injuries at setup.
 *
 *   2. CLIENT — the starting-injury handlers were empty no-ops, which was fine
 *      while the notifs only arrived as setup history. Drawn after the draft
 *      they arrive live, so the handlers must render the card, the panel
 *      count, and the god move. They act only on notifs flagged `live`, so
 *      random-mode setup history stays log-only.
 *
 * Run: php tests/test_draft_injury_order.php
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

/** Extract a JS method body (8-space indent object literal), comments removed. */
function jsMethod(string $js, string $name): string {
    if (!preg_match('/^        ' . preg_quote($name, '/') . ': (?:async )?function\([^)]*\) \{(.*?)^        \},/ms', $js, $m)) {
        return '';
    }
    return stripComments($m[1]);
}

$gameSrc  = file_get_contents("$root/modules/php/Game.php");
$draftSrc = file_get_contents("$root/modules/php/States/DraftShipTile.php");
$js       = file_get_contents("$root/theoracleofdelphi.js");

// ---------------------------------------------------------------------------
// 1. setupNewGame draws the injuries only in random mode.
// ---------------------------------------------------------------------------
$setup = methodBody($gameSrc, 'setupNewGame');
check($setup !== '', 'Game::setupNewGame() is extractable');
check(preg_match('/if\s*\(\s*!\$draftMode\s*\)\s*\{[^}]*drawStartingInjuries\(/s', $setup) === 1,
      'setupNewGame draws the starting injuries ONLY when !$draftMode');
$calls = preg_match_all('/\$this->drawStartingInjuries\(/', $setup);
check($calls === 1, "setupNewGame calls drawStartingInjuries exactly once (got $calls)");

// ---------------------------------------------------------------------------
// 2. The deferred entry point exists, is public, and is guarded.
// ---------------------------------------------------------------------------
$deferred = methodBody($gameSrc, 'drawStartingInjuriesIfNeeded');
check($deferred !== '', 'Game::drawStartingInjuriesIfNeeded() exists');
check(preg_match('/public function drawStartingInjuriesIfNeeded/', $gameSrc) === 1,
      'it is public, so DraftShipTile can call it');
check(preg_match("/card_type\s*=\s*'injury'\s+AND\s+card_location\s*=\s*'hand'/", $deferred) === 1,
      'it checks for injury cards already in hand');
check(preg_match('/if\s*\(\s*\$existing\s*>\s*0\s*\)\s*return;/', $deferred) === 1,
      'it returns early when starting injuries were already drawn');
check(str_contains($deferred, 'drawStartingInjuries('),
      'it delegates to drawStartingInjuries');
check(preg_match('/drawStartingInjuries\([^;]*true\s*\)/', $deferred) === 1,
      'it asks for live notifs, since the clients are already running');

// The live flag reaches both notifs.
$draw = methodBody($gameSrc, 'drawStartingInjuries');
check(preg_match('/function drawStartingInjuries\(array \$players, bool \$live = false\)/', $gameSrc) === 1,
      'drawStartingInjuries takes a $live flag defaulting to false (setup history)');
check(preg_match_all('/"live"\s*=>\s*\$live/', $draw) >= 3,
      'the private notif and both public notif variants carry the live flag');

// ---------------------------------------------------------------------------
// 3. finishDraft draws the injuries before rolling the dice.
// ---------------------------------------------------------------------------
$finish = methodBody($draftSrc, 'finishDraft');
check($finish !== '', 'DraftShipTile::finishDraft() exists');
$injAt  = strpos($finish, 'drawStartingInjuriesIfNeeded');
$diceAt = strpos($finish, 'rollInitialDiceIfNeeded');
check($injAt !== false, 'finishDraft draws the starting injuries');
check($injAt !== false && $diceAt !== false && $injAt < $diceAt,
      'injuries come before the oracle dice, matching random-mode setup order');

// ---------------------------------------------------------------------------
// 4. The client renders live draws and ignores setup history.
// ---------------------------------------------------------------------------
$pub = jsMethod($js, 'notif_startingInjuryDrawn');
$priv = jsMethod($js, 'notif_startingInjuryDrawnPrivate');
check(trim($pub) !== '', 'notif_startingInjuryDrawn is not an empty no-op');
check(trim($priv) !== '', 'notif_startingInjuryDrawnPrivate is not an empty no-op');
foreach (['notif_startingInjuryDrawn' => $pub, 'notif_startingInjuryDrawnPrivate' => $priv] as $n => $body) {
    check(preg_match('/if\s*\(\s*!args\.live\s*\)\s*return/', $body) === 1,
          "$n ignores non-live notifs, so random-mode setup history is not applied twice");
}
check(str_contains($priv, 'addInjuryCard'), 'the private handler adds the card to the hand');
check(str_contains($priv, '_addDrawnCardHidden'),
      'the card stays hidden until its deck flight lands');
check(str_contains($pub, "_adjustDeckCount('injury', -1)"), 'the public handler decrements the injury deck');
check(str_contains($pub, 'updateInjuries'), 'the public handler refreshes the panel injury bar');
check(str_contains($pub, 'positionGodToken') && str_contains($pub, 'updateGodStep'),
      'the public handler moves the god token and the panel god step');
check(str_contains($pub, "_flyDeckCardToPanel('injury'"),
      'the public handler flies the card from the deck (which also reveals the hidden hand card)');

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
