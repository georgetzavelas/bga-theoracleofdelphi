<?php
/**
 * Regression lint: the "Redo god advancement" rewind, and the one line that
 * keeps it from becoming a card farm.
 *
 * The feature is a third undo slot holding the state from before a turn's
 * god-advancement phase — a point neither existing rewind reaches, since the
 * pin is armed at the first ACTION and the advancements happen before that.
 *
 * THE EXPLOIT THIS GUARDS. A god is "spent" by resetting player_god.track_step
 * to the bottom, and player_god is in UndoState::SNAPSHOT_TABLES — so a restore
 * un-spends it. The button is gated on `undo_actions_since_pin` being null or
 * 0 ("no action stands"), and clearUndoAll() NULLS that counter. Three paths
 * spend a god and then seal:
 *
 *   actTradeGodForCard  god to the bottom, draw a card, seal — and it never
 *                       checkpoints, so the counter was never raised at all
 *   useApollo           checkpoints, then seals on the wild card draw
 *   Ares / Artemis      consumePendingGodReset spends the god while a
 *                       CombatVictory equipment reward seals
 *
 * Without clearUndoAll() dropping the turn-start slot, each hands the button
 * back with the god already spent: advance a god, trade it for a card, rewind
 * the advancement, advance another, repeat. The reveal fingerprint catches the
 * two that draw from the deck, but an equipment card comes from the DISPLAY
 * and never touches card_location='deck' — so the fingerprint is a partial
 * second layer, not a backstop. The clearUndoSlot line is the guarantee, and
 * most of this file exists to keep it there.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_god_advancement_rewind.php
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

$gameSrc      = file_get_contents("$root/modules/php/Game.php");
$turnStartSrc = file_get_contents("$root/modules/php/States/PlayerTurnStart.php");
$actionsSrc   = file_get_contents("$root/modules/php/States/PlayerActions.php");
$undoSrc      = file_get_contents("$root/modules/php/UndoState.php");
$jsSrc        = file_get_contents("$root/theoracleofdelphi.js");

// ---------------------------------------------------------------------------
// 1. THE GUARANTEE. clearUndoAll must drop all three slots.
// ---------------------------------------------------------------------------
$clearAll = methodBody($gameSrc, 'clearUndoAll');
check($clearAll !== '', 'Game::clearUndoAll() exists');
check(substr_count($clearAll, 'clearUndoSlot') === 3,
      'clearUndoAll drops all THREE slots — dropping only pin+scratch hands the '
      . 'rewind button back with a god already spent');
check(str_contains($clearAll, 'UNDO_SLOT_TURNSTART'),
      'the slot it drops is the turn-start one specifically');

// The three god-spend paths must each still route through a seal. If someone
// adds a fourth, or removes a seal from one of these, that is the moment the
// farm opens — so name them.
$trade = methodBody($actionsSrc, 'actTradeGodForCard');
check($trade !== '', 'actTradeGodForCard() exists');
check(str_contains($trade, 'resetGod') && str_contains($trade, 'clearUndoAll'),
      'trade-god-for-card spends a god AND seals (it never checkpoints, so the '
      . 'seal is the only thing gating the rewind)');

$apollo = methodBody($actionsSrc, 'useApollo');
check($apollo !== '', 'useApollo() exists');
check(str_contains($apollo, 'resetGod') && str_contains($apollo, 'clearUndoAll'),
      'apollo spends a god AND seals on its wild draw');

$combatVictorySrc = file_get_contents("$root/modules/php/States/CombatVictory.php");
check(str_contains($combatVictorySrc, 'clearUndoAll'),
      'the equipment-reward path seals — the Ares/Artemis deferred god reset '
      . 'rides through here, and the fingerprint does NOT catch it (an '
      . 'equipment card comes from the display, not the deck)');

// Pin the fingerprint's blind spot, so nobody later "simplifies" the seal away
// on the belief that the fingerprint covers it.
$fingerprint = methodBody($gameSrc, 'computeRevealFingerprint');
check($fingerprint !== '', 'computeRevealFingerprint() exists');
check(!str_contains($fingerprint, "'display'") && !str_contains($fingerprint, 'equipment'),
      'the fingerprint does NOT track the equipment display — so it cannot be '
      . 'relied on as the backstop for the Ares path');

// ---------------------------------------------------------------------------
// 2. The slot: written once per turn, only when a choice exists.
// ---------------------------------------------------------------------------
check(str_contains($gameSrc, 'UNDO_SLOT_TURNSTART = 3'),
      'the turn-start slot has its own id');

$capture = methodBody($gameSrc, 'captureGodAdvancementRewind');
check($capture !== '', 'Game::captureGodAdvancementRewind() exists');
check(str_contains($capture, 'god_advancement_queue') && str_contains($capture, 'if ($queued === 0) return'),
      'nothing is written when no advancement is queued — no choice, no button');
check(str_contains($capture, 'captureUndoState'),
      'it reuses the existing capture rather than snapshotting tables by hand');

// The capture is worthless if the tables it needs are not in the snapshot.
check(str_contains($undoSrc, "'player_god'") && str_contains($undoSrc, "'god_advancement_queue'"),
      'player_god and god_advancement_queue are both in SNAPSHOT_TABLES');

// Written AFTER the pre-drain: those entries offered no choice.
$entering = methodBody($turnStartSrc, 'onEnteringState');
$drainAt   = strpos($entering, 'drainAutoSkippableGodAdvancements');
$captureAt = strpos($entering, 'captureGodAdvancementRewind');
check($captureAt !== false, 'PlayerTurnStart captures the rewind point');
check($drainAt !== false && $captureAt !== false && $drainAt < $captureAt,
      'the capture runs AFTER the auto-skip drain');

// ---------------------------------------------------------------------------
// 3. Availability: "no action STANDS", which is why Restart Turn revives it.
// ---------------------------------------------------------------------------
$avail = methodBody($gameSrc, 'godAdvancementRewindAvailable');
check($avail !== '', 'Game::godAdvancementRewindAvailable() exists');
check(str_contains($avail, 'UNDO_SLOT_TURNSTART'),
      'it requires the slot');
// null OR 0 — null covers "no action yet" and Restart Turn; 0 covers an undone
// action. Requiring null alone would kill the button after action-then-undo.
check(str_contains($avail, 'null') && str_contains($avail, '=== 0'),
      'the counter may be null OR 0 — null alone would leave the button dead '
      . 'after action-then-undo, which restores the same board state');

// The slot must NOT be dropped by taking an action; that is what killed the
// button after Restart Turn in the first design.
$checkpoint = methodBody($gameSrc, 'undoCheckpoint');
check($checkpoint !== '', 'Game::undoCheckpoint() exists');
check(!str_contains($checkpoint, 'UNDO_SLOT_TURNSTART'),
      'undoCheckpoint does NOT drop the turn-start slot — an action only hides '
      . 'the button, so Restart Turn can bring it back');

// ---------------------------------------------------------------------------
// 4. The rewind: verified, and routed back to the prompt.
// ---------------------------------------------------------------------------
$perform = methodBody($gameSrc, 'performGodAdvancementRewind');
check($perform !== '', 'Game::performGodAdvancementRewind() exists');
check(str_contains($perform, 'godAdvancementRewindAvailable'),
      're-gated server-side, so a stale client button is a no-op');
check(str_contains($perform, 'CheckGodAdvancement::class'),
      'it exits to CheckGodAdvancement — the restore put queue rows back and '
      . 'only that state drains them; the hub would strand them until next turn');
if (preg_match('/restoreUndoSlot\(\s*self::UNDO_SLOT_TURNSTART,\s*(\w+)/s', $perform, $m)) {
    check($m[1] === 'true', 'the restore verifies the reveal fingerprint');
} else {
    check(false, 'the restoreUndoSlot call is extractable');
}
// Pin and scratch describe a turn that no longer happened.
check(str_contains($perform, 'UNDO_SLOT_SCRATCH') && str_contains($perform, 'UNDO_SLOT_PIN'),
      'pin and scratch are dropped — both describe a turn being discarded');
// The turn-start slot itself survives a SUCCESSFUL rewind, so the player can
// redo again after re-choosing. It is legitimately dropped in the refusal
// branch, so look only at the code after that branch closes.
$successArm = '';
if (preg_match('/if \(\$next === null\) \{.*?\n        \}(.*)$/s', $perform, $m)) {
    $successArm = $m[1];
}
check($successArm !== '', 'the success arm is extractable');
check(!str_contains($successArm, 'UNDO_SLOT_TURNSTART'),
      'the turn-start slot survives a successful rewind, so redoing again works');
check(str_contains($perform, 'clearUndoSlot(self::UNDO_SLOT_TURNSTART)'),
      'a REFUSED rewind drops the slot, rather than leaving a button that keeps declining');

// restoreUndoSlot's default must be unchanged for the three existing callers.
$restore = methodBody($gameSrc, 'restoreUndoSlot');
check(str_contains($restore, '$exitState ??'),
      'restoreUndoSlot defaults to the hub when no exit state is given');
check(str_contains($gameSrc, '?string $exitState = null'),
      'the exit-state parameter is optional, leaving existing callers untouched');

// ---------------------------------------------------------------------------
// 5. Client.
// ---------------------------------------------------------------------------
check(str_contains($actionsSrc, "'godAdvancementRewindAvailable'"),
      'the hub ships the availability flag');
check(str_contains($actionsSrc, 'actRedoGodAdvancement'),
      'the hub exposes the action');
check(str_contains($jsSrc, '_addRedoGodAdvancementButton'),
      'the client renders a button');
check(str_contains($jsSrc, "bgaPerformAction('actRedoGodAdvancement'"),
      'the button calls the action');
// Not styled as a peer of Restart turn: one is a reversible one-choice rewind,
// the other discards the turn and confirms first.
// methodBody() matches PHP's `function name(`; JS here is `name: function(`,
// so slice the helper out by its own boundaries instead.
$btn = '';
$btnAt = strpos($jsSrc, '_addRedoGodAdvancementButton: function');
if ($btnAt !== false) {
    $endAt = strpos($jsSrc, "\n        },", $btnAt);
    if ($endAt !== false) $btn = substr($jsSrc, $btnAt, $endAt - $btnAt);
}
check($btn !== '', 'the button helper is extractable');
check(!str_contains($btn, 'delphi-restart-btn') && !str_contains($btn, "'red'"),
      'it stays secondary — a second red button beside Restart turn is the '
      . 'misclick that costs a whole turn');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
