<?php
/**
 * Tests for CombatRules: monster combat.
 *
 * A combat round is short but the pieces interact: strength opens at
 * 9 - shield, the battle die is a d10 numbered 0-9, roll >= strength wins,
 * a losing roll of 0 also draws an injury, and paying 1 Favor shaves a point
 * off strength before the next roll.
 *
 * The interaction worth pinning is the ORDER of the two checks in
 * CombatResult. Favor payments can grind strength all the way to 0, and at
 * strength 0 a rolled 0 meets the target and wins. If the injury check ran
 * first -- or if it only asked "was the roll 0?" -- that player would be
 * handed an injury for the roll that killed the monster. It is a plausible
 * mistake because the rule reads as "rolling 0 hurts you", and it is
 * reachable in real play: shield 5 opens at strength 4, and four Favor take
 * it to 0.
 *
 * Run: php tests/test_combat_rules.php
 */

require_once __DIR__ . '/../modules/php/CombatRules.php';

use Bga\Games\theoracleofdelphi\CombatRules;

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

/** Every face of the battle die. */
function faces(): array {
    return range(CombatRules::DIE_MIN, CombatRules::DIE_MAX);
}

// ---- opening strength --------------------------------------------------------
check(CombatRules::startingStrength(0) === 9, 'no shield opens at strength 9');
check(CombatRules::startingStrength(2) === 7, 'the shield_start ship tile (+2) opens at 7');
check(CombatRules::startingStrength(5) === 4, 'the shield cap of 5 opens at 4');
check(CombatRules::startingStrength(9) === 0, 'nine shields would open at 0');
check(CombatRules::startingStrength(20) === 0, 'strength never goes negative, however many shields');

// Each shield is worth exactly one point of strength across the real range.
$monotone = true;
for ($shield = 0; $shield < 9; $shield++) {
    if (CombatRules::startingStrength($shield) - CombatRules::startingStrength($shield + 1) !== 1) {
        $monotone = false;
    }
}
check($monotone, 'every shield below the clamp is worth exactly 1 strength');

// ---- winning the round -------------------------------------------------------
check(CombatRules::isVictory(9, 9), 'an unshielded player wins on a 9');
check(!CombatRules::isVictory(8, 9), 'an unshielded player loses on an 8');
check(CombatRules::isVictory(4, 4), 'meeting the strength exactly is a win');
check(CombatRules::isVictory(7, 4), 'beating it is a win');

// The odds actually on offer: 10 - strength faces out of 10.
$oddsWrong = [];
for ($strength = 0; $strength <= 9; $strength++) {
    $winners = array_values(array_filter(faces(),
        fn($roll) => CombatRules::isVictory($roll, $strength)));
    if ($winners !== CombatRules::winningRolls($strength)) {
        $oddsWrong[] = "strength $strength: enumerated winners disagree";
    }
    if (count($winners) !== 10 - $strength) {
        $oddsWrong[] = "strength $strength: " . count($winners) . " winning faces, expected " . (10 - $strength);
    }
}
check($oddsWrong === [],
    'every strength offers exactly 10 - strength winning faces (' . implode('; ', $oddsWrong) . ')');

check(CombatRules::winningRolls(9) === [9], 'strength 9 is won only by the single best roll');
check(CombatRules::winningRolls(0) === faces(), 'strength 0 is won by every face, including 0');

// ---- the injury rule, and the ordering it depends on -------------------------
check(CombatRules::drawsInjury(0, 9), 'a rolled 0 that loses draws an injury');
check(CombatRules::drawsInjury(0, 1), 'a 0 against strength 1 still loses, so still injures');
check(!CombatRules::drawsInjury(3, 9), 'a losing roll that is not 0 draws nothing');
check(!CombatRules::drawsInjury(9, 9), 'a winning roll draws nothing');

// The case the ordering exists for.
check(CombatRules::isVictory(0, 0), 'at strength 0 a rolled 0 WINS');
check(!CombatRules::drawsInjury(0, 0),
    'and must NOT also be injured for the roll that won the fight');
check(CombatRules::outcome(0, 0) === CombatRules::OUTCOME_VICTORY,
    'so the round resolves as a plain victory');

// Exactly one outcome per (roll, strength), and injury only ever on a 0.
$badOutcome = [];
for ($strength = 0; $strength <= 9; $strength++) {
    foreach (faces() as $roll) {
        $outcome = CombatRules::outcome($roll, $strength);
        $expected = $roll >= $strength
            ? CombatRules::OUTCOME_VICTORY
            : ($roll === 0 ? CombatRules::OUTCOME_INJURY : CombatRules::OUTCOME_DEFEAT);
        if ($outcome !== $expected) {
            $badOutcome[] = "roll $roll vs strength $strength: $outcome";
        }
        if ($outcome === CombatRules::OUTCOME_INJURY && $roll !== 0) {
            $badOutcome[] = "roll $roll vs strength $strength injured on a non-zero roll";
        }
    }
}
check($badOutcome === [],
    'every roll/strength pair resolves to one correct outcome ('
    . count($badOutcome) . ' wrong: ' . implode('; ', array_slice($badOutcome, 0, 3)) . ')');

// ---- paying favor ------------------------------------------------------------
check(CombatRules::canPayFavor(1), '1 favor is enough to continue');
check(CombatRules::canPayFavor(7), 'more than enough is enough');
check(!CombatRules::canPayFavor(0), 'no favor means the only option is surrender');
check(!CombatRules::canPayFavor(-1), 'a negative balance cannot buy a round');

check(CombatRules::afterPayingFavor(9) === 8, 'a favor takes strength 9 to 8');
check(CombatRules::afterPayingFavor(1) === 0, 'a favor takes strength 1 to 0');
check(CombatRules::afterPayingFavor(0) === 0, 'strength never drops below 0');

// The full grind a shield-5 player can buy: 4 favor takes strength 4 to 0,
// and every step improves the odds by exactly one face.
$strength = CombatRules::startingStrength(5);
$steps = [];
for ($paid = 0; $paid < 4; $paid++) {
    $before = count(CombatRules::winningRolls($strength));
    $strength = CombatRules::afterPayingFavor($strength);
    $steps[] = count(CombatRules::winningRolls($strength)) - $before;
}
check($strength === 0, 'four favor takes a shield-5 player from strength 4 to 0');
check($steps === [1, 1, 1, 1], 'each favor buys exactly one more winning face');
check(CombatRules::outcome(0, $strength) === CombatRules::OUTCOME_VICTORY,
    'having ground strength to 0, even a rolled 0 now wins outright');

echo "$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
