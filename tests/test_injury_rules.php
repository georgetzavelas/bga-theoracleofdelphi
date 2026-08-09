<?php
/**
 * Tests for InjuryRules: what a player's injury hand does to their turn.
 *
 * At the start of a turn the hand decides everything: too many injuries and
 * the turn is spent recovering (discard 3, no actions at all), none at all
 * and the player takes the no-injury bonus, anything between and the turn
 * proceeds normally. Getting the boundary wrong either steals a turn from
 * someone who should have had one, or lets a player keep acting through a
 * hand the rules say should have stopped them.
 *
 * "Too many" is TWO rules, and the thing worth pinning is that both of them
 * bite. Three of one colour forces recovery; so does six in total. Neither
 * implies the other — a hand of 2+2+2 hits six without ever reaching three
 * of a colour, and 3+0+0 hits the colour rule at half the total. Drop either
 * check and a whole class of hands stops triggering recovery, which is
 * invisible: the player just gets turns they should not have had.
 *
 * Equipment 015 (Pain Tolerance) raises both bars together, to four and
 * eight. It does NOT change the price of recovery — that is three cards
 * either way.
 *
 * Run: php tests/test_injury_rules.php
 */

require_once __DIR__ . '/../modules/php/InjuryRules.php';

use Bga\Games\theoracleofdelphi\InjuryRules;

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

const BASE = false;   // no Pain Tolerance
const TOUGH = true;   // Equipment 015

/** A hand written as a plain list of per-colour counts. */
function hand(int ...$counts): array { return $counts; }

// ---- the thresholds themselves ------------------------------------------------
check(InjuryRules::sameColorThreshold(BASE) === 3, 'three of a colour forces recovery');
check(InjuryRules::totalThreshold(BASE) === 6, 'six in total forces recovery');
check(InjuryRules::sameColorThreshold(TOUGH) === 4, 'Pain Tolerance raises the colour bar to four');
check(InjuryRules::totalThreshold(TOUGH) === 8, 'Pain Tolerance raises the total bar to eight');
check(InjuryRules::RECOVERY_DISCARD_COUNT === 3, 'recovery always discards three cards');

// ---- counting ----------------------------------------------------------------
check(InjuryRules::totalInjuries([]) === 0, 'an empty hand is zero injuries');
check(InjuryRules::totalInjuries(hand(2, 2, 1)) === 5, 'counts add up across colours');
// CheckInjuries passes a map keyed by colour index; the keys must not matter.
check(InjuryRules::totalInjuries([0 => 2, 5 => 3]) === 5, 'colour keys are ignored, only counts matter');
check(InjuryRules::mustRecover([0 => 3], BASE) === InjuryRules::mustRecover(hand(3), BASE),
    'a keyed map and a plain list read the same');

// ---- the same-colour rule ----------------------------------------------------
check(!InjuryRules::hasSameColorThreshold(hand(2, 2, 2), BASE), 'two of each colour is under the bar');
check(InjuryRules::hasSameColorThreshold(hand(3), BASE), 'three of one colour reaches it');
check(InjuryRules::hasSameColorThreshold(hand(1, 1, 4), BASE), 'and any colour counts, not just the first');
check(!InjuryRules::hasSameColorThreshold(hand(3, 3), TOUGH), 'Pain Tolerance shrugs off three of a colour');
check(InjuryRules::hasSameColorThreshold(hand(3, 4), TOUGH), 'but not four');

// ---- both rules are load-bearing ---------------------------------------------
// Six spread thin: the total rule fires where the colour rule cannot.
check(!InjuryRules::hasSameColorThreshold(hand(2, 2, 2), BASE)
    && InjuryRules::mustRecover(hand(2, 2, 2), BASE),
    '2+2+2 forces recovery on the TOTAL rule alone (drop it and this hand plays on)');
// Three of a colour at half the total: the colour rule fires where total cannot.
check(InjuryRules::totalInjuries(hand(3)) < InjuryRules::totalThreshold(BASE)
    && InjuryRules::mustRecover(hand(3), BASE),
    '3 of one colour forces recovery on the COLOUR rule alone (drop it and this hand plays on)');
// Same pair of arguments once Pain Tolerance is in play.
check(!InjuryRules::hasSameColorThreshold(hand(3, 3, 2), TOUGH)
    && InjuryRules::mustRecover(hand(3, 3, 2), TOUGH),
    'with Pain Tolerance, 3+3+2 still trips the total rule at eight');
check(InjuryRules::totalInjuries(hand(4)) < InjuryRules::totalThreshold(TOUGH)
    && InjuryRules::mustRecover(hand(4), TOUGH),
    'and four of a colour still trips the colour rule below eight');

