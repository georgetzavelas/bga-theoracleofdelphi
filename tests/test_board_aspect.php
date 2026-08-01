<?php
/**
 * Game board setup option (gameoptions.json id 101): Spacious generates one
 * board, Compact generates several and keeps the smallest.
 *
 * Two properties matter more than the rest:
 *
 *  1. The SHARED op budget. Generation runs synchronously inside setupNewGame
 *     under BGA's 10s PHP limit, and DEFAULT_MAX_OPS_TOTAL was calibrated so
 *     that exhausting it still fits. Giving each candidate its own budget would
 *     multiply the ceiling by the candidate count, so a bad table would fatal
 *     the createGame request instead of just producing a plainer board.
 *
 *  2. Determinism. A recorded seed plus the candidate count must reproduce the
 *     chosen board exactly, or no game can be replayed or debugged.
 *
 * Run: php tests/test_board_aspect.php
 */

require_once(__DIR__ . '/../modules/php/BoardGenerator.php');
require_once(__DIR__ . '/../modules/php/SeededRandom.php');

$pass = 0;
$fail = 0;

function check(bool $cond, string $msg): void {
    global $pass, $fail;
    if ($cond) { $pass++; } else { echo "  FAIL: $msg\n"; $fail++; }
}

/** Identity of a board: every hex, plus every cluster anchor and rotation. */
function fingerprint(array $res): string {
    $h = [];
    foreach ($res['hexes'] as $x) {
        $h[] = $x['q'] . ',' . $x['r'] . ':' . $x['type'] . ':' . ($x['color'] ?? '-');
    }
    sort($h);
    $c = [];
    foreach ($res['clusters'] as $p) {
        $c[] = $p['cluster']['id'] . '@' . $p['anchorQ'] . ',' . $p['anchorR'] . 'r' . $p['rotation'];
    }
    sort($c);
    return md5(implode('|', $h) . '#' . implode('|', $c));
}

function one(int $seed, array $extra = []): array {
    return (new BoardGenerator(array_merge(
        ['randFn' => [new SeededRandom($seed), 'rand']], $extra)))->generate();
}
function bestOf(int $k, int $seed, array $extra = []): array {
    return BoardGenerator::generateMostCompact($k, array_merge(
        ['randFn' => [new SeededRandom($seed), 'rand']], $extra));
}
function areaOf(array $res): float {
    return BoardGenerator::boardFootprint($res['hexes'])['area'];
}

$SEEDS = [4001, 4002, 4003, 4004, 4005];

// ---- the footprint helper ------------------------------------------------
// Everything below is measured with it, so it is checked first.
$fp = BoardGenerator::boardFootprint([['q' => 0, 'r' => 0]]);
check(abs($fp['width'] - 60.0) < 0.001 && abs($fp['height'] - 69.0) < 0.001,
    sprintf('a single hex footprints as one hex box (%.1f x %.1f)', $fp['width'], $fp['height']));
check(abs($fp['area'] - 60.0 * 69.0) < 0.001, 'and its area is the product');
$empty = BoardGenerator::boardFootprint([]);
check($empty['area'] === 0.0, 'an empty board footprints as zero rather than throwing');
// Two hexes side by side are twice as wide and no taller.
$fp2 = BoardGenerator::boardFootprint([['q' => 0, 'r' => 0], ['q' => 1, 'r' => 0]]);
check(abs($fp2['width'] - 120.0) < 0.001 && abs($fp2['height'] - 69.0) < 0.001,
    'two hexes in a row double the width and not the height');

// ---- Spacious must remain exactly the base game -------------------------
// One candidate has to mean "just generate a board", identically to before the
// option existed, or every recorded seed stops meaning what it meant.
$sameAsPlain = 0;
foreach ($SEEDS as $s) {
    if (fingerprint(bestOf(1, $s)) === fingerprint(one($s))) $sameAsPlain++;
}
check($sameAsPlain === count($SEEDS),
    "one candidate is identical to a plain single generation ($sameAsPlain/"
    . count($SEEDS) . ')');

// ---- Compact must pick a genuinely different, smaller board -------------
$differs = 0; $smallerOrEqual = 0; $sumFirst = 0.0; $sumBest = 0.0;
foreach ($SEEDS as $s) {
    $first = one($s);
    $best = bestOf(BoardGenerator::COMPACT_CANDIDATES, $s);
    if (fingerprint($best) !== fingerprint($first)) $differs++;
    // The first candidate draws from the same stream, so the winner can never be
    // worse than it.
    if (areaOf($best) <= areaOf($first) + 0.001) $smallerOrEqual++;
    $sumFirst += areaOf($first);
    $sumBest += areaOf($best);
}
check($differs >= count($SEEDS) - 1,
    "compact usually lands on a different board than the first draw ($differs/"
    . count($SEEDS) . ')');
