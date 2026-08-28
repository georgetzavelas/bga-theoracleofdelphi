<?php
/**
 * The two-slot undo engine: per-action Undo and Restart Turn must consume
 * DIFFERENT slots, and the seal triage must send every call site to the right
 * one.
 *
 * The bug this guards against is not hypothetical, it is the whole reason the
 * split exists. Before the split, one slot served two jobs that only coincide
 * at depth 1:
 *
 *   - turn-level undo, and
 *   - the mid-action-unit rollback that refunds a recolor Favor on cancel
 *     (Game::abandonSelectedSource).
 *
 * Pin the slot so it survives later actions and those two jobs diverge: every
 * cancel would destroy the turn pin (players cancel constantly, so Restart Turn
 * would break at random), and cancelling a recolored die would rewind the whole
 * turn instead of just the recolor.
 *
 * Source-level assertions, in the style of the other engine tests here: there is
 * no DB in this harness, so the contract is checked against the shipped source
 * rather than by running it.
 *
 * Run: php tests/test_undo_two_slot.php
 */

$root = dirname(__DIR__);
$pass = 0;
$fail = 0;

function check(bool $cond, string $msg): void {
    global $pass, $fail;
    if ($cond) { $pass++; } else { $fail++; echo "  FAIL: $msg\n"; }
}

function body(string $file, string $signature): string {
    $src = file_get_contents($file);
    $at = strpos($src, $signature);
    if ($at === false) return '';
    // Walk braces from the signature to the matching close.
    $open = strpos($src, '{', $at);
    if ($open === false) return '';
    $depth = 0;
    for ($i = $open; $i < strlen($src); $i++) {
        if ($src[$i] === '{') $depth++;
        elseif ($src[$i] === '}') {
            $depth--;
            if ($depth === 0) return substr($src, $at, $i - $at + 1);
        }
    }
    return '';
}

$game = "$root/modules/php/Game.php";
$gameSrc = file_get_contents($game);

// =============================================================
// 1. No caller is left on the old single-slot API
// =============================================================
echo "=== the old sealUndo() is gone ===\n";
$phpFiles = array_merge(
    glob("$root/modules/php/*.php"),
    glob("$root/modules/php/States/*.php")
);
$liveCalls = [];
foreach ($phpFiles as $f) {
    foreach (file($f) as $n => $line) {
        // A call, not prose: sealUndo( preceded by -> or ::.
        if (preg_match('/(->|::)sealUndo\s*\(/', $line)) {
            $liveCalls[] = basename($f) . ':' . ($n + 1);
        }
    }
}
check($liveCalls === [],
      'no live sealUndo() calls remain (found: ' . implode(', ', $liveCalls) . ')');

// =============================================================
// 2. The slots are distinct and the engine reads the right one
// =============================================================
echo "=== slot constants ===\n";
check(preg_match('/UNDO_SLOT_PIN\s*=\s*1;/', $gameSrc) === 1, 'pin is slot 1');
check(preg_match('/UNDO_SLOT_SCRATCH\s*=\s*2;/', $gameSrc) === 1, 'scratch is slot 2');
check(preg_match('/ENABLE_RESTART_TURN\s*=\s*(true|false);/', $gameSrc) === 1,
      'the Restart Turn deploy gate exists');

$undoAvailable = body($game, 'public function undoAvailable(): bool');
check(str_contains($undoAvailable, 'UNDO_SLOT_SCRATCH'),
      'undoAvailable() reports the SCRATCH slot, not the pin');
check(!str_contains($undoAvailable, 'UNDO_SLOT_PIN'),
      'undoAvailable() never consults the pin');

// =============================================================
// 3. undoCheckpoint pins once, then leaves the pin alone
// =============================================================
echo "=== undoCheckpoint ===\n";
$checkpoint = body($game, 'public function undoCheckpoint(string $label): void');
check($checkpoint !== '', 'undoCheckpoint found');
check(str_contains($checkpoint, 'writeUndoSlot(self::UNDO_SLOT_SCRATCH'),
      'scratch is written on every checkpoint');
// The pin write must be conditional on the slot being empty. That "write once,
// then leave it" IS the Restart Turn mechanism; make it unconditional and the
// pin degrades back into a second scratch slot.
check(preg_match(
        '/if\s*\(!\$this->undoSlotExists\(self::UNDO_SLOT_PIN\)\)\s*\{\s*\$this->writeUndoSlot\(self::UNDO_SLOT_PIN/s',
        $checkpoint) === 1,
      'the pin is written ONLY when its slot is empty');