// ---- the boundaries ----------------------------------------------------------
check(!InjuryRules::mustRecover(hand(2), BASE), 'two of a colour is fine');
check(InjuryRules::mustRecover(hand(3), BASE), 'three is not — the bar is >=, not >');
check(!InjuryRules::mustRecover(hand(2, 2, 1), BASE), 'five in total is fine');
check(InjuryRules::mustRecover(hand(2, 2, 2), BASE), 'six is not');
check(!InjuryRules::mustRecover(hand(3, 3, 1), TOUGH), 'with Pain Tolerance, seven spread thin is fine');
check(InjuryRules::mustRecover(hand(3, 3, 2), TOUGH), 'eight is not');

// The largest hand a player can hold and still take a normal turn. There are
// six injury colours, so the binding constraint is the total, not the spread.
$maxSafe = InjuryRules::totalThreshold(BASE) - 1;
check($maxSafe === 5, 'the most injuries you can hold and still act is five');
check(!InjuryRules::mustRecover(hand(2, 2, 1), BASE) && InjuryRules::totalInjuries(hand(2, 2, 1)) === $maxSafe,
    'and a legal five-card hand exists (2+2+1)');
$maxSafeTough = InjuryRules::totalThreshold(TOUGH) - 1;
check($maxSafeTough === 7 && !InjuryRules::mustRecover(hand(3, 3, 1), TOUGH),
    'Pain Tolerance stretches that to seven (3+3+1)');

// Pain Tolerance never makes a hand WORSE. Exhaustive over every hand of up
// to 3 colours with up to 9 of each.
$regressions = [];
for ($a = 0; $a <= 9; $a++) {
    for ($b = 0; $b <= 9; $b++) {
        for ($c = 0; $c <= 9; $c++) {
            $h = hand($a, $b, $c);
            if (!InjuryRules::mustRecover($h, BASE) && InjuryRules::mustRecover($h, TOUGH)) {
                $regressions[] = "$a/$b/$c";
            }
        }
    }
}
check($regressions === [],
    'Pain Tolerance never forces a recovery that would not have happened anyway ('
    . count($regressions) . ' cases: ' . implode(' ', array_slice($regressions, 0, 3)) . ')');

// ---- what the turn resolves to -----------------------------------------------
check(InjuryRules::nextPhase([], BASE) === InjuryRules::PHASE_NO_INJURY_BONUS,
    'an empty hand takes the no-injury bonus');
check(InjuryRules::nextPhase(hand(0, 0), BASE) === InjuryRules::PHASE_NO_INJURY_BONUS,
    'and so does a hand of explicit zeroes');
check(InjuryRules::nextPhase(hand(1), BASE) === InjuryRules::PHASE_ACTIONS,
    'a single injury is just an ordinary turn');
check(InjuryRules::nextPhase(hand(2, 2, 1), BASE) === InjuryRules::PHASE_ACTIONS,
    'so is the largest safe hand');
check(InjuryRules::nextPhase(hand(3), BASE) === InjuryRules::PHASE_RECOVER,
    'the colour rule sends the turn to recovery');
check(InjuryRules::nextPhase(hand(2, 2, 2), BASE) === InjuryRules::PHASE_RECOVER,
    'and so does the total rule');
check(InjuryRules::nextPhase(hand(3), TOUGH) === InjuryRules::PHASE_ACTIONS,
    'the same hand is an ordinary turn with Pain Tolerance');

// Exactly one phase per hand, and recovery always wins over the bonus --
// which only matters if a threshold could ever be 0, but pins the ordering.
$phases = [];
for ($a = 0; $a <= 8; $a++) {
    for ($b = 0; $b <= 8; $b++) {
        foreach ([BASE, TOUGH] as $pt) {
            $h = hand($a, $b);
            $phase = InjuryRules::nextPhase($h, $pt);
            $expected = InjuryRules::mustRecover($h, $pt) ? InjuryRules::PHASE_RECOVER
                : (InjuryRules::totalInjuries($h) === 0 ? InjuryRules::PHASE_NO_INJURY_BONUS
                    : InjuryRules::PHASE_ACTIONS);
            if ($phase !== $expected) { $phases[] = "$a/$b pt=" . var_export($pt, true); }
        }
    }
}
check($phases === [], 'every hand resolves to exactly one phase (' . count($phases) . ' wrong)');

// ---- the recovery discard ----------------------------------------------------
check(InjuryRules::isValidRecoveryDiscard([1, 2, 3]), 'exactly three cards is a valid discard');
check(!InjuryRules::isValidRecoveryDiscard([1, 2]), 'two is not');
check(!InjuryRules::isValidRecoveryDiscard([1, 2, 3, 4]), 'four is not');
check(!InjuryRules::isValidRecoveryDiscard([]), 'nor is nothing');
check(!InjuryRules::isValidRecoveryDiscard(null), 'malformed JSON decodes to null and is rejected');
check(!InjuryRules::isValidRecoveryDiscard('123'), 'a bare string is rejected');
check(!InjuryRules::isValidRecoveryDiscard(3), 'so is a bare number');

// The price of recovery does not move with Pain Tolerance.
check(InjuryRules::isValidRecoveryDiscard([1, 2, 3]),
    'Pain Tolerance raises the bar for ENTERING recovery, not the three cards it costs');

echo "$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
