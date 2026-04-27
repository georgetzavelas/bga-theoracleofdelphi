<?php
declare(strict_types=1);
namespace Bga\Games\theoracleofdelphigzed\States;
use Bga\GameFramework\StateType;
use Bga\Games\theoracleofdelphigzed\Game;
use Bga\Games\theoracleofdelphigzed\MaterialDefs;

class RoundStart extends \Bga\GameFramework\States\GameState
{
    function __construct(protected Game $game) {
        parent::__construct($game, id: 2, type: StateType::GAME);
    }

    function onEnteringState(int $activePlayerId) {
        // fewer_tasks ship tile: if the holder hasn't yet returned a Zeus tile,
        // detour through DiscardZeusTile before round 1 begins. Detection uses
        // the holder's tile count (12 = pending, 11 = already discarded) so no
        // extra global flag is needed.
        $pendingPlayerId = $this->findPendingFewerTasksPlayer();
        if ($pendingPlayerId !== null) {
            $this->game->gamestate->changeActivePlayer($pendingPlayerId);
            return DiscardZeusTile::class;
        }

        $this->game->statInc(1, 'rounds_played');
        $this->notify->all("roundStart", clienttranslate('A new round begins'), []);
        return PlayerTurnStart::class;
    }

    private function findPendingFewerTasksPlayer(): ?int
    {
        $rows = $this->game->getObjectListFromDB(
            "SELECT player_id, ship_tile_id FROM player WHERE ship_tile_id IS NOT NULL"
        );
        foreach ($rows as $row) {
            $tile = MaterialDefs::SHIP_TILES[(int)$row['ship_tile_id']] ?? null;
            if (!$tile || $tile['ability'] !== 'fewer_tasks') continue;

            $playerId = (int)$row['player_id'];
            $tileCount = (int)$this->game->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM zeus_tile WHERE player_id = $playerId"
            );
            if ($tileCount > 11) return $playerId;
        }
        return null;
    }
}
