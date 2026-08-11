<?php
/**
 * Regression lint: the Bonus Action card (equipment 003) must always be
 * escapable, and cancelling must always give the 3 Favor back.
 *
 * Two reported failures, one root cause each.
 *
 * 1. SOFTLOCK. With a die already selected, activating the card ran
 *    SelectAction::activateEquipment003, which paid the 3 Favor and returned
 *    SelectAction. But the colour pick's two outcomes — actUseBonusAction and
 *    actCancelBonusAction — are declared on PlayerActions ONLY. So the picker
 *    was on screen while every chip and its Cancel button answered "this move
 *    is not authorized now": 3 Favor spent, and no way to use or abort it short
 *    of ending the turn. Fix: hand off to PlayerActions, where those actions
 *    live.
 *
 * 2. EATEN FAVOR. Activating from the hub, choosing a colour, then cancelling
 *    took SelectAction's no-die arm, which returned the bonus to the pending
 *    pool WITHOUT refunding — betting the colour picker would reopen. A player
 *    reported it not reopening: turn over, 3 Favor gone. Fix: both arms fully
 *    abort through one shared Game::refundBonusAction.
 *
 * A source lint rather than a behavioural test because Game extends
 * \Bga\GameFramework\Table and cannot be instantiated off-platform.
 *
 * Run: php tests/test_bonus_action_cancel.php
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

$gameSrc   = file_get_contents("$root/modules/php/Game.php");
$selectSrc = file_get_contents("$root/modules/php/States/SelectAction.php");
$hubSrc    = file_get_contents("$root/modules/php/States/PlayerActions.php");
$js        = file_get_contents("$root/theoracleofdelphi.js");

// ---------------------------------------------------------------------------
// 1. The softlock: the picker's actions and the state must agree.
// ---------------------------------------------------------------------------
// Establish the premise rather than assuming it: these two actions really are
// PlayerActions-only. If either is ever added to SelectAction, the routing
// below stops being load-bearing and this test should be revisited.
foreach (['actUseBonusAction', 'actCancelBonusAction'] as $action) {
    check(str_contains($hubSrc, "function $action("),
          "$action is declared on PlayerActions");
    check(!str_contains($selectSrc, "function $action("),
          "$action is NOT declared on SelectAction — which is why activation "
          . 'must hand off to the hub');
}

// The client dispatches both from the picker, so the player is guaranteed to
// try them.
check(str_contains($js, "bgaPerformAction('actUseBonusAction'"),
      'the colour chips dispatch actUseBonusAction');
check(str_contains($js, "bgaPerformAction('actCancelBonusAction'"),
      "the picker's Cancel dispatches actCancelBonusAction");

// The rule: the Bonus Action buys an EXTRA action, so it may not be taken while
// a die, oracle card or earlier bonus is already selected. Enforced at two
// layers, and BOTH matter — the args gate stops the card lighting up, the
// handler stops a stale client that clicks it anyway.

// Layer 1: SelectAction refuses card 3 rather than activating it. Activating
// there was the softlock: 3 Favor charged, then no authorized way out.
$switch = methodBody($selectSrc, 'actActivateEquipment');
check($switch !== '', 'SelectAction::actActivateEquipment() is extractable');
check(preg_match('/case 3:\s*throw new UserException/', $switch) === 1,
      'SelectAction throws on card 3 instead of activating it');
check(!str_contains($selectSrc, 'function activateEquipment003'),
      'the SelectAction activation path is gone, not just bypassed');
check(!str_contains($switch, 'activateBonusActionEquipment'),
      'SelectAction never charges the 3 Favor');
// The amulets must still work from here — they are the cards that DO need a die.
foreach ([4, 5, 6] as $amulet) {
    check(preg_match('/case ' . $amulet . ':\s*return \$this->activateAmuletEquipment/', $switch) === 1,
          "card 00$amulet (amulet) still activates from SelectAction");
}

// Layer 2: the args gate only lights card 3 up with nothing in flight.
$compute = methodBody($gameSrc, 'computeActivatableEquipment');
check($compute !== '', 'Game::computeActivatableEquipment() is extractable');
$arm = '';
if (preg_match('/case 3:(.*?)break;/s', $compute, $m)) $arm = $m[1];
check($arm !== '', 'the case 3 arm is extractable');
check(str_contains($arm, '$actionColor === null'),
      'card 3 lights up only when no die / oracle card / bonus is selected');
check(str_contains($arm, '$bonusUsed === 0') && str_contains($arm, '$favor >= 3'),
      'and still requires an unused card plus 3 Favor');

// ---------------------------------------------------------------------------
// 2. Cancel always refunds, from one shared implementation.
// ---------------------------------------------------------------------------
$refund = methodBody($gameSrc, 'refundBonusAction');
check($refund !== '', 'Game::refundBonusAction() exists');
check(preg_match('/public function refundBonusAction/', $gameSrc) === 1,
      'it is public so both states share it');
check(str_contains($refund, '+ 3'), 'it refunds 3 Favor');
check(str_contains($refund, "statInc(-3, 'favor_tokens_spent'"),
      'it backs the spend out of the stat too');
foreach (['bonus_action_color', 'pre_bonus_die_index',
          'equipment_bonus_action_used', 'equipment_bonus_action_available'] as $flag) {
    check(preg_match('/' . $flag . "['\"]\s*,\s*(null|0)\s*\)/", $refund) === 1,
          "it resets $flag");
}
// The card must become usable again, not stay burnt.
check(preg_match("/equipment_bonus_action_used['\"]\s*,\s*0\s*\)/", $refund) === 1,
      'the card is un-used, so the player can activate it again');
// It must NOT clear selected_die_index — the return-state decision reads it.
check(!str_contains($refund, 'selected_die_index'),
      'it leaves selected_die_index alone, so callers can route the player back');

// Both cancel entry points go through it, and neither hand-rolls the refund.
foreach (['SelectAction.php' => $selectSrc, 'PlayerActions.php' => $hubSrc] as $file => $src) {
    $stripped = stripComments($src);
    check(str_contains($stripped, 'refundBonusAction'),
          "$file cancels via the shared refund");
    check(!preg_match('/favor_tokens\s*=\s*\$newFavor\s*WHERE/', $stripped),
          "$file no longer writes the Favor refund by hand");
}

// The no-die arm must refund too. It is identified by the branch that does NOT
// restore a die; assert no arm re-arms the bonus instead of refunding.
$cancelBody = methodBody($selectSrc, 'actCancelDieSelection');
check($cancelBody !== '', 'SelectAction::actCancelDieSelection() is extractable');
check(!preg_match("/equipment_bonus_action_available['\"]\s*,\s*1\s*\)/", $cancelBody),
      'no cancel arm re-arms the bonus instead of refunding it — that half-state '
      . 'is what ate a player\'s 3 Favor');
check(substr_count($cancelBody, 'refundBonusAction') === 1,
      'the refund runs once, before the two arms diverge');
check(str_contains($cancelBody, 'selected_die_index'),
      'the die-selected arm still restores the die');

// ---------------------------------------------------------------------------
// 3. Cancelling before a colour is chosen returns the player where they were.
// ---------------------------------------------------------------------------
$hubCancel = methodBody($hubSrc, 'actCancelBonusAction');
check($hubCancel !== '', 'PlayerActions::actCancelBonusAction() is extractable');
check(str_contains($hubCancel, 'selected_die_index'),
      'it checks whether a die was already selected');
check(str_contains($hubCancel, 'SelectAction::class')
      && str_contains($hubCancel, 'PlayerActions::class'),
      'it routes to SelectAction when a die is still picked, else the hub — a die '
      . 'selected before activation survives, so the hub would strand it');

echo "\n$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
