<?php
/**
 * Regression lint: the end-of-game reveal flips every island still face down,
 * and marks each one with whether anyone ever looked at it.
 *
 * The feature rests on four things that are easy to break from a distance:
 *
 *   - The reveal runs LAST in EndScore, after the score writes, so the
 *     standings stay the dramatic peak and the board reads as a post-mortem.
 *   - The UPDATE leaves revealed_by_player_id alone. ExploreIsland is the only
 *     other writer of is_revealed=1 and it always stamps the explorer, so a
 *     null explorer on a revealed hex is how Game::endGameIslandReveal finds
 *     these islands again — nothing is cached, so there is nothing to go
 *     stale.
 *   - Both the notif and getAllDatas take their payload from that one
 *     derivation, which reads only durable rows. That is what makes the
 *     markers appear in BGA's "Final situation" view, which renders
 *     getAllDatas with no notif replay at all.
 *   - The derivation has TWO arms, and the game-over one is what makes this
 *     work for games that ended before the feature shipped — their hexes were
 *     never flipped and never will be. The arms must both fail closed: on its
 *     own, "never explored" matches every unexplored island mid-game, which
 *     would hand a player the whole board on turn one.
 *   - getAllDatas' island censor is UNCHANGED. The client infers "I privately
 *     peeked this" from contents present on an unrevealed hex, so loosening
 *     the censor would stamp a peeked-eye on every unexplored island instead
 *     of the never-looked-at X. The reveal payload carries the identities
 *     separately for exactly this reason.
 *   - The notif path and the reload path share _revealEndGameIsland, so a
 *     refresh of a finished game can't drift from what the sweep painted.
 *   - The notif handler skips the stagger under instantaneousMode. BGA sets
 *     that for page-load catch-up and replay-to-move; scheduling wall-clock
 *     timeouts across a jump that is meant to be instant stalls the queue.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_endgame_island_reveal.php
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

$endScoreSrc = file_get_contents("$root/modules/php/States/EndScore.php");
$gameSrc     = file_get_contents("$root/modules/php/Game.php");
$jsSrc       = file_get_contents("$root/theoracleofdelphi.js");
$cssSrc      = file_get_contents("$root/theoracleofdelphi.css");

// ---------------------------------------------------------------------------
// 1. Placement: the reveal is the last thing EndScore does.
// ---------------------------------------------------------------------------
$entering = methodBody($endScoreSrc, 'onEnteringState');
check($entering !== '', 'EndScore::onEnteringState() exists');

$callAt  = strpos($entering, 'revealRemainingIslands');
$scoreAt = strpos($entering, 'playerScore->set');
check($callAt !== false, 'onEnteringState calls revealRemainingIslands');
check($callAt !== false && $scoreAt !== false && $callAt > $scoreAt,
      'the reveal runs AFTER the score writes, not before');

// ---------------------------------------------------------------------------
// 2. The reveal method itself.
// ---------------------------------------------------------------------------
$reveal = methodBody($endScoreSrc, 'revealRemainingIslands');
check($reveal !== '', 'EndScore::revealRemainingIslands() exists');

check(str_contains($reveal, "island_content = 'shrine'") && str_contains($reveal, 'is_revealed = 0'),
      'it targets face-down shrine islands — the only genuinely hidden category');

// The UPDATE must not stamp an explorer. That null is not decoration: it is
// the sole thing identifying these islands to endGameIslandReveal afterwards.
if (preg_match('/UPDATE hex SET(.*?)"/s', $reveal, $m)) {
    check(!str_contains($m[1], 'revealed_by_player_id'),
          'the UPDATE leaves revealed_by_player_id NULL (the never-explored marker)');
} else {
    check(false, 'the is_revealed UPDATE is extractable');
}

// Nothing is cached: the notif payload comes from the shared derivation.
check(str_contains($reveal, 'endGameIslandReveal()'),
      'the notif payload comes from Game::endGameIslandReveal, not a local build');
check(!str_contains($reveal, 'globals->set'),
      'nothing is stashed in a global — the payload is derived, so it cannot go stale');

$updateAt = strpos($reveal, 'UPDATE hex SET is_revealed');
$deriveAt = strpos($reveal, 'endGameIslandReveal()');
check($updateAt !== false && $deriveAt !== false && $updateAt < $deriveAt,
      'the flip happens BEFORE the derivation (which selects on is_revealed = 1)');

$notifAt = strpos($reveal, 'endGameIslandsRevealed');
check($notifAt !== false && $deriveAt < $notifAt,
      'the payload is derived before the notif goes out');

// ---------------------------------------------------------------------------
// 3. The shared derivation, and getAllDatas carrying it.
// ---------------------------------------------------------------------------
$derive = methodBody($gameSrc, 'endGameIslandReveal');
check($derive !== '', 'Game::endGameIslandReveal() exists');
check(str_contains($derive, 'revealed_by_player_id IS NULL'),
      'it finds never-explored islands by the null explorer, not a cached list');

// --- The gate. This is the assertion that matters most: without it the
// --- method hands every unexplored island to every player on turn one.
check(str_contains($derive, 'isGameOver()'),
      'the derivation is gated on the game being over');
check(str_contains($derive, 'is_revealed = 1'),
      'the pre-game-over arm still requires an already-flipped hex');
// Mid-game the is_revealed = 1 restriction must be PRESENT, not absent. Pin
// which branch of the ternary drops it, so an inverted gate is caught.
if (preg_match('/isGameOver\(\)\s*\?\s*(.*?)\s*:\s*(.*?);/s', $derive, $m)) {
    check(trim($m[1], "' ") === '',
          'game over -> no extra restriction');
    check(str_contains($m[2], 'is_revealed = 1'),
          'NOT over -> restricted to already-flipped hexes (an inverted gate leaks the board)');
} else {
    check(false, 'the game-over gate is extractable');
}

$gameOver = methodBody($gameSrc, 'isGameOver');
check($gameOver !== '', 'Game::isGameOver() exists');
check(str_contains($gameOver, '99'),
      'it tests for the terminal state');
check(str_contains($gameOver, 'catch') && str_contains($gameOver, 'return false'),
      'it fails CLOSED — anything unexpected means "not over", never "over"');
check(str_contains($derive, 'player_island_knowledge'),
      'it reads the peek rows directly');
// The peek subquery must NOT re-introduce the is_revealed join that makes
// islandKnowledge go empty after the flip — that would mark everything unseen.
// Scope the check to the subquery: the outer WHERE legitimately has
// is_revealed = 1, so a loose match over the whole method always trips.
if (preg_match('/SELECT COUNT\(\*\) FROM player_island_knowledge(.*?)\)\s*AS peeks/s', $derive, $m)) {
    check(!str_contains($m[1], 'is_revealed'),
          'the peek subquery does not join is_revealed (which would zero every count)');
} else {
    check(false, 'the peek subquery is extractable');
}

$allDatas = methodBody($gameSrc, 'getAllDatas');
check(str_contains($allDatas, "'endGameIslandReveal'"),
      'getAllDatas emits endGameIslandReveal');
check(str_contains($allDatas, 'endGameIslandReveal()'),
      'it calls the same derivation the notif used — one source of truth');
check(!str_contains($allDatas, "globals->get('endgame_island_reveal')"),
      'it does not depend on a global surviving into the archive view');

// The censor must stay exactly as strict as it was. The reveal payload
// carries shrine identities itself precisely so this never has to loosen.
$censor = '';
if (preg_match('/tileType.{0,14}===\s*.island.(.*?)\)\s*\{/s', $allDatas, $m)) {
    $censor = $m[1];
}
check($censor !== '', 'the island censor is extractable');
check(str_contains($censor, 'isRevealed') && str_contains($censor, '=== 0'),
      'the island censor still keys on isRevealed === 0');
check(!str_contains($censor, 'GameOver') && !str_contains($censor, 'endGame'),
      'the censor was NOT loosened for the end game — that would break the '
      . "client's privately-peeked inference and eye-mark every island");

// ---------------------------------------------------------------------------
// 4. Client: notif and reload share one apply path.
// ---------------------------------------------------------------------------
check(str_contains($jsSrc, '_revealEndGameIsland: function'),
      'the shared apply helper exists');
check(str_contains($jsSrc, "dojo.subscribe('endGameIslandsRevealed'"),
      'the notif is subscribed');
check(str_contains($jsSrc, 'notif_endGameIslandsRevealed: function'),
      'the notif handler exists');

$handler = '';
if (preg_match('/notif_endGameIslandsRevealed: function\(args\) \{(.*?)\n        \},/s', $jsSrc, $m)) {
    $handler = $m[1];
}
check($handler !== '', 'the notif handler body is extractable');
check(str_contains($handler, '_revealEndGameIsland'),
      'the notif path goes through the shared helper');
check(str_contains($handler, 'setSynchronousDuration'),
      'the handler sizes the queue hold to the island count, not a constant');
check(str_contains($handler, 'instantaneousMode'),
      'the handler skips the stagger when BGA is fast-forwarding');
// The guard has to come before the timeouts are scheduled, or it buys nothing.
$fastAt  = strpos($handler, 'instantaneousMode');
$timerAt = strpos($handler, 'setTimeout');
check($fastAt !== false && $timerAt !== false && $fastAt < $timerAt,
      'the fast-forward guard precedes the setTimeout stagger');
check(str_contains($jsSrc, 'gamedatas.endGameIslandReveal')
      && str_contains($jsSrc, 'self._revealEndGameIsland(island)'),
      'setup replays the same helper on reload, so the two paths cannot drift');

// The eye-marker creation is shared, not copy-pasted.
check(str_contains($jsSrc, '_ensureShrinePeekMarker: function'),
      'the eye-marker helper is extracted');
$markPeeked = '';
if (preg_match('/_markIslandPeeked: function\(shrineId, color, letter\) \{(.*?)\n        \},/s', $jsSrc, $m)) {
    $markPeeked = $m[1];
}
check(str_contains($markPeeked, '_ensureShrinePeekMarker'),
      '_markIslandPeeked uses the shared marker helper');

// The tooltip must not call an end-game-revealed island "explored".
check(str_contains($jsSrc, 'hex.endGameRevealed'),
      'the tooltip branches on endGameRevealed');
$exploredAt = strpos($jsSrc, "_('Explored Shrine Island')");
$neverAt    = strpos($jsSrc, "_('Never Explored')");
check($neverAt !== false && $exploredAt !== false && $neverAt < $exploredAt,
      'the Never Explored branch is tested BEFORE the Explored one');

// ---------------------------------------------------------------------------
// 5. CSS: the endgame override must beat the hide-on-revealed rule. Both are
//    (0,3,0), so source order is the only thing deciding it.
// ---------------------------------------------------------------------------
$hideAt     = strpos($cssSrc, '.delphi-shrine.shrine-revealed .shrine-peek-marker');
$overrideAt = strpos($cssSrc, '.delphi-shrine.shrine-endgame-revealed .shrine-peek-marker');
check($hideAt !== false, 'the hide-on-revealed rule exists');
check($overrideAt !== false, 'the endgame marker override exists');
check($hideAt !== false && $overrideAt !== false && $overrideAt > $hideAt,
      'the override comes LATER in the file — equal specificity, so order decides');
check(str_contains($cssSrc, '.delphi-shrine.shrine-endgame-unseen .shrine-peek-marker::before'),
      'the never-looked-at islands get the struck-through eye');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