check(str_contains($checkpoint, "globals->set('undo_actions_since_pin', 0)"),
      'pinning resets the actions-since-pin counter');
check(preg_match('/undo_actions_since_pin.*\+\s*1/s', $checkpoint) === 1,
      'a checkpoint over a live pin increments the counter instead');
// Capture must precede both writes: one snapshot, two slots.
$capAt     = strpos($checkpoint, 'captureUndoState()');
$scratchAt = strpos($checkpoint, 'writeUndoSlot(self::UNDO_SLOT_SCRATCH');
check($capAt !== false && $scratchAt !== false && $capAt < $scratchAt,
      'state is captured once, before either slot is written');

// Interaction with the checkpoint hardening (test_undo_checkpoint_hardening):
// the scratch slot is cleared pre-capture so a throw cannot leave an older
// payload marked available. The pin must NOT be, since holding an older
// payload is exactly its job.
$preTry = substr($checkpoint, 0, strpos($checkpoint, 'try'));
check(str_contains($preTry, 'clearUndoSlot(self::UNDO_SLOT_SCRATCH)'),
      'the scratch slot is cleared before the capture (hardening)');
check(substr_count($preTry, 'clearUndoSlot(self::UNDO_SLOT_PIN)') === 1
      && str_contains($preTry, "globals->get('undo_actions_since_pin') === null"),
      'the pin is cleared pre-capture ONLY by the carried-over-game guard');

// =============================================================
// 4. The seal triage
// =============================================================
echo "=== seal triage ===\n";

// Cancel paths clear SCRATCH ONLY. Clearing the pin on any of these is the
// silent-failure mode: Restart Turn would vanish for anyone who backs out of a
// die selection, which is an ordinary thing to do several times a turn.
$cancelSites = [
    ["$root/modules/php/Game.php",
     'private function releaseSelectedSource(int $playerId): void', 'releaseSelectedSource'],
    ["$root/modules/php/States/SelectAction.php",
     'public function actCancelDieSelection(int $activePlayerId)', 'actCancelDieSelection'],
    ["$root/modules/php/States/PlayerActions.php",
     'public function actCancelBonusAction(int $activePlayerId): string', 'actCancelBonusAction'],
    ["$root/modules/php/States/UseGodAbility.php",
     'public function actPass(int $activePlayerId)', 'actPass'],
];
foreach ($cancelSites as [$file, $sig, $name]) {
    $fn = body($file, $sig);
    check($fn !== '', "$name found");
    check(str_contains($fn, 'clearUndoScratch()'), "$name clears the scratch slot");
    check(!str_contains($fn, 'clearUndoAll('),
          "$name does NOT clear the pin (a cancel must not cost the turn)");
}

// Reveal / randomness / turn-boundary sites clear BOTH. Missing one here is the
// exploit direction: the pin would outlive information the player has now seen.
$revealSites = [
    ["$root/modules/php/States/CombatRound.php",       'combat roll'],
    ["$root/modules/php/States/ExploreIsland.php",     'island reveal'],
    ["$root/modules/php/States/PeekIslands.php",       'peek islands reveal'],
    ["$root/modules/php/States/ScoutIslands.php",      'scout islands reveal'],
    ["$root/modules/php/States/ConsultOracle.php",     'turn boundary'],
    ["$root/modules/php/States/CombatVictory.php",     'equipment reward taken'],
    ["$root/modules/php/States/SelectReward.php",      'companion reward taken'],
];
foreach ($revealSites as [$file, $reason]) {
    $src = file_get_contents($file);
    check(str_contains($src, "clearUndoAll('$reason')"),
          basename($file) . " clears BOTH slots ('$reason')");
}
// The multi-site files carry more than one reveal each.
$selectAction = file_get_contents("$root/modules/php/States/SelectAction.php");
check(str_contains($selectAction, "clearUndoAll('oracle card draw')"),
      'SelectAction: the oracle card draw clears both slots');
check(str_contains($selectAction, "clearUndoAll('amulet card draw')"),
      'SelectAction: the amulet card draw clears both slots');
