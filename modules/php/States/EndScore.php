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
     *   1. The player who landed on Zeus wins outright.
     *   2. Remaining players are ordered by Zeus-tiles completed (more = better).
     *   3. Tie-break by Oracle cards in hand (more = better).
     *   4. Tie-break by Favor Tokens (more = better).
     *
     * BGA scoring model: `player_score` is the primary sort key; ties resolve
     * via `player_score_aux`. We encode the three secondary criteria into one
     * aux score: `tasks * 10000 + oracles * 100 + favor`. That keeps the
     * hierarchy intact while fitting in one INT field (well within range for
     * realistic max values: ~12 tasks * 10000 + ~30 oracles * 100 + ~20 favor).
     */
    public function onEnteringState() {
        $winnerId = $this->game->globals->get('winner_player_id');
        $winnerId = $winnerId !== null ? (int)$winnerId : null;

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

        foreach ($rows as $row) {
            $pid = (int)$row['player_id'];
            $tasks = (int)$row['tasks'];
            $oracles = (int)$row['oracles'];
            $favor = (int)$row['favor'];

            $primary = ($winnerId !== null && $pid === $winnerId) ? 1 : 0;
            $aux = $tasks * 10000 + $oracles * 100 + $favor;

            // Use the BGA PlayerCounter API so the front is notified of
            // final scores; pass null to skip the auto-notif for aux since
            // it's a synthetic tiebreaker value, not a human-readable score.
            $this->game->playerScore->set($pid, $primary);
            $this->game->playerScoreAux->set($pid, $aux, null);
        }

        return ST_END_GAME;
    }
}