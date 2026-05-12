<?php

declare(strict_types=1);

namespace Bga\Games\theoracleofdelphigzed\States;

use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;

const ST_END_GAME = 99;

class EndScore extends \Bga\GameFramework\States\GameState
{

    function __construct(
        protected Game $game,
    ) {
        parent::__construct($game,
            id: 98,
            type: StateType::GAME,
        );
    }

    /**
     * Rank every player and write the BGA scores.
     *
     * Ranking rules (Oracle of Delphi):
     *   1. Every player who reached Zeus in the final round wins over every
     *      player who did not.
     *   2. Among Zeus-reachers, tie-break by Oracle cards in hand, then
     *      Favor Tokens.
     *   3. Among non-Zeus-reachers, rank by Zeus tiles completed, then
     *      Oracle cards, then Favor Tokens.
     *
     * BGA scoring model: the primary score counter is the primary sort
     * key; ties resolve via the aux score counter. We encode the primary as
     * `tasks_completed + (reached_zeus ? 1 : 0)` so the end-game scoreboard
     * reads as a meaningful number (tasks done) instead of the binary 0/1
     * flag the previous design used. The +1 bonus for reaching Zeus
     * guarantees the reacher always ranks above non-reachers: reaching
     * Zeus requires all 12 zeus_tile rows to have is_completed=1 (the
     * fewer_tasks ship tile auto-completes one via DiscardZeusTile, so
     * the count is 12 for everyone), and the +1 lifts the reacher's
     * primary to 13 vs the non-reacher's max of 12.
     *
     * Aux still encodes `tasks * 10000 + oracles * 100 + favor` so ties
     * within the same primary score (two reachers with the same task
     * count) resolve via oracle cards in hand and then favor tokens.
     *
     * Also writes two end-game player stats:
     *   - returned_to_zeus: 1 if the player reached Zeus, else 0
     *   - remaining_favors: favor token balance at game end
     */
    public function onEnteringState() {
        $reachersRaw = $this->game->globals->get('zeus_reachers') ?? [];
        $reachers = array_map('intval', is_array($reachersRaw) ? $reachersRaw : []);

        // Collect ranking inputs for every player.
        $rows = $this->game->getObjectListFromDB(
            "SELECT p.player_id AS player_id,
                    p.favor_tokens AS favor,
                    (SELECT COUNT(*) FROM zeus_tile
                        WHERE player_id = p.player_id AND is_completed = 1)
                        AS tasks,
                    (SELECT COUNT(*) FROM card
                        WHERE card_type = 'oracle'
                          AND card_location = 'hand'
                          AND card_location_arg = p.player_id)
                        AS oracles
             FROM player p"
        );

        // Slow down end-of-game reveal per BGA Studio Guideline F-3:
        // suspense for the players, plus a clear breakdown in the gamelog
        // so non-winners can see why they ranked where they did.
        $this->notify->all('endScoreBegin', clienttranslate('Final scoring begins'), []);

        // Sort for animation order: Zeus reachers first (by tiebreaker),
        // then non-reachers by tasks/oracles/favor. Mirrors the BGA ranking
        // produced by playerScore + playerScoreAux below.
        $orderedRows = $this->sortRowsForReveal($rows, $reachers);

        foreach ($orderedRows as $row) {
            $pid = (int)$row['player_id'];
            $tasks = (int)$row['tasks'];
            $oracles = (int)$row['oracles'];
            $favor = (int)$row['favor'];
            $reached = in_array($pid, $reachers, true);

            $message = $reached
                ? clienttranslate('${player_name} reached Zeus — ${tasks} task(s), ${oracles} oracle card(s), ${favor} Favor')
                : clienttranslate('${player_name} did not reach Zeus — ${tasks} task(s), ${oracles} oracle card(s), ${favor} Favor');

            $this->notify->all('endScorePlayer', $message, [
                'player_id' => $pid,
                'player_name' => $this->game->getPlayerNameById($pid),
                'tasks' => $tasks,
                'oracles' => $oracles,
                'favor' => $favor,
                'reached_zeus' => $reached ? 1 : 0,
            ]);
        }

        foreach ($rows as $row) {
            $pid = (int)$row['player_id'];
            $tasks = (int)$row['tasks'];
            $oracles = (int)$row['oracles'];
            $favor = (int)$row['favor'];
            $reached = in_array($pid, $reachers, true);

            $primary = $tasks + ($reached ? 1 : 0);
            $aux = $tasks * 10000 + $oracles * 100 + $favor;

            // Use the BGA PlayerCounter API so the front is notified of
            // final scores; pass null to skip the auto-notif for aux since
            // it's a synthetic tiebreaker value, not a human-readable score.
            $this->game->playerScore->set($pid, $primary);
            $this->game->playerScoreAux->set($pid, $aux, null);

            // End-game player stats. Both start at 0 so inc() lands on
            // the right final value: 1 (or 0) for the reached-Zeus flag,
            // and the player's final favor count for the remaining-favor
            // stat.
            if ($reached) {
                $this->game->statInc(1, 'returned_to_zeus', $pid);
            }
            if ($favor > 0) {
                $this->game->statInc($favor, 'remaining_favors', $pid);
            }
        }

        return ST_END_GAME;
    }

    /**
     * Order rows so the gamelog and animation reveal sequence matches the
     * final ranking: Zeus reachers (sorted by oracles desc, favor desc)
     * first, then non-reachers (sorted by tasks desc, oracles desc, favor
     * desc).
     *
     * @param array<int, array<string,mixed>> $rows
     * @param int[] $reachers
     * @return array<int, array<string,mixed>>
     */
    private function sortRowsForReveal(array $rows, array $reachers): array
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
}