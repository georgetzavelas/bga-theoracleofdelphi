<?php
/**
 * Regression lint: backing out of a started action must not strand a Favor that
 * was already spent recoloring the action source.
 *
 * Reported from a real game: recolor pink -> blue for 1 Favor, enter the
 * ship-move picker, cancel — Favor gone, and no Undo button to recover it.
 * Cause: Game::releaseSelectedSource() calls sealUndo() on the premise
 * "nothing committed, so no Undo button should appear back at the hub". That
 * premise is false once Favor has been debited, and the cancel destroyed the
 * undo slot that was the documented remedy.
 *
 * The fix routes every back-out through Game::abandonSelectedSource(), which
 * prefers performUndo() when the action-unit debited Favor and the slot is
 * still live, and otherwise falls back to releaseSelectedSource(). That helper
 * is now private, so PHP — not this lint — enforces that no cancel path
 * bypasses the decision. What is left to check here is the decision itself.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_recolor_cancel_refund.php
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

$gameSrc = file_get_contents("$root/modules/php/Game.php");

// ---------------------------------------------------------------------------
// 1. The back-out decision.
// ---------------------------------------------------------------------------
$body = methodBody($gameSrc, 'abandonSelectedSource');
check($body !== '', 'Game::abandonSelectedSource() exists');

// Gates on undo_recolor_marked: ANY recolor this action-unit, paid or free.
//
// This used to gate on undo_recolor_paid — Favor actually debited — on the
// reasoning that a free Apollo/Demigod recolor, or one a Thrifty Wheel discount
// took to cost 0, had nothing to refund, so routing its cancel through a full
// snapshot restore would be "for nothing".
//
// It is not for nothing. A recolor changes oracle_die.color permanently, and
// releaseSelectedSource deliberately KEEPS that colour; performUndo is the only
// thing that puts it back. So a free recolor followed by a cancel silently ate
// the die's colour for the rest of the turn.
//
// Proven from a real game's undo_snapshot payload: NazFTW recoloured a black
// die to yellow with Kirke (the black Demigod, companion type 16), cancelled,
// and the die is frozen in a later snapshot as
// {"color":"yellow","original_color":"black","is_used":"1"} — spent as yellow
// on an injury discard. original_color is never rewritten by a recolor, so it
// is the standing record that the die rolled black and never came back.
//
// The refund case this file was written for is unaffected: a paid recolor sets
// both flags, so widening the gate is a superset. undo_recolor_paid is now
// unused and has been removed rather than left as read-never state.
check(str_contains($body, 'undo_recolor_marked'),
      'gates on undo_recolor_marked, so a FREE recolor is reverted too');
check(!str_contains($body, 'undo_recolor_paid'),
      'the paid-only gate is gone — it let free recolors keep their colour');

// Both terms are required: the flag survives sealUndo(), so without the
// availability check performUndo() could no-op and strand the source.
check(str_contains($body, 'undoAvailable()'),
      'also requires a live undo slot (performUndo no-ops on a sealed one)');
check(preg_match('/undo_recolor_marked.*&&.*undoAvailable\(\)/s', $body) === 1,
      'the two conditions are ANDed, so neither alone triggers the undo path');

// The undo attempt must come first: releaseSelectedSource seals the slot, so a
// release-then-undo ordering would make performUndo() unreachable.
check(preg_match('/performUndo\(\).*releaseSelectedSource\(/s', $body) === 1,
      'the undo attempt precedes the releaseSelectedSource fallback');
check(str_contains($body, 'releaseSelectedSource('),
      'still falls back to releaseSelectedSource() (no debit, or slot sealed)');

// ---------------------------------------------------------------------------
// 2. One flag, armed by every recolor and cleared per action-unit.
// ---------------------------------------------------------------------------
// undo_recolor_paid is gone entirely. Read-never state is worse than no state:
// it reads as load-bearing to the next person, and restoring the paid-only gate
// is exactly the regression this file now guards against.
// stripComments, because the history of WHY the paid-only gate was wrong is
// recorded in a comment on abandonSelectedSource and is worth keeping.
check(!str_contains(stripComments($gameSrc), 'undo_recolor_paid'),
      'undo_recolor_paid is removed from the CODE, not left dangling as '
      . 'read-never state (comments explaining its removal are fine)');

// Armed by EVERY recolor branch — paid, Apollo-wild and Demigod-wild alike —
// which is what makes the widened gate correct.
$selectActionSrc0 = file_get_contents("$root/modules/php/States/SelectAction.php");
foreach (['actRecolorDie', 'actRecolorCard'] as $action) {
    check(str_contains(methodBody($selectActionSrc0, $action), 'undo_recolor_marked'),
          "$action arms undo_recolor_marked on every branch it can take");
}

// Cleared wherever a new action-unit starts or the recolor is reverted, or a
// stale flag would redirect an unrelated later cancel into a full restore.
check(str_contains(methodBody($gameSrc, 'undoCheckpoint'), 'undo_recolor_marked'),
      'undoCheckpoint clears undo_recolor_marked for the new action-unit');
check(str_contains(methodBody($gameSrc, 'performUndo'), 'undo_recolor_marked'),
      'performUndo clears undo_recolor_marked once the recolor is reverted');

// BOTH recolor actions must debit through applyRecolorCost, or the flag is
// never armed for that source and its cancel silently eats the Favor again.
// A second report — "used three favor to recolor, cancelled, no refund" — was
// the CARD path (oracleCardRecolored, cost 3), reached identically. Arming at
// the shared debit site rather than at the two call sites is what covers both;
// this pins the link.
$selectActionSrc = file_get_contents("$root/modules/php/States/SelectAction.php");
foreach (['actRecolorDie', 'actRecolorCard'] as $action) {
    check(str_contains(methodBody($selectActionSrc, $action), 'applyRecolorCost('),
          "$action debits via the shared applyRecolorCost, so the refund path "
          . "covers both die and card");
}

// ---------------------------------------------------------------------------
// 3. releaseSelectedSource is unreachable from outside Game: PHP enforces the
//    "no cancel path bypasses the refund decision" invariant structurally.
// ---------------------------------------------------------------------------
check(preg_match('/private function releaseSelectedSource\(/', $gameSrc) === 1,
      'releaseSelectedSource is private (structural, not lint-enforced)');

$offenders = [];
foreach (glob("$root/modules/php/States/*.php") as $file) {
    if (str_contains(stripComments(file_get_contents($file)), 'releaseSelectedSource(')) {
        $offenders[] = basename($file);
    }
}
check($offenders === [],
      'no state calls releaseSelectedSource directly: ' . implode(', ', $offenders));

// ---------------------------------------------------------------------------
// 4. The reachable cancel sites route through the helper. MoveShip and
//    SelectAction are the live surface; BuildShrine and ConfirmRecolor are
//    orphan states (nothing returns their ::class) and are deliberately NOT
//    pinned here, so deleting them doesn't fail this test.
// ---------------------------------------------------------------------------
foreach (['MoveShip', 'SelectAction'] as $state) {
    check(str_contains(file_get_contents("$root/modules/php/States/$state.php"),
                       'abandonSelectedSource('),
          "$state's cancel path routes through abandonSelectedSource()");
}

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
