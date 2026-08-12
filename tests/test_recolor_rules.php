<?php
/**
 * Tests for RecolorRules: what it costs to recolour a die or oracle card.
 *
 * Recolouring walks the six-colour oracle wheel and each step costs a Favor
 * Token, so an error here quietly over- or under-charges the player. Two ship
 * tiles bend the pricing: reverse_recolor allows the counterclockwise
 * direction (so nothing costs more than half the wheel), and recolor_discount
 * (Thrifty Wheel) knocks one Favor off.
 *
 * The Thrifty Wheel interaction is the one with teeth. A one-step recolour
 * discounted by one is FREE, so if the discount applied to every recolour a
 * player could walk the entire wheel a free step at a time and pay nothing.
 * Game::applyRecolorCost gates it to the first recolour of a source per turn
 * for exactly that reason; the last block here prices the exploit out so the
 * numbers behind that gate are on record.
 *
 * A second trap: wheelCost returns 0 both for "same colour" and for "colour I
 * do not recognise". Callers must read 0 as "not a real recolour" and reject
 * it, which applyRecolorCost does by throwing. Read as "free" instead, an
 * unrecognised colour would be a free recolour to anywhere.
 *
 * Run: php tests/test_recolor_rules.php
 */

require_once __DIR__ . '/../modules/php/RecolorRules.php';

use Bga\Games\theoracleofdelphi\RecolorRules;
use Bga\Games\theoracleofdelphi\MaterialDefs;

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}

const CW_ONLY = false;   // no reverse_recolor ship tile
const BOTH = true;       // reverse_recolor: either direction

$wheel = RecolorRules::wheel();
$n = count($wheel);

// ---- the wheel itself --------------------------------------------------------
check($wheel === MaterialDefs::ORACLE_WHEEL_ORDER, 'the wheel is the one MaterialDefs defines');
check($n === 6, 'the wheel has six colours, got ' . $n);
check(count(array_unique($wheel)) === $n, 'no colour appears on the wheel twice');
check(RecolorRules::wheelSize() === 6, 'wheelSize reports six');

// ---- a same-colour or unknown target is not a recolour -----------------------
foreach ($wheel as $color) {
    check(RecolorRules::wheelCost($color, $color) === 0, "$color to itself is not a recolour");
}
// Unknown colours must price as 0 against EVERY colour on the wheel, not just
// against red. array_search returns false, which is 0 in arithmetic, so a
// missing colour silently reads as wheel index 0 — and index 0 is red. Testing
// only against red therefore proves nothing: it agrees with the bug. Drop the
// guard in wheelCost and chartreuse->black prices as 1, chartreuse->pink as 2.
$unknownPriced = [];
foreach ($wheel as $color) {
    if (RecolorRules::wheelCost('chartreuse', $color) !== 0) {
        $unknownPriced[] = "chartreuse->$color = " . RecolorRules::wheelCost('chartreuse', $color);
    }
    if (RecolorRules::wheelCost($color, 'chartreuse') !== 0) {
        $unknownPriced[] = "$color->chartreuse = " . RecolorRules::wheelCost($color, 'chartreuse');
    }
}
check($unknownPriced === [],
    'an unknown colour prices as 0 against every wheel colour, not just red ('
    . implode(', ', $unknownPriced) . ')');
check(RecolorRules::wheelCost('chartreuse', 'black') === 0,
    'specifically: an unknown source does not price as if it were red');
check(RecolorRules::wheelCost('black', 'chartreuse') === 0,
    'and neither does an unknown target');
check(RecolorRules::wheelCost('', '') === 0, 'empty colours return 0');
check(RecolorRules::wheelCost('', 'pink') === 0, 'and an empty source against a real colour');

// And 0 must be read as invalid, never as free.
check(!RecolorRules::isValidTarget(0), 'a cost of 0 is not a valid recolour target');
check(RecolorRules::isValidTarget(1), 'a one-step recolour is valid');
check(!RecolorRules::isValidTarget(RecolorRules::wheelCost('red', 'chartreuse')),
    'so an unrecognised colour cannot be recoloured for free');

// ---- clockwise pricing -------------------------------------------------------
// The wheel is red, black, pink, blue, yellow, green.
check(RecolorRules::wheelCost('red', 'black', CW_ONLY) === 1, 'one step clockwise costs 1');
check(RecolorRules::wheelCost('red', 'pink', CW_ONLY) === 2, 'two steps cost 2');
check(RecolorRules::wheelCost('red', 'green', CW_ONLY) === 5,
    'the colour just counterclockwise of red costs the long way round: 5');
check(RecolorRules::wheelCost('green', 'red', CW_ONLY) === 1,
    'and going the other way is a single cheap step');

// Every adjacent clockwise pair is one step, all the way round including the wrap.
$adjacent = [];
for ($i = 0; $i < $n; $i++) {
    $from = $wheel[$i];
    $to = $wheel[($i + 1) % $n];
    if (RecolorRules::wheelCost($from, $to, CW_ONLY) !== 1) { $adjacent[] = "$from->$to"; }
}
check($adjacent === [], 'each clockwise neighbour is one step, wrap included (' . implode(' ', $adjacent) . ')');

// Clockwise costs run 1..5 and never reach 6 (that would be a full lap).
$cwCosts = [];
foreach ($wheel as $from) {
    foreach ($wheel as $to) {
        if ($from === $to) continue;
        $cwCosts[] = RecolorRules::wheelCost($from, $to, CW_ONLY);
    }
}
check(min($cwCosts) === 1 && max($cwCosts) === 5,
    'clockwise costs span 1 to 5, got ' . min($cwCosts) . ' to ' . max($cwCosts));

