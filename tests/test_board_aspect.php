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

// ---- the choice is withdrawn, but the code behind it is kept ------------
// The option was removed from the lobby and every table now gets Compact. Both
// modes stay in the code so the choice can be restored, which is exactly the
// arrangement that rots quietly: nothing at runtime would report that the
// disabled branch had drifted.
{
    $opts = json_decode(file_get_contents(__DIR__ . '/../gameoptions.json'), true);
    $php = file_get_contents(__DIR__ . '/../modules/php/Game.php');

    check(!isset($opts['101']),
        'option 101 is gone from gameoptions.json, so players cannot choose');
    check(is_array($opts) && count($opts) > 0,
        'the other game options survived the removal');

    // The gate, and the direction it points.
    preg_match('/BOARD_SETUP_OPTION_ENABLED\s*=\s*(true|false)/', $php, $mE);
    check(!empty($mE), 'the board-setup option has an explicit enable flag');
    check(!empty($mE) && $mE[1] === 'false',
        'and it is off, matching the option being absent from the lobby');

    // Whichever way the flag points, the disabled path must yield Compact. This
    // is the one that would silently invert: tableOptions->get() on an
    // undeclared option need not throw, and a null casts to 0, matching neither
    // constant and falling through to the single-board Spacious branch.
    // Exact source match rather than a regex: inside a single-quoted PHP
    // pattern a backslash is an escape, so \B silently becomes a word boundary
    // and the check would pass against anything.
    $phpLf = str_replace("\r\n", "\n", $php);
    check(strpos($phpLf, "if (!self::BOARD_SETUP_OPTION_ENABLED) {\n"
        . "            return \\BoardGenerator::COMPACT_CANDIDATES;") !== false,
        'with the option off it returns the COMPACT candidate count directly, '
        . 'rather than relying on an option read that may not throw');

    // The kept code. If any of this is deleted, restoring the choice stops being
    // a one-line flip and the comment promising otherwise becomes a lie.
    foreach (['OPT_BOARD_SETUP', 'BOARD_SETUP_COMPACT', 'BOARD_SETUP_SPACIOUS'] as $c) {
        check(strpos($php, "private const $c") !== false, "$c is still declared");
    }
    check(strpos($php, 'tableOptions->get(self::OPT_BOARD_SETUP)') !== false,
        'the option-reading path is kept, not deleted');
    check(strpos($phpLf, "return \$setup === self::BOARD_SETUP_COMPACT\n"
        . "            ? \\BoardGenerator::COMPACT_CANDIDATES\n"
        . "            : 1;") !== false,
        'and so is the Spacious branch it selects between');

    // The generator keeps both behaviours regardless of the lobby.
    $gen = file_get_contents(__DIR__ . '/../modules/php/BoardGenerator.php');
    check(strpos($gen, 'function generateMostCompact') !== false,
        'the generator still offers compact selection');
    check(strpos($gen, 'COMPACT_CANDIDATES') !== false, 'and the candidate count');

    // The breadcrumb still has to be recorded: the count remains a generation
    // input even when nobody can choose it.
    check(strpos($php, "setGameStateValue('board_candidates'") !== false,
        'the candidate count is still recorded for reproducibility');
    $stats = json_decode(file_get_contents(__DIR__ . '/../stats.json'), true);
    check(isset($stats['table']['board_candidates']),
        'and the stat that carries it still exists');
}

echo "\n$pass passed, $fail failed\n";
exit($fail === 0 ? 0 : 1);
