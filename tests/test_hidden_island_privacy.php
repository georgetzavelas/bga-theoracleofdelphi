<?php
/**
 * Privacy regression: a face-down island must leak NOTHING about its shrine.
 *
 * getAllDatas sends every hex row to every player and censors the secret
 * fields for islands that are neither revealed nor peeked by that viewer. It
 * nulled three of the four secret columns it selected — shrineGameColor was
 * missed. That column is written for every shrine hex at setup (Game::…
 * "UPDATE hex SET shrine_player_id …, shrine_game_color …"), so each player's
 * gamedatas carried which player's shrine sat under every unrevealed island:
 * precisely the information the Look action costs a die to buy, and enough to
 * decide which islands are worth exploring.
 *
 * It never rendered — every client read is gated on `shrineGameColor &&
 * shrineLetter`, and the letter was nulled — so this was a payload-only leak,
 * readable in devtools or by a modified client rather than visible in play.
 *
 * The assertion below is deliberately SET-BASED rather than a list of the four
 * known fields. The bug was "someone censored three of four", so the test
 * derives the secret fields from the SELECT itself and requires each one to be
 * nulled. Add a fifth shrine column to that query and this test fails until it
 * is censored too.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_hidden_island_privacy.php
 */

$root = $argv[1] ?? (__DIR__ . '/..');
$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

$src = file_get_contents("$root/modules/php/Game.php");

// ---------------------------------------------------------------------------
// 1. Pull the hex SELECT and the censoring block out of getAllDatas.
// ---------------------------------------------------------------------------
$select = '';
if (preg_match('/\$hexes = self::getObjectListFromDB\(\s*"(.*?)"\s*\);/s', $src, $m)) {
    $select = $m[1];
}
check($select !== '', 'the hex SELECT in getAllDatas is extractable');
check(str_contains($select, 'FROM hex'), 'it is the hex query');

$block = '';
if (preg_match('/foreach \(\$hexes as &\$hex\) \{(.*?)\n        \}/s', $src, $m)) {
    $block = $m[1];
}
check($block !== '', 'the hidden-island censoring block is extractable');
check(str_contains($block, 'isRevealed') && str_contains($block, 'peekedSet'),
      'the block gates on unrevealed AND not-peeked-by-this-viewer');

// ---------------------------------------------------------------------------
// 2. Every SECRET alias the query selects must be nulled in that block.
//
//    "Secret" = anything describing the shrine hidden under the tile, plus the
//    island's content type. Public geometry (q/r/tileType/colour/cluster*) and
//    the already-public revealedBy stay untouched: the client needs them to
//    draw the board, and in physical play they are face-up information.
// ---------------------------------------------------------------------------
preg_match_all('/AS\s+([A-Za-z_]+)/', $select, $am);
$aliases = $am[1];
check(count($aliases) > 5, 'aliases parsed from the SELECT (' . count($aliases) . ')');

$secret = array_values(array_filter($aliases, function ($a) {
    return stripos($a, 'shrine') === 0 || $a === 'islandContent';
}));
check(count($secret) >= 4,
      'found the secret aliases: ' . implode(', ', $secret));

$uncensored = [];
foreach ($secret as $field) {
    if (!preg_match('/\$hex\[\'' . preg_quote($field, '/') . '\'\]\s*=\s*null;/', $block)) {
        $uncensored[] = $field;
    }
}
check($uncensored === [],
      'every secret field is nulled for a hidden island; leaking: '
      . implode(', ', $uncensored));

// The specific field that was missed, named so a regression reads clearly.
check(str_contains($block, "\$hex['shrineGameColor'] = null;"),
      'shrineGameColor is nulled (the shrine owner under a face-down island)');

// ---------------------------------------------------------------------------
// 3. The peek/reveal paths must still be able to REPOPULATE it, or censoring
//    would cost players information they legitimately hold.
// ---------------------------------------------------------------------------
$js = file_get_contents("$root/theoracleofdelphi.js");
check(preg_match('/cachedHex\.shrineGameColor\s*=/', $js) === 1
      || preg_match_all('/cachedHex\.shrineGameColor\s*=/', $js) >= 1,
      'the client re-populates shrineGameColor from the peek / reveal notifs');

// And the viewer's OWN peeked islands must keep their contents: the censor
// only fires for hexes absent from that player's peekedSet.
check(str_contains($src, 'WHERE player_id = $current_player_id'),
      'peekedSet is built from THIS viewer\'s player_island_knowledge rows');

// ---------------------------------------------------------------------------
// 4. The companion payload must stay coordinates-only. islandKnowledge tells a
//    viewer WHICH islands opponents looked at (public — you can see someone
//    pick a tile up) and must never carry what is under them.
// ---------------------------------------------------------------------------
$knowledge = '';
if (preg_match('/\$result\[\'islandKnowledge\'\] = self::getObjectListFromDB\(\s*"(.*?)"\s*\);/s', $src, $m)) {
    $knowledge = $m[1];
}
check($knowledge !== '', 'the islandKnowledge query is extractable');
check(!preg_match('/shrine|island_content/i', $knowledge),
      'islandKnowledge selects no shrine or content column');
check(str_contains($knowledge, 'pik.player_id != $current_player_id'),
      'islandKnowledge covers only OTHER players (a viewer\'s own peeks show as '
      . 'the flipped tile instead)');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
