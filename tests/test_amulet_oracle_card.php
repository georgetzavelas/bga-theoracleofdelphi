<?php
/**
 * Regression lint: the Amulet cards (004/005/006) activate on a played Oracle
 * Card as well as on a rolled Oracle Die.
 *
 * Their rulebook text is "You may use an Oracle Die of the depicted color as an
 * action to take 1 Favor Token, draw 1 Oracle Card, and advance the God of the
 * respective color by 1 step." Per ruling, a played Oracle Card counts as that
 * die — which is how the Creature and Demigod companions, worded identically
 * ("an Oracle Die of the Creature's color" / "any Oracle Die in the Demigod's
 * color"), already behaved. The amulets were the lone strict case and rejected
 * cards in two places.
 *
 * What must stay true:
 *   - a die OR a played oracle card of the matching colour activates the amulet;
 *   - a BONUS action (equipment 003) does not — an extra action bought with
 *     Favor is neither an Oracle Die nor an Oracle Card;
 *   - Apollo's pending free colour choice still blocks activation, for a card
 *     just as much as a die. That gate previously excluded oracle cards, which
 *     was invisible while cards couldn't activate an amulet at all and becomes
 *     load-bearing now: without it a wild-but-uncoloured source could take the
 *     amulet's reward before its colour was chosen.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_amulet_oracle_card.php
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

$gameSrc   = file_get_contents("$root/modules/php/Game.php");
$actionSrc = file_get_contents("$root/modules/php/States/SelectAction.php");

// ---------------------------------------------------------------------------
// 1. The args gate (which decides whether the button renders at all).
// ---------------------------------------------------------------------------
$compute = methodBody($gameSrc, 'computeActivatableEquipment');
check($compute !== '', 'Game::computeActivatableEquipment() exists');

// The amulet arm must no longer consult oracle-card-ness, and must take its
// colour from the action SOURCE (getActionColor covers die + card) rather than
// querying oracle_die directly.
check(!preg_match('/\$isOracleCard/', $compute),
      'no $isOracleCard gate remains — a played card is a valid amulet source');
check(!preg_match('/FROM oracle_die/', $compute),
      'no direct oracle_die lookup — the colour comes from getActionColor, which '
      . 'covers a played card too');
check(str_contains($compute, 'getActionColor'),
      'the amulet colour is resolved via getActionColor');

// Extract just the 4/5/6 arm to assert precisely on it.
$arm = '';
if (preg_match('/case 4:\s*case 5:\s*case 6:(.*?)break;/s', $compute, $m)) {
    $arm = $m[1];
}
check($arm !== '', 'the case 4/5/6 arm is extractable');
check(str_contains($arm, '$actionColor') && str_contains($arm, '$amuletColor[$arg]'),
      'the arm compares the action colour against the per-card amulet colour');
check(str_contains($arm, '!$usingBonus'),
      'the arm still excludes bonus actions');
check(str_contains($arm, '!$apolloNeedsRecolor'),
      'the arm still blocks while Apollo owes a free colour choice');

// The Apollo precondition itself must not exclude oracle cards, or the gate
// above is dead for exactly the case that needs it.
if (preg_match('/\$apolloNeedsRecolor\s*=\s*(.*?);/s', $compute, $m)) {
    check(!str_contains($m[1], 'isOracleCard'),
          'apolloNeedsRecolor does NOT exclude oracle cards (mirrors '
          . 'SelectAction::getArgs, and is what stops an uncoloured wild source '
          . 'activating the amulet)');
} else {
    check(false, 'apolloNeedsRecolor assignment is extractable');
}

// ---------------------------------------------------------------------------
// 2. The action handler (defence in depth against a stale client).
// ---------------------------------------------------------------------------
$activate = methodBody($actionSrc, 'activateAmuletEquipment');
check($activate !== '', 'SelectAction::activateAmuletEquipment() exists');

check(!preg_match('/selected_oracle_card_id/', $activate),
      'the handler no longer rejects a played oracle card');
check(!preg_match('/FROM oracle_die/', $activate),
      'the handler no longer requires a die row');
check(str_contains($activate, 'getActionColor'),
      'the handler resolves the source colour via getActionColor');
check(str_contains($activate, '$requiredColor'),
      'the handler still enforces the colour match');
check(str_contains($activate, 'bonus_action_color'),
      'the handler still rejects a bonus action');
check(str_contains($activate, 'apollo_pending_recolor'),
      'the handler still rejects while Apollo owes a colour choice');

// The colour match must be a hard failure, not a silent pass-through.
check(preg_match('/\$actionColor\s*!==\s*\$requiredColor\s*\)\s*\{\s*throw/s', $activate) === 1,
      'a mismatched colour throws');

// ---------------------------------------------------------------------------
// 3. Consistency: all three "Oracle Die"-worded abilities now agree that a
//    played card counts. Creature and Demigod already did; this is what the
//    ruling aligned the amulets with, so assert they haven't drifted apart.
// ---------------------------------------------------------------------------
$moveShipSrc = file_get_contents("$root/modules/php/States/MoveShip.php");
check(str_contains(methodBody($moveShipSrc, 'getSelectedDieColor'), 'getActionColor'),
      'Creature companion (+3 range) resolves colour via getActionColor');

$args = methodBody($actionSrc, 'getArgs');
check(str_contains($args, '$demigodColor'),
      'Demigod wild is computed from an action colour, not a die-only lookup');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
