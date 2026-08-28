<?php
/**
 * Restart Turn must appear exactly when it would do something, and never when
 * it would not.
 *
 * The hub's per-action "Undo action" button has since been removed, so Restart
 * Turn is the only take-back there and has nothing to duplicate: the predicate
 * is now simply "at least one action stands between the pinned state and now".
 * The counter arithmetic that feeds it is the part still worth pinning down,
 * because it was wrong once in a way players saw.
 *
 * Reported from a real game, back when both buttons were on screen: start of
 * turn, do an action, press "Undo action", do another action — and Restart
 * Turn appeared, even though one action stood and restarting would restore
 * exactly what Undo restored.
 *
 * Cause: `undo_actions_since_pin` armed at 0 on the pinning checkpoint and the
 * predicate tested `> 0`. The undo floored the counter at 0, then the next
 * checkpoint found a live pin and incremented to 1, so a re-done first action
 * counted as a second one.
 *
 * The counter now means "actions STANDING between the pinned state and now,
 * including the one the checkpoint is opening", so it arms at 1:
 *
 *   standing < 1    pin IS the current state -> restarting is a no-op, hide
 *   standing >= 1   a real rewind            -> offer
 *
 * Two halves. First an executable model of the three engine rules, swept
 * exhaustively against ground truth computed from the actual snapshot states.
 * Second a source lint tying that model to the shipped code, since Game
 * extends \Bga\GameFramework\Table and cannot be instantiated off-platform
 * (same reasoning as test_recolor_cancel_refund.php).
 *
 * Run: php tests/test_restart_turn_offer.php
 */

$root = dirname(__DIR__);
$pass = 0; $fail = 0;
function check(bool $c, string $m): void {
    global $pass, $fail;
    if ($c) { $pass++; } else { $fail++; echo "  FAIL: $m\n"; }
}

// ===========================================================================
// 1. The model: the three rules, and ground truth from real states
// ===========================================================================
final class UndoModel
{
    public ?string $pin = null;      // snapshot the pin holds
    public ?string $scratch = null;  // snapshot the scratch holds
    public ?int $standing = null;    // undo_actions_since_pin
    public string $state = 'S0';     // current game state
    private int $n = 0;

    /** undoCheckpoint(): capture into scratch, pin when empty, count up. */
    public function checkpoint(): void
    {
        $this->scratch = $this->state;
        if ($this->pin === null) {
            $this->pin = $this->state;
            $this->standing = 1;      // the pin is armed at 1, not 0
        } else {
            $this->standing++;
        }
    }

    public function completeAction(): void { $this->state = 'S' . (++$this->n); }

    /** performUndo(): restore + consume the scratch, count down (floored). */
    public function undo(): void
    {
        if ($this->scratch === null) return;   // nothing to undo; no-op
        $this->state = $this->scratch;
        $this->scratch = null;
        if ($this->standing > 0) $this->standing--;
    }

    /** restartTurnAvailable(), minus the deploy flag. */
    public function offered(): bool
    {
        if ($this->pin === null) return false;
        return (int)$this->standing >= 1;
    }

    /**
     * Ground truth, from the actual snapshot states: would pressing it change
     * anything? No "same as Undo" clause any more — the hub has no Undo button
     * to duplicate.
     */
    public function shouldBeOffered(): bool
    {
        if ($this->pin === null) return false;
        return $this->pin !== $this->state;
    }

    public static function run(string $ops): self
    {
        $m = new self();
        foreach (str_split($ops) as $op) {
            if ($op === 'A') { $m->checkpoint(); $m->completeAction(); }
            else             { $m->undo(); }
        }
        return $m;
    }
}

echo "=== the counter still tracks actions standing ===\n";
// The bug was arithmetic, not the predicate: a re-done first action counted as
// a second one. With the hub Undo gone the predicate is looser, so the counter
// is the only thing left keeping the button off screen at the start of a turn.
$m = UndoModel::run('AUA');
check($m->standing === 1,
      'action, Undo, action leaves ONE action standing, not two');

check(UndoModel::run('A')->standing === 1, 'one action: standing 1');
check(UndoModel::run('AA')->standing === 2, 'two actions: standing 2');
check(UndoModel::run('AU')->standing === 0, 'action then Undo: standing 0');
check(UndoModel::run('AAU')->standing === 1, 'two then Undo: standing 1');