// The two directions between any pair always add up to one full lap.
$lap = [];
foreach ($wheel as $from) {
    foreach ($wheel as $to) {
        if ($from === $to) continue;
        $there = RecolorRules::wheelCost($from, $to, CW_ONLY);
        $back = RecolorRules::wheelCost($to, $from, CW_ONLY);
        if ($there + $back !== $n) { $lap[] = "$from/$to"; }
    }
}
check($lap === [], 'a clockwise round trip always costs exactly one lap (' . implode(' ', $lap) . ')');

// ---- the reverse_recolor ship tile ------------------------------------------
check(RecolorRules::wheelCost('red', 'green', BOTH) === 1,
    'going counterclockwise makes the 5-step recolour a 1-step one');
check(RecolorRules::wheelCost('red', 'blue', BOTH) === 3,
    'the colour opposite red costs 3 either way round');

// It is always the cheaper of the two one-way costs, and never more than half.
$bothWrong = [];
$bothCosts = [];
foreach ($wheel as $from) {
    foreach ($wheel as $to) {
        if ($from === $to) continue;
        $best = RecolorRules::wheelCost($from, $to, BOTH);
        $cw = RecolorRules::wheelCost($from, $to, CW_ONLY);
        $ccw = RecolorRules::wheelCost($to, $from, CW_ONLY);
        if ($best !== min($cw, $ccw)) { $bothWrong[] = "$from/$to"; }
        $bothCosts[] = $best;
    }
}
check($bothWrong === [], 'both-directions always picks the cheaper way round (' . implode(' ', $bothWrong) . ')');
check(max($bothCosts) === (int)($n / 2),
    'and nothing costs more than half the wheel, got ' . max($bothCosts));

// With the tile the price is symmetric; without it, it usually is not.
$asymmetric = 0;
foreach ($wheel as $from) {
    foreach ($wheel as $to) {
        if ($from === $to) continue;
        if (RecolorRules::wheelCost($from, $to, BOTH) !== RecolorRules::wheelCost($to, $from, BOTH)) {
            $asymmetric++;
        }
    }
}
check($asymmetric === 0, 'both-directions pricing is symmetric (' . $asymmetric . ' asymmetric pairs)');
check(RecolorRules::wheelCost('red', 'green', CW_ONLY) !== RecolorRules::wheelCost('green', 'red', CW_ONLY),
    'clockwise-only pricing is not symmetric, which is the point of the tile');

// The tile never makes a recolour dearer.
$dearer = [];
foreach ($wheel as $from) {
    foreach ($wheel as $to) {
        if ($from === $to) continue;
        if (RecolorRules::wheelCost($from, $to, BOTH) > RecolorRules::wheelCost($from, $to, CW_ONLY)) {
            $dearer[] = "$from/$to";
        }
    }
}
check($dearer === [], 'reverse_recolor never costs more than going clockwise (' . implode(' ', $dearer) . ')');

// ---- the Thrifty Wheel discount ---------------------------------------------
check(RecolorRules::discountedCost(3, true) === 2, 'the discount takes one Favor off');
check(RecolorRules::discountedCost(3, false) === 3, 'and does nothing without the tile');
check(RecolorRules::discountedCost(1, true) === 0, 'a one-step recolour becomes free');
check(RecolorRules::discountedCost(0, true) === 0, 'and the cost never goes negative');

$negative = [];
for ($base = 0; $base <= 6; $base++) {
    if (RecolorRules::discountedCost($base, true) < 0) { $negative[] = $base; }
    if (RecolorRules::discountedCost($base, true) > $base) { $negative[] = "raised:$base"; }
}
check($negative === [], 'the discount never goes below zero or raises a cost');

// ---- why the discount is gated to one recolour per turn ----------------------
// Walking red all the way to green the long way costs 5, or 4 with a single
// discount. Taken as five separate one-step recolours, each discounted, the
// whole trip is free — so an ungated discount makes the wheel cost nothing.
$multiStep = RecolorRules::wheelCost('red', 'green', CW_ONLY);
$multiStepDiscounted = RecolorRules::discountedCost($multiStep, true);
$stepwiseUngated = 0;
for ($i = 0; $i < $n - 1; $i++) {
    $stepwiseUngated += RecolorRules::discountedCost(
        RecolorRules::wheelCost($wheel[$i], $wheel[$i + 1], CW_ONLY), true);
}
check($multiStep === 5, 'red to green the long way is 5 Favor');
check($multiStepDiscounted === 4, 'a single discount makes it 4');
check($stepwiseUngated === 0,
    'but five separately-discounted single steps would cost nothing ('
    . $stepwiseUngated . ') — which is why applyRecolorCost gates the discount '
    . 'to the first recolour of a source per turn');

// Gated correctly, incremental recolouring costs the same as doing it at once:
// one discounted step, then full price for the rest.
$stepwiseGated = RecolorRules::discountedCost(
    RecolorRules::wheelCost($wheel[0], $wheel[1], CW_ONLY), true);
for ($i = 1; $i < $n - 1; $i++) {
    $stepwiseGated += RecolorRules::wheelCost($wheel[$i], $wheel[$i + 1], CW_ONLY);
}
check($stepwiseGated === $multiStepDiscounted,
    'with the gate, stepping round costs the same as one multi-step recolour ('
    . $stepwiseGated . ' vs ' . $multiStepDiscounted . ')');

echo "$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
