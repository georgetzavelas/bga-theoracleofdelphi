<?php

declare(strict_types=1);

namespace Bga\Games\theoracleofdelphi;

/**
 * Pure end-game ranking maths, lifted out of States\EndScore so it can be
 * exercised without the BGA platform. EndScore keeps the DB read, the reveal
 * notifications and the stat writes; everything that decides who actually won
 * lives here.
 *
 * Ranking rules (Oracle of Delphi):
 *   1. Every player who reached Zeus in the final round beats every player
 *      who did not.
 *   2. Among Zeus-reachers, tie-break by Oracle cards in hand, then Favor.
 *   3. Among non-reachers, rank by Zeus tiles completed, then Oracles, then
 *      Favor.
 *
 * These map onto BGA's two-counter model: the primary score is the sort key
 * and the aux score breaks ties.
 */
class EndScoring
{
    /**
     * The zeus_reachers global arrives as whatever was stored (and may be
     * absent entirely). EndScore compares player ids with a strict in_array,
     * so the ids have to be real ints or every comparison silently misses.
     *
     * @return list<int>
     */
    public static function normalizeReachers(mixed $raw): array
    {
        return array_map('intval', is_array($raw) ? $raw : []);
    }

    /**
     * Primary score = tasks completed, plus 1 for reaching Zeus.
     *
     * The +1 is what enforces rule 1, and it only works because of an
     * invariant enforced elsewhere: Game::isEligibleForZeus() requires every
     * one of the player's zeus_tile rows to be completed before the Zeus hex
     * opens, and DiscardZeusTile marks the fewer_tasks tile completed rather
     * than deleting the row, so every reacher arrives with 12. That puts a
     * reacher at 13 against a non-reacher's ceiling of 12.
     *
     * The margin is exactly 1, so this is worth stating plainly: if a reacher
     * could ever finish with fewer tiles than a non-reacher has completed,
     * rule 1 breaks and the non-reacher wins on the aux tie-break. See
     * test_end_scoring.php, which pins both the guarantee and its dependency.
     */
    public static function primaryScore(int $tasks, bool $reached): int
    {
        return $tasks + ($reached ? 1 : 0);
    }

    /**
     * Aux score packs the tie-break keys into one sortable integer:
     * tasks, then oracle cards in hand, then favor tokens.
     *
     * Each field gets a fixed decimal window — favor the low two digits,
     * oracles the next two. The packing is only order-preserving while every
     * field stays inside its window; 100 favor would carry into the oracle
     * digits and read as an extra oracle card. Real games are nowhere near
     * that, and the test records where the encoding stops holding.
     */
    public static function auxScore(int $tasks, int $oracles, int $favor): int
    {
        return $tasks * 10000 + $oracles * 100 + $favor;
    }

    /**
     * Order rows so the gamelog and animation reveal sequence matches the
     * final ranking: Zeus reachers (by tasks desc, oracles desc, favor desc)
     * first, then non-reachers by the same keys.
     *
     * @param array<int, array<string,mixed>> $rows
     * @param list<int> $reachers
     * @return array<int, array<string,mixed>>
     */
    public static function sortRowsForReveal(array $rows, array $reachers): array
    {
        usort($rows, function ($a, $b) use ($reachers) {
            $aReached = in_array((int)$a['player_id'], $reachers, true) ? 1 : 0;
            $bReached = in_array((int)$b['player_id'], $reachers, true) ? 1 : 0;
            if ($aReached !== $bReached) return $bReached - $aReached;
            $cmp = (int)$b['tasks'] - (int)$a['tasks'];
            if ($cmp !== 0) return $cmp;
            $cmp = (int)$b['oracles'] - (int)$a['oracles'];
            if ($cmp !== 0) return $cmp;
            return (int)$b['favor'] - (int)$a['favor'];
        });
        return $rows;
    }

    /**
     * The scores EndScore writes to the BGA counters, one entry per row.
     *
     * @param array<int, array<string,mixed>> $rows
     * @param list<int> $reachers
     * @return list<array{player_id:int,tasks:int,oracles:int,favor:int,reached:bool,primary:int,aux:int}>
     */
    public static function scores(array $rows, array $reachers): array
    {
        $out = [];
        foreach ($rows as $row) {
            $pid = (int)$row['player_id'];
            $tasks = (int)$row['tasks'];
            $oracles = (int)$row['oracles'];
            $favor = (int)$row['favor'];
            $reached = in_array($pid, $reachers, true);
            $out[] = [
                'player_id' => $pid,
                'tasks' => $tasks,
                'oracles' => $oracles,
                'favor' => $favor,
                'reached' => $reached,
                'primary' => self::primaryScore($tasks, $reached),
                'aux' => self::auxScore($tasks, $oracles, $favor),
            ];
        }
        return $out;
    }

    /**
     * The standings BGA will produce from the two counters: primary score
     * descending, ties broken by aux descending.
     *
     * BGA does this ranking itself, inside the platform — this mirrors it so
     * the game's actual ranking rules can be asserted end to end rather than
     * only the arithmetic that feeds them. Players who tie on both scores
     * keep their input order.
     *
     * @param array<int, array<string,mixed>> $rows
     * @param list<int> $reachers
     * @return list<array{player_id:int,tasks:int,oracles:int,favor:int,reached:bool,primary:int,aux:int}>
     */
    public static function finalRanking(array $rows, array $reachers): array
    {
        $scored = self::scores($rows, $reachers);
        // Decorate with the original index so equal entries keep input order
        // (usort is not stable across every PHP build this may run on).
        $indexed = [];
        foreach ($scored as $i => $s) { $indexed[] = [$i, $s]; }
        usort($indexed, function ($a, $b) {
            $cmp = $b[1]['primary'] - $a[1]['primary'];
            if ($cmp !== 0) return $cmp;
            $cmp = $b[1]['aux'] - $a[1]['aux'];
            if ($cmp !== 0) return $cmp;
            return $a[0] - $b[0];
        });
        return array_map(fn($pair) => $pair[1], $indexed);
    }
}
