<?php
/**
 * Every mid-game oracle-card draw reaches the player panels.
 *
 * Reported: at game end a player's panel showed 4 oracle cards while the
 * tie-break (EndScore counts card_location = 'hand') counted 6. Both read the
 * same rows; the panel was the one behind. The client builds each panel hand
 * from the PUBLIC oracleCardDrawn notif (or oracleCardsDrawn for a multi-card
 * draw), and notif_oracleCardDrawn ignores one without card_color.
 *
 *   - Apollo drew a card with only a private notif and a public
 *     godAbilityUsed that names no card, so no panel ever added it.
 *   - The demigod companion's draw sent oracleCardDrawn without card_id /
 *     card_color, so the client dropped it.
 *
 * Source lint: Game extends the BGA Table and cannot run off-platform.
 *
 * Run: php tests/test_oracle_draws_reach_panel.php
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
/** Does this code send a public oracleCardDrawn carrying card_id and card_color? */
function announcesDraw(string $code): bool {
    return (bool)preg_match('/notify->all\(\s*[\'"]oracleCardDrawn[\'"][^;]*?[\'"]card_id[\'"]\s*=>[^;]*?[\'"]card_color[\'"]\s*=>/s', $code);
}

$game    = file_get_contents("$root/modules/php/Game.php");
$actions = file_get_contents("$root/modules/php/States/PlayerActions.php");
$reward  = file_get_contents("$root/modules/php/States/SelectReward.php");
$explore = file_get_contents("$root/modules/php/States/ExploreIsland.php");
$js      = file_get_contents("$root/theoracleofdelphi.js");

check(announcesDraw(methodBody($game, 'drawOneOracleCardInline')),
    'the shared draw helper announces the card to every panel');
check(announcesDraw(methodBody($actions, 'useApollo')),
    'Apollo\'s draw announces the card to every panel (it did not)');
$demigod = substr($reward, strpos($reward, "Demigod companion: draw 1 Oracle card"));
check(announcesDraw($demigod),
    'the demigod companion\'s draw carries card_id and card_color (it did not)');
check((bool)preg_match('/notify->all\("oracleCardsDrawn"[^;]*"cards"\s*=>/s', $explore),
    'the Phi shrine\'s multi-card draw sends its cards publicly');

// The client side of the contract: a draw without card_color is dropped.
check((bool)preg_match('/notif_oracleCardDrawn: function\(args\) \{[^}]*if \(!ps \|\| !args\.card_color\) return;/s', $js),
    'the client adds a drawn card to the panel only when card_color is present');

echo "\n$passed passed, $failed failed\n";
exit($failed ? 1 : 0);
