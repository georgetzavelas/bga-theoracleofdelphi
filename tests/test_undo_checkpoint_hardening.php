<?php
/**
 * Regression lint: a failed undo checkpoint kills undo, never corrupts it —
 * and says so somewhere anyone can read.
 *
 * undoCheckpoint captures the whole game state and writes it to the undo
 * slots. The capture can throw: it walks every snapshot table and json_encodes
 * the lot, and a single unencodable cell once left undo dead for an entire game
 * with nothing recorded anywhere.
 *
 * The engine now has TWO slots (see the UNDO ENGINE banner in Game.php) and the
 * hardening applies to them differently, which is itself worth pinning down:
 *
 *   SCRATCH is cleared before the capture, exactly as the single slot was.
 *   PIN is NOT, and must not be. It holds an older payload ON PURPOSE — that
 *   is the whole of Restart Turn — so clearing it every action would destroy
 *   the feature, and a capture failing elsewhere does not make it wrong.
 *
 * The original guard attempted the capture first and simply returned on
 * failure. That leaves `available` at whatever value it already held, which
 * makes the failure mode depend on what happened last:
 *
 *   - after a performUndo (which seals): available = 0. Undo goes quietly
 *     dead. Bad, but safe.
 *   - after a SUCCESSFUL earlier checkpoint: available = 1, and the row still
 *     holds that OLDER payload. The player is offered an Undo button that
 *     restores a state from a previous action. Silent corruption.
 *
 * Sealing before the capture collapses both into the safe one.
 *
 * The second half is diagnosability. trace() writes to the BGA server log,
 * which is not readable for a production table — which is precisely the
 * situation this was needed in. A player reported an undo they could not
 * perform, and the only durable artefact was undo_snapshot itself: one row,
 * overwritten every action, with no record of a failure ever having happened.
 * So a failure now also stamps the row, where a single query finds it.
 *
 * A source lint because Game extends \Bga\GameFramework\Table and cannot be
 * instantiated off-platform. Same reasoning as test_recolor_cancel_refund.php.
 *
 * Run: php tests/test_undo_checkpoint_hardening.php
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
$body = methodBody($gameSrc, 'undoCheckpoint');
check($body !== '', 'Game::undoCheckpoint() exists');

// ---------------------------------------------------------------------------
// 1. Seal before capture.
// ---------------------------------------------------------------------------
check(str_contains($body, 'clearUndoSlot(self::UNDO_SLOT_SCRATCH)'),
      'undoCheckpoint clears the scratch slot itself rather than relying on '
      . 'whatever value available already held');
check(preg_match('/clearUndoSlot\(self::UNDO_SLOT_SCRATCH\).*try\s*\{/s', $body) === 1,
      'the clear comes BEFORE the try block — clearing after the capture would '
      . 'not help, and clearing inside the catch would still leave the window '
      . 'where an older payload sits marked available');

// The pin must NOT be swept up in that pre-capture clear. The only pin clear
// allowed in this method is the carried-over-game guard, which is conditional
// on the counter global being absent.
$preTry = substr($body, 0, strpos($body, 'try'));
check(preg_match(
        '/if\s*\(\$this->globals->get\(\'undo_actions_since_pin\'\)\s*===\s*null\)\s*\{\s*\$this->clearUndoSlot\(self::UNDO_SLOT_PIN\);\s*\}/s',
        $preTry) === 1,
      'the ONLY pre-capture pin clear is the carried-over-game guard, gated on '
      . 'the counter global being absent');
check(substr_count($preTry, 'clearUndoSlot(self::UNDO_SLOT_PIN)') === 1,
      'the pin is not otherwise cleared before the capture — doing so every '
      . 'action would destroy Restart Turn');
check(preg_match('/try\s*\{.*captureUndoState\(/s', $body) === 1,
      'the capture is still inside the try, so a throw is caught rather than '
      . 'aborting the player\'s action');

// The seal must not be conditional: a guard around it would reintroduce the
// exact "depends what happened last" behaviour being removed.
check(preg_match('/if\s*\([^)]*\)\s*\{?\s*\$this->clearUndoSlot\(self::UNDO_SLOT_SCRATCH\);/', $body) !== 1,
      'the scratch clear is unconditional');

// ---------------------------------------------------------------------------
// 2. Success still arms the slot.
// ---------------------------------------------------------------------------
// Sealing first is only safe if the success path re-arms; otherwise undo would
// be dead permanently, which is a far worse bug than the one being fixed.
// writeUndoSlot is the single writer now; the SQL lives there.
$writeSlot = methodBody($gameSrc, 'writeUndoSlot');
check(str_contains($body, 'writeUndoSlot(self::UNDO_SLOT_SCRATCH'),
      'the success path re-fills the scratch slot, so the pre-emptive clear is '
      . 'always undone by a good capture');
check(preg_match('/INSERT INTO undo_snapshot.*available.*1/s', $writeSlot) === 1,
      'and writeUndoSlot writes available = 1');

// ---------------------------------------------------------------------------
// 3. A failure is recorded where it can actually be read.
// ---------------------------------------------------------------------------
$catchAt = strpos($body, 'catch');
check($catchAt !== false, 'there is a catch around the capture');
$catchBody = $catchAt === false ? '' : substr($body, $catchAt);

check(str_contains($catchBody, 'trace('),
      'the failure is still traced to the server log');
// The row write moved into a named helper; follow it rather than re-inlining.
check(str_contains($catchBody, 'markUndoCaptureFailure('),
      'AND the catch records the failure in the row via markUndoCaptureFailure');
$catchBody = $catchBody . methodBody($gameSrc, 'markUndoCaptureFailure');
check(str_contains($catchBody, 'undo_snapshot'),
      'AND written to undo_snapshot — trace() alone is unreadable for a '
      . 'production table, which is the case this exists for');
check(str_contains($catchBody, 'action_label'),
      'recorded in action_label, the one field that is not the payload and so '
      . 'survives as a marker');
check(preg_match('/available\s*=?,?\s*0/', $catchBody) === 1
      || str_contains($catchBody, 'NULL, 0,'),
      'and the row is left unavailable, matching the seal');

// The message must be escaped: it is an exception string, not a literal.
check(str_contains($catchBody, 'addslashes('),
      'the reason is addslashes()d before interpolation — it is exception '
      . 'text landing in SQL');
check(str_contains($catchBody, 'substr('),
      'and truncated, because action_label is VARCHAR(64)');

// ---------------------------------------------------------------------------
// 4. The column it writes into is still the size assumed above.
// ---------------------------------------------------------------------------
$schema = file_get_contents("$root/dbmodel.sql");
check(preg_match('/`action_label`\s+VARCHAR\(64\)/i', $schema) === 1,
      'action_label is still VARCHAR(64), which is what the truncation above '
      . 'is sized for');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
