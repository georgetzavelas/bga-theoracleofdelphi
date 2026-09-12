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
 *     null explorer on a revealed hex is the durable "never explored" marker
 *     the client keys its markers and tooltip off.
 *   - The peek counts are read BEFORE the flip. getAllDatas' islandKnowledge
 *     query joins is_revealed = 0, so after the UPDATE it returns nothing;
 *     reading peeks afterwards would silently mark every island unseen.
 *   - The notif path and the reload path share _revealEndGameIsland, so a
 *     refresh of a finished game can't drift from what the sweep painted.
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

// The UPDATE must not stamp an explorer: that null is the never-explored marker.
if (preg_match('/UPDATE hex SET(.*?)"/s', $reveal, $m)) {
    check(!str_contains($m[1], 'revealed_by_player_id'),
          'the UPDATE leaves revealed_by_player_id NULL (the never-explored marker)');
} else {
    check(false, 'the is_revealed UPDATE is extractable');
}

// Peeks must be counted before the flip, or they all read as zero.
$peekAt   = strpos($reveal, 'player_island_knowledge');
$updateAt = strpos($reveal, 'UPDATE hex SET is_revealed');
check($peekAt !== false, 'per-island peek counts are gathered');
check($peekAt !== false && $updateAt !== false && $peekAt < $updateAt,
      'peeks are counted BEFORE the flip (islandKnowledge joins is_revealed = 0)');

check(str_contains($reveal, "globals->set('endgame_island_reveal'"),
      'the payload is stashed in a global for the reload path');
check(str_contains($reveal, 'endGameIslandsRevealed'),
      'the notif is emitted');

$notifAt = strpos($reveal, 'endGameIslandsRevealed');
check($notifAt !== false && $updateAt !== false && $updateAt < $notifAt,
      'the DB is flipped before the notif goes out');

// ---------------------------------------------------------------------------
// 3. Reload path: getAllDatas carries the payload.
// ---------------------------------------------------------------------------
$allDatas = methodBody($gameSrc, 'getAllDatas');
check(str_contains($allDatas, "'endGameIslandReveal'"),
      'getAllDatas emits endGameIslandReveal');
check(str_contains($allDatas, "globals->get('endgame_island_reveal')"),
      'it reads the same global the reveal wrote — one source of truth');
check(preg_match("/endGameIslandReveal'\]\s*=\s*.*?\?\?\s*\[\]/s", $allDatas) === 1,
      'it defaults to an empty array before the game ends');

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
