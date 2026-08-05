<?php
/**
 * Regression lint: Blessed Reward (Equipment 011) must not be usable during the
 * turn it is obtained.
 *
 * The card reads "Whenever you receive a reward for Making an Offering, Raising
 * a Statue or Fighting a Monster, advance 1 God by 1 step." Equipment is only
 * ever obtained mid-turn as a monster-defeat reward, and
 * CombatVictory::actSelectEquipment moves the card into the player's hand
 * BEFORE it calls Game::maybeGrantBlessedRewardGodStep. Since
 * playerOwnsEquipment() reads the hand, taking Blessed Reward as the reward for
 * defeating a monster made the card fire on that very reward — and, since it is
 * a permanent reaction, on every further Offering/Statue/Monster reward for the
 * rest of that turn.
 *
 * Per the ruling, the fix records the acquiring player in
 * `blessed_reward_acquired_by` at the moment the card enters the hand; the
 * reaction refuses to fire for that player while the flag is set, and
 * PlayerTurnStart clears it so the card works from the next turn on.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_blessed_reward_same_turn.php
 */

require_once __DIR__ . '/../modules/php/UndoState.php';

use Bga\Games\theoracleofdelphi\UndoState;

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

const FLAG = 'blessed_reward_acquired_by';

$gameSrc    = file_get_contents("$root/modules/php/Game.php");
$victorySrc = file_get_contents("$root/modules/php/States/CombatVictory.php");
$turnSrc    = file_get_contents("$root/modules/php/States/PlayerTurnStart.php");

// ---------------------------------------------------------------------------
// 1. The reaction refuses to fire for the acquiring player.
// ---------------------------------------------------------------------------
$reaction = methodBody($gameSrc, 'maybeGrantBlessedRewardGodStep');
check($reaction !== '', 'Game::maybeGrantBlessedRewardGodStep() exists');
check(str_contains($reaction, FLAG),
      'the reaction checks ' . FLAG);
check(preg_match('/' . FLAG . '.*?\)\s*===\s*\$playerId/s', $reaction) === 1,
      'compared against $playerId, not treated as a boolean (so it cannot leak '
      . "into an opponent's turn)");

// The gate must sit BEFORE the notif/state transition, or the log announces a
// god step that never happens.
$gateAt  = strpos($reaction, FLAG);
$notifAt = strpos($reaction, 'equipmentReactionTriggered');
check($gateAt !== false && $notifAt !== false && $gateAt < $notifAt,
      'the gate precedes the equipmentReactionTriggered notif');
check(preg_match('/' . FLAG . '[^;]*\)\s*===\s*\$playerId\s*\)\s*\{\s*return null;/s', $reaction) === 1,
      'the gate returns null (no god step, no sub-state)');

// ---------------------------------------------------------------------------
// 2. The flag is set where the card is acquired — and specifically for card 11.
// ---------------------------------------------------------------------------
$select = methodBody($victorySrc, 'actSelectEquipment');
check($select !== '', 'CombatVictory::actSelectEquipment() exists');
check(str_contains($select, FLAG), 'the acquisition path sets ' . FLAG);
check(preg_match('/card_type_arg.{0,40}===\s*11[^{]*\{\s*[^}]*' . FLAG . '/s', $select) === 1,
      'set only when the acquired card IS 011, so taking any other equipment '
      . 'leaves an already-owned Blessed Reward working');

// Must be set before the reaction is consulted, otherwise the card still fires
// on its own reward — the whole point of the fix.
$setAt      = strpos($select, FLAG);
$reactionAt = strpos($select, 'maybeGrantBlessedRewardGodStep');
check($setAt !== false && $reactionAt !== false && $setAt < $reactionAt,
      'the flag is set before maybeGrantBlessedRewardGodStep is called');

// It also has to be set before the deferred one-time-combo path stashes
// pending_blessed_reward_type, which fires the reaction later.
$pendingAt = strpos($select, 'pending_blessed_reward_type');
check($pendingAt === false || $setAt < $pendingAt,
      'the flag is set before the deferred pending_blessed_reward_type path');

// ---------------------------------------------------------------------------
// 3. The restriction ends at the next turn, not sooner and not never.
// ---------------------------------------------------------------------------
check(str_contains(methodBody($turnSrc, 'onEnteringState'), FLAG),
      'PlayerTurnStart::onEnteringState clears ' . FLAG);
check(preg_match('/' . FLAG . "['\"]\s*,\s*null\s*\)/", $turnSrc) === 1,
      'cleared to null at turn start');

// Nothing else may clear it: an early clear inside the acquiring turn would
// re-open the hole the fix closes.
$clearSites = [];
foreach (array_merge(["$root/modules/php/Game.php"], glob("$root/modules/php/States/*.php")) as $file) {
    $src = stripComments(file_get_contents($file));
    if (preg_match_all("/set\(\s*['\"]" . FLAG . "['\"]\s*,\s*null\s*\)/", $src, $m)) {
        foreach ($m[0] as $_) { $clearSites[] = basename($file); }
    }
}
check($clearSites === ['PlayerTurnStart.php'],
      'PlayerTurnStart is the ONLY place the flag is cleared; got: '
      . implode(', ', $clearSites));

// ---------------------------------------------------------------------------
// 4. Undo must restore the flag. UndoState's manifest docblock requires every
//    new turn-scratch global to be listed, or undoing the combat that granted
//    the card would leave the restriction applied to a card the player no
//    longer holds (or drop it from one they do).
// ---------------------------------------------------------------------------
check(in_array(FLAG, UndoState::GLOBAL_KEYS, true),
      FLAG . ' is captured in UndoState::GLOBAL_KEYS');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
