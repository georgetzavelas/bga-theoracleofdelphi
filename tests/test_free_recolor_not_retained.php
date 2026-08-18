<?php
/**
 * Regression lint: a FREE oracle-card recolour must not outlive the play.
 *
 * oracle_card_play_colors is the per-card retention hash. Its contract, in its
 * own words, is that a cancel + re-play "resumes at the paid-for colour" —
 * the card equivalent of oracle_die.color surviving a cancel because Favor was
 * spent on it. actRecolorCard wrote it on every branch, paid or free.
 *
 * That is harmless for dice and not for cards. Dice are re-rolled at end of
 * turn, so a stray free colour washes out; this hash outlives the turn and is
 * only cleared when the card is spent. So an Apollo or Demigod recolour that
 * the player backed out of repainted the card for the REST OF THE GAME:
 *
 *   Apollo active -> play a Blue card -> free-recolour it to Red -> back out
 *   -> the card returns to hand Red and stays Red.
 *
 * Both back-outs land there. abandonSelectedSource only reverts through
 * performUndo when undo_recolor_paid = 1, which a free recolour never sets, so
 * it falls to releaseSelectedSource — which deliberately keeps the retained
 * colour and even reports it in the cancel notif. Apollo also seals undo when
 * it draws, so the Undo button is frequently not even on screen.
 *
 * Both gods grant a colour for ONE play, not a repaint, so the fix is to stop
 * recording free recolours rather than to widen the back-out.
 *
 * A source lint because Game extends \Bga\GameFramework\Table and cannot be
 * instantiated off-platform. Assertions are structural (the hash write sits
 * inside a cost > 0 block) and cannot be satisfied by a comment.
 *
 * Run: php tests/test_free_recolor_not_retained.php
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

/** The innermost {...} block whose header contains $header. */
function blockAfter(string $body, string $header): string {
    $at = strpos($body, $header);
    if ($at === false) return '';
    $open = strpos($body, '{', $at);
    if ($open === false) return '';
    $depth = 0;
    for ($i = $open, $n = strlen($body); $i < $n; $i++) {
        if ($body[$i] === '{') $depth++;
        if ($body[$i] === '}' && --$depth === 0) return substr($body, $open, $i - $open + 1);
    }
    return '';
}

$actionSrc = file_get_contents("$root/modules/php/States/SelectAction.php");
$gameSrc   = file_get_contents("$root/modules/php/Game.php");

// ---- 1. the hash write is gated on a real cost ----------------------------
$recolor = methodBody($actionSrc, 'actRecolorCard');
check($recolor !== '', 'actRecolorCard found');
check(strpos($recolor, 'oracle_card_play_colors') !== false, 'the retention hash is still written');

$costBlock = blockAfter($recolor, 'if ($cost > 0)');
check($costBlock !== '', 'the hash write is wrapped in an if ($cost > 0) block');
check(strpos($costBlock, 'oracle_card_play_colors') !== false,
    'the hash write must sit INSIDE the cost > 0 block — a free Apollo/Demigod '
    . 'recolour outlives the turn and repaints the card permanently');

// Nothing may write the hash outside that block: one stray unconditional write
// restores the bug while the block above still reads correct.
$writes = substr_count($recolor, "globals->set('oracle_card_play_colors'");
$gatedWrites = substr_count($costBlock, "globals->set('oracle_card_play_colors'");
check($writes === $gatedWrites,
    "every hash write in actRecolorCard is gated (found $writes, $gatedWrites gated)");

// The free branch must still set the LIVE colour — the action has to act as red.
check(strpos($recolor, "globals->set('selected_oracle_card_color'") !== false,
    'the live in-play colour is still recorded for free recolours');

// ---- 2. a reload still shows the live free colour -------------------------
// Dropping the free colour from the hash means getAllDatas can no longer derive
// the played card's colour from the hash alone, or a mid-turn F5 would repaint
// it to native while the server still acts on the free colour.
$all = methodBody($gameSrc, 'getAllDatas');
check($all !== '', 'getAllDatas found');
check(strpos($all, 'selected_oracle_card_color') !== false,
    'getAllDatas must read selected_oracle_card_color so the in-play card '
    . 'renders at its live (possibly free) colour after a reload');

// Assert on the ASSIGNMENT, not merely that the global is mentioned somewhere in
// getAllDatas. Reading it into a local and then not using it leaves the reload
// broken while a mention-only check stays green — which is exactly what a
// mutation run caught here.
if (preg_match('/\$handCard\\[.currentColor.\\]\s*=\s*(.+?);/s', $all, $m)) {
    $assignment = $m[1];
} else {
    $assignment = '';
}
check($assignment !== '', 'found the currentColor assignment');
check(strpos($assignment, 'inPlayColor') !== false,
    'the currentColor assignment itself must consult the live in-play colour, '
    . 'not just the retention hash');
check(strpos($assignment, 'playColors') !== false,
    'and must still fall back to the retained PAID colour for cards not in play');

// ---- 3. the back-out still reports a retained PAID colour -----------------
// releaseSelectedSource is unchanged on purpose: a paid colour must survive a
// cancel. This pins that half so a later "simplification" doesn't take it out.
$release = methodBody($gameSrc, 'releaseSelectedSource');
check($release !== '', 'releaseSelectedSource found');
check(strpos($release, 'oracle_card_play_colors') !== false,
    'releaseSelectedSource still honours a retained PAID colour on cancel');

echo ($failed ? "FAILED" : "OK") . ": $passed passed, $failed failed\n";
exit($failed ? 1 : 0);
