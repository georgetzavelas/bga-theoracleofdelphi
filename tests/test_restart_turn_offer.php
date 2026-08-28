<?php
/**
 * Restart Turn must never appear as a duplicate of Undo, and must never hide
 * when it is the only way back.
 *
 * Reported from a real game: start of turn, do an action, press "Undo action",
 * do another action — and Restart Turn appears, even though one action stands
 * and restarting would restore exactly what Undo restores.
 *
 * Cause: `undo_actions_since_pin` armed at 0 on the pinning checkpoint and the
 * predicate tested `> 0`. The undo floored the counter at 0, then the next
 * checkpoint found a live pin and incremented to 1, so a re-done first action
 * counted as a second one.
 *
 * The counter now means "actions STANDING between the pinned state and now,
 * including the one the checkpoint is opening", so it arms at 1. The predicate
 * splits on it:
 *
 *   standing < 1    pin IS the current state          -> no-op, hide
 *   standing == 1   one action stands, so Restart and Undo are the same rewind
 *                   -> offer ONLY when Undo is absent (it is, right after an
 *                      undo, which consumes the scratch slot)
 *   standing >= 2   the rewinds genuinely differ      -> offer
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
        $s = (int)$this->standing;
        if ($s < 1) return false;
        return $s >= 2 || $this->scratch === null;   // scratch === null <=> !undoAvailable()
    }

    /** Ground truth: would the button do something Undo does not already do? */
    public function shouldBeOffered(): bool
    {
        if ($this->pin === null) return false;
        if ($this->pin === $this->state) return false;          // restoring it is a no-op
        if ($this->scratch !== null && $this->pin === $this->scratch) return false;  // same as Undo
        return true;
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

echo "=== the reported sequence ===\n";
// action, Undo, action: one action stands and Undo is on screen, so Restart
// Turn would restore exactly what Undo restores.
$m = UndoModel::run('AUA');
check($m->standing === 1, 'action, Undo, action leaves ONE action standing');
check($m->scratch !== null, 'and Undo is available to take it back');
check($m->offered() === false, 'so Restart Turn is NOT offered (the reported bug)');

echo "=== the cases either side of it ===\n";
check(UndoModel::run('A')->offered() === false,
      'one action, Undo on screen: hidden (they are the same rewind)');
check(UndoModel::run('AA')->offered() === true,
      'two actions: offered (Restart goes further back than Undo)');
check(UndoModel::run('AU')->offered() === false,
      'action then Undo: hidden (the pin IS the current state)');
// A,A,U: action A still stands and the pin sits BEFORE it, so restarting is a
// real rewind — and the undo just consumed the scratch, so Undo is gone.
$afterUndo = UndoModel::run('AAU');
check($afterUndo->standing === 1 && $afterUndo->scratch === null,
      'two actions then Undo leaves the first standing, scratch consumed');
check($afterUndo->offered() === true,
      'and Restart Turn IS offered — it still takes back that first action');
// Right after an undo the scratch is consumed, so there is no Undo button.
// Restart Turn is then the ONLY way back and must not hide.
$only = UndoModel::run('AUAAU');
check($only->standing === 1 && $only->scratch === null,
      'A,U,A,A,U leaves one action standing with the scratch consumed');
check($only->offered() === true,
      'and Restart Turn IS offered there — it is the only way back');

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
check(preg_match('/\$standing\s*<\s*1\s*\)\s*return false;/', $avail) === 1,
      'a pin equal to the current state is rejected (standing < 1)');
check(preg_match('/\$standing\s*>=\s*2\s*\|\|\s*!\$this->undoAvailable\(\)/', $avail) === 1,
      'and the single-standing-action case defers to Undo unless Undo is gone');
// The old predicate. If this ever comes back the reported bug comes with it.
check(preg_match("/get\('undo_actions_since_pin'\)\s*>\s*0;/", $avail) !== 1,
      'the old `> 0` predicate is not back');

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