check($smallerOrEqual === count($SEEDS),
    'the chosen board is never larger than the first candidate '
    . "($smallerOrEqual/" . count($SEEDS) . ')');
$improvement = ($sumBest - $sumFirst) / $sumFirst * 100;
check($improvement < -5.0,
    sprintf('compact reduces the mean footprint materially (%.1f%%)', $improvement));

// ---- it must genuinely be the MINIMUM of what it saw --------------------
// Not merely "smaller": the winner has to be the smallest of the candidates,
// which is checked by replaying the same stream by hand.
$seed = 4321;
$k = 4;
$rng = new SeededRandom($seed);
$areas = [];
for ($i = 0; $i < $k; $i++) {
    $r = (new BoardGenerator(['randFn' => [$rng, 'rand']]))->generate();
    if (!empty($r['valid'])) $areas[] = areaOf($r);
}
$picked = bestOf($k, $seed);
check(!empty($areas) && abs(areaOf($picked) - min($areas)) < 0.001,
    sprintf('the winner is the minimum of the candidates (%.0f vs min %.0f)',
        areaOf($picked), $areas ? min($areas) : -1));

// ---- determinism ---------------------------------------------------------
// Same seed and same count must give the same board, or nothing is replayable.
$repeatable = 0;
foreach ($SEEDS as $s) {
    if (fingerprint(bestOf(8, $s)) === fingerprint(bestOf(8, $s))) $repeatable++;
}
check($repeatable === count($SEEDS), "the selection is deterministic ($repeatable/"
    . count($SEEDS) . ')');
// And the count is part of the identity: 8 candidates need not agree with 4.
$countMatters = 0;
foreach ($SEEDS as $s) {
    if (fingerprint(bestOf(8, $s)) !== fingerprint(bestOf(2, $s))) $countMatters++;
}
check($countMatters >= count($SEEDS) - 2,
    "the candidate count changes the outcome, so it must be recorded ($countMatters/"
    . count($SEEDS) . ')');

// ---- THE budget property ------------------------------------------------
// One shared budget, not one per candidate. Without this the worst-case setup
// time multiplies by the candidate count and the createGame request dies.
// Budgets deliberately smaller than 8 healthy candidates need (~26k ops), so the
// shared accounting is the ONLY thing holding the total down. A generous 150k
// budget cannot distinguish one shared budget from eight separate ones, because
// 8 candidates never approach it.
// The +8 slack is the counter's own overshoot: it increments then checks, so each
// candidate may cross its cap by one op.
$overBudget = [];
foreach ([6000, 10000, 20000] as $budget) {
    foreach ($SEEDS as $s) {
        $r = bestOf(BoardGenerator::COMPACT_CANDIDATES, $s, ['maxOpsTotal' => $budget]);
        if ($r['ops'] > $budget + 8) {
            $overBudget[] = "budget $budget seed $s spent {$r['ops']}";
        }
    }
}
check($overBudget === [],
    'the op budget is SHARED across candidates, never granted to each'
    . ($overBudget ? ' (over: ' . implode('; ', $overBudget) . ')' : ''));

// A budget too small for the full set must degrade, not fail: fewer candidates,
// still a valid board.
$tight = bestOf(BoardGenerator::COMPACT_CANDIDATES, 4444, ['maxOpsTotal' => 6000]);
check(!empty($tight['valid']),
    'a budget too small for 8 candidates still returns a valid board');
check($tight['candidates'] >= 1 && $tight['candidates'] < BoardGenerator::COMPACT_CANDIDATES,
    "it settles for fewer candidates rather than overspending ({$tight['candidates']})");
check($tight['ops'] <= 6000 + 8,
    "and it stays inside the tight budget ({$tight['ops']})");

// The reported spend must be the TOTAL, not the last candidate's, or the stat
// would understate the work and hide a creeping budget problem.
$multi = bestOf(8, 4555);
$single = one(4555);
check($multi['ops'] > $single['ops'],
    "reported ops cover every candidate ({$multi['ops']} vs {$single['ops']} for one)");
check($multi['candidates'] === 8, "all 8 candidates were considered ({$multi['candidates']})");

