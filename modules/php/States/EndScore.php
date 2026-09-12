<?php

declare(strict_types=1);

namespace Bga\Games\theoracleofdelphi\States;

use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphi\EndScoring;
use Bga\Games\theoracleofdelphi\Game;

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
     * The ranking maths itself lives in EndScoring, which is plain arrays in
     * and out and is covered by tests/test_end_scoring.php. This state keeps
     * the DB read, the reveal notifications and the stat writes.
     *
     * Also writes two end-game player stats:
     *   - returned_to_zeus: 1 if the player reached Zeus, else 0
     *   - remaining_favors: favor token balance at game end
     */
    public function onEnteringState() {
        $reachers = EndScoring::normalizeReachers($this->game->globals->get('zeus_reachers'));

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
        $orderedRows = EndScoring::sortRowsForReveal($rows, $reachers);

        foreach ($orderedRows as $row) {
            $pid = (int)$row['player_id'];
            $tasks = (int)$row['tasks'];
            $oracles = (int)$row['oracles'];
            $favor = (int)$row['favor'];
            $reached = in_array($pid, $reachers, true);

            $message = $reached
                ? clienttranslate('${player_name} reached Zeus — ${tasks} task(s), ${oracles} oracle card(s), ${favor} favor')
                : clienttranslate('${player_name} did not reach Zeus — ${tasks} task(s), ${oracles} oracle card(s), ${favor} favor');

            $this->notify->all('endScorePlayer', $message, [
                'player_id' => $pid,
                'player_name' => $this->game->getPlayerNameById($pid),
                'tasks' => $tasks,
                'oracles' => $oracles,
                'favor' => $favor,
                'reached_zeus' => $reached ? 1 : 0,
            ]);
        }

        foreach (EndScoring::scores($rows, $reachers) as $score) {
            $pid = $score['player_id'];
            $favor = $score['favor'];

            // Use the BGA PlayerCounter API so the front is notified of
            // final scores; pass null to skip the auto-notif for aux since
            // it's a synthetic tiebreaker value, not a human-readable score.
            $this->game->playerScore->set($pid, $score['primary']);
            $this->game->playerScoreAux->set($pid, $score['aux'], null);

            // End-game player stats. Both start at 0 so inc() lands on
            // the right final value: 1 (or 0) for the reached-Zeus flag,
            // and the player's final favor count for the remaining-favor
            // stat.
            if ($score['reached']) {
                $this->game->statInc(1, 'returned_to_zeus', $pid);
            }
            if ($favor > 0) {
                $this->game->statInc($favor, 'remaining_favors', $pid);
            }
        }

        $this->revealRemainingIslands();

        return ST_END_GAME;
    }

    /**
     * Flip every island still face down so the finished board shows what was
     * under each one — what a different route would have found.
     *
     * Runs last, after the scoring animation, so the standings stay the peak
     * and this reads as the post-mortem.
     *
     * revealed_by_player_id is deliberately left NULL. ExploreIsland is the
     * only place that sets is_revealed=1 and it always stamps the explorer, so
     * a null explorer on a revealed hex means "never explored" — the flag the
     * client keys its markers and tooltip off, and it already rides along in
     * getAllDatas. Setting is_revealed=1 is also what lifts the
     * getAllDatas censor (Game::getAllDatas keys it on isRevealed === 0), so
     * the reveal survives a reload with no extra column.
     *
     * The per-island peek count separates "someone looked here and passed"
     * from "nobody ever saw this". It is captured BEFORE the flip: the
     * islandKnowledge query joins is_revealed = 0 and would come back empty
     * afterwards. The same list is stashed in a global so a reload rebuilds
     * the markers from one payload rather than a second query that could drift.
     */
    private function revealRemainingIslands(): void
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT h.q, h.r, h.shrine_game_color, h.shrine_letter,
                    (SELECT COUNT(*) FROM player_island_knowledge pik
                     WHERE pik.hex_q = h.q AND pik.hex_r = h.r) AS peeks
             FROM hex h
             WHERE h.island_content = 'shrine' AND h.is_revealed = 0
             ORDER BY h.q, h.r"
        );
        if (count($rows) === 0) {
            return;
        }

        $islands = [];
        foreach ($rows as $row) {
            $islands[] = [
                'q' => (int)$row['q'],
                'r' => (int)$row['r'],
                'shrine_owner_color' => $row['shrine_game_color'],
                'shrine_letter' => $row['shrine_letter'],
                'peeked' => (int)$row['peeks'] > 0 ? 1 : 0,
            ];
        }

        $this->game->DbQuery(
            "UPDATE hex SET is_revealed = 1
             WHERE island_content = 'shrine' AND is_revealed = 0"
        );
        $this->game->globals->set('endgame_island_reveal', $islands);

        $this->notify->all(
            'endGameIslandsRevealed',
            clienttranslate('${count} island(s) never explored are revealed'),
            [
                'count' => count($islands),
                'islands' => $islands,
            ]
        );
    }
}
