<?php
/**
 * Tests for GodAdvancement: the God Track.
 *
 * The track runs 1..6, with 0 meaning "off track". Two things about it are
 * easy to get wrong, and both are silent when they go wrong — a god quietly
 * sits one step lower than it should, or an Oracle Consultation offers a
 * choice it shouldn't.
 *
 *   1. Stepping onto the track is NOT "0 becomes 1". A god's first
 *      advancement jumps to a step set by the player count (2p => 3, 3p => 2,
 *      4p => 1), so a smaller game starts its gods further along. Only
 *      advancements from 1 upward are a plain +1.
 *
 *   2. There are two eligibility rules and they differ ON PURPOSE. A general
 *      advancement (a reward, the no-injury bonus) can start a god from 0 and
 *      so only asks "below the top?". An Oracle Consultation advances a god
 *      but never starts one, so it demands 0 < step < 6. Collapsing the two
 *      into one rule would change what a consultation offers, in one
 *      direction or the other, without anything looking broken.
 *
 * The last block pins a dependency rather than a rule:
 * CheckGodAdvancement::actAdvanceGod writes `$currentStep + 1` directly
 * instead of going through nextStep(), which is correct only because the
 * eligibility filter has already excluded 0 and 6.
 *
 * Run: php tests/test_god_advancement.php
 */

require_once __DIR__ . '/../modules/php/GodAdvancement.php';

use Bga\Games\theoracleofdelphi\GodAdvancement;
use Bga\Games\theoracleofdelphi\MaterialDefs;

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}
function sameList(array $got, array $want, string $m): void {
    check($got === $want, $m . "\n     got:  " . json_encode($got)
        . "\n     want: " . json_encode($want));
}

// ---- stepping onto the track -------------------------------------------------
check(GodAdvancement::startingStep(2) === 3, 'a 2-player game starts its gods at step 3');
check(GodAdvancement::startingStep(3) === 2, 'a 3-player game starts at 2');
check(GodAdvancement::startingStep(4) === 1, 'a 4-player game starts at 1');
check(GodAdvancement::startingStep(1) === GodAdvancement::DEFAULT_START_STEP,
    'an unlisted player count falls back to the default start');
check(GodAdvancement::startingStep(5) === GodAdvancement::DEFAULT_START_STEP,
    'and so does a count above the table');

// The whole point of the table: fewer players start further up.
check(GodAdvancement::startingStep(2) > GodAdvancement::startingStep(3)
    && GodAdvancement::startingStep(3) > GodAdvancement::startingStep(4),
    'fewer players means a higher starting step');

// A god's first advancement jumps, it does not simply become 1.
check(GodAdvancement::nextStep(0, 2) === 3, 'first advancement in a 2p game lands on 3, not 1');
check(GodAdvancement::nextStep(0, 3) === 2, 'first advancement in a 3p game lands on 2');
check(GodAdvancement::nextStep(0, 4) === 1, 'first advancement in a 4p game lands on 1');

// ---- advancing along the track ----------------------------------------------
$plusOne = [];
for ($step = 1; $step < GodAdvancement::MAX_STEP; $step++) {
    foreach ([2, 3, 4] as $playerCount) {
        if (GodAdvancement::nextStep($step, $playerCount) !== $step + 1) {
            $plusOne[] = "step $step at {$playerCount}p";
        }
    }
}
check($plusOne === [],
    'once on the track every advancement is +1, whatever the player count ('
    . implode(', ', $plusOne) . ')');

check(GodAdvancement::nextStep(6, 2) === 6, 'a god at the top stays at the top');
check(GodAdvancement::nextStep(7, 2) === 7, 'a step above the top is left alone, not reset');

// ---- the two predicates ------------------------------------------------------
check(!GodAdvancement::isOnTrack(0), 'step 0 is off the track');
check(GodAdvancement::isOnTrack(1), 'step 1 is on it');
check(GodAdvancement::isOnTrack(6), 'so is the top step');

check(GodAdvancement::canAdvance(0), 'a god off the track can still be advanced (it starts it)');
check(GodAdvancement::canAdvance(5), 'a god below the top can be advanced');
check(!GodAdvancement::canAdvance(6), 'a god at the top cannot');

check(!GodAdvancement::isOracleConsultEligible(0),
    'an Oracle Consultation cannot START a god from off the track');
check(GodAdvancement::isOracleConsultEligible(1), 'it can advance one already on the track');
check(GodAdvancement::isOracleConsultEligible(5), 'right up to one below the top');
check(!GodAdvancement::isOracleConsultEligible(6), 'but not one already at the top');

// The deliberate divergence, stated outright so nobody "fixes" it.
check(GodAdvancement::canAdvance(0) && !GodAdvancement::isOracleConsultEligible(0),
    'the two rules differ at step 0 ON PURPOSE, and only at step 0');
