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

// Gates on Favor actually DEBITED, not on undo_recolor_marked. The marker is a
// UI flag that is also set by free Apollo/Demigod recolors and by a Thrifty
// Wheel discount that reduces the cost to 0 — gating on it would upgrade those
// plain cancels into full snapshot restores for nothing.
check(str_contains($body, 'undo_recolor_paid'),
      'gates on undo_recolor_paid (Favor actually debited)');
check(!str_contains($body, 'undo_recolor_marked'),
      'does NOT gate on undo_recolor_marked, which free recolors also set');

// Both terms are required: the flag survives sealUndo(), so without the
// availability check performUndo() could no-op and strand the source.
check(str_contains($body, 'undoAvailable()'),
      'also requires a live undo slot (performUndo no-ops on a sealed one)');
check(preg_match('/undo_recolor_paid.*&&.*undoAvailable\(\)/s', $body) === 1,
      'the two conditions are ANDed, so neither alone triggers the undo path');

// The undo attempt must come first: releaseSelectedSource seals the slot, so a
// release-then-undo ordering would make performUndo() unreachable.
check(preg_match('/performUndo\(\).*releaseSelectedSource\(/s', $body) === 1,
      'the undo attempt precedes the releaseSelectedSource fallback');
check(str_contains($body, 'releaseSelectedSource('),
      'still falls back to releaseSelectedSource() (no debit, or slot sealed)');

// ---------------------------------------------------------------------------
// 2. The flag is armed where the Favor is actually taken, not next to the UI
//    marker — so a discounted-to-zero or free recolor never arms it.
// ---------------------------------------------------------------------------
$costBody = methodBody($gameSrc, 'applyRecolorCost');
check($costBody !== '', 'Game::applyRecolorCost() exists');
check(str_contains($costBody, 'undo_recolor_paid'),
      'applyRecolorCost arms undo_recolor_paid');
check(preg_match('/if\s*\(\s*\$cost\s*>\s*0\s*\)\s*\{[^}]*undo_recolor_paid/s', $costBody) === 1,
      'armed INSIDE the $cost > 0 debit branch, so a 0-cost recolor does not arm it');

// Cleared wherever a new action-unit starts or the debit is reverted, or a
// stale flag would redirect an unrelated later cancel into a full restore.
check(str_contains(methodBody($gameSrc, 'undoCheckpoint'), 'undo_recolor_paid'),
      'undoCheckpoint clears undo_recolor_paid for the new action-unit');
check(str_contains(methodBody($gameSrc, 'performUndo'), 'undo_recolor_paid'),
      'performUndo clears undo_recolor_paid once the debit is reverted');

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
