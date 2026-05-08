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
        // detour through DiscardZeusTile before round 1 begins. Detection
        // counts active (is_completed = 0) tiles — the discard now flips
        // is_completed to 1 instead of deleting the row (so the slot keeps
        // a faded tile instead of revealing the dashed empty placeholder),
        // but the active count drops from 12 to 11 the same way the row
        // count used to.
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
            $activeCount = (int)$this->game->getUniqueValueFromDB(
                "SELECT COUNT(*) FROM zeus_tile WHERE player_id = $playerId AND is_completed = 0"
            );
            if ($activeCount > 11) return $playerId;
        }
        return null;
    }
}