$playerActions = file_get_contents("$root/modules/php/States/PlayerActions.php");
check(str_contains($playerActions, "clearUndoAll('trade god for card')"),
      'PlayerActions: trading a god for a card clears both slots');
check(str_contains($playerActions, "clearUndoAll('apollo wild card draw')"),
      'PlayerActions: the Apollo wild draw clears both slots');
check(str_contains($gameSrc, "clearUndoAll('zeus reached')"),
      'Game: reaching Zeus clears both slots');
check(str_contains($gameSrc, "clearUndoAll('equipment-007 card draw')"),
      'Game: the equipment 007 draw clears both slots');

// =============================================================
// 5. performUndo consumes scratch and SPARES the pin
// =============================================================
echo "=== performUndo ===\n";
$performUndo = body($game, 'public function performUndo(): string');
check(str_contains($performUndo, 'restoreUndoSlot(') && str_contains($performUndo, 'UNDO_SLOT_SCRATCH'),
      'performUndo restores the scratch slot');
check(str_contains($performUndo, 'clearUndoSlot(self::UNDO_SLOT_SCRATCH)'),
      'performUndo consumes the scratch slot');
// The player is still mid-turn after a per-action undo, so restarting the turn
// is still a legal thing to want.
check(!str_contains($performUndo, 'clearUndoSlot(self::UNDO_SLOT_PIN)'),
      'performUndo leaves the pin alive');
check(preg_match('/undo_actions_since_pin.*-\s*1/s', $performUndo) === 1,
      'performUndo walks the actions-since-pin counter back');
// The cancel back-out gates on undo_recolor_marked (ANY recolor this
// action-unit, paid or free — see abandonSelectedSource). The retired
// undo_recolor_paid must not creep back in with the two-slot rewrite.
check(str_contains($performUndo, "undo_recolor_marked"),
      'performUndo clears the recolor marker');
check(!str_contains($gameSrc, "globals->set('undo_recolor_paid'"),
      'the retired undo_recolor_paid global is not reintroduced');
// The pin must never be fingerprint-verified here; that is the pin's gate.
check(preg_match('/restoreUndoSlot\(\s*self::UNDO_SLOT_SCRATCH,\s*false,/s', $performUndo) === 1,
      'performUndo does not fingerprint-verify (that gate belongs to the pin)');

// =============================================================
// 6. performRestartTurn consumes BOTH and is fingerprint-gated
// =============================================================
echo "=== performRestartTurn ===\n";
$restart = body($game, 'public function performRestartTurn(): string');
check($restart !== '', 'performRestartTurn found');
check(preg_match('/restoreUndoSlot\(\s*self::UNDO_SLOT_PIN,\s*true,/s', $restart) === 1,
      'the pin restore IS fingerprint-verified');
check(str_contains($restart, 'clearUndoSlot(self::UNDO_SLOT_SCRATCH)')
   && str_contains($restart, 'clearUndoSlot(self::UNDO_SLOT_PIN)'),
      'restarting consumes both slots (the scratch describes a state that is gone)');
check(str_contains($restart, 'restartTurnAvailable()'),
      'restarting re-checks availability server-side (a stale client button no-ops)');

$avail = body($game, 'public function restartTurnAvailable(): bool');
check(str_contains($avail, 'ENABLE_RESTART_TURN'), 'the deploy gate is honoured');
check(str_contains($avail, 'UNDO_SLOT_PIN'), 'a live pin is required');
// Without this the two buttons would restore identical state and the second
// would be pure noise.
check(str_contains($avail, "undo_actions_since_pin") && str_contains($avail, '> 0'),
      'offered only when the pin differs from the per-action undo');

// =============================================================
// 7. The fingerprint measures the right things
// =============================================================
echo "=== reveal fingerprint ===\n";
$fp = body($game, 'private function computeRevealFingerprint(): string');
check($fp !== '', 'computeRevealFingerprint found');
check(str_contains($fp, "card_location = 'deck'"),
      'fingerprints the DECK (a draw shrinks it)');
// Hashing every card location would refuse every ordinary card play, since
// playing a card moves hand -> played without revealing anything.
check(!preg_match("/SELECT card_id, card_location FROM card\b/", $fp),
      'does NOT fingerprint all card locations (would refuse legitimate card plays)');