$divergences = [];
for ($step = 1; $step <= 7; $step++) {
    if (GodAdvancement::canAdvance($step) !== GodAdvancement::isOracleConsultEligible($step)) {
        $divergences[] = $step;
    }
}
sameList($divergences, [], 'above step 0 the two eligibility rules agree exactly');

// ---- steps to the top --------------------------------------------------------
check(GodAdvancement::stepsNeededToTop(0) === 6, 'a god off the track is 6 steps from the top');
check(GodAdvancement::stepsNeededToTop(4) === 2, 'step 4 is 2 away');
check(GodAdvancement::stepsNeededToTop(6) === 0, 'the top is 0 away');
check(GodAdvancement::stepsNeededToTop(9) === 0, 'and never reports a negative distance');

// ---- which gods an Oracle Consultation offers --------------------------------
// Colours come from MaterialDefs::GODS: aphrodite red, apollo yellow,
// ares black, artemis green, hermes pink, poseidon blue.
$allOnTrack = ['aphrodite' => 3, 'apollo' => 3, 'ares' => 3,
               'artemis' => 3, 'hermes' => 3, 'poseidon' => 3];

sameList(GodAdvancement::eligibleGodsForOracleConsult(['red'], $allOnTrack),
    [['god_name' => 'aphrodite', 'color' => 'red', 'current_step' => 3]],
    'a red die offers the red god');

sameList(GodAdvancement::eligibleGodsForOracleConsult([], $allOnTrack), [],
    'no dice, no offer');
sameList(GodAdvancement::eligibleGodsForOracleConsult(['purple'], $allOnTrack), [],
    'a colour with no god offers nothing');

// Every god is reachable by its own colour, and only by its own colour.
$colourWrong = [];
foreach (MaterialDefs::GODS as $godName => $god) {
    $offered = GodAdvancement::eligibleGodsForOracleConsult([$god['color']], $allOnTrack);
    if (count($offered) !== 1 || $offered[0]['god_name'] !== $godName) {
        $colourWrong[] = $godName;
    }
}
check($colourWrong === [],
    'each die colour offers exactly its own god (' . implode(', ', $colourWrong) . ')');

// Order follows the dice, then the god table.
sameList(array_column(
    GodAdvancement::eligibleGodsForOracleConsult(['blue', 'red'], $allOnTrack), 'god_name'),
    ['poseidon', 'aphrodite'], 'gods are offered in die-colour order');
sameList(array_column(
    GodAdvancement::eligibleGodsForOracleConsult(['red', 'blue'], $allOnTrack), 'god_name'),
    ['aphrodite', 'poseidon'], 'reversing the dice reverses the offer');

// Duplicate dice do not offer the same god twice.
sameList(array_column(
    GodAdvancement::eligibleGodsForOracleConsult(['red', 'red', 'red'], $allOnTrack), 'god_name'),
    ['aphrodite'], 'three red dice still offer the red god once');

// Steps 0 and 6 are filtered out, and a god with no row counts as 0.
$mixed = ['aphrodite' => 0, 'apollo' => 6, 'ares' => 1, 'artemis' => 5];
sameList(array_column(GodAdvancement::eligibleGodsForOracleConsult(
    ['red', 'yellow', 'black', 'green', 'pink'], $mixed), 'god_name'),
    ['ares', 'artemis'],
    'gods off the track, at the top, or with no row at all are not offered');

check(GodAdvancement::eligibleGodsForOracleConsult(['pink'], $mixed) === [],
    'a god missing from the step map is treated as off the track');

// The reported step is the CURRENT one, not the one it would move to.
$offered = GodAdvancement::eligibleGodsForOracleConsult(['green'], ['artemis' => 5]);
check($offered[0]['current_step'] === 5, 'the offer reports where the god is now');

// ---- the dependency CheckGodAdvancement leans on -----------------------------
// actAdvanceGod writes $currentStep + 1 straight to the DB rather than going
// through nextStep(). That is correct only while eligibility has already
// ruled out 0 (which would need the player-count jump) and 6 (which would
// need the clamp). If the filter is ever loosened, that raw +1 becomes wrong.
$unsafe = [];
for ($step = 0; $step <= 7; $step++) {
    if (!GodAdvancement::isOracleConsultEligible($step)) continue;
    foreach ([2, 3, 4] as $playerCount) {
        if (GodAdvancement::nextStep($step, $playerCount) !== $step + 1) {
            $unsafe[] = "step $step at {$playerCount}p";
        }
    }
}
check($unsafe === [],
    'for every Oracle-Consultation-eligible step, a raw +1 matches nextStep ('
    . implode(', ', $unsafe) . ')');
check(GodAdvancement::nextStep(0, 2) !== 0 + 1,
    'CHARACTERISATION: at step 0 a raw +1 would be wrong (2p should jump to 3)');
check(GodAdvancement::nextStep(6, 2) !== 6 + 1,
    'CHARACTERISATION: at step 6 a raw +1 would overshoot the top');

echo "$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
