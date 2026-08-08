<?php
/**
 * Tests for EndScoring: who actually won.
 *
 * Final scoring is the one place where a wrong answer is invisible. A bad
 * movement range or a mis-drawn tile is obvious the moment you look at the
 * board; a mis-ranked endgame just quietly hands the game to the wrong
 * player, and nobody can tell from the scoreboard that it was wrong.
 *
 * The rules being pinned (Oracle of Delphi):
 *   1. Every player who reached Zeus beats every player who did not.
 *   2. Among reachers, tie-break on Oracle cards, then Favor.
 *   3. Among non-reachers, rank on Zeus tiles, then Oracles, then Favor.
 *
 * Rule 1 is the interesting one, because it is not enforced directly. It
 * falls out of a +1 primary-score bonus that only outranks a non-reacher
 * while every reacher finishes with a full 12 completed tiles — which
 * Game::isEligibleForZeus() guarantees by refusing to open the Zeus hex
 * until none are outstanding, and DiscardZeusTile preserves by marking the
 * fewer_tasks tile completed instead of deleting its row. The margin is
 * exactly one task, so the last block here pins what happens if that ever
 * stops being true.
 *
 * Run: php tests/test_end_scoring.php
 */

require_once __DIR__ . '/../modules/php/EndScoring.php';

use Bga\Games\theoracleofdelphi\EndScoring;

$passed = 0; $failed = 0;
function check(bool $c, string $m): void {
    global $passed, $failed;
    if ($c) { $passed++; } else { $failed++; echo "FAIL: $m\n"; }
}
function sameList(array $got, array $want, string $m): void {
    check($got === $want, $m . "  (got " . json_encode($got) . " want " . json_encode($want) . ")");
}

/**
 * A player row shaped the way getObjectListFromDB hands it over: every
 * column is a string, so the int casts inside EndScoring are exercised.
 */
function row(int $pid, int $tasks, int $oracles, int $favor): array {
    return [
        'player_id' => (string)$pid,
        'tasks' => (string)$tasks,
        'oracles' => (string)$oracles,
        'favor' => (string)$favor,
    ];
}
/** Final standings as player ids, best first. */
function rankIds(array $rows, array $reachers): array {
    return array_map(fn($s) => $s['player_id'], EndScoring::finalRanking($rows, $reachers));
}
/** Gamelog reveal order as player ids. */
function revealIds(array $rows, array $reachers): array {
    return array_map(fn($r) => (int)$r['player_id'], EndScoring::sortRowsForReveal($rows, $reachers));
}

// ---- the score encoding ------------------------------------------------------
check(EndScoring::primaryScore(12, true) === 13, 'a reacher with every tile scores 13');
check(EndScoring::primaryScore(12, false) === 12, 'a non-reacher tops out at 12');
check(EndScoring::primaryScore(0, false) === 0, 'no tiles, no Zeus, no points');
check(EndScoring::auxScore(12, 3, 5) === 120305, 'aux packs tasks/oracles/favor into one integer');

// ---- rule 1: reaching Zeus beats everything ---------------------------------
// The reacher is given the worst possible tie-breakers (no oracles, no favor)
// and the non-reacher the best, across every task count a non-reacher can
// hold. The reacher must still come first every time.
$violations = [];
for ($tasks = 0; $tasks <= 12; $tasks++) {
    foreach ([0, 4, 8] as $oracles) {
        foreach ([0, 10, 25] as $favor) {
            $rows = [row(1, 12, 0, 0), row(2, $tasks, $oracles, $favor)];
            if (rankIds($rows, [1])[0] !== 1) {
                $violations[] = "non-reacher($tasks,$oracles,$favor)";
            }
        }
    }
}
check($violations === [],
    'a Zeus reacher outranks every non-reacher, whatever they are holding ('
    . count($violations) . ' losses: ' . implode(' ', array_slice($violations, 0, 3)) . ')');

// Two reachers and two non-reachers: both reachers come first.
$rows = [row(1, 12, 0, 0), row(2, 12, 9, 9), row(3, 12, 9, 9), row(4, 12, 0, 0)];
sameList(rankIds($rows, [3, 4]), [3, 4, 2, 1],
    'both reachers rank above both non-reachers regardless of tie-breakers');

// ---- rule 2: among reachers, oracles then favor ------------------------------
sameList(rankIds([row(1, 12, 1, 20), row(2, 12, 2, 0)], [1, 2]), [2, 1],
    'more oracle cards beats more favor between two reachers');