echo "=== offered exactly when it would change something ===\n";
check(UndoModel::run('A')->offered() === true,
      'one action: offered (it is the only take-back at the hub now)');
check(UndoModel::run('AU')->offered() === false,
      'action then Undo: hidden, the pin IS the current state');
check(UndoModel::run('AUA')->offered() === true,
      'action, Undo, action: offered, and takes back exactly that one action');
check(UndoModel::run('AA')->offered() === true, 'two actions: offered');
// An undo consumes the scratch, so nothing else at the hub can take this back.
$only = UndoModel::run('AUAAU');
check($only->standing === 1 && $only->scratch === null,
      'A,U,A,A,U leaves one action standing with the scratch consumed');
check($only->offered() === true,
      'and Restart Turn is offered there — it is the only way back');

echo "=== exhaustive sweep against ground truth ===\n";
$wrongShow = 0; $wrongHide = 0; $egShow = null; $egHide = null; $seqs = 0;
for ($len = 1; $len <= 12; $len++) {
    for ($bits = 0; $bits < (1 << $len); $bits++) {
        $ops = '';
        for ($i = 0; $i < $len; $i++) $ops .= (($bits >> $i) & 1) ? 'U' : 'A';
        $m = UndoModel::run($ops);
        $seqs++;
        if ($m->offered() && !$m->shouldBeOffered()) { $wrongShow++; $egShow ??= $ops; }
        if (!$m->offered() && $m->shouldBeOffered()) { $wrongHide++; $egHide ??= $ops; }
    }
}
check($wrongShow === 0, "offered when it should not be ($wrongShow, e.g. $egShow)");
check($wrongHide === 0, "hidden when it should be offered ($wrongHide, e.g. $egHide)");
echo "  (swept $seqs action/undo sequences)\n";

// ===========================================================================
// 2. The lint: the shipped code implements the model above
// ===========================================================================
echo "=== the shipped predicate matches the model ===\n";
function body(string $file, string $sig): string {
    $src = file_get_contents($file);
    $at = strpos($src, $sig);
    if ($at === false) return '';
    $open = strpos($src, '{', $at);
    $depth = 0;
    for ($i = $open, $n = strlen($src); $i < $n; $i++) {
        if ($src[$i] === '{') $depth++;
        elseif ($src[$i] === '}' && --$depth === 0) return substr($src, $at, $i - $at + 1);
    }
    return '';
}
$game = "$root/modules/php/Game.php";

$avail = body($game, 'public function restartTurnAvailable(): bool');
check($avail !== '', 'restartTurnAvailable found');
check(preg_match("/get\('undo_actions_since_pin'\)\s*>=\s*1;/", $avail) === 1,
      'offered whenever at least one action stands');
// The hub no longer shows a per-action Undo, so deferring to it would just
// hide the only take-back there is.
check(!str_contains($avail, 'undoAvailable()'),
      'and it no longer defers to a hub Undo button that does not exist');

$ckpt = body($game, 'public function undoCheckpoint(string $label): void');
check(preg_match(
        '/writeUndoSlot\(self::UNDO_SLOT_PIN.*?set\(\s*\'undo_actions_since_pin\',\s*1\s*\)/s',
        $ckpt) === 1,
      'the pin write arms the counter at 1 (the action it precedes will stand)');
check(preg_match("/set\(\s*'undo_actions_since_pin',\s*0\s*\)/", $ckpt) !== 1,
      'and never at 0, which is what mis-counted the re-done first action');

$undo = body($game, 'public function performUndo(): string');
check(preg_match('/\$standing\s*>\s*0\s*\)\s*\{\s*\$this->globals->set\(\s*\'undo_actions_since_pin\',\s*\$standing\s*-\s*1\s*\)/s', $undo) === 1,
      'performUndo decrements the standing count, floored at 0');
// performUndo must leave the pin alone: the player is still mid-turn.
check(!str_contains($undo, 'clearUndoSlot(self::UNDO_SLOT_PIN)'),
      'and leaves the pin alive (still the same turn)');

echo "\n";
if ($fail > 0) { echo "$pass passed, $fail failed\n"; exit(1); }
echo "OK: $pass passed, 0 failed\n";