check(str_contains($fp, 'is_revealed = 1'), 'fingerprints revealed islands');
check(str_contains($fp, 'player_island_knowledge'), 'fingerprints peeks');
check(str_contains($fp, 'combat_roll'), 'fingerprints the combat die roll');

$restore = body($game, 'private function restoreUndoSlot(int $slot, bool $verifyFingerprint, string $logMessage): ?string');
check($restore !== '', 'restoreUndoSlot found');
check(str_contains($restore, "empty(\$decoded['tables']['player'])"),
      'the corrupt-payload guard survives the refactor');
// Refuse rather than restore on a missing fingerprint: a pre-fingerprint
// payload cannot be verified, so the pin must not act on it.
check(preg_match('/\$stored === null \|\| \$stored !== \$this->computeRevealFingerprint\(\)/', $restore) === 1,
      'an unverifiable pin is refused, not trusted');

$audit = body($game, 'private function auditPinFingerprint(string $where): void');
check($audit !== '', 'auditPinFingerprint found (the dark-launch validator)');
check(str_contains($audit, 'trace('), 'a mis-triaged seal site is traced');
$clearAll = body($game, 'public function clearUndoAll(string $reason): void');
check(strpos($clearAll, 'auditPinFingerprint') < strpos($clearAll, 'clearUndoSlot'),
      'the audit runs BEFORE the pin is dropped (afterwards there is nothing to check)');

// =============================================================
// 8. Hub-only wiring
// =============================================================
echo "=== client wiring ===\n";
$trait = file_get_contents("$root/modules/php/States/UndoableState.php");
check(str_contains($trait, 'undoArgs(bool $withRestart = false)'),
      'Restart Turn is opt-in per state, not a trait default');
// The amber pickers are reached THROUGH a reveal, which has already released
// the pin, so a Restart Turn button there would be absent or lying.
foreach (['CombatVictory', 'SelectReward'] as $picker) {
    $src = file_get_contents("$root/modules/php/States/$picker.php");
    check(str_contains($src, 'undoArgs()') && !str_contains($src, 'undoArgs(true)'),
          "$picker does not offer Restart Turn");
}
check(str_contains($playerActions, 'undoArgs(true)'),
      'PlayerActions (the hub) opts in');
check(str_contains($playerActions, 'function actRestartTurn'),
      'the hub declares actRestartTurn');

$js = file_get_contents("$root/theoracleofdelphi.js");
check(str_contains($js, '_addRestartTurnButton'), 'the client builds a Restart Turn button');
// Two red right-grouped buttons whose labels both start with "Undo" is the
// misclick this design exists to avoid, and here the misclick costs a turn.
$btn = (function (string $js): string {
    $at = strpos($js, '_addRestartTurnButton: function');
    $end = strpos($js, "\n        },", $at);
    return substr($js, $at, $end - $at);
})($js);
check(!str_contains($btn, 'delphi-dismiss-btn'),
      'Restart Turn is NOT flex-ordered next to Undo/Cancel');
check(!str_contains($btn, "color: 'red'"),
      'Restart Turn does not wear the red dismiss colour at rest');
// Confirms through the SHARED helper rather than a bespoke idiom: it also
// hides the action-source strip, so a stray click on a die or god portrait
// cannot become a third exit from the question (test_confirm_isolation_js).
check(str_contains($btn, '_confirmInActionBar('),
      'it confirms via the shared _confirmInActionBar helper');
check(str_contains($btn, 'actRestartTurn'),
      'the confirm handler dispatches actRestartTurn');
check(!str_contains($btn, 'setTimeout'),
      'no bespoke timer-based confirm (the shared helper owns this)');
check(str_contains($btn, 'restartTurnAvailable'),
      'it is gated on the server flag');
// Undo must stay a plain one-press button: a confirmation on the cheap
// back-out would be friction for the common case.
$undoBtn = (function (string $js): string {
    $at = strpos($js, '_addUndoButton: function');
    $end = strpos($js, "\n        },", $at);
    return substr($js, $at, $end - $at);
})($js);
check(!str_contains($undoBtn, '_confirmInActionBar('),
      'the per-action Undo does NOT confirm (only the expensive button does)');

echo "\n";
if ($fail > 0) {
    echo "$pass passed, $fail failed\n";
    exit(1);
}
echo "OK: $pass passed, 0 failed\n";