sameList(rankIds([row(1, 12, 2, 3), row(2, 12, 2, 7)], [1, 2]), [2, 1],
    'equal oracles falls through to favor');
sameList(rankIds([row(1, 12, 2, 3), row(2, 12, 2, 3)], [1, 2]), [1, 2],
    'two identical reachers keep their input order rather than swapping');

// ---- rule 3: among non-reachers, tasks then oracles then favor ---------------
sameList(rankIds([row(1, 4, 9, 9), row(2, 5, 0, 0)], []), [2, 1],
    'more completed tiles beats better tie-breakers');
sameList(rankIds([row(1, 5, 1, 9), row(2, 5, 3, 0)], []), [2, 1],
    'equal tiles falls through to oracles');
sameList(rankIds([row(1, 5, 3, 2), row(2, 5, 3, 8)], []), [2, 1],
    'equal tiles and oracles falls through to favor');

// ---- the reveal order matches the final standings ----------------------------
// The gamelog reveals players one at a time and claims to mirror the ranking.
// If the two ever disagree the log tells a different story than the scoreboard.
$boards = [
    [[row(1, 12, 0, 0), row(2, 12, 3, 1), row(3, 8, 5, 4), row(4, 11, 0, 9)], [1, 2]],
    [[row(1, 12, 2, 2), row(2, 9, 9, 9), row(3, 12, 2, 5)], [3]],
    [[row(1, 3, 0, 0), row(2, 7, 1, 1), row(3, 7, 1, 4)], []],
    [[row(1, 12, 4, 4), row(2, 12, 4, 4)], [1, 2]],
];
$mismatched = 0;
foreach ($boards as [$b, $r]) {
    if (revealIds($b, $r) !== rankIds($b, $r)) { $mismatched++; }
}
check($mismatched === 0,
    "the reveal order matches the final standings on every board ($mismatched differ)");

// ---- the zeus_reachers global ------------------------------------------------
// It is read straight off globals, so it can be absent or arrive with string
// ids. EndScoring compares strictly, so anything not normalised to int
// silently matches nobody — and everyone would be scored as a non-reacher.
sameList(EndScoring::normalizeReachers(null), [], 'a missing global means nobody reached Zeus');
sameList(EndScoring::normalizeReachers('nonsense'), [], 'a non-array global is treated as empty');
sameList(EndScoring::normalizeReachers(['3', '5']), [3, 5], 'string ids are normalised to ints');
sameList(rankIds([row(7, 12, 0, 0), row(8, 12, 9, 9)], EndScoring::normalizeReachers(['7'])),
    [7, 8], 'a reacher stored as a string still ranks as a reacher');

// ---- the edges of the aux packing --------------------------------------------
// Each field owns a two-digit window. Inside those windows the packing is
// order-preserving; the moment a field overflows it borrows the next field's
// digits and the ranking silently reads it as something else. Real games stay
// far below these numbers -- this records where the encoding stops working.
check(EndScoring::auxScore(12, 0, 99) < EndScoring::auxScore(12, 1, 0),
    'inside its window, one oracle card outweighs any amount of favor');
check(EndScoring::auxScore(12, 0, 100) === EndScoring::auxScore(12, 1, 0),
    'at 100 favor the packing collides with one oracle card (documented limit)');
check(EndScoring::auxScore(0, 100, 0) === EndScoring::auxScore(1, 0, 0),
    'at 100 oracle cards the packing collides with one completed tile');

// ---- the load-bearing assumption behind rule 1 -------------------------------
// Rule 1 survives on a one-task margin. If a reacher could ever finish with
// fewer completed tiles than a non-reacher holds -- say DiscardZeusTile were
// changed to delete the fewer_tasks row instead of completing it, which is
// what the rulebook describes and what the comment on
// Game::isEligibleForZeus() still claims -- the bonus stops covering the gap
// and the player who reached Zeus loses. This is characterisation, not a
// wish: it records today's behaviour so the breakage is loud if it happens.
$rows = [row(1, 11, 9, 9), row(2, 12, 0, 0)];
sameList(rankIds($rows, [1]), [2, 1],
    'CHARACTERISATION: an 11-tile reacher would LOSE to a 12-tile non-reacher; '
    . 'rule 1 holds only because every reacher finishes on 12');
check(EndScoring::primaryScore(11, true) === EndScoring::primaryScore(12, false),
    'the +1 bonus ties an 11-tile reacher with a 12-tile non-reacher, and aux then decides');

echo "$passed passed, $failed failed\n";
exit($failed === 0 ? 0 : 1);