// ---- shape of the result ------------------------------------------------
// The winner must look exactly like a normal generate() result, since the caller
// treats them interchangeably.
foreach (['clusters', 'hexes', 'zeusPosition', 'valid', 'attempts', 'ops'] as $key) {
    check(array_key_exists($key, $multi), "the result carries '$key' like generate() does");
}
check(count($multi['hexes']) === 120, 'and it still places all 120 hexes');

// ---- both modes generate valid boards -----------------------------------
foreach ([1, BoardGenerator::COMPACT_CANDIDATES] as $k) {
    $valid = 0;
    foreach (range(4100, 4105) as $s) {
        if (!empty(bestOf($k, $s)['valid'])) $valid++;
    }
    check($valid === 6, "k=$k generates 6/6 valid boards (got $valid)");
}

// ---- the constants ------------------------------------------------------
check(BoardGenerator::ASPECT_SPACIOUS === 1.5, 'the aspect target is still 1.5');
check(BoardGenerator::COMPACT_CANDIDATES === 8, 'compact draws 8 candidates');
check(!defined('BoardGenerator::ASPECT_COMPACT')
      && !in_array('ASPECT_COMPACT', array_keys(
          (new ReflectionClass('BoardGenerator'))->getConstants()), true),
    'the abandoned 1.0 aspect preset is gone');

// ---- the lobby option and the code must agree ---------------------------
// Nothing else pins this, and the two are edited in different files: a value
// swap in gameoptions.json with the PHP constants left behind would silently
// invert which board every new table gets, with no test going red.
{
    $opts = json_decode(file_get_contents(__DIR__ . '/../gameoptions.json'), true);
    $php = file_get_contents(__DIR__ . '/../modules/php/Game.php');

    check(isset($opts['101']), 'gameoptions.json declares option 101');
    $vals = $opts['101']['values'] ?? [];
    $names = [];
    foreach ($vals as $id => $v) { $names[$v['name']] = (int)$id; }

    // Display order: Compact is listed first.
    check(array_keys($vals) === [1, 2], 'the option has exactly values 1 and 2');
    check(($vals[1]['name'] ?? '') === 'Compact', 'value 1 is Compact, so it lists first');
    check(($vals[2]['name'] ?? '') === 'Spacious', 'value 2 is Spacious');

    // The PHP constants must point at the same ids.
    preg_match('/BOARD_SETUP_COMPACT\s*=\s*(\d+)/', $php, $mC);
    preg_match('/BOARD_SETUP_SPACIOUS\s*=\s*(\d+)/', $php, $mS);
    check(!empty($mC) && !empty($mS), 'both board-setup constants are declared in Game.php');
    check(!empty($mC) && (int)$mC[1] === $names['Compact'],
        sprintf('BOARD_SETUP_COMPACT (%s) matches the Compact value id (%d)',
            $mC[1] ?? '?', $names['Compact']));
    check(!empty($mS) && (int)$mS[1] === $names['Spacious'],
        sprintf('BOARD_SETUP_SPACIOUS (%s) matches the Spacious value id (%d)',
            $mS[1] ?? '?', $names['Spacious']));

    // Compact is the default, which is the decision this option encodes.
    check(($opts['101']['default'] ?? null) === $names['Compact'],
        'Compact is the default for new tables');

    // An unreadable option must fall back to whatever the lobby advertises as the
    // default, or a table would quietly get a board the host was not shown.
    preg_match('/\$setup = self::(BOARD_SETUP_\w+);/', $php, $mF);
    check(!empty($mF), 'boardCandidateCount has a defensive fallback');
    $fallbackId = !empty($mF) ? (int)(${'m' . ($mF[1] === 'BOARD_SETUP_COMPACT' ? 'C' : 'S')}[1]) : -1;
    check($fallbackId === ($opts['101']['default'] ?? null),
        sprintf('the fallback (%s = %d) equals the advertised default (%s)',
            $mF[1] ?? '?', $fallbackId, $opts['101']['default'] ?? '?'));

    // tmdisplay advertises a NON-default choice in the table menu, so the default
    // must not carry one.
    $defaultId = (int)($opts['101']['default'] ?? 0);
    check(!isset($vals[$defaultId]['tmdisplay']),
        'the default value carries no tmdisplay, since there is nothing to advertise');
    $otherId = $defaultId === 1 ? 2 : 1;
    check(isset($vals[$otherId]['tmdisplay']),
        'and the non-default value does carry one');

    // Both descriptions should read as finished sentences.
    foreach ($vals as $id => $v) {
        check(substr(trim($v['description']), -1) === '.',
            "value $id's description ends in a full stop");
    }
}

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
