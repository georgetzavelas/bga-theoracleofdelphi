<?php
/**
 * Regression lint: Blessed Reward (Equipment 011) must not fire for the reward
 * that granted it — and must still fire for every other reward that turn.
 *
 * The card reads "Whenever you receive a reward for Making an Offering, Raising
 * a Statue or Fighting a Monster, advance 1 God by 1 step."
 * CombatVictory::actSelectEquipment moves the picked card into the player's hand
 * near the top, then calls Game::maybeGrantBlessedRewardGodStep at the bottom,
 * which gates on playerOwnsEquipment() — a hand lookup. So taking Blessed Reward
 * as the reward for defeating a monster advanced a god for the card's own
 * acquisition.
 *
 * Per the ruling this is a PER-REWARD restriction, not a per-turn one: the card
 * simply does not apply retroactively to the reward that granted it. A later
 * Offering, Statue or Monster reward in the same turn triggers it normally.
 *
 * That distinction is the whole point of this file. The guard therefore lives at
 * the single acquisition site, keyed on the picked card's type, and NOT inside
 * maybeGrantBlessedRewardGodStep — a gate in there (or any turn-scoped flag)
 * would also suppress those legitimate later triggers. An earlier attempt did
 * exactly that; these assertions exist to stop it coming back.
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

$gameSrc    = file_get_contents("$root/modules/php/Game.php");
$victorySrc = file_get_contents("$root/modules/php/States/CombatVictory.php");

// ---------------------------------------------------------------------------
// 1. The monster-reward call site skips the reaction when 011 IS the card just
//    taken. This is the actual bug fix.
// ---------------------------------------------------------------------------
$select = methodBody($victorySrc, 'actSelectEquipment');
check($select !== '', 'CombatVictory::actSelectEquipment() exists');
check(str_contains($select, 'maybeGrantBlessedRewardGodStep'),
      'the monster path still consults the Blessed Reward reaction');
check(preg_match('/\$cardTypeArg\s*!==\s*11[^{]*\{[^}]*maybeGrantBlessedRewardGodStep/s', $select) === 1,
      'the reaction call is guarded by $cardTypeArg !== 11, so picking Blessed '
      . 'Reward does not advance a god for its own acquisition');

// The guard must wrap the call, not merely precede it: a bare `if` above an
// unguarded call would read as fixed and do nothing.
$guardPos = strpos($select, '!== 11');
$callPos  = strpos($select, 'maybeGrantBlessedRewardGodStep');
check($guardPos !== false && $callPos !== false && $guardPos < $callPos,
      'the guard precedes the call it protects');

// ---------------------------------------------------------------------------
// 2. The restriction is PER-REWARD, not per-turn. Two ways that could regress:
//    a gate inside the shared reaction helper, or a turn-scoped flag anywhere.
//    Either would also block an Offering/Statue reward later in the same turn,
//    which the ruling explicitly allows.
// ---------------------------------------------------------------------------
$reaction = methodBody($gameSrc, 'maybeGrantBlessedRewardGodStep');
check($reaction !== '', 'Game::maybeGrantBlessedRewardGodStep() exists');
check(str_contains($reaction, 'playerOwnsEquipment'),
      'the helper still gates on ownership');
check(!preg_match('/acquired|this_turn|same_turn/i', $reaction),
      'the helper carries NO turn-scoped gate — that would suppress legitimate '
      . 'later-in-turn rewards');

$flagNames = ['blessed_reward_acquired_by', 'blessed_reward_acquired_this_turn'];
$flagSites = [];
foreach (array_merge(["$root/modules/php/Game.php", "$root/modules/php/UndoState.php"],
                     glob("$root/modules/php/States/*.php")) as $file) {
    $src = stripComments(file_get_contents($file));
    foreach ($flagNames as $flag) {
        if (str_contains($src, $flag)) { $flagSites[] = basename($file) . " ($flag)"; }
    }
}
check($flagSites === [],
      'no turn-scoped Blessed Reward flag exists; found: ' . implode(', ', $flagSites));
check(!in_array('blessed_reward_acquired_by', UndoState::GLOBAL_KEYS, true),
      'the abandoned turn-scoped flag is not left in the undo manifest');

// ---------------------------------------------------------------------------
// 3. The other three reward paths stay UNGUARDED. They cannot grant equipment,
//    so they can never be the reward that granted the card, and gating them
//    would silently remove god steps the player is owed.
// ---------------------------------------------------------------------------
$otherSites = [
    'DeliverCargo.php'  => 'offering delivered',
    'SelectReward.php'  => 'statue reward (companion taken or declined)',
];
foreach ($otherSites as $file => $what) {
    $src = file_get_contents("$root/modules/php/States/$file");
    check(str_contains($src, 'maybeGrantBlessedRewardGodStep'),
          "$file still fires the reaction ($what)");
    check(!preg_match('/!==\s*11[^;{]*\{[^}]{0,200}maybeGrantBlessedRewardGodStep/s', $src),
          "$file's reaction is NOT card-11-guarded — a same-turn $what must still "
          . 'advance a god');
}

// The deferred one-time-equipment combo path fires the reaction after a
// sub-state resolves. It is only reachable when the picked card is one_time or
// mixed — i.e. never card 011, which is permanent — so it needs no guard, and
// adding one would break the case where the player already owned 011.
$exit = methodBody($gameSrc, 'resolvePostActivationExit');
check(str_contains($exit, 'maybeGrantBlessedRewardGodStep'),
      'the deferred combo path still fires the reaction');
check(!str_contains($exit, '!== 11'),
      'the deferred combo path is not card-11-guarded (unreachable for a '
      . 'permanent card, and guarding it would break an already-owned 011)');

// Sanity: 011 really is permanent, which is what makes the two claims above
// hold. If it ever became one_time/mixed, the deferred path would need the
// guard too.
require_once "$root/modules/php/MaterialDefs.php";
check((\Bga\Games\theoracleofdelphi\MaterialDefs::EQUIPMENT_CARDS[11]['type'] ?? '') === 'permanent',
      'card 011 is a permanent card (the premise for leaving the deferred path '
      . 'unguarded)');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
